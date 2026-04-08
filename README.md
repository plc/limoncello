# Limoncello

Kanban board for human-AI collaboration. Humans use the web board, agents use MCP tools. Both share the same board.

## Getting Started

### Web UI

Open the Kanban board at https://limoncello.fly.dev/board

Create projects, define custom columns, drag cards between columns, and manage your workflow from the browser.

### Get an API Key

Generate an API key for Claude to access your board:

```bash
curl -X POST https://limoncello.fly.dev/api/keys \
  -H "Content-Type: application/json" \
  -d '{"name": "My Claude Agent"}'
```

The response includes your key (shown once) and setup instructions. **Rate limit: 10 requests/min/IP.**

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

All endpoints require `Authorization: Bearer <your-api-key>` header (except `/health`, `/api/man`, and `POST /api/keys`).

**API Key Management**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/keys | None | Create agent API key (rate limit: 10 req/min/IP) |
| GET | /api/keys | Admin | List all agent API keys |
| DELETE | /api/keys/:id | Admin | Revoke an agent API key |

## MCP Tools

The MCP server provides these tools for Claude:

| Tool | Description |
|------|-------------|
| `limoncello_projects` | List all boards with their names, IDs, and columns |
| `limoncello_create_project` | Create a board with name and optional custom columns |
| `limoncello_add` | Create a card with title, optional status, substatus, description, and project_id |
| `limoncello_list` | List cards, optionally filtered by status and project_id |
| `limoncello_move` | Move a card to a different status, with optional substatus and project_id |
| `limoncello_board` | Show board summary with card counts and listings, with optional project_id |
| `limoncello_changes` | Get cards that have changed since a given timestamp |

All card tools accept an optional `project_id` parameter. If omitted, they operate on the Default project.

**Terminology note:** In Limoncello, a "project" is a board with custom columns (like separate Trello boards). Cards are individual tasks that belong to a project/board. Each codebase typically gets its own dedicated Limoncello project/board.

## REST API

All requests require `Authorization: Bearer <your-api-key>` header (except `/health`, `/api/man`, and `POST /api/keys`).

**Terminology note:** In Limoncello, a "project" is a board with custom columns. Think of it like separate Trello boards. Cards are tasks that belong to a project/board.

### Board Endpoints (Projects)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/projects | List all boards |
| POST | /api/projects | Create a board `{ name, columns? }` |
| GET | /api/projects/:id | Get a board |
| PATCH | /api/projects/:id | Update a board |
| DELETE | /api/projects/:id | Delete a board |

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
