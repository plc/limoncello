# Prello List Projects

List all projects in Prello.

## Usage

```
/prello-projects
```

## Arguments

None.

## Instructions

Use the Bash tool with curl to GET all projects from the API:

```bash
curl -X GET http://127.0.0.1:3654/api/projects
```

Display the projects with:

1. Header section:
   ```
   PRELLO PROJECTS
   ===============
   ```

2. For each project, show:
   - Project name
   - Project ID
   - Columns (formatted as a comma-separated list of column labels)
   - Format:
     ```
     [ID] Name
     Columns: <column1>, <column2>, <column3>, ...
     ```

3. Show total count of projects at the end

4. If no projects exist, display:
   ```
   PRELLO PROJECTS
   ===============
   No projects found. Use /prello-add to create cards in the Default project.
   ```

Format the output to be compact and easy to scan visually. Use formatting like headers, separators, and indentation to make the structure clear.

If the API returns an error, display the error message clearly.
