# CLAUDE.md

Instructions for Claude Code. See [SPEC.md](SPEC.md) for the full product spec.

## Project Overview

Prello is a local-first Kanban board for human-AI collaboration. Humans use the web UI, Claude uses slash commands. Both create and manage cards on a shared board.

Stack: Node.js + Express + SQLite (better-sqlite3), vanilla HTML/CSS/JS frontend.

## Key Architecture

- **Database**: SQLite at `./data/prello.db` -- created automatically on first run
- **Schema-on-startup**: Table created via `CREATE TABLE IF NOT EXISTS` in `src/db.js`
- **IDs**: nanoid with `crd_` prefix (`src/lib/ids.js`)
- **Port**: 3654
- **No auth**: Single-user, local tool
- **API**: REST at `/api/cards` (`src/routes/cards.js`)
- **UI**: Vanilla HTML/CSS/JS served from `src/public/`

## Project Structure

```
src/
  index.js          # Express server entry point
  db.js             # SQLite connection + schema init
  lib/ids.js        # Card ID generation (crd_ prefix)
  routes/cards.js   # Card CRUD API
  public/
    index.html      # Kanban board UI
    style.css       # Board styles
    app.js          # Client-side JS
.claude/commands/
  prello-add.md     # /prello-add slash command
  prello-list.md    # /prello-list slash command
  prello-move.md    # /prello-move slash command
  prello-board.md   # /prello-board slash command
```

## Common Tasks

```bash
# Start dev server (auto-reload)
npm run dev

# Start production server
npm start

# With Docker
docker compose up --build

# Health check
curl http://127.0.0.1:3654/health

# Create a card
curl -X POST http://127.0.0.1:3654/api/cards \
  -H "Content-Type: application/json" \
  -d '{"title": "Test card", "status": "todo"}'

# List cards
curl http://127.0.0.1:3654/api/cards
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| GET | /api/cards | List cards (optional `?status=`) |
| POST | /api/cards | Create card |
| GET | /api/cards/:id | Get card |
| PATCH | /api/cards/:id | Update card |
| DELETE | /api/cards/:id | Delete card |
| PATCH | /api/cards/reorder | Batch update positions |

## Valid Statuses

`backlog`, `todo`, `in_progress`, `done`

## Documentation Maintenance

| File | When to Update |
|------|----------------|
| **CHANGELOG.md** | After every significant change |
| **SPEC.md** | When API, schema, or architecture changes |
| **README.md** | When user-facing details change |
| **CLAUDE.md** | When project context changes |

## Git Workflow

- Update CHANGELOG.md before committing
- Commit locally after completing work
- Do not push without explicit permission
