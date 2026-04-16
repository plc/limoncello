# CLAUDE.md

Instructions for Claude Code. See [SPEC.md](SPEC.md) for the full product spec.

## Project Overview

Limoncello is a Kanban board for human-AI collaboration. Humans use the web UI, Claude uses the MCP server. Both create and manage cards on shared projects.

**Terminology note:** In Limoncello, a "project" is a board with custom columns (like separate Trello boards). Cards are individual tasks that belong to a project/board. This naming can be confusing when working on software projects, but: each software codebase typically gets its own dedicated Limoncello project/board for tracking work.

Projects feature: Each project has its own custom columns. Cards belong to projects. The Default project provides backward compatibility.

Stack: Node.js + Express + SQLite (better-sqlite3), vanilla HTML/CSS/JS frontend.

## Deployment

- **Local**: `npm run dev` -- homepage at http://localhost:3654, board at http://localhost:3654/board
- **Production**: https://limoncello.fly.dev (Fly.io, SQLite on persistent volume)
- **Auth**: Three-tier model -- admin key (env var), agent keys (database-backed `lmn_` prefix), or open mode (no auth configured). See Key Architecture below.
- **Rate Limits**: `POST /api/keys` is rate-limited to 10 requests/min/IP to prevent abuse of the unauthenticated bootstrapping endpoint.

## Key Architecture

- **Database**: SQLite at `./data/limoncello.db` -- created automatically on first run
- **Schema-on-startup**: Tables (api_keys, projects, cards) created via `CREATE TABLE IF NOT EXISTS` in `src/db.js`. `api_keys` is created first so the `projects.owner_key_id` foreign key can reference it.
- **Projects table**: Each project has custom columns (JSON array of `{key, label, substatuses}`) and an `owner_key_id` column (nullable FK to `api_keys`) identifying the key that owns the project. `NULL` = admin-owned.
- **Cards table**: Cards belong to projects via `project_id` foreign key
- **Project ownership**: Every project is owned by exactly one agent key (or NULL = admin-owned). Agent keys see and mutate only their own projects and the cards inside them; cross-tenant reads return 404 (existence is never leaked). The admin key bypasses all ownership checks. Shared helper lives in `src/lib/access.js` (`isAuthConfigured`, `canAccessProject`) and is used by both route modules.
- **Default project**: Created on first run for backward compatibility. It is admin-owned and invisible to agent keys.
- **Sub-statuses**: Columns can define optional sub-statuses. Cards have nullable `substatus` field, validated against column definition
- **IDs**: nanoid with `crd_` prefix for cards, `prj_` prefix for projects, `key_` prefix for API keys (`src/lib/ids.js`)
- **Port**: 3654
- **Auth**: Three-tier: (1) admin key from `LIMONCELLO_API_KEY` env var -- full access including key management and every project; (2) agent keys from `api_keys` table -- full CRUD on projects they own, zero visibility into other projects, no key management; (3) open mode -- if no admin key and no agent keys exist, all routes are open (local dev)
- **API keys**: `POST /api/keys` is unauthenticated and rate-limited to 10 requests/min/IP. Each bootstrap atomically creates the key, a private project owned by the key, and a welcome card (see `src/routes/keys.js`). The response includes `project_id` for the new private board. Keys use `lmn_` prefix + 48 chars. Only SHA-256 hash stored; plaintext returned once at creation. `GET /api/keys` and `DELETE /api/keys/:id` are admin-only.
- **API**: REST at `/api/projects` and `/api/projects/:projectId/cards` (`src/routes/projects.js`, `src/routes/cards.js`)
- **Backward compat**: `/api/cards` routes to the caller's first-owned project (or the first admin-owned project in open/admin mode)
- **Homepage**: Static landing page at `/` (`src/public/index.html`) -- links to `/board` and `/api/man`
- **Board**: Kanban UI at `/board` (`src/public/board.html`) -- served via explicit route and static middleware
- **UI**: Vanilla HTML/CSS/JS served from `src/public/`, dynamic columns based on selected project
- **MCP (STDIO)**: `src/mcp.mjs` -- STDIO transport entry point for local subprocess use
- **MCP (HTTP)**: `/mcp` endpoint in `src/index.js` -- Streamable HTTP transport for remote use. Each MCP session uses the CALLER'S bearer token (not the admin key) so the caller's role and project ownership are preserved end-to-end through the MCP tool surface.
- **MCP tools**: `src/mcp-tools.mjs` -- shared tool definitions used by both transports
- **WebSocket**: `/ws` endpoint for real-time board updates (`src/ws.js`). Clients subscribe to a project; card mutations broadcast to all subscribers. Accepts both admin and agent keys via `?token=` query param. Agent keys may only subscribe to projects they own (otherwise the socket closes with code 1008 Forbidden).

## Project Structure

```
src/
  index.js            # Express server entry point (includes /mcp HTTP transport, WebSocket setup)
  db.js               # SQLite connection + schema init
  ws.js               # WebSocket server -- real-time broadcast to connected browsers
  mcp.mjs             # MCP server entry point (STDIO transport)
  mcp-tools.mjs       # Shared MCP tool definitions (used by both transports)
  lib/ids.js          # Card, project, and key ID generation (crd_, prj_, key_ prefixes)
  lib/access.js       # Shared auth helpers: isAuthConfigured, canAccessProject
  lib/welcome.js      # Welcome card title and description constants
  routes/projects.js  # Project CRUD API (scoped by owner_key_id)
  routes/cards.js     # Card CRUD API (ownership-gated, broadcasts via WebSocket)
  routes/keys.js      # API key management (bootstrap atomically creates private project + welcome card)
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

MCP resources: `limoncello://guide` (comprehensive agent guide for using Limoncello effectively)

All card tools accept optional `project_id` parameter (defaults to Default project).

### Known Behavior: Deployments Break MCP Sessions

**MCP sessions are stored in memory and do not persist across server restarts.** When Limoncello is deployed to Fly.io, all active MCP sessions are lost.

**What this means:**
- During/after a deployment, MCP tool calls will fail with "Session not found" errors
- Claude Code will automatically reconnect on the next tool call
- Simply retry the failed tool call - the connection will be re-established automatically
- No manual intervention needed

**Why this happens:**
- Sessions are stored in a Map() in src/index.js (in-memory only)
- Deployments restart the server, clearing all in-memory data
- No session persistence to SQLite (intentional trade-off for simplicity)

**Impact:**
- Minimal - deployments are infrequent and reconnects are automatic
- If this becomes a pain point, session persistence can be added later

### Onboarding a New Project

When setting up Limoncello for a new codebase:
1. **Create a dedicated project** first: `limoncello_create_project` with a descriptive name matching the codebase
2. **Then run onboarding**: `limoncello_onboard` with the new project_id
3. The agent will automatically edit CLAUDE.md and .claude/settings.json with board documentation and automation hooks

**Note**: .claude.json is Claude's state file (MCP server config). .claude/settings.json is for hooks configuration.

**IMPORTANT**: Each codebase should have its own dedicated Limoncello project, NOT share the Default project.

## Limoncello Board

This project tracks work on: **Limoncello** (`prj_uEgwVnLhTbZI`)

At session start, check for tasks:
```
limoncello_board(project_id: "prj_uEgwVnLhTbZI")
```

Working on tasks:
- Move cards to `in_progress` when starting work
- Move to `blocked` if waiting on human input
- Move to `done` when finished
- Add new cards to `backlog` when discovering work

The board is shared with humans via the web UI. Check it regularly to stay coordinated.

## API Endpoints

### Board Endpoints (Projects)

**Terminology reminder:** "Project" in Limoncello = board with custom columns. Cards = tasks on that board.

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/projects | List all boards |
| POST | /api/projects | Create a board |
| GET | /api/projects/:id | Get a board |
| PATCH | /api/projects/:id | Update a board |
| DELETE | /api/projects/:id | Delete a board |

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
