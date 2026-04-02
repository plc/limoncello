# Prello Create Project

Create a new Prello project, optionally loading column definitions from a JSON file.

## Usage

```
/prello-create-project "Project Name" [--file <path-to-json>]
```

## Arguments

- First argument: Project name (required, quoted if contains spaces)
- `--file`: Optional path to a JSON file containing column definitions

## JSON File Format

The file should match the shape of the `POST /api/projects` request body:

```json
{
  "name": "My Project",
  "columns": [
    {"key": "backlog", "label": "Backlog", "substatuses": []},
    {"key": "in_progress", "label": "In Progress", "substatuses": []},
    {"key": "blocked", "label": "Blocked", "substatuses": [
      {"key": "human_review", "label": "Human Review"}
    ]},
    {"key": "done", "label": "Done", "substatuses": []}
  ]
}
```

An example template is available at `examples/columns-template.json`.

The `name` field in the file is optional -- the positional argument takes precedence. If no positional name is given and the file contains a `name`, that name is used.

## Instructions

Parse the arguments from `$ARGUMENTS`:
1. Extract the first quoted or unquoted argument as the project name (required unless `--file` provides one)
2. Parse `--file` flag if present to get the path to a JSON file

If `--file` is provided:
1. Read the JSON file using `cat <path>`
2. Parse the JSON to extract `columns` and optionally `name`
3. If a positional project name was given, use it (overrides file's `name`)
4. If no positional name and the file has a `name` field, use the file's name
5. If neither provides a name, return an error

Build the request body:
- Always include `name`
- Include `columns` from the file if `--file` was provided
- If no `--file`, omit `columns` (server will use defaults)

Use the Bash tool with curl to POST to the API:

```bash
curl -X POST http://127.0.0.1:3654/api/projects \
  -H "Content-Type: application/json" \
  -d '<json-body>'
```

Display the response showing:
- Project ID
- Project name
- Columns (formatted as a flow: Column1 -> Column2 -> Column3)
- Any sub-statuses defined per column

If the API returns an error, display the error message clearly.
If the file cannot be read or contains invalid JSON, display a clear error.
