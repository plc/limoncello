# Limoncello Add Card

Create a new card on the Limoncello Kanban board.

## Usage

```
/limoncello-add "Card title" [--status <status>] [--substatus <substatus>] [--description "Description text"] [--project <project-id>]
```

## Arguments

- First argument: Card title (required, quoted if contains spaces)
- `--status`: Optional status column (default: backlog). Valid values are defined per project
- `--substatus`: Optional sub-status within the column (e.g. `human_review`). Must be valid for the target column
- `--description`: Optional card description (quoted if contains spaces)
- `--project`: Optional project ID (default: uses Default project)

## Instructions

Parse the arguments from `$ARGUMENTS`:
1. Extract the first quoted or unquoted argument as the title (required)
2. Parse `--status` flag if present, otherwise use "backlog"
3. Parse `--substatus` flag if present
4. Parse `--description` flag if present, otherwise omit from JSON body
5. Parse `--project` flag if present to get the project ID

Use the Bash tool with curl to POST to the API:

If `--project` is provided:
```bash
curl -X POST http://127.0.0.1:3654/api/projects/<project-id>/cards \
  -H "Content-Type: application/json" \
  -d '{"title": "<title>", "status": "<status>", "substatus": "<substatus>", "description": "<description>"}'
```

If no `--project` flag (uses Default project):
```bash
curl -X POST http://127.0.0.1:3654/api/cards \
  -H "Content-Type: application/json" \
  -d '{"title": "<title>", "status": "<status>", "substatus": "<substatus>", "description": "<description>"}'
```

Note: Only include `substatus` in the JSON body when provided.

Display the response showing:
- Card ID
- Title
- Status
- Sub-status (if provided)
- Description (if provided)

If the API returns an error, display the error message clearly.
