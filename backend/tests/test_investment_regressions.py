"""Exercise investment handlers with simulated external services."""
import ast
import asyncio
import csv
import io
import math
import unittest
from datetime import datetime, timezone, timedelta
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock


def handlers():
    tree = ast.parse((Path(__file__).parents[1] / 'server.py').read_text())
    names = {'_fetch_fred_series', 'investment_project'}
    functions = [n for n in tree.body if isinstance(n, ast.AsyncFunctionDef) and n.name in names]
    for fn in functions:
        fn.decorator_list = []
    future = ast.ImportFrom(module='__future__', names=[ast.alias(name='annotations')], level=0)
    module = ast.fix_missing_locations(ast.Module(body=[future, *functions], type_ignores=[]))
    ns = dict(csv=csv, io=io, math=math, datetime=datetime, timezone=timezone, timedelta=timedelta,
              FRED_API_KEY='', Depends=lambda dependency: None, get_current_user=None)
    exec(compile(module, '<investment-handlers>', 'exec'), ns)
    return ns


class InvestmentRegressions(unittest.IsolatedAsyncioTestCase):
    async def test_public_fred_download_without_api_key(self):
        ns = handlers()
        http = SimpleNamespace(get=AsyncMock(return_value=SimpleNamespace(
            status_code=200, text='observation_date,DGS10\n2026-10-20,4.12\n2026-10-21,4.15\n2026-10-22,.\n2026-10-23,NaN\n')))
        value = await ns['_fetch_fred_series'](http, 'DGS10')
        self.assertEqual(value, 4.15)
        self.assertEqual(http.get.await_args.args[0], 'https://fred.stlouisfed.org/graph/fredgraph.csv')
        self.assertNotIn('api_key', http.get.await_args.kwargs['params'])

    async def test_api_failure_uses_public_download(self):
        ns = handlers()
        ns['FRED_API_KEY'] = 'test-only'
        http = SimpleNamespace(get=AsyncMock(side_effect=[
            SimpleNamespace(status_code=403),
            SimpleNamespace(status_code=200, text='observation_date,FEDFUNDS\n2026-09-01,3.75\n')]))
        self.assertEqual(await ns['_fetch_fred_series'](http, 'FEDFUNDS'), 3.75)

    async def test_bad_public_download_returns_unavailable(self):
        ns = handlers()
        http = SimpleNamespace(get=AsyncMock(return_value=SimpleNamespace(status_code=200, text='<html>blocked</html>')))
        self.assertIsNone(await ns['_fetch_fred_series'](http, 'DGS10'))

    async def test_missing_rates_no_longer_crash_projection(self):
        ns = handlers()
        ns['investment_rates'] = AsyncMock(return_value={
            'br': {'cdi_annual_pct': None, 'poupanca_annual_pct': None},
            'us': {'treasury_10y_pct': None, 'hysa_avg_pct': 4.0}})
        request = SimpleNamespace(initial=1000, monthly=200, period_months=60, scenarios=None)
        result = await ns['investment_project'](request, {})
        self.assertEqual(result['total_invested'], 13000)
        self.assertEqual(len(result['us']['ustreasury']['series']), 61)
        self.assertIn('treasury_10y_pct', result['assumed_rates'])
        self.assertGreater(result['us']['ustreasury']['final_amount'], 13000)

    async def test_zero_rate_override_is_preserved(self):
        ns = handlers()
        ns['investment_rates'] = AsyncMock(return_value={'br': {}, 'us': {}})
        result = await ns['investment_project'](SimpleNamespace(initial=1000, monthly=200, period_months=60,
            scenarios={'ustreasury': 0}), {})
        self.assertEqual(result['us']['ustreasury']['final_amount'], 13000)
