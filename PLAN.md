# ProdForge - Roadmap

## Completed

### Phase 1-7: Core Application
- 45 frameworks, 30 prompt templates, ~140 Rust IPC commands
- VSCode-style UI: ActivityBar, centered tabs, xterm.js terminal, file explorer with Monaco editor
- Conversational welcome page, global search, command palette
- Workflow builder with output chaining
- AI insights, git versioning, Jira/Notion export
- Multi-model streaming chat with provider selector (OpenAI, Anthropic, Google, Ollama)

### Phase 8: Polish & Power
- Multi-model support with provider abstraction
- Multi-key settings with per-provider API key storage
- Analytics dashboard: token usage trends, cost breakdowns by provider/model/project, CSV export
- First-run setup wizard, toast notifications, shortcut overlay

### Phase 9: Skills & Agents
- 30 pre-built PM skills across 8 categories (Strategy, Research, Execution, Leadership, Growth, GTM, AI, Career)
- 6 pre-built agents: PRD Writer, Strategy Advisor, User Researcher, Competitive Intel, Growth PM, Launch Captain
- Pydantic AI backend with SSE streaming agent execution
- Skills library UI with search, filter, and CRUD
- Agent editor with model/provider selection, skills picker, and system instructions

### Phase 10: Agent Teams & Visual Workflow
- Agent teams with sequential, parallel, and conductor execution modes
- React Flow visual canvas for drag-and-drop team composition
- Custom node types: AgentNode, ConnectorNode, ConditionalNode
- Team runner with per-step progress tracking
- Context passing and output chaining between agents

### Phase 11: Scheduling, Tracing & Advanced Features
- Scheduling system with cron, interval, and event triggers
- Hierarchical tracing with timeline visualization
- Fallback models with automatic retry
- Per-session agent memory
- Enhanced analytics with agent performance metrics and cost forecasting
- Built-in Claude Code terminal with PTY, UTF-8 safe buffering, and Full Disk Access support

### Phase 12: Manage Views, Export/Import & UI Polish
- Framework Manager: inline editing of category, name, and icon with duplicate-name validation
- Prompt Library: category management (create, edit, delete with usage guard), slide-in editor
- Skills Library: manage view with category sidebar, export/import as `.md` files with YAML frontmatter, per-skill provider+model dropdown replacing model tier
- Agents Page: manage view with detail panel, export/import as `.md` files (YAML frontmatter + system instructions body), combined provider+model dropdown showing only configured providers
- Marketplace portability: all entity types (frameworks, prompts, skills, agents) export as portable Markdown with conflict detection on import
- Built-in agent icons migrated from Lucide text names to emoji unicode
- All modal/panel backgrounds guaranteed opaque with inline styles
- Removed stale icon text strings from skill category UI displays
- Background agent running with global state management

---

## Future Ideas

- Mobile companion app (read-only project viewer)
- Template marketplace with community sharing
- Real-time co-editing (CRDT-based)
- Voice input for chat and framework generation
- Embedding-based semantic search across all project content
- MCP server integration for external tool access
- Agent playground with sandbox execution environment
- Windows and Linux support
- Plugin system for custom integrations
