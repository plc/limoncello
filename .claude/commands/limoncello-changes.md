# Limoncello Changes

Poll for cards that have changed since a given timestamp. Use this to stay aware of recent board activity.

## Usage

```
/limoncello-changes --since <ISO8601-timestamp> [--project <project-id>]
```

## Arguments

- `--since`: Required ISO 8601 timestamp (e.g., "2026-04-02T10:30:00.000Z"). Only cards updated after this time will be returned.
- `--project`: Optional project ID (default: uses Default project)

## Instructions

This command uses the MCP tool `limoncello_changes` to fetch recent changes.

Parse the arguments from `$ARGUMENTS`:
1. Extract `--since` value (required)
2. Extract `--project` value if present (optional)

Call the `limoncello_changes` MCP tool with the parsed parameters:
- `since`: the timestamp value from `--since`
- `project_id`: the project ID from `--project` (if provided)

The tool will return:
- A list of cards that were created or updated since the given timestamp
- The current server time to use for the next poll
- A formatted summary showing card details and changes

If no `--since` parameter is provided, return an error message:
```
Error: --since parameter is required. Provide an ISO 8601 timestamp (e.g., "2026-04-02T10:30:00.000Z")
```

## Example

```
/limoncello-changes --since "2026-04-02T10:30:00.000Z"
/limoncello-changes --since "2026-04-02T10:30:00.000Z" --project prj_abc123
```

## Tips

- Use the `server_time` returned by the previous call as the `since` value for your next poll
- Call this at the start of a session to see what changed since your last session
- Combine with `/limoncello-board` to get full context on session start
