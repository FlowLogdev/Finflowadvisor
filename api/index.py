"""Vercel entrypoint for the FinFlow FastAPI API.

Keeping the function under ``/api`` lets Vercel serve the exported Expo web
application as static files while forwarding only API traffic to FastAPI.
"""

from backend.server import app

