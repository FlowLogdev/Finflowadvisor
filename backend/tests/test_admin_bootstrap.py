"""Bootstrap regression tests with a fake Auth transport and no service secrets."""
import ast
import unittest
from pathlib import Path
from unittest.mock import AsyncMock
from urllib.parse import quote


def bootstrap_store():
    # Compile the actual bootstrap method independently of optional HTTP/server
    # dependencies: these tests exercise its outbound Auth/database operations.
    tree = ast.parse((Path(__file__).parents[1] / 'supabase_store.py').read_text())
    store = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'SupabaseStore')
    method = next(n for n in store.body if isinstance(n, ast.AsyncFunctionDef) and n.name == 'ensure_admin')
    namespace = {'quote': quote}
    exec(compile(ast.Module(body=[method], type_ignores=[]), '<bootstrap>', 'exec'), namespace)
    return type('Store', (), {'ensure_admin': namespace['ensure_admin']})()


class AdminBootstrapTests(unittest.IsolatedAsyncioTestCase):
    async def test_repeated_cold_starts_preserve_existing_auth_session(self):
        store = bootstrap_store()
        store.admin_user_by_email = AsyncMock(return_value={'id': 'admin-id', 'user_metadata': {'name': 'Admin'}})
        session = {'valid': True}

        async def transport(method, path, **kwargs):
            if path.startswith('/auth/') and method in ('PUT', 'PATCH'):
                session['valid'] = False

        store.request = AsyncMock(side_effect=transport)
        store.create_user = AsyncMock()
        for _ in range(3):
            await store.ensure_admin('admin@example.invalid', 'bootstrap-password')
        self.assertTrue(session['valid'], 'Cold starts must not revoke existing sessions')
        store.create_user.assert_not_awaited()
        self.assertEqual(store.request.await_count, 3)
        for call in store.request.await_args_list:
            self.assertEqual(call.args, ('POST', '/rest/v1/profiles'))
            self.assertNotIn('password', str(call.kwargs))
            self.assertEqual(call.kwargs['json'][0]['role'], 'admin')

    async def test_first_bootstrap_still_creates_admin(self):
        store = bootstrap_store()
        store.admin_user_by_email = AsyncMock(return_value=None)
        store.request = AsyncMock()
        store.create_user = AsyncMock()
        await store.ensure_admin('admin@example.invalid', 'initial-password')
        store.create_user.assert_awaited_once_with('admin@example.invalid', 'initial-password', 'Admin', 'admin')
        store.request.assert_not_awaited()
