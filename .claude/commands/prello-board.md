# Prello Board Overview

Show a summary overview of the Prello Kanban board.

## Usage

```
/prello-board [--project <project-id>]
```

## Arguments

- `--project`: Optional project ID (default: uses Default project)

## Instructions

Parse the arguments from `$ARGUMENTS`:
1. Parse `--project` flag if present to get the project ID

Use the Bash tool with curl to GET from the API:

If `--project` is provided, first get the project info to display project name and column labels:
```bash
curl -X GET http://127.0.0.1:3654/api/projects/<project-id>
```

Then get the cards for that project:
```bash
curl -X GET http://127.0.0.1:3654/api/projects/<project-id>/cards
```

If no `--project` flag (uses Default project):
```bash
curl -X GET http://127.0.0.1:3654/api/cards
```

Display a board overview with:

1. If a project was specified, show project name and ID

2. Summary section showing count of cards per column:
   ```
   BOARD SUMMARY
   =============
   <Column Label>: N cards
   (for each column defined in the project)
   Total: N cards
   ```

3. Detailed view grouped by status:
   - For each column defined by the project (use column labels from project):
     - Show column header (using the label from project)
     - List cards in position order
     - Format: `[ID] Title`
   - Use visual separators between columns

4. If the board is empty, display:
   ```
   BOARD SUMMARY
   =============
   The board is empty. Use /prello-add to create your first card.
   ```

Format the output to be compact and easy to scan visually. Use formatting like headers, separators, and indentation to make the board structure clear.

If the API returns an error, display the error message clearly.
