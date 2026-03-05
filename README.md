# ProdForge

An AI-powered desktop toolkit for Product Managers. Built with Tauri 2, React 19, and multi-model LLM support.

## Features

- **AI Chat** - Strategy conversations with OpenAI, Anthropic, Google Gemini, and Ollama models
- **45+ PM Frameworks** - PRD, RICE, SWOT, JTBD, Customer Journey Maps, and more
- **30+ Prompt Templates** - With `{variable}` substitution and auto-detection
- **Workflow Builder** - Chain frameworks into multi-step pipelines with output piping
- **Context Documents** - Upload PDFs, URLs, Google Docs as AI context
- **File Explorer** - Hierarchical folders with Monaco code editor
- **Outputs Library** - Save, search, edit inline, and export generated frameworks
- **AI Insights** - Proactive project suggestions based on activity
- **Git Versioning** - Auto-commit every output with diff viewer and rollback
- **Jira & Notion Export** - Push outputs directly to external tools
- **xterm.js Terminal** - Built-in terminal with autocomplete and ANSI colors
- **Import/Export** - Share frameworks and prompts as `.md` files with YAML front matter
- **Analytics Dashboard** - Token usage trends, cost breakdowns, CSV export
- **Multi-Model Support** - OpenAI, Anthropic Claude, Google Gemini, and local Ollama models
- **Dynamic Model Discovery** - Automatically fetches latest available models from each provider

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, TypeScript, Tailwind CSS v4, Vite |
| Desktop | Tauri 2.0 (Rust, WKWebView on macOS) |
| AI Sidecar | Python, FastAPI, multi-provider LLM support |
| Database | SQLite (12+ tables, CASCADE deletes) |
| LLMs | OpenAI, Anthropic Claude, Google Gemini, Ollama |
| Encryption | AES-256-GCM (API keys, tokens) |
| Versioning | libgit2 (per-project repos) |

## Prerequisites

- **macOS** (primary target)
- **Rust** 1.70+ with `cargo`
- **Node.js** 18+
- **Python** 3.11+
- At least one LLM API key (OpenAI, Anthropic, or Google)

## Installation

```bash
git clone git@github.com:riverphoenix/prodforge.git
cd prodforge

# Frontend dependencies
npm install

# Python sidecar
cd python-sidecar
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..
```

## Running Locally

You need two processes running: the Python sidecar and the Tauri app.

**Terminal 1 - Start the AI sidecar:**

```bash
cd python-sidecar
source venv/bin/activate
python main.py
```

This starts the FastAPI server on `http://localhost:8000`. You can verify with:

```bash
curl http://localhost:8000/health
```

**Terminal 2 - Start the app:**

```bash
npm run tauri dev
```

This starts the Vite dev server and opens the Tauri window. Hot-reload is enabled for both frontend and Rust changes.

## Building for Production

```bash
npm run tauri build
```

Outputs a `.dmg` installer in `src-tauri/target/release/bundle/dmg/`.

## First Run Setup

1. Launch the app — the setup wizard will guide you through initial configuration
2. Enter at least one API key (OpenAI, Anthropic, or Google)
3. Optionally configure your profile and first project
4. Configure additional providers in **Settings**

## Project Structure

```
prodforge/
├── src/                    # React frontend
│   ├── components/         # UI components (ActivityBar, ChatInterface, ModelSelector, etc.)
│   ├── pages/              # Page views (ProjectView, FileExplorer, Settings, etc.)
│   ├── lib/                # IPC wrappers, types, shortcuts
│   ├── hooks/              # Custom React hooks
│   ├── frameworks/         # 45 framework JSON seed definitions
│   └── prompts/            # 30 prompt template seed files
├── src-tauri/              # Rust backend
│   └── src/
│       ├── main.rs         # Entry point
│       ├── lib.rs          # ~140 IPC command registrations
│       └── commands.rs     # All commands, SQLite schema, business logic
├── python-sidecar/         # Python FastAPI server
│   ├── main.py             # API routes (chat, frameworks, insights, models)
│   ├── openai_client.py    # OpenAI streaming client
│   ├── anthropic_client.py # Anthropic Claude streaming client
│   ├── google_client.py    # Google Gemini streaming client
│   ├── ollama_client.py    # Local Ollama client
│   ├── framework_loader.py # Framework definition loader
│   └── document_parser.py  # PDF, URL, Google Docs extraction
└── README.md
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Command Palette |
| `Cmd+F` | Search |
| `Cmd+1-8` | Switch tabs |
| `` Cmd+` `` | Toggle terminal |
| `Cmd+B` | Toggle sidebar |
| `Cmd+/` | Keyboard shortcuts |

## License

Private - All rights reserved.
