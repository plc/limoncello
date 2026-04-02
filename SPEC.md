# Prello -- Product Specification

## 1. Problem Statement

When working with AI agents (Claude Code in particular), there is no lightweight way to share a structured task list between human and AI. The human thinks "we need to do X, Y, Z" but communicates this ad hoc in conversation. The AI thinks "I should also do A, B, C" but has no persistent place to track it.

Prello solves this by providing a simple, local-first Trello-style board where both humans and AI agents can create, view, move, and manage cards.

## 2. Goals

- A human can open a browser, see a board with columns, and drag cards between them
- Claude (Desktop or Code) can create a card, list cards, and move a card via MCP tools or slash commands
- Cards persist across restarts (SQLite)
- Setup: `npm install && npm run dev` gets a working board immediately

## 3. Non-Goals (v1)

- Multiple boards (one board is enough; add `board_id` column later)
- Real-time sync (browser refresh is fine; polling or WebSockets later)
- Card comments, due dates, assignments, labels, attachments
- Mobile-optimized UI
- Multi-user auth (single API key is sufficient for now)

## 4. Architecture

### Stack
- **Runtime**: Node.js 20 + Express
- **Database**: SQLite via better-sqlite3, stored at `./data/prello.db`
- **UI**: Vanilla HTML + CSS + JS (no build step, no framework)
- **Port**: 3654
- **Auth**: Optional bearer token via `PRELLO_API_KEY` env var
- **IDs**: nanoid with `crd_` prefix

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS cards (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  description TEXT DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'backlog'
             CHECK (status IN ('backlog', 'todo', 'in_progress', 'done')),
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status, position);
```

### Valid Statuses

| Value | Display Label |
|-------|---------------|
| `backlog` | Backlog |
| `todo` | To Do |
| `in_progress` | In Progress |
| `done` | Done |

## 5. API

All endpoints return JSON. Errors return `{ "error": "message" }`.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | `{ "status": "ok", "timestamp": "..." }` |
| GET | /api/cards | List all cards (optional `?status=`) |
| POST | /api/cards | Create a card |
| GET | /api/cards/:id | Get a single card |
| PATCH | /api/cards/:id | Update a card (partial) |
| DELETE | /api/cards/:id | Delete a card (204) |
| PATCH | /api/cards/reorder | Batch update positions |

### Card Shape

```json
{
  "id": "crd_abc123",
  "title": "Fix login bug",
  "description": "Users can't log in on Safari",
  "status": "todo",
  "position": 3,
  "created_at": "2026-04-02T10:00:00",
  "updated_at": "2026-04-02T10:00:00"
}
```

### Request Bodies

**POST /api/cards**: `{ title: string, description?: string, status?: string }`
- `title` is required and must be non-empty
- `status` defaults to `backlog`
- `position` auto-assigned as max(position) + 1 within the status

**PATCH /api/cards/:id**: `{ title?: string, description?: string, status?: string, position?: number }`
- When status changes and no position is provided, position is auto-assigned in the new column

**PATCH /api/cards/reorder**: `{ cards: [{ id: string, position: number }] }`
- Batch-updates positions after drag-and-drop reordering

## 6. Web UI

- Four-column Kanban board (Backlog, To Do, In Progress, Done)
- Cards display title; click to open detail modal with description
- Drag-and-drop cards between columns (updates status) and within columns (reorder)
- "Add card" button at bottom of each column with inline form
- Card detail modal: edit title/description, delete card
- Dark theme, vanilla HTML/CSS/JS served statically from `src/public/`

## 7. MCP Server

`src/mcp.mjs` -- STDIO transport MCP server for Claude Desktop and Claude Code.

Configured via `PRELLO_URL` and `PRELLO_API_KEY` env vars. Calls the REST API over HTTP.

| Tool | Description |
|------|-------------|
| `prello_add` | Create a card with title, optional status and description |
| `prello_list` | List cards, optionally filtered by status |
| `prello_move` | Move a card to a different status |
| `prello_board` | Show board summary with card counts and listing |

## 8. Claude Code Slash Commands

Commands live in `.claude/commands/` and use `curl` to talk to the local API.

| Command | Description |
|---------|-------------|
| `/prello-add` | Create a card with title, optional status and description |
| `/prello-list` | List cards, optionally filtered by status |
| `/prello-move` | Move a card to a different status |
| `/prello-board` | Show board summary with card counts and listing |

## 9. Deployment

- **Local**: `npm run dev` at http://localhost:3654
- **Production**: https://prello.fly.dev (Fly.io, SQLite on persistent volume, `PRELLO_API_KEY` required)

## 10. Project Structure

```
src/
  index.js          # Express server entry point
  db.js             # SQLite connection + schema init
  mcp.mjs           # MCP server (STDIO transport)
  lib/ids.js        # Card ID generation (crd_ prefix)
  routes/cards.js   # Card CRUD API
  public/
    index.html      # Kanban board UI
    style.css       # Board styles
    app.js          # Client-side JS
.claude/commands/
  prello-add.md
  prello-list.md
  prello-move.md
  prello-board.md
```
