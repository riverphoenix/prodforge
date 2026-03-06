# ProdForge

<p align="center">
  <img src="prodforge-icons/app-icon/color/app-icon-512.svg" width="128" height="128" alt="ProdForge">
</p>

<p align="center">
  <strong>The AI-powered operating system for Product Managers.</strong>
</p>

<p align="center">
  <a href="https://github.com/riverphoenix/prodforge/releases/latest">Download for macOS</a> &bull;
  <a href="https://prodforge.app">Website</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#installation">Install</a> &bull;
  <a href="#contributing">Contribute</a>
</p>

---

ProdForge is a native desktop app that combines AI-driven frameworks, autonomous agents, and a built-in Claude Code terminal into one tool for Product Managers. Built with Tauri v2, React 19, and multi-model LLM support.

## Features

- **45+ PM Frameworks** — RICE, SWOT, JTBD, Business Model Canvas, Porter's Five Forces, and more. AI generates structured outputs from your project context.
- **AI Chat** — Multi-provider conversations with OpenAI, Anthropic Claude, Google Gemini, and local Ollama models. Context-aware with project documents.
- **30+ PM Skills** — Pre-built skills across Strategy, Research, Execution, Leadership, Growth, GTM, AI, and Career categories.
- **6 AI Agents** — PRD Writer, Strategy Advisor, User Researcher, Competitive Intel, Growth PM, Launch Captain. Create custom agents with your own skills and system prompts.
- **Agent Teams** — Compose agents into teams with sequential, parallel, or conductor orchestration. Visual drag-and-drop canvas with React Flow.
- **Claude Code Terminal** — Built-in PTY terminal with full Claude Code integration, UTF-8 support, and multiple tabs.
- **Workflow Builder** — Chain frameworks and prompts into repeatable multi-step pipelines. Schedule with cron expressions.
- **30+ Prompt Templates** — With `{variable}` substitution and auto-detection.
- **Context Engine** — Upload PDFs, URLs, and Google Docs as AI context for every conversation and generation.
- **File Explorer** — Hierarchical folders with Monaco code editor.
- **Outputs Library** — Save, search, edit inline, and export generated frameworks.
- **Git Versioning** — Auto-commit every output with diff viewer and rollback.
- **Jira & Notion Export** — Push outputs directly to external tools.
- **Analytics Dashboard** — Token usage trends, cost breakdowns, agent performance, CSV export.
- **Tracing** — Hierarchical span recording with timeline visualization for all executions.
- **Scheduling** — Cron, interval, and event triggers for automated agent and workflow runs.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Tauri v2 (Rust backend, WKWebView on macOS) |
| Frontend | React 19, TypeScript, Tailwind CSS v4, Vite |
| AI Sidecar | Python, FastAPI, Pydantic AI |
| Database | SQLite (15+ tables, CASCADE deletes) |
| LLMs | OpenAI, Anthropic Claude, Google Gemini, Ollama |
| Encryption | AES-256-GCM for API keys |
| Versioning | libgit2 per-project repos |
| Agent Canvas | React Flow (@xyflow/react) |

## Installation

### Download

Grab the latest `.dmg` from the [Releases page](https://github.com/riverphoenix/prodforge/releases/latest). Open the DMG, drag ProdForge to Applications, and launch.

### Build from Source

**Prerequisites:**
- macOS 10.15+
- Rust 1.70+ with `cargo`
- Node.js 18+
- Python 3.11+

```bash
git clone https://github.com/riverphoenix/prodforge.git
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

### Running Locally

You need two processes: the Python sidecar and the Tauri app.

**Terminal 1 — AI sidecar:**

```bash
cd python-sidecar
source venv/bin/activate
python main.py
```

The FastAPI server starts on `http://localhost:8000`.

**Terminal 2 — App:**

```bash
npm run tauri dev
```

Hot-reload is enabled for both frontend and Rust changes.

### Building for Production

```bash
npm run tauri build
```

Outputs a `.dmg` installer in `src-tauri/target/release/bundle/dmg/`.

## First Run

1. Launch the app — the setup wizard guides you through initial configuration
2. Enter at least one API key (OpenAI, Anthropic, or Google) in Settings
3. Create your first project and start chatting or generating frameworks
4. For Claude Code terminal access, grant Full Disk Access in System Preferences (the app will guide you)

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Command Palette |
| `Cmd+F` | Search |
| `Cmd+1`–`Cmd+8` | Switch tabs |
| `` Cmd+` `` | Toggle terminal |
| `Cmd+B` | Toggle sidebar |
| `Cmd+/` | Keyboard shortcuts |

## Project Structure

```
prodforge/
├── src/                    # React frontend
│   ├── components/         # 50+ UI components
│   ├── pages/              # Page views
│   ├── lib/                # IPC wrappers, types, shortcuts
│   ├── hooks/              # Custom React hooks
│   ├── frameworks/         # 45 framework JSON definitions
│   └── prompts/            # 30 prompt template files
├── src-tauri/              # Rust backend
│   └── src/
│       ├── main.rs         # Entry point
│       ├── lib.rs          # ~140 IPC command registrations
│       ├── commands.rs     # Commands, SQLite schema, business logic
│       └── pty.rs          # Terminal PTY management
├── python-sidecar/         # Python FastAPI server
│   ├── main.py             # API routes
│   ├── agent_engine.py     # Pydantic AI agent execution
│   ├── team_engine.py      # Multi-agent orchestration
│   ├── scheduler.py        # APScheduler-based scheduling
│   ├── tracing_layer.py    # Span-based tracing
│   ├── openai_client.py    # OpenAI streaming
│   ├── anthropic_client.py # Anthropic streaming
│   ├── google_client.py    # Google Gemini streaming
│   ├── ollama_client.py    # Local Ollama
│   └── document_parser.py  # PDF, URL, Google Docs extraction
└── prodforge-icons/        # App and brand icons
```

## Contributing

Contributions are welcome! Here are some ways you can help:

- **Frameworks** — Add new PM frameworks in `src/frameworks/`
- **Skills** — Create new agent skills
- **Bug fixes** — File an issue or submit a PR
- **Documentation** — Improve the docs

Please open an issue first for larger changes so we can discuss the approach.

## License

MIT License — see [LICENSE](LICENSE) for details.
