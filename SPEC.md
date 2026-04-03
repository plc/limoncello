# Limoncello -- Product Specification

## 1. Problem Statement

When working with AI agents (Claude Code in particular), there is no lightweight way to share a structured task list between human and AI. The human thinks "we need to do X, Y, Z" but communicates this ad hoc in conversation. The AI thinks "I should also do A, B, C" but has no persistent place to track it.

Limoncello solves this by providing a simple, local-first Trello-style board where both humans and AI agents can create, view, move, and manage cards.

## 2. Goals

- A human can open a browser, see a board with columns, and drag cards between them
- Claude (Desktop or Code) can create a card, list cards, and move a card via MCP tools or slash commands
- Cards persist across restarts (SQLite)
- Setup: `npm install && npm run dev` gets a working board immediately

## 3. Non-Goals (v1)

- Real-time sync (browser refresh is fine; polling or WebSockets later)
- Card comments, due dates, assignments, labels, attachments
- Mobile-optimized UI
- Multi-user auth (single API key is sufficient for now)

## 4. Architecture

### Stack
- **Runtime**: Node.js 20 + Express
- **Database**: SQLite via better-sqlite3, stored at `./data/limoncello.db`
- **UI**: Vanilla HTML + CSS + JS (no build step, no framework)
- **Port**: 3654
- **Auth**: Optional bearer token via `LIMONCELLO_API_KEY` env var
- **IDs**: nanoid with `crd_` prefix

### Database Schema

**Projects table:**

```sql
CREATE TABLE IF NOT EXISTS projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  columns    TEXT NOT NULL,  -- JSON array of {key, label, substatuses: [{key, label}, ...]}
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Cards table:**

```sql
CREATE TABLE IF NOT EXISTS cards (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'backlog',
  substatus   TEXT DEFAULT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cards_project_status ON cards(project_id, status, position);
```

### Valid Statuses

Statuses are now dynamic per project, defined by each project's `columns` field (JSON array).

Default columns for new projects:

| Key | Label |
|-----|-------|
| `backlog` | Backlog |
| `todo` | To Do |
| `in_progress` | In Progress |
| `done` | Done |

Projects can define custom columns via the columns JSON array, e.g.:
```json
[
  {"key": "backlog", "label": "Backlog", "substatuses": []},
  {"key": "todo", "label": "To Do", "substatuses": []},
  {"key": "in_progress", "label": "In Progress", "substatuses": []},
  {"key": "blocked", "label": "Blocked", "substatuses": [
    {"key": "human_review", "label": "Human Review"},
    {"key": "agent_review", "label": "Agent Review"}
  ]},
  {"key": "done", "label": "Done", "substatuses": []}
]
```

### Sub-statuses

Columns can optionally define sub-statuses. Sub-statuses are validated against the column definition when creating or updating cards.

Default columns for new projects:

| Column Key | Column Label | Sub-statuses |
|-----------|-------------|--------------|
| `backlog` | Backlog | (none) |
| `todo` | To Do | (none) |
| `in_progress` | In Progress | (none) |
| `blocked` | Blocked | `human_review` (Human Review), `agent_review` (Agent Review) |
| `done` | Done | (none) |

When a card moves to a different column, its substatus is automatically cleared to null unless a new substatus is explicitly provided.

## 5. API

All endpoints return JSON. Errors return `{ "error": "message" }`.

### Project Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/projects | List all projects |
| POST | /api/projects | Create a project |
| GET | /api/projects/:id | Get a single project |
| PATCH | /api/projects/:id | Update a project (partial) |
| DELETE | /api/projects/:id | Delete a project (204) |

### Card Endpoints (Project-scoped)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/projects/:projectId/cards | List cards in project (optional `?status=`) |
| POST | /api/projects/:projectId/cards | Create a card in project |
| GET | /api/projects/:projectId/cards/:id | Get a single card |
| PATCH | /api/projects/:projectId/cards/:id | Update a card (partial) |
| DELETE | /api/projects/:projectId/cards/:id | Delete a card (204) |
| PATCH | /api/projects/:projectId/cards/reorder | Batch update positions |

### Card Endpoints (Backward Compatibility)

For backward compatibility, `/api/cards` routes to the Default project:

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | `{ "status": "ok", "timestamp": "..." }` |
| GET | /api/cards | List cards in Default project (optional `?status=`) |
| POST | /api/cards | Create a card in Default project |
| GET | /api/cards/:id | Get a single card from Default project |
| PATCH | /api/cards/:id | Update a card in Default project (partial) |
| DELETE | /api/cards/:id | Delete a card from Default project (204) |
| PATCH | /api/cards/reorder | Batch update positions in Default project |

### Project Shape

```json
{
  "id": "prj_abc123",
  "name": "My Project",
  "columns": [
    {"key": "backlog", "label": "Backlog"},
    {"key": "todo", "label": "To Do"},
    {"key": "in_progress", "label": "In Progress"},
    {"key": "done", "label": "Done"}
  ],
  "created_at": "2026-04-02T10:00:00",
  "updated_at": "2026-04-02T10:00:00"
}
```

### Card Shape

```json
{
  "id": "crd_abc123",
  "project_id": "prj_abc123",
  "title": "Fix login bug",
  "description": "Users can't log in on Safari",
  "status": "blocked",
  "substatus": "human_review",
  "position": 3,
  "created_at": "2026-04-02T10:00:00",
  "updated_at": "2026-04-02T10:00:00"
}
```

### Request Bodies

**POST /api/projects**: `{ name: string, columns?: array }`
- `name` is required and must be non-empty
- `columns` is optional, defaults to standard four-column layout (backlog, todo, in_progress, done)

**PATCH /api/projects/:id**: `{ name?: string, columns?: array }`
- All fields are optional

**POST /api/projects/:projectId/cards** or **POST /api/cards**: `{ title: string, description?: string, status?: string, substatus?: string }`
- `title` is required and must be non-empty
- `status` defaults to first column in project, or `backlog` for Default project
- `substatus` is optional and validated against the column's defined sub-statuses
- `position` auto-assigned as max(position) + 1 within the status

**PATCH /api/projects/:projectId/cards/:id** or **PATCH /api/cards/:id**: `{ title?: string, description?: string, status?: string, substatus?: string|null, position?: number }`
- When status changes and no position is provided, position is auto-assigned in the new column
- When `status` changes and `substatus` is not provided, substatus auto-clears to null

**PATCH /api/projects/:projectId/cards/reorder** or **PATCH /api/cards/reorder**: `{ cards: [{ id: string, position: number }] }`
- Batch-updates positions after drag-and-drop reordering

## 6. Web UI

- Project selector dropdown in header to switch between projects
- Dynamic column layout based on selected project's columns
- Cards display title; click to open detail modal with description
- Drag-and-drop cards between columns (updates status) and within columns (reorder)
- "Add card" button at bottom of each column with inline form
- Card detail modal: edit title/description, delete card
- Project settings modal: create new projects, edit project name and columns
- Dark theme, vanilla HTML/CSS/JS served statically from `src/public/`

## 7. MCP Server

Two transports are supported:

- **Streamable HTTP**: `/mcp` endpoint in `src/index.js` -- for remote connections (e.g. Claude Code connecting to `https://prello.fly.dev/mcp`). Stateful sessions with `Mcp-Session-Id` header. Auth via same `LIMONCELLO_API_KEY` bearer token. MCP tools call the API on `localhost` within the same process.
- **STDIO**: `src/mcp.mjs` -- for local subprocess use (Claude Desktop, Claude Code local config). Configured via `LIMONCELLO_URL` and `LIMONCELLO_API_KEY` env vars. Calls the REST API over HTTP.

Shared tool definitions live in `src/mcp-tools.mjs`.

| Tool | Description |
|------|-------------|
| `limoncello_projects` | List all projects with their names, IDs, and columns |
| `limoncello_create_project` | Create a project with name, optional inline columns, or a `columns_file` path to load columns from a JSON file |
| `limoncello_add` | Create a card with title, optional status, substatus, description, and project_id |
| `limoncello_list` | List cards (displays sub-status labels), optionally filtered by status and project_id |
| `limoncello_move` | Move a card to a different status, with optional substatus and project_id |
| `limoncello_board` | Show board summary with card counts and listing (displays sub-status labels), with optional project_id |

The `limoncello_create_project` tool accepts an optional `columns_file` parameter -- a local file path to a JSON file containing `name` (optional) and `columns` (array). When provided, the file's columns take precedence over inline `columns`. The `name` parameter takes precedence over the file's `name`. See `examples/columns-template.json` for the file format.

All card tools accept an optional `project_id` parameter. If omitted, they operate on the Default project.

## 8. Claude Code Slash Commands

Commands live in `.claude/commands/` and use `curl` to talk to the local API.

| Command | Description |
|---------|-------------|
| `/limoncello-projects` | List all projects with their names, IDs, and columns |
| `/limoncello-create-project` | Create a project with name, optional `--file <path>` to load columns from a JSON file |
| `/limoncello-add` | Create a card with title, optional --status, --substatus, --description, and --project flags |
| `/limoncello-list` | List cards, optionally filtered by --status and --project flags |
| `/limoncello-move` | Move a card to a different status, with optional --substatus and --project flags |
| `/limoncello-board` | Show board summary with card counts and listing, with optional --project flag |

All card commands accept an optional `--project <project-id>` parameter. If omitted, they operate on the Default project.

## 9. Deployment

- **Local**: `npm run dev` at http://localhost:3654
- **Production**: https://prello.fly.dev (Fly.io, SQLite on persistent volume, `LIMONCELLO_API_KEY` required)

## 10. Project Structure

```
src/
  index.js            # Express server entry point (includes /mcp HTTP transport)
  db.js               # SQLite connection + schema init
  mcp.mjs             # MCP server entry point (STDIO transport)
  mcp-tools.mjs       # Shared MCP tool definitions (used by both transports)
  lib/ids.js          # Card and project ID generation (crd_, prj_ prefixes)
  routes/projects.js  # Project CRUD API
  routes/cards.js     # Card CRUD API
  public/
    index.html        # Kanban board UI
    style.css         # Board styles
    app.js            # Client-side JS
.claude/commands/
  limoncello-projects.md         # /limoncello-projects slash command
  limoncello-create-project.md   # /limoncello-create-project slash command
  limoncello-add.md              # /limoncello-add slash command
  limoncello-list.md             # /limoncello-list slash command
  limoncello-move.md             # /limoncello-move slash command
  limoncello-board.md            # /limoncello-board slash command
examples/
  columns-template.json      # Example column definition file for project creation
```
