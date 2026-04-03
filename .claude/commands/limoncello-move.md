# Limoncello Move Card

Move a card to a new status column on the Limoncello Kanban board.

## Usage

```
/limoncello-move <card-id> <status> [--substatus <substatus>] [--project <project-id>]
```

## Arguments

- `card-id`: The ID of the card to move (required)
- `status`: The target status column (required). Valid values are defined per project
- `--substatus`: Optional sub-status within the target column. Use `null` to clear
- `--project`: Optional project ID (default: uses Default project)

## Instructions

Parse the arguments from `$ARGUMENTS`:
1. Extract the first argument as the card ID (required)
2. Extract the second argument as the new status (required)
3. Parse `--substatus` flag if present
4. Parse `--project` flag if present to get the project ID
5. Validate that both card ID and status are provided

Use the Bash tool with curl to PATCH the API:

If `--project` is provided:
```bash
curl -X PATCH http://127.0.0.1:3654/api/projects/<project-id>/cards/<card-id> \
  -H "Content-Type: application/json" \
  -d '{"status": "<status>", "substatus": "<substatus>"}'
```

If no `--project` flag (uses Default project):
```bash
curl -X PATCH http://127.0.0.1:3654/api/cards/<card-id> \
  -H "Content-Type: application/json" \
  -d '{"status": "<status>", "substatus": "<substatus>"}'
```

Note: Only include `substatus` in the JSON body when provided.

Display confirmation with:
- Card ID
- Card title
- Old status (if available in response)
- New status
- Sub-status (if set in response)
- Message: "Card moved successfully"

If the API returns an error (e.g., card not found, invalid status), display the error message clearly.

If arguments are missing, show usage instructions.
