# Changelog

## [Unreleased]

### Added
- `.claude.json` with Claude Code hooks for automatic Limoncello integration: ExitPlanMode hook prompts to create cards for non-trivial plans, TaskCompleted hook updates card status and commits changes
- Hooks intelligently detect Limoncello configuration by reading CLAUDE.md before activating
- Zero-auth agent bootstrapping: agents can self-provision API keys without human intervention
- `POST /api/keys` -- unauthenticated, rate-limited endpoint (10 req/min/IP) returns a one-time plaintext key (`lmn_` prefix, 48 chars)
- `GET /api/keys` -- admin-only endpoint to list all agent keys (id, name, created_at, last_used, revoked status)
- `DELETE /api/keys/:id` -- admin-only endpoint to revoke an agent key (soft delete)
- `api_keys` table in SQLite: stores SHA-256 hash only, never plaintext
- Three-tier auth model: admin key (env var) > agent keys (database) > open mode (no auth configured)
- `requireAdmin` middleware for admin-only routes (returns 403 for agent keys)
- `limoncello_bootstrap` MCP tool -- agents can provision keys for other agents/projects via MCP
- Comprehensive test suite for API key management (33 tests in `test/keys.test.js`)
- Test helpers updated to mount key routes for testing
- Homepage at `/` -- static landing page explaining Limoncello for both humans and agents
- Homepage links to `/api/man` (agent discovery) and `/board` (web UI)
- `GET /board` route serves the Kanban board (previously at `/`)
- Homepage tests (16 tests)
- `limoncello_onboard` MCP tool -- generates onboarding plan for integrating Limoncello into a project's workflow (CLAUDE.md additions, optional hooks)
- MCP server `instructions` field -- strongly prompts agents to check the board at session start, create cards for discovered work, poll for changes, and onboard new projects
- Enhanced MCP tool descriptions -- prescriptive guidance on when to use each tool (e.g., "CALL THIS AT THE START OF EVERY SESSION")
- Self-describing API manual at `GET /api/man` -- returns structured JSON documenting every endpoint, schema, concept, WebSocket protocol, and MCP tool
- No auth required on `/api/man` (like `/health`)
- Manual includes 21 endpoints, project/card schemas, authentication docs, error format, and MCP tool reference
- Test suite for API manual (11 tests)
- Tags feature: cards can have an array of string tags, stored as JSON in the database
- Tags input in card modal (comma-separated)
- Tag badges rendered on cards in the board view
- Tag filter bar below the header: shows all tags in use, click to filter board by tag
- API support for `?tag=` query parameter on card list endpoints
- Tags test coverage (13 tests)

### Changed
- Enhanced `limoncello_onboard` MCP tool to be more proactive: now instructs agents to edit BOTH CLAUDE.md AND .claude.json directly (with approval), verify the changes, and emphasizes the critical importance of documenting the board's project ID
- Onboarding process now creates/edits `.claude.json` with automation hooks (ExitPlanMode and TaskCompleted) instead of just showing copy-paste examples
- MCP server instructions updated to strongly emphasize documenting the board in both CLAUDE.md and .claude.json as critical requirements
- Onboarding plan text strengthened with clear explanation of why documentation is essential (prevents work loss, duplication, and coordination breakdowns)
- Onboarding plan now includes step-by-step instructions for creating/editing `.claude.json` with intelligent merging if file already exists
- CLAUDE.md updated with section documenting the automated workflow hooks in `.claude.json`
- `POST /api/keys` response now includes `setup` object with MCP installation command, environment variable example, warning, and docs link (agents and humans both get setup instructions immediately)
- Auth middleware refactored: `requireAuth` now checks admin key, then hashes Bearer token against `api_keys` table; updates `last_used` on match
- API manual (`GET /api/man`) updated: documents three auth types, 24 endpoints, 8 MCP tools, key schema, 403/429 error codes
- Homepage redesigned with bootstrap-first flow: get a key, connect MCP, create a project
- Existing tests updated to reflect new endpoint count (24), tool count (8), auth structure, and homepage sections
- Documentation repositioned Limoncello as a hosted webapp at https://limoncello.fly.dev
- README.md restructured: Getting Started section leads with web UI and MCP setup (not npm install)
- README.md now clearly separates user-facing content from developer/contributor content (Development section at bottom)
- Removed "local-first" terminology from README.md, CLAUDE.md, and SPEC.md
- SPEC.md deployment section now lists Production first, Development second
- CLAUDE.md updated: added `limoncello_onboard` to MCP tools list, added `routes/man.js` to project structure
- Homepage rewritten for hosted webapp audience at https://limoncello.fly.dev
- Removed "Local-first" from tagline (now "Kanban board for human-AI collaboration")
- Updated REST API example to use production URL with Authorization header
- Renamed "Quick Start" section to "Getting Started"
- Removed all self-hosting instructions (npm install, localhost references, STDIO MCP setup)
- Getting Started section now highlights Streamable HTTP MCP transport as the recommended approach

### Removed
- Slash commands (.claude/commands/) removed in favor of MCP tools

## 2026-04-03 (v12)

### Changed
- Full rebrand from "Prello" to "Limoncello" across all code, config, docs, and MCP tools
- Environment variables renamed: `PRELLO_API_KEY` -> `LIMONCELLO_API_KEY`, `PRELLO_URL` -> `LIMONCELLO_URL`
- MCP tool names renamed: `prello_*` -> `limoncello_*`
- Slash commands renamed: `/prello-*` -> `/limoncello-*`
- Default database path changed: `data/prello.db` -> `data/limoncello.db`
- localStorage keys renamed: `prello_*` -> `limoncello_*`
- Board project renamed: "Prello Development" -> "Limoncello Development"
- Fly.io app migrated from `prello` to `limoncello` (now at `limoncello.fly.dev`)

## 2026-04-02 (v11)

### Changed
- UI font changed to Jost (loaded from Google Fonts, system stack as fallback)
- CSP updated to allow `fonts.googleapis.com` and `fonts.gstatic.com`

## 2026-04-02 (v10)

### Added
- Startup guard: rejects `LIMONCELLO_API_KEY` values matching Stripe key patterns (`sk_live_*`, `sk_test_*`, `pk_*`, `rk_*`) to prevent accidental use of third-party credentials
- Comprehensive test suite (192 tests) using Node's built-in test runner (`node:test`) with `supertest`
- `test/ids.test.js` -- ID generation: prefix, length, character set, uniqueness
- `test/db.test.js` -- database schema: tables, columns, constraints, foreign keys, indexes, WAL mode
- `test/projects.test.js` -- Projects API: full CRUD, column/substatus validation, edge cases
- `test/cards.test.js` -- Cards API: full CRUD, status/substatus handling, reorder, changes polling, backward compat
- `test/ws.test.js` -- WebSocket: connection auth, subscription, broadcast, cleanup
- `test/auth.test.js` -- auth middleware: Bearer token validation, public endpoints, Stripe key guard
- `npm test` script runs all tests via `node --test test/*.test.js`
- `supertest` added as dev dependency

### Fixed
- `/changes` endpoint: wrap `since` parameter in SQLite's `datetime()` for proper ISO 8601 timestamp comparison

## 2026-04-02 (v9)

### Added
- Real-time board updates via WebSocket at `/ws` endpoint
- New `src/ws.js` module: manages WebSocket connections, per-project subscriptions, and ping/pong keepalive
- Frontend WebSocket client with exponential backoff reconnect
- Card mutations (create, update, delete, reorder) broadcast to all connected browsers subscribed to the same project
- WebSocket auth: if `LIMONCELLO_API_KEY` is set, connections require `?token=<key>` query param

### Changed
- `src/index.js` refactored from `app.listen()` to `http.createServer(app)` + `server.listen()` to share the HTTP server with WebSocket
- Added `ws` dependency

## 2026-04-02 (v8)

### Changed
- `limoncello_create_project` MCP tool response now includes onboarding tip suggesting agents update their CLAUDE.md with board-specific instructions (project ID, session-start polling, card lifecycle)
- Disabled `auto_stop_machines` on Fly.io to prevent MCP session drops from cold starts

## 2026-04-02 (v7)

### Added
- Changes polling feature: agents can poll for recent card activity
- `updated_at` column on cards table (ISO 8601 timestamp), auto-updated on card modifications
- API endpoint `GET /api/projects/:projectId/cards/changes?since=<ISO8601>` returns cards modified since the given timestamp
- Backward-compat endpoint `GET /api/cards/changes?since=<ISO8601>` for Default project
- MCP tool `limoncello_changes` to fetch and format recent changes
- Slash command `/limoncello-changes --since <timestamp>` for polling changes
- Database migration: adds `updated_at` column to existing cards tables

### Changed
- CLAUDE.md now recommends agents poll for changes at session start using `limoncello_changes` or `limoncello_board`

## 2026-04-02 (v6)

### Added
- Streamable HTTP transport for MCP server at `/mcp` endpoint -- Claude Code can connect remotely without running a local subprocess
- Extracted shared MCP tool definitions into `src/mcp-tools.mjs`, used by both STDIO and HTTP transports
- Session management for HTTP MCP connections (stateful sessions with automatic cleanup)

### Changed
- `src/index.js` startup wrapped in async `start()` function to support dynamic ESM imports
- `src/mcp.mjs` simplified to ~20 lines using shared `createLimoncelloMcpServer()` from `mcp-tools.mjs`

## 2026-04-02 (v5)

### Added
- File-based column definitions: projects can be created from a JSON file that defines name and columns with sub-statuses
- New slash command `/limoncello-create-project` for creating projects with optional `--file <path>` to load columns from a JSON file
- MCP tool `limoncello_create_project` now accepts optional `columns_file` parameter (file path) to load column definitions from a JSON file
- Example template at `examples/columns-template.json` showing the JSON format for column definitions

### Changed
- MCP tool `limoncello_create_project` `name` parameter is now optional when a columns file provides the name

## 2026-04-02 (v4)

### Added
- Sub-statuses: columns can now define optional sub-statuses (e.g., Blocked column with "Human Review" and "Agent Review")
- Cards have a nullable `substatus` field, validated against the column's defined sub-statuses
- Default columns now include a "Blocked" column with two sub-statuses: Human Review and Agent Review
- Frontend: substatus badge on cards, substatus editor in project modal, substatus dropdown in card modal
- MCP tools: `limoncello_add` and `limoncello_move` accept optional `substatus` parameter; `limoncello_list` and `limoncello_board` display sub-status labels
- Slash commands: `--substatus` flag on `/limoncello-add` and `/limoncello-move`

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
- MCP server: `limoncello_projects` tool to list projects, optional `project_id` parameter on all existing tools (`limoncello_add`, `limoncello_list`, `limoncello_move`, `limoncello_board`)
- Slash commands: optional `--project <project-id>` parameter on all existing commands, new `/limoncello-projects` command to list projects

### Changed
- Cards table now has `project_id` column (foreign key to projects)
- Valid statuses are now dynamic per project (defined by project's columns JSON)
- Removed CHECK constraint on cards.status (statuses are now validated against project columns)
- Default columns for new projects: backlog, todo, in_progress, done

## 2026-04-02 (v2)

### Added
- Bearer token auth via `LIMONCELLO_API_KEY` env var (optional; if unset, no auth)
- Web UI prompts for API key on 401 and stores in localStorage
- MCP server (`src/mcp.mjs`) with tools: `limoncello_add`, `limoncello_list`, `limoncello_move`, `limoncello_board`
- Deployed to Fly.io at https://limoncello.fly.dev with persistent SQLite volume

## 2026-04-02

### Added
- Initial Limoncello implementation
- SQLite database with cards table (id, title, description, status, position, timestamps)
- REST API for card CRUD at `/api/cards` with status filtering and batch reorder
- Web UI: four-column Kanban board with drag-and-drop, inline card creation, edit/delete modal
- Claude Code slash commands: `/limoncello-add`, `/limoncello-list`, `/limoncello-move`, `/limoncello-board`
- Docker and Fly.io configuration
- Project documentation (CLAUDE.md, README.md, SPEC.md)

### Architecture decisions
- SQLite over Postgres: local-first, zero-config, single file at `./data/limoncello.db`
- Vanilla HTML/CSS/JS: no build step, no framework, served statically
- Slash commands over MCP: simpler, uses curl against the local API
- nanoid with `crd_` prefix for card IDs
- Schema-on-startup pattern (CREATE TABLE IF NOT EXISTS)
