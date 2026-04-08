# Limoncello

Kanban board for human-AI collaboration. Humans use the web board, agents use MCP tools. Both share the same board.

## Getting Started

### Web UI

Open the Kanban board at https://limoncello.fly.dev/board

Create projects, define custom columns, drag cards between columns, and manage your workflow from the browser.

### MCP Setup

Connect Claude to Limoncello via the MCP HTTP transport:

```bash
claude mcp add limoncello -s user --transport http \
  --header "Authorization: Bearer <your-api-key>" \
  -- https://limoncello.fly.dev/mcp
```

Once connected, Claude can create, list, move, and view cards as part of its workflow.

**Note:** MCP sessions are stored in memory and break during server deployments. If you see "Session not found" errors after a deployment, simply retry the tool call - Claude Code will automatically reconnect.

### REST API

API documentation is available at https://limoncello.fly.dev/api/man

All endpoints require `Authorization: Bearer <your-api-key>` header.

## MCP Tools

The MCP server provides these tools for Claude:

| Tool | Description |
|------|-------------|
| `limoncello_projects` | List all projects with their names, IDs, and columns |
| `limoncello_create_project` | Create a project with name and optional custom columns |
| `limoncello_add` | Create a card with title, optional status, substatus, description, and project_id |
| `limoncello_list` | List cards, optionally filtered by status and project_id |
| `limoncello_move` | Move a card to a different status, with optional substatus and project_id |
| `limoncello_board` | Show board summary with card counts and listings, with optional project_id |
| `limoncello_changes` | Get cards that have changed since a given timestamp |

All card tools accept an optional `project_id` parameter. If omitted, they operate on the Default project.

## REST API

All requests require `Authorization: Bearer <your-api-key>` header.

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

## Development

For contributors and local development:

```bash
npm install
npm run dev
```

Open http://localhost:3654 in your browser.

### Deployment

Deployed to https://limoncello.fly.dev via Fly.io:

```bash
fly deploy
```

SQLite data persists on a Fly.io volume. Auth is required via `LIMONCELLO_API_KEY` secret.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3654 | Server port |
| DATABASE_PATH | ./data/limoncello.db | SQLite database file path |
| LIMONCELLO_API_KEY | (none) | Bearer token for API auth (required when deployed). Must not resemble a third-party key (e.g., Stripe `sk_live_*` / `sk_test_*` patterns are rejected on startup). Use a random string like `openssl rand -base64 32`. |

## License

MIT
