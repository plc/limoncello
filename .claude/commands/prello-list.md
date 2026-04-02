# Prello List Cards

List all cards on the Prello Kanban board, optionally filtered by status.

## Usage

```
/prello-list [--status <status>]
```

## Arguments

- `--status`: Optional filter by status column. Valid values: backlog, todo, in_progress, done

## Instructions

Parse the arguments from `$ARGUMENTS`:
1. Check if `--status` flag is present and extract its value
2. Build the appropriate API URL

Use the Bash tool with curl to GET from the API:

If no status filter:
```bash
curl -X GET http://127.0.0.1:3654/api/cards
```

If status filter provided:
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
