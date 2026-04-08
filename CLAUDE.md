# CLAUDE.md

Instructions for Claude Code. See [SPEC.md](SPEC.md) for the full product spec.

## Project Overview

Limoncello is a Kanban board for human-AI collaboration. Humans use the web UI, Claude uses the MCP server. Both create and manage cards on shared projects.

Projects feature: Each project has its own custom columns. Cards belong to projects. The Default project provides backward compatibility.

Stack: Node.js + Express + SQLite (better-sqlite3), vanilla HTML/CSS/JS frontend.

## Deployment

- **Local**: `npm run dev` -- homepage at http://localhost:3654, board at http://localhost:3654/board
- **Production**: https://limoncello.fly.dev (Fly.io, SQLite on persistent volume)
- **Auth**: Three-tier model -- admin key (env var), agent keys (database-backed `lmn_` prefix), or open mode (no auth configured). See Key Architecture below.

## Key Architecture

- **Database**: SQLite at `./data/limoncello.db` -- created automatically on first run
- **Schema-on-startup**: Tables (projects, cards) created via `CREATE TABLE IF NOT EXISTS` in `src/db.js`
- **Projects table**: Each project has custom columns (stored as JSON array of {key, label, substatuses})
- **Cards table**: Cards belong to projects via `project_id` foreign key
- **Default project**: Created on first run for backward compatibility
- **Sub-statuses**: Columns can define optional sub-statuses. Cards have nullable `substatus` field, validated against column definition
- **IDs**: nanoid with `crd_` prefix for cards, `prj_` prefix for projects, `key_` prefix for API keys (`src/lib/ids.js`)
- **Port**: 3654
- **Auth**: Three-tier: (1) admin key from `LIMONCELLO_API_KEY` env var -- full access including key management; (2) agent keys from `api_keys` table -- full project/card access, no key management; (3) open mode -- if no admin key and no agent keys exist, all routes are open (local dev)
- **API keys**: `POST /api/keys` is unauthenticated and rate-limited (10/min/IP). Keys use `lmn_` prefix + 48 chars. Only SHA-256 hash stored. Plaintext returned once at creation. `GET /api/keys` and `DELETE /api/keys/:id` are admin-only.
- **API**: REST at `/api/projects` and `/api/projects/:projectId/cards` (`src/routes/projects.js`, `src/routes/cards.js`)
- **Backward compat**: `/api/cards` routes to Default project
- **Homepage**: Static landing page at `/` (`src/public/index.html`) -- links to `/board` and `/api/man`
- **Board**: Kanban UI at `/board` (`src/public/board.html`) -- served via explicit route and static middleware
- **UI**: Vanilla HTML/CSS/JS served from `src/public/`, dynamic columns based on selected project
- **MCP (STDIO)**: `src/mcp.mjs` -- STDIO transport entry point for local subprocess use
- **MCP (HTTP)**: `/mcp` endpoint in `src/index.js` -- Streamable HTTP transport for remote use
- **MCP tools**: `src/mcp-tools.mjs` -- shared tool definitions used by both transports
- **WebSocket**: `/ws` endpoint for real-time board updates (`src/ws.js`). Clients subscribe to a project; card mutations broadcast to all subscribers. Auth via `?token=` query param when `LIMONCELLO_API_KEY` is set.

## Project Structure

```
src/
  index.js            # Express server entry point (includes /mcp HTTP transport, WebSocket setup)
  db.js               # SQLite connection + schema init
  ws.js               # WebSocket server -- real-time broadcast to connected browsers
  mcp.mjs             # MCP server entry point (STDIO transport)
  mcp-tools.mjs       # Shared MCP tool definitions (used by both transports)
  lib/ids.js          # Card, project, and key ID generation (crd_, prj_, key_ prefixes)
  routes/projects.js  # Project CRUD API
  routes/cards.js     # Card CRUD API (broadcasts via WebSocket on mutations)
  routes/keys.js      # API key management (bootstrap, list, revoke)
  routes/man.js       # Self-describing API manual endpoint
  public/
    index.html        # Homepage (static, inline styles, no JS)
    board.html        # Kanban board UI (served at /board)
    style.css         # Board styles
    app.js            # Client-side JS
examples/
  columns-template.json      # Example column definition file for project creation
```

## Common Tasks

```bash
# Start dev server (auto-reload)
npm run dev

# Start production server
npm start

# Run MCP server (used by Claude Desktop / Claude Code)
npm run mcp

# With Docker
docker compose up --build

# Health check
curl http://127.0.0.1:3654/health

# List projects
curl http://127.0.0.1:3654/api/projects

# Create a card in Default project (local, no auth)
curl -X POST http://127.0.0.1:3654/api/cards \
  -H "Content-Type: application/json" \
  -d '{"title": "Test card", "status": "todo"}'

# Create a card with substatus
curl -X POST http://127.0.0.1:3654/api/cards \
  -H "Content-Type: application/json" \
  -d '{"title": "Needs review", "status": "blocked", "substatus": "human_review"}'

# Create a card in specific project (production, with auth)
curl -X POST https://limoncello.fly.dev/api/projects/prj_abc123/cards \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LIMONCELLO_API_KEY" \
  -d '{"title": "Test card", "status": "todo"}'

# List cards in Default project
curl http://127.0.0.1:3654/api/cards

# List cards in specific project
curl http://127.0.0.1:3654/api/projects/prj_abc123/cards
```

## MCP Server Configuration

### Remote (Streamable HTTP -- recommended)

No local process needed. Claude Code connects directly to the deployed server:

```bash
claude mcp add limoncello -s user --transport http \
  --header "Authorization: Bearer <your-api-key>" \
  -- https://limoncello.fly.dev/mcp
```

### Local (STDIO)

For Claude Desktop (`claude_desktop_config.json`) or Claude Code (`.claude.json`):

```json
{
  "mcpServers": {
    "limoncello": {
      "command": "node",
      "args": ["/Users/plc/Documents/limoncello/src/mcp.mjs"],
      "env": {
        "LIMONCELLO_URL": "https://limoncello.fly.dev",
        "LIMONCELLO_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

MCP tools: `limoncello_projects`, `limoncello_create_project` (with `columns_file`), `limoncello_add` (with substatus), `limoncello_list`, `limoncello_move` (with substatus), `limoncello_board`, `limoncello_changes`, `limoncello_onboard` (generate onboarding plan for a project), `limoncello_bootstrap` (provision API keys)

All card tools accept optional `project_id` parameter (defaults to Default project).

### Onboarding a New Project

When setting up Limoncello for a new codebase:
1. **Create a dedicated project** first: `limoncello_create_project` with a descriptive name matching the codebase
2. **Then run onboarding**: `limoncello_onboard` with the new project_id
3. The agent will automatically edit CLAUDE.md and .claude.json with board documentation and automation hooks

**IMPORTANT**: Each codebase should have its own dedicated Limoncello project, NOT share the Default project.

## Working with the Limoncello Board

This project tracks its own work on a Limoncello board: **Limoncello Dev** (`prj_vDi0hGAhCrUP`).

### On session start

At the beginning of every session, check the board for current tasks:

```
limoncello_board(project_id: "prj_vDi0hGAhCrUP")
```

Or use `limoncello_changes` with a `since` timestamp if you know when your last session ended. The `server_time` in the response can be stored and reused as `since` next time.

### Working on tasks

- Before starting work on a card, move it to `in_progress`
- If blocked (waiting on human input, unclear requirements), move it to `blocked` with an appropriate substatus (`human_review` or `agent_review`)
- When finished, move it to `done`
- If you discover new work while implementing a task, add it as a new card in `backlog`

### Automated workflow (hooks)

This project has Claude Code hooks in `.claude.json` (added during Limoncello onboarding) that automatically:
- **After ExitPlanMode**: Prompt to create Limoncello cards for non-trivial plans (tracks each step)
- **After TaskCompleted**: Check for matching Limoncello cards and move them to `done`, then commit changes

These hooks intelligently detect if Limoncello is configured by reading CLAUDE.md. The `limoncello_onboard` MCP tool creates these hooks automatically when setting up a new project.

### Why this matters

The board is shared between humans and agents. Humans may add, reprioritize, or annotate cards via the web UI between agent sessions. Polling ensures you're working on what matters and not duplicating effort.

## API Endpoints

### Project Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/projects | List projects |
| POST | /api/projects | Create project |
| GET | /api/projects/:id | Get project |
| PATCH | /api/projects/:id | Update project |
| DELETE | /api/projects/:id | Delete project |

### Card Endpoints (Project-scoped)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/projects/:projectId/cards | List cards in project (optional `?status=`) |
| GET | /api/projects/:projectId/cards/changes | Get cards changed since timestamp (required `?since=<ISO8601>`) |
| POST | /api/projects/:projectId/cards | Create card in project (accepts optional `substatus`) |
| GET | /api/projects/:projectId/cards/:id | Get card |
| PATCH | /api/projects/:projectId/cards/:id | Update card (substatus auto-clears on column change) |
| DELETE | /api/projects/:projectId/cards/:id | Delete card |
| PATCH | /api/projects/:projectId/cards/reorder | Batch update positions |

### Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/keys | Create agent key (no auth, rate-limited 10/min/IP) |
| GET | /api/keys | List all agent keys (admin only) |
| DELETE | /api/keys/:id | Revoke agent key (admin only) |

### Backward Compatibility (Default project)

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check (no auth) |
| GET | /api/man | Self-describing API manual (no auth) |
| GET | /api/cards | List cards in Default project (optional `?status=`) |
| GET | /api/cards/changes | Get cards changed since timestamp (required `?since=<ISO8601>`) |
| POST | /api/cards | Create card in Default project |
| GET | /api/cards/:id | Get card |
| PATCH | /api/cards/:id | Update card |
| DELETE | /api/cards/:id | Delete card |
| PATCH | /api/cards/reorder | Batch update positions |

## Valid Statuses

Statuses are dynamic per project, defined by each project's `columns` field (JSON array).

Default columns for new projects: `backlog`, `todo`, `in_progress`, `blocked`, `done`

Columns can define sub-statuses. Default columns include `blocked` with sub-statuses: `human_review`, `agent_review`

## Documentation Maintenance

| File | When to Update |
|------|----------------|
| **CHANGELOG.md** | After every significant change |
| **SPEC.md** | When API, schema, or architecture changes |
| **README.md** | When user-facing details change |
| **CLAUDE.md** | When project context changes |

## Gotchas

- **Fly.io SSH tests unreliable**: The machine has `auto_stop_machines = 'stop'` in `fly.toml`, so `fly ssh console` often fails with "Connection refused" because the machine is stopped. Don't waste time debugging SSH -- test via the public URL (`https://limoncello.fly.dev/...`) instead.
- **API key format**: `LIMONCELLO_API_KEY` must not resemble a third-party credential. The server rejects keys matching Stripe patterns (`sk_live_*`, `sk_test_*`, `pk_*`, `rk_*`) on startup. Use a dedicated random string (e.g., `openssl rand -base64 32`).

## Git Workflow

- Update CHANGELOG.md before committing
- Commit locally after completing work
- Do not push without explicit permission
