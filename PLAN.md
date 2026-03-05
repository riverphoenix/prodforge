# ProdForge - Roadmap

Phases 1-7 are complete. Below is the plan for remaining phases.

## Current State (Phase 7 Complete)

- 45 frameworks, 30 prompt templates, ~132 Rust IPC commands
- VSCode-style UI: ActivityBar, centered tabs, xterm.js terminal, file explorer with Monaco editor
- Conversational welcome page, global search, command palette
- Workflow builder with output chaining
- AI insights, git versioning, Jira/Notion export
- Multi-model streaming chat with provider selector (OpenAI, Anthropic, Google, Ollama)

---

## Phase 8: Polish & Power (Complete)

- Multi-model support with provider abstraction (OpenAI, Anthropic, Google, Ollama)
- Multi-key settings with per-provider API key storage
- Analytics dashboard: token usage trends, cost breakdowns by provider/model/project, CSV export
- First-run setup wizard, toast notifications, shortcut overlay
- Improved empty states and responsive panel constraints

---

## Phase 9: Scale & Extend (6-8 weeks)

Goal: Multi-user, multi-tool, extensible platform.

### 9.1 Additional Integrations
- **Slack**: Share output summaries to channels via webhook; workflow completion notifications
- **Linear**: Create issues from outputs with project/team/label mapping
- **Confluence**: Export as wiki pages with markdown-to-storage format conversion
- **GitHub Issues**: Create issues with label/assignee mapping

### 9.2 Cloud Sync & Backup
- **Project archives**: Export/import entire projects as `.prodforge` files (SQLite + git + docs)
- **Auto-backup**: Configurable schedule (hourly/daily/weekly) with retention policy
- **Cloud sync**: Optional S3-compatible storage with client-side AES-256-GCM encryption
- Conflict detection and resolution

### 9.3 Collaboration
- **Project sharing**: Shareable links with permission levels (view/comment/edit)
- **Comments**: Inline and general comments on outputs with resolve/unresolve
- **Activity feed**: Per-project timeline of all actions, filterable by type
- **Presence**: Show who's viewing a shared project

### 9.4 Plugin & Extension System
- **Plugin architecture**: Load framework/prompt packs from JSON/YAML bundles
- **Webhooks**: Configurable event notifications (output created, workflow completed)
- **REST API**: Local HTTP API for scripting, CI/CD, and automation
- **Custom themes**: JSON-based theme files; built-in: Codex Dark, Light, Solarized, Nord

**Estimated scope**: ~12 new components, ~57 new Rust commands, ~6 new DB tables, optional companion server

---

## Phase 10: Skills & Agents Foundation

Goal: Create a PM skills library and AI agents system with Pydantic AI backend.

### 10.1 Database Schema

4 new tables:

**`skill_categories`** — 8 PM categories (Strategy, Research, Execution, Leadership, Growth, GTM, AI, Career)
```
id TEXT PK, name, description, icon, sort_order, is_builtin, created_at, updated_at
```

**`skills`** — Individual PM skills with system prompts
```
id TEXT PK, name, description, category FK, system_prompt TEXT, tools TEXT (JSON array),
output_schema TEXT?, model_tier TEXT ('opus'|'sonnet'|'haiku'), is_builtin, is_favorite,
usage_count, sort_order, created_at, updated_at
```

**`agents`** — AI agents that compose skills
```
id TEXT PK, name, description, icon, system_instructions TEXT, skill_ids TEXT (JSON array),
model TEXT, provider TEXT, max_tokens INT, temperature REAL, tools_config TEXT (JSON),
context_strategy TEXT ('auto'|'manual'|'rag'), is_builtin, is_favorite,
usage_count, sort_order, created_at, updated_at
```

**`agent_runs`** — Execution history with usage tracking
```
id TEXT PK, agent_id FK, project_id FK, skill_id TEXT?, status TEXT,
input_prompt TEXT, output_content TEXT?, model TEXT, provider TEXT,
input_tokens INT, output_tokens INT, total_tokens INT, cost REAL,
duration_ms INT?, error TEXT?, started_at, completed_at, created_at
```

### 10.2 Rust CRUD Commands (~25 new commands)

- **skill_categories**: list, get, create, update, delete
- **skills**: list, get, create, update, delete, search, duplicate, increment_usage
- **agents**: list, get, create, update, delete, search, duplicate, increment_usage
- **agent_runs**: create, get, list, update_status, delete, get_usage_stats

### 10.3 Seed Data (30 Skills, 6 Agents)

**30 Pre-built Skills** across 8 categories:

| Skill | Category | Model Tier |
|-------|----------|------------|
| Writing PRDs | Strategy | sonnet |
| Prioritizing Roadmap | Strategy | sonnet |
| Defining Product Vision | Strategy | opus |
| Setting OKRs & Goals | Strategy | sonnet |
| Evaluating Trade-offs | Strategy | opus |
| Scoping & Cutting | Strategy | sonnet |
| Writing Specs & Designs | Strategy | sonnet |
| Conducting User Interviews | Research | sonnet |
| Analyzing User Feedback | Research | haiku |
| Competitive Analysis | Research | sonnet |
| Problem Definition | Research | sonnet |
| Designing Surveys | Research | haiku |
| Usability Testing | Research | sonnet |
| Shipping Products | Execution | sonnet |
| Managing Timelines | Execution | haiku |
| Post-mortems & Retros | Execution | sonnet |
| Running Decision Processes | Execution | sonnet |
| Managing Tech Debt | Execution | sonnet |
| Stakeholder Alignment | Leadership | opus |
| Managing Up | Leadership | sonnet |
| Giving Presentations | Leadership | sonnet |
| Running Effective Meetings | Leadership | haiku |
| Cross-functional Collaboration | Leadership | sonnet |
| Designing Growth Loops | Growth | opus |
| Pricing Strategy | Growth | opus |
| Retention & Engagement | Growth | sonnet |
| Measuring Product-Market Fit | Growth | sonnet |
| Launch Marketing | GTM | sonnet |
| Positioning & Messaging | GTM | sonnet |
| AI Product Strategy | AI | opus |

Each skill has a 200-500 word system_prompt with PM methodology, output format, and best practices.

**6 Pre-built Agents:**

1. **PRD Writer** — Uses: writing-prds, problem-definition, evaluating-trade-offs. Model: claude-sonnet. Focus: structured PRD generation.
2. **Strategy Advisor** — Uses: product-vision, evaluating-trade-offs, prioritizing-roadmap, stakeholder-alignment. Model: claude-opus. Focus: strategic analysis and recommendations.
3. **User Researcher** — Uses: user-interviews, analyzing-feedback, designing-surveys, problem-definition. Model: claude-sonnet. Focus: research design and insight synthesis.
4. **Competitive Intel** — Uses: competitive-analysis, positioning-messaging, measuring-pmf. Model: claude-sonnet. Focus: market landscape and positioning.
5. **Growth PM** — Uses: growth-loops, retention, pricing-strategy, measuring-pmf. Model: claude-opus. Focus: growth modeling and experiments.
6. **Launch Captain** — Uses: launch-marketing, shipping-products, managing-timelines, giving-presentations. Model: claude-sonnet. Focus: launch planning and execution.

### 10.4 Python Sidecar (Pydantic AI)

New dependency: `pydantic-ai>=0.2.0`

**`python-sidecar/agent_engine.py`**:
- `AgentEngine` class: dynamically creates Pydantic AI `Agent` instances from DB config
- `_resolve_model(provider, model, api_key)` — returns appropriate Pydantic AI model class
- `_build_system_prompt(config)` — combines agent instructions + skill system prompts
- `run_stream(config)` — yields SSE-formatted chunks
- `cancel(run_id)` — cancels active execution

**New endpoints** in `main.py`:
- `POST /agent/run/stream` — SSE streaming agent execution
- `POST /agent/run/cancel` — Cancel running agent
- `POST /agent/test` — Non-streaming quick test

### 10.5 Frontend

**Navigation**: Add Skills (Cmd+9) and Agents (Cmd+0) tabs to ActivityBar, Tab type, command palette.

**New pages**:
- `SkillsLibrary.tsx` — Category sidebar, skill cards grid, search/sort/filter, test button, CRUD modal
- `AgentsPage.tsx` — Agent cards list, AgentEditor, AgentRunner sub-views

**New components**:
- `SkillEditorModal.tsx` — Name, description, category, model tier, system prompt editor
- `AgentEditor.tsx` — Name, icon, model/provider, system instructions, skills picker, advanced config
- `AgentRunner.tsx` — Input prompt, context picker, SSE streaming output, run history, usage stats

**Estimated scope**: ~25 new Rust commands, 6 new components, 3 new Python endpoints, 4 new DB tables

---

## Phase 11: Agent Teams & Visual Workflow Builder

Goal: Compose agents into teams with a visual drag-and-drop canvas.

### 11.1 Database Schema

**`agent_teams`** — Team definitions
```
id TEXT PK, name, description, icon, execution_mode TEXT ('sequential'|'parallel'|'conductor'),
conductor_agent_id TEXT?, max_concurrent INT, created_at, updated_at
```

**`agent_team_nodes`** — Agents placed on the canvas
```
id TEXT PK, team_id FK, agent_id FK, position_x REAL, position_y REAL,
role TEXT ('worker'|'conductor'|'reviewer'), config TEXT (JSON), sort_order
```

**`agent_team_edges`** — Connections between nodes
```
id TEXT PK, team_id FK, source_node_id FK, target_node_id FK,
condition TEXT?, data_mapping TEXT (JSON)
```

**`team_runs`** — Team execution history
```
id TEXT PK, team_id FK, project_id FK, status TEXT, input TEXT,
output TEXT?, total_tokens INT, total_cost REAL, duration_ms INT?,
started_at, completed_at, created_at
```

**`team_run_steps`** — Per-node execution within a team run
```
id TEXT PK, team_run_id FK, node_id FK, agent_id FK, status TEXT,
input TEXT, output TEXT?, tokens INT, cost REAL, duration_ms INT?,
started_at, completed_at
```

### 11.2 Visual Canvas (React Flow)

- **@xyflow/react** canvas for drag-and-drop team composition
- Custom node types: AgentNode (shows agent name, skills, model), ConnectorNode, ConditionalNode
- Edge types: data flow, conditional branching, parallel fan-out/fan-in
- Minimap, zoom controls, auto-layout
- Properties panel for selected node/edge configuration
- Real-time execution visualization (highlight active nodes, show progress)

### 11.3 Execution Modes

- **Sequential**: Agents run in order; each receives previous agent's output
- **Parallel**: Multiple agents run simultaneously; outputs collected and merged
- **Conductor**: A conductor agent orchestrates other agents dynamically, deciding which to invoke based on context

### 11.4 Team Orchestration Engine

New Python sidecar module: `team_engine.py`
- `TeamEngine` class managing multi-agent execution
- Context passing between agents (output → input chaining)
- Parallel execution with asyncio
- Conductor mode with dynamic agent selection
- SSE streaming for real-time team execution monitoring

**New endpoints**:
- `POST /team/run/stream` — SSE streaming team execution
- `POST /team/run/cancel` — Cancel running team
- `GET /team/run/{id}/status` — Get team run status with per-step details

### 11.5 Frontend

- `AgentTeamsPage.tsx` — Team list, team canvas editor, team runner
- `TeamCanvas.tsx` — React Flow canvas with custom nodes and edges
- `TeamRunner.tsx` — Team execution with per-step progress tracking
- `NodePropertiesPanel.tsx` — Configuration panel for selected canvas elements

**Estimated scope**: ~20 new Rust commands, 5 new DB tables, 4 new components, 3 new Python endpoints

---

## Phase 12: Scheduling, Tracing & Advanced Features

Goal: Production-grade execution with scheduling, observability, and advanced agent patterns.

### 12.1 Scheduling System

**`schedules`** table:
```
id TEXT PK, name, target_type TEXT ('agent'|'team'|'workflow'),
target_id FK, trigger_type TEXT ('cron'|'interval'|'event'),
trigger_config TEXT (JSON), is_active BOOLEAN, last_run_at INT?,
next_run_at INT?, run_count INT, created_at, updated_at
```

- **Cron triggers**: Standard cron expressions (e.g., "0 9 * * MON" = every Monday 9am)
- **Interval triggers**: Run every N minutes/hours/days
- **Event triggers**: Run when specific events occur (output created, project updated, workflow completed)
- Schedule management UI with enable/disable, run history, next execution preview

### 12.2 Tracing & Observability

**`trace_spans`** table:
```
id TEXT PK, parent_span_id TEXT?, run_id FK, run_type TEXT,
span_name TEXT, span_kind TEXT ('agent'|'tool'|'llm'|'chain'),
input TEXT, output TEXT?, status TEXT, tokens INT?, cost REAL?,
metadata TEXT (JSON), started_at INT, ended_at INT?
```

- Hierarchical span recording for all agent/team executions
- `TracingView` component (bottom panel tab) with timeline visualization
- Span detail drill-down: see exact prompts, responses, tool calls
- Logfire/OTEL integration with Pydantic AI's built-in tracing
- Export traces as JSON for external analysis

### 12.3 Advanced Agent Patterns

- **Fallback models**: If primary model fails, automatically retry with fallback
- **Agent-as-tool**: Register agents as tools that other agents can invoke
- **Context window management**: Automatic summarization when context exceeds limits
- **Tool library**: Reusable tools (web search, file read, calculator, API call) assignable to any agent
- **Memory**: Per-agent conversation memory with configurable retention

### 12.4 Enhanced Analytics

- Per-skill usage breakdown in analytics dashboard
- Per-agent performance metrics (success rate, avg duration, cost efficiency)
- Team execution analytics (bottleneck identification, parallel efficiency)
- Schedule execution history and reliability metrics
- Cost forecasting based on usage trends

### 12.5 Frontend

- `SchedulesPage.tsx` — Schedule list, create/edit modal, run history
- `TracingView.tsx` — Timeline visualization, span details, trace export
- Enhanced analytics dashboard with agent/skill/team breakdowns

**Estimated scope**: ~15 new Rust commands, 2 new DB tables, 3 new components, 2 new Python endpoints

---

## Beyond Phase 12 (Ideas)

- Mobile companion app (read-only project viewer)
- Template marketplace with community sharing
- Real-time co-editing (CRDT-based)
- Voice input for chat and framework generation
- Embedding-based semantic search across all project content
- MCP server integration for external tool access
- Agent playground with sandbox execution environment
