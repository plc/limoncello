# Prello Board Overview

Show a summary overview of the Prello Kanban board.

## Usage

```
/prello-board
```

## Arguments

None.

## Instructions

Use the Bash tool with curl to GET all cards from the API:

```bash
curl -X GET http://127.0.0.1:3654/api/cards
```

Display a board overview with:

1. Summary section showing count of cards per column:
   ```
   BOARD SUMMARY
   =============
   Backlog: N cards
   Todo: N cards
   In Progress: N cards
   Done: N cards
   Total: N cards
   ```

2. Detailed view grouped by status:
   - For each column (backlog, todo, in_progress, done):
     - Show column header
     - List cards in position order
     - Format: `[ID] Title`
   - Use visual separators between columns

3. If the board is empty, display:
   ```
   BOARD SUMMARY
   =============
   The board is empty. Use /prello-add to create your first card.
   ```

Format the output to be compact and easy to scan visually. Use formatting like headers, separators, and indentation to make the board structure clear.

If the API returns an error, display the error message clearly.
