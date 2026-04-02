# Prello

A local-first Kanban board for human-AI collaboration. Humans manage cards via a web UI, Claude Code manages them via slash commands. Both share the same board.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:3654 in your browser.

## Features

- Four-column Kanban board: Backlog, To Do, In Progress, Done
- Drag-and-drop cards between columns and reorder within columns
- Create, edit, and delete cards from the web UI
- Claude Code slash commands for AI-driven card management
- SQLite database -- zero configuration, data persists in `./data/prello.db`

## Claude Code Commands

With the Prello server running, use these slash commands in Claude Code:

| Command | Description |
|---------|-------------|
| `/prello-add "title" [--status todo] [--description "..."]` | Create a card |
| `/prello-list [--status in_progress]` | List cards |
| `/prello-move <card-id> <status>` | Move a card |
| `/prello-board` | Board overview |

## API

All endpoints are at `http://localhost:3654/api/cards`.

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/cards | List all cards (filter with `?status=`) |
| POST | /api/cards | Create a card `{ title, description?, status? }` |
| GET | /api/cards/:id | Get a card |
| PATCH | /api/cards/:id | Update a card |
| DELETE | /api/cards/:id | Delete a card |
| PATCH | /api/cards/reorder | Batch update positions |

## With Docker

```bash
docker compose up --build
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3654 | Server port |
| DATABASE_PATH | ./data/prello.db | SQLite database file path |

## License

MIT
