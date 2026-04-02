# Prello

A local-first Kanban board for human-AI collaboration. Humans manage cards via a web UI, Claude manages them via MCP tools or slash commands. Both share the same board.

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
- MCP server for Claude Desktop and Claude Code integration
- Slash commands for Claude Code
- SQLite database -- zero configuration, data persists in `./data/prello.db`
- Deployable to Fly.io with persistent volume and bearer token auth

## MCP Server (Claude Desktop / Claude Code)

The MCP server lets Claude create, list, move, and view cards as part of its workflow.

Add to your Claude Desktop config (`claude_desktop_config.json`) or Claude Code project config:

```json
{
  "mcpServers": {
    "prello": {
      "command": "node",
      "args": ["/path/to/prello/src/mcp.mjs"],
      "env": {
        "PRELLO_URL": "https://prello.fly.dev",
        "PRELLO_API_KEY": "your-api-key"
      }
    }
  }
}
```

For local use without auth, set `PRELLO_URL` to `http://localhost:3654` and omit `PRELLO_API_KEY`.

Tools: `prello_add`, `prello_list`, `prello_move`, `prello_board`

## Slash Commands (Claude Code)

With the Prello server running, use these slash commands in Claude Code:

| Command | Description |
|---------|-------------|
| `/prello-add "title" [--status todo] [--description "..."]` | Create a card |
| `/prello-list [--status in_progress]` | List cards |
| `/prello-move <card-id> <status>` | Move a card |
| `/prello-board` | Board overview |

## API

All endpoints are at `/api/cards`. When `PRELLO_API_KEY` is set, requests require `Authorization: Bearer <key>` header.

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check (no auth required) |
| GET | /api/cards | List all cards (filter with `?status=`) |
| POST | /api/cards | Create a card `{ title, description?, status? }` |
| GET | /api/cards/:id | Get a card |
| PATCH | /api/cards/:id | Update a card |
| DELETE | /api/cards/:id | Delete a card |
| PATCH | /api/cards/reorder | Batch update positions |

## Deployment

Deployed at https://prello.fly.dev

```bash
fly deploy
```

SQLite data persists on a Fly.io volume. Auth is required via `PRELLO_API_KEY` secret.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3654 | Server port |
| DATABASE_PATH | ./data/prello.db | SQLite database file path |
| PRELLO_API_KEY | (none) | Bearer token for API auth (required when deployed) |

## License

MIT
