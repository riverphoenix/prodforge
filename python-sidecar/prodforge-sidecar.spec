# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec file for ProdForge sidecar

import sys
import os
from PyInstaller.utils.hooks import collect_all, collect_submodules

block_cipher = None

source_dir = os.path.dirname(os.path.abspath(SPEC))

# Collect all submodules for packages that have complex imports
hidden = []
hidden += collect_submodules('apscheduler')
hidden += collect_submodules('uvicorn')
hidden += collect_submodules('anthropic')
hidden += collect_submodules('google.genai')
hidden += collect_submodules('httpx')
hidden += collect_submodules('anyio')
hidden += collect_submodules('starlette')
hidden += collect_submodules('fastapi')
hidden += collect_submodules('pydantic')
hidden += collect_submodules('pydantic_core')
hidden += collect_submodules('bs4')
hidden += collect_submodules('lxml')

hidden += [
    'openai_client',
    'anthropic_client',
    'google_client',
    'ollama_client',
    'framework_loader',
    'document_parser',
    'agent_engine',
    'team_engine',
    'scheduler',
    'tracing_layer',
    'fitz',
    'pymupdf',
    'httptools',
    'websockets',
    'h11',
    'sniffio',
    'certifi',
    'charset_normalizer',
    'idna',
    'multipart',
    'email_validator',
    'typing_extensions',
]

# Collect data files for packages that need them
datas = []
binaries = []

for pkg in ['certifi', 'httpx', 'httpcore', 'openai', 'anthropic', 'pydantic', 'pydantic_core']:
    try:
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hidden += h
    except Exception:
        pass

a = Analysis(
    ['main.py'],
    pathex=[source_dir],
    binaries=binaries,
    datas=datas,
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[os.path.join(source_dir, 'runtime_hook_ssl.py')],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='prodforge-sidecar',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    target_arch='arm64',
)
