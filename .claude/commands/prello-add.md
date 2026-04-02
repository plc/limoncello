# Prello Add Card

Create a new card on the Prello Kanban board.

## Usage

```
/prello-add "Card title" [--status <status>] [--description "Description text"]
```

## Arguments

- First argument: Card title (required, quoted if contains spaces)
- `--status`: Optional status column (default: backlog). Valid values: backlog, todo, in_progress, done
- `--description`: Optional card description (quoted if contains spaces)

## Instructions

Parse the arguments from `$ARGUMENTS`:
1. Extract the first quoted or unquoted argument as the title (required)
2. Parse `--status` flag if present, otherwise use "backlog"
3. Parse `--description` flag if present, otherwise omit from JSON body

Use the Bash tool with curl to POST to the API:

```bash
curl -X POST http://127.0.0.1:3654/api/cards \
  -H "Content-Type: application/json" \
  -d '{"title": "<title>", "status": "<status>", "description": "<description>"}'
```

Display the response showing:
- Card ID
- Title
- Status
- Description (if provided)

If the API returns an error, display the error message clearly.
