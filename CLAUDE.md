# CLAUDE.md

Instructions for Claude Code. See [SPEC.md](SPEC.md) for the full product spec.

## Project Overview

Prello is a local-first Kanban board for human-AI collaboration. Humans use the web UI, Claude uses the MCP server or slash commands. Both create and manage cards on shared projects.

Projects feature: Each project has its own custom columns. Cards belong to projects. The Default project provides backward compatibility.

Stack: Node.js + Express + SQLite (better-sqlite3), vanilla HTML/CSS/JS frontend.

## Deployment

- **Local**: `npm run dev` -- board at http://localhost:3654
- **Production**: https://prello.fly.dev (Fly.io, SQLite on persistent volume)
- **Auth**: Bearer token via `PRELLO_API_KEY` env var. Required on Fly.io, optional locally.

## Key Architecture

- **Database**: SQLite at `./data/prello.db` -- created automatically on first run
- **Schema-on-startup**: Tables (projects, cards) created via `CREATE TABLE IF NOT EXISTS` in `src/db.js`
- **Projects table**: Each project has custom columns (stored as JSON array of {key, label, substatuses})
- **Cards table**: Cards belong to projects via `project_id` foreign key
- **Default project**: Created on first run for backward compatibility
- **Sub-statuses**: Columns can define optional sub-statuses. Cards have nullable `substatus` field, validated against column definition
- **IDs**: nanoid with `crd_` prefix for cards, `prj_` prefix for projects (`src/lib/ids.js`)
- **Port**: 3654
- **Auth**: Bearer token via `PRELLO_API_KEY` (optional; if unset, no auth required)
- **API**: REST at `/api/projects` and `/api/projects/:projectId/cards` (`src/routes/projects.js`, `src/routes/cards.js`)
- **Backward compat**: `/api/cards` routes to Default project
- **UI**: Vanilla HTML/CSS/JS served from `src/public/`, dynamic columns based on selected project
- **MCP (STDIO)**: `src/mcp.mjs` -- STDIO transport entry point for local subprocess use
- **MCP (HTTP)**: `/mcp` endpoint in `src/index.js` -- Streamable HTTP transport for remote use
- **MCP tools**: `src/mcp-tools.mjs` -- shared tool definitions used by both transports
- **WebSocket**: `/ws` endpoint for real-time board updates (`src/ws.js`). Clients subscribe to a project; card mutations broadcast to all subscribers. Auth via `?token=` query param when `PRELLO_API_KEY` is set.

## Project Structure

```
src/
  index.js            # Express server entry point (includes /mcp HTTP transport, WebSocket setup)
  db.js               # SQLite connection + schema init
  ws.js               # WebSocket server -- real-time broadcast to connected browsers
  mcp.mjs             # MCP server entry point (STDIO transport)
  mcp-tools.mjs       # Shared MCP tool definitions (used by both transports)
  lib/ids.js          # Card and project ID generation (crd_, prj_ prefixes)
  routes/projects.js  # Project CRUD API
  routes/cards.js     # Card CRUD API (broadcasts via WebSocket on mutations)
  public/
    index.html        # Kanban board UI
    style.css         # Board styles
    app.js            # Client-side JS
.claude/commands/
  prello-projects.md         # /prello-projects slash command
  prello-create-project.md   # /prello-create-project slash command
  prello-add.md              # /prello-add slash command
  prello-list.md             # /prello-list slash command
  prello-move.md             # /prello-move slash command
  prello-board.md            # /prello-board slash command
  prello-changes.md          # /prello-changes slash command
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
curl -X POST https://prello.fly.dev/api/projects/prj_abc123/cards \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $PRELLO_API_KEY" \
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
claude mcp add prello -s user --transport http \
  --header "Authorization: Bearer <your-api-key>" \
  -- https://prello.fly.dev/mcp
```

### Local (STDIO)

For Claude Desktop (`claude_desktop_config.json`) or Claude Code (`.claude.json`):

```json
{
  "mcpServers": {
    "prello": {
      "command": "node",
      "args": ["/Users/plc/Documents/prello/src/mcp.mjs"],
      "env": {
        "PRELLO_URL": "https://prello.fly.dev",
        "PRELLO_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

MCP tools: `prello_projects`, `prello_create_project` (with `columns_file`), `prello_add` (with substatus), `prello_list`, `prello_move` (with substatus), `prello_board`, `prello_changes`

All card tools accept optional `project_id` parameter (defaults to Default project).

## Working with the Prello Board

This project tracks its own work on a Prello board: **Prello Development** (`prj_UevwwjWyYEEG`).

### On session start

At the beginning of every session, check the board for current tasks:

```
prello_board(project_id: "prj_UevwwjWyYEEG")
```

Or use `prello_changes` with a `since` timestamp if you know when your last session ended. The `server_time` in the response can be stored and reused as `since` next time.

### Working on tasks

- Before starting work on a card, move it to `in_progress`
- If blocked (waiting on human input, unclear requirements), move it to `blocked` with an appropriate substatus (`human_review` or `agent_review`)
- When finished, move it to `done`
- If you discover new work while implementing a task, add it as a new card in `backlog`

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

### Backward Compatibility (Default project)

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check (no auth) |
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

- **Fly.io SSH tests unreliable**: The machine has `auto_stop_machines = 'stop'` in `fly.toml`, so `fly ssh console` often fails with "Connection refused" because the machine is stopped. Don't waste time debugging SSH -- test via the public URL (`https://prello.fly.dev/...`) instead.

## Git Workflow

- Update CHANGELOG.md before committing
- Commit locally after completing work
- Do not push without explicit permission
