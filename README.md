# Prello

A local-first Kanban board for human-AI collaboration. Humans manage cards via a web UI, Claude manages them via MCP tools or slash commands. Both share the same board.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:3654 in your browser.

## Features

- Multiple projects with custom columns per project
- Sub-statuses per column (e.g., Blocked with Human Review / Agent Review)
- Dynamic Kanban board that adapts to each project's column configuration
- Drag-and-drop cards between columns and reorder within columns
- Create, edit, and delete cards from the web UI
- Project management: create projects, define custom columns, switch between projects
- MCP server for Claude Desktop and Claude Code integration
- Slash commands for Claude Code
- SQLite database -- zero configuration, data persists in `./data/prello.db`
- Deployable to Fly.io with persistent volume and bearer token auth

## MCP Server (Claude Desktop / Claude Code)

The MCP server lets Claude create, list, move, and view cards as part of its workflow. Two transports are available:

### Remote (Streamable HTTP -- recommended)

Connect Claude Code directly to a deployed Prello instance. No local process needed:

```bash
claude mcp add prello -s user --transport http \
  --header "Authorization: Bearer <your-api-key>" \
  -- https://prello.fly.dev/mcp
```

The `/mcp` endpoint supports the MCP Streamable HTTP transport with stateful sessions. Auth uses the same `PRELLO_API_KEY` bearer token as the REST API.

### Local (STDIO)

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

### Tools

`prello_projects`, `prello_create_project`, `prello_add`, `prello_list`, `prello_move`, `prello_board`

The `prello_create_project` tool accepts an optional `columns_file` parameter -- a path to a JSON file defining the project's name and columns. See `examples/columns-template.json` for the format.

All card tools accept an optional `project_id` parameter. If omitted, they operate on the Default project.

## Slash Commands (Claude Code)

With the Prello server running, use these slash commands in Claude Code:

| Command | Description |
|---------|-------------|
| `/prello-projects` | List all projects |
| `/prello-create-project "name" [--file <path>]` | Create a project (optionally from a JSON file) |
| `/prello-add "title" [--status todo] [--substatus key] [--description "..."] [--project <id>]` | Create a card |
| `/prello-list [--status in_progress] [--project <id>]` | List cards |
| `/prello-move <card-id> <status> [--substatus key] [--project <id>]` | Move a card |
| `/prello-board [--project <id>]` | Board overview |

All card commands accept an optional `--project <project-id>` parameter. If omitted, they operate on the Default project.

## API

When `PRELLO_API_KEY` is set, requests require `Authorization: Bearer <key>` header.

### Project Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/projects | List all projects |
| POST | /api/projects | Create a project `{ name, columns? }` |
| GET | /api/projects/:id | Get a project |
| PATCH | /api/projects/:id | Update a project |
| DELETE | /api/projects/:id | Delete a project |

### Card Endpoints (Project-scoped)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/projects/:projectId/cards | List cards in project (filter with `?status=`) |
| POST | /api/projects/:projectId/cards | Create a card `{ title, description?, status?, substatus? }` |
| GET | /api/projects/:projectId/cards/:id | Get a card |
| PATCH | /api/projects/:projectId/cards/:id | Update a card (substatus auto-clears on column change) |
| DELETE | /api/projects/:projectId/cards/:id | Delete a card |
| PATCH | /api/projects/:projectId/cards/reorder | Batch update positions |

### Card Endpoints (Backward Compatibility)

For backward compatibility, `/api/cards` routes to the Default project:

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check (no auth required) |
| GET | /api/cards | List cards in Default project (filter with `?status=`) |
| POST | /api/cards | Create a card in Default project `{ title, description?, status?, substatus? }` |
| GET | /api/cards/:id | Get a card |
| PATCH | /api/cards/:id | Update a card (substatus auto-clears on column change) |
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
| PRELLO_API_KEY | (none) | Bearer token for API auth (required when deployed). Must not resemble a third-party key (e.g., Stripe `sk_live_*` / `sk_test_*` patterns are rejected on startup). Use a random string like `openssl rand -base64 32`. |

## License

MIT
