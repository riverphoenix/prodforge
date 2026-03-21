"""
SSL helper for PyInstaller-bundled environment.
Creates an httpx client with explicit certifi CA bundle.
"""
import ssl
import sys
import os
import httpx


def get_ssl_context():
    """Get an SSL context using certifi certificates."""
    import certifi
    ctx = ssl.create_default_context(cafile=certifi.where())
    return ctx


def get_httpx_client(**kwargs):
    """Get an httpx.AsyncClient with proper SSL for frozen builds."""
    if getattr(sys, 'frozen', False):
        kwargs.setdefault('verify', get_ssl_context())
    return httpx.AsyncClient(**kwargs)
