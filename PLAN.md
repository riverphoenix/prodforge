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
