# Limoncello List Projects

List all projects in Limoncello.

## Usage

```
/limoncello-projects
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
   LIMONCELLO PROJECTS
   ===================
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
   LIMONCELLO PROJECTS
   ===================
   No projects found. Use /limoncello-add to create cards in the Default project.
   ```

Format the output to be compact and easy to scan visually. Use formatting like headers, separators, and indentation to make the structure clear.

If the API returns an error, display the error message clearly.
