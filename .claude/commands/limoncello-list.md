# Limoncello List Cards

List all cards on the Limoncello Kanban board, optionally filtered by status.

## Usage

```
/limoncello-list [--status <status>] [--project <project-id>]
```

## Arguments

- `--status`: Optional filter by status column. Valid values are defined per project
- `--project`: Optional project ID (default: uses Default project)

## Instructions

Parse the arguments from `$ARGUMENTS`:
1. Check if `--status` flag is present and extract its value
2. Check if `--project` flag is present and extract its value
3. Build the appropriate API URL

Use the Bash tool with curl to GET from the API:

If `--project` is provided (no status filter):
```bash
curl -X GET http://127.0.0.1:3654/api/projects/<project-id>/cards
```

If `--project` is provided with status filter:
```bash
curl -X GET "http://127.0.0.1:3654/api/projects/<project-id>/cards?status=<status>"
```

If no `--project` flag and no status filter (uses Default project):
```bash
curl -X GET http://127.0.0.1:3654/api/cards
```

If no `--project` flag with status filter (uses Default project):
```bash
curl -X GET "http://127.0.0.1:3654/api/cards?status=<status>"
```

Format the output nicely:
- Group cards by status column (backlog, todo, in_progress, done)
- For each column, show:
  - Column header (e.g., "BACKLOG", "TODO", "IN PROGRESS", "DONE")
  - List of cards with: ID, title, position
  - Format: `[ID] Title (position: N)`
- Show count of cards in each column
- If no cards exist, display a message indicating the board is empty

If the API returns an error, display the error message clearly.
