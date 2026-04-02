# Changelog

## 2026-04-02 (v9)

### Added
- Real-time board updates via WebSocket at `/ws` endpoint
- New `src/ws.js` module: manages WebSocket connections, per-project subscriptions, and ping/pong keepalive
- Frontend WebSocket client with exponential backoff reconnect
- Card mutations (create, update, delete, reorder) broadcast to all connected browsers subscribed to the same project
- WebSocket auth: if `PRELLO_API_KEY` is set, connections require `?token=<key>` query param

### Changed
- `src/index.js` refactored from `app.listen()` to `http.createServer(app)` + `server.listen()` to share the HTTP server with WebSocket
- Added `ws` dependency

## 2026-04-02 (v8)

### Changed
- `prello_create_project` MCP tool response now includes onboarding tip suggesting agents update their CLAUDE.md with board-specific instructions (project ID, session-start polling, card lifecycle)
- Disabled `auto_stop_machines` on Fly.io to prevent MCP session drops from cold starts

## 2026-04-02 (v7)

### Added
- Changes polling feature: agents can poll for recent card activity
- `updated_at` column on cards table (ISO 8601 timestamp), auto-updated on card modifications
- API endpoint `GET /api/projects/:projectId/cards/changes?since=<ISO8601>` returns cards modified since the given timestamp
- Backward-compat endpoint `GET /api/cards/changes?since=<ISO8601>` for Default project
- MCP tool `prello_changes` to fetch and format recent changes
- Slash command `/prello-changes --since <timestamp>` for polling changes
- Database migration: adds `updated_at` column to existing cards tables

### Changed
- CLAUDE.md now recommends agents poll for changes at session start using `prello_changes` or `prello_board`

## 2026-04-02 (v6)

### Added
- Streamable HTTP transport for MCP server at `/mcp` endpoint -- Claude Code can connect remotely without running a local subprocess
- Extracted shared MCP tool definitions into `src/mcp-tools.mjs`, used by both STDIO and HTTP transports
- Session management for HTTP MCP connections (stateful sessions with automatic cleanup)

### Changed
- `src/index.js` startup wrapped in async `start()` function to support dynamic ESM imports
- `src/mcp.mjs` simplified to ~20 lines using shared `createPrelloMcpServer()` from `mcp-tools.mjs`

## 2026-04-02 (v5)

### Added
- File-based column definitions: projects can be created from a JSON file that defines name and columns with sub-statuses
- New slash command `/prello-create-project` for creating projects with optional `--file <path>` to load columns from a JSON file
- MCP tool `prello_create_project` now accepts optional `columns_file` parameter (file path) to load column definitions from a JSON file
- Example template at `examples/columns-template.json` showing the JSON format for column definitions

### Changed
- MCP tool `prello_create_project` `name` parameter is now optional when a columns file provides the name

## 2026-04-02 (v4)

### Added
- Sub-statuses: columns can now define optional sub-statuses (e.g., Blocked column with "Human Review" and "Agent Review")
- Cards have a nullable `substatus` field, validated against the column's defined sub-statuses
- Default columns now include a "Blocked" column with two sub-statuses: Human Review and Agent Review
- Frontend: substatus badge on cards, substatus editor in project modal, substatus dropdown in card modal
- MCP tools: `prello_add` and `prello_move` accept optional `substatus` parameter; `prello_list` and `prello_board` display sub-status labels
- Slash commands: `--substatus` flag on `/prello-add` and `/prello-move`

### Changed
- Column shape extended from `{key, label}` to `{key, label, substatuses: [{key, label}, ...]}`
- Card substatus auto-clears to null when card moves to a different column (unless new substatus explicitly provided)
- Database migration: adds `substatus` column to existing cards tables

## 2026-04-02 (v3)

### Added
- Projects feature: cards now belong to projects, each project defines its own columns
- Projects table with schema: `id` (prj_ prefix), `name`, `columns` (JSON array of {key, label}), timestamps
- Project CRUD API at `/api/projects`: GET, POST, PATCH, DELETE
- Project-scoped card endpoints at `/api/projects/:projectId/cards` (and all card sub-routes)
- Backward-compatibility shim: `/api/cards` routes to Default project
- Database migration: creates Default project on startup, assigns existing cards to it
- Frontend: project selector dropdown in header, dynamic column rendering based on project, project settings modal for creating/editing projects
- MCP server: `prello_projects` tool to list projects, optional `project_id` parameter on all existing tools (`prello_add`, `prello_list`, `prello_move`, `prello_board`)
- Slash commands: optional `--project <project-id>` parameter on all existing commands, new `/prello-projects` command to list projects

### Changed
- Cards table now has `project_id` column (foreign key to projects)
- Valid statuses are now dynamic per project (defined by project's columns JSON)
- Removed CHECK constraint on cards.status (statuses are now validated against project columns)
- Default columns for new projects: backlog, todo, in_progress, done

## 2026-04-02 (v2)

### Added
- Bearer token auth via `PRELLO_API_KEY` env var (optional; if unset, no auth)
- Web UI prompts for API key on 401 and stores in localStorage
- MCP server (`src/mcp.mjs`) with tools: `prello_add`, `prello_list`, `prello_move`, `prello_board`
- Deployed to Fly.io at https://prello.fly.dev with persistent SQLite volume

## 2026-04-02

### Added
- Initial Prello implementation
- SQLite database with cards table (id, title, description, status, position, timestamps)
- REST API for card CRUD at `/api/cards` with status filtering and batch reorder
- Web UI: four-column Kanban board with drag-and-drop, inline card creation, edit/delete modal
- Claude Code slash commands: `/prello-add`, `/prello-list`, `/prello-move`, `/prello-board`
- Docker and Fly.io configuration
- Project documentation (CLAUDE.md, README.md, SPEC.md)

### Architecture decisions
- SQLite over Postgres: local-first, zero-config, single file at `./data/prello.db`
- Vanilla HTML/CSS/JS: no build step, no framework, served statically
- Slash commands over MCP: simpler, uses curl against the local API
- nanoid with `crd_` prefix for card IDs
- Schema-on-startup pattern (CREATE TABLE IF NOT EXISTS)
