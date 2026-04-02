# Prello Move Card

Move a card to a new status column on the Prello Kanban board.

## Usage

```
/prello-move <card-id> <status>
```

## Arguments

- `card-id`: The ID of the card to move (required)
- `status`: The target status column (required). Valid values: backlog, todo, in_progress, done

## Instructions

Parse the arguments from `$ARGUMENTS`:
1. Extract the first argument as the card ID (required)
2. Extract the second argument as the new status (required)
3. Validate that both arguments are provided

Use the Bash tool with curl to PATCH the API:

```bash
curl -X PATCH http://127.0.0.1:3654/api/cards/<card-id> \
  -H "Content-Type: application/json" \
  -d '{"status": "<status>"}'
```

Display confirmation with:
- Card ID
- Card title
- Old status (if available in response)
- New status
- Message: "Card moved successfully"

If the API returns an error (e.g., card not found, invalid status), display the error message clearly.

If arguments are missing, show usage instructions.
