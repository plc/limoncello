/**
 * Shared MCP tool definitions for Limoncello.
 *
 * Exports createLimoncelloMcpServer(baseUrl, apiKey) which returns a configured
 * McpServer instance with all Limoncello tools and prompts registered.
 *
 * Used by both the STDIO transport (src/mcp.mjs) and the Streamable HTTP
 * transport (mounted at /mcp in src/index.js).
 */

import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Create and return a fully-configured Limoncello MCP server.
 *
 * @param {string} baseUrl  Base URL of the Limoncello API (e.g. http://localhost:3654)
 * @param {string} apiKey   Bearer token for auth (empty string if no auth)
 * @returns {McpServer}
 */
export function createLimoncelloMcpServer(baseUrl, apiKey) {
  const LIMONCELLO_URL = baseUrl.replace(/\/$/, '');
  const LIMONCELLO_API_KEY = apiKey || '';

  // HTTP helper
  async function api(path, options = {}) {
    const url = `${LIMONCELLO_URL}${path}`;
    const headers = { ...options.headers };
    if (LIMONCELLO_API_KEY) {
      headers['Authorization'] = `Bearer ${LIMONCELLO_API_KEY}`;
    }
    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const body = await response.text();
      let message;
      try {
        message = JSON.parse(body).error;
      } catch {
        message = body || `HTTP ${response.status}`;
      }
      throw new Error(message);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  // Helper to get project info
  async function getProjectInfo(project_id) {
    if (project_id) {
      return api(`/api/projects/${project_id}`);
    } else {
      const projects = await api('/api/projects');
      return projects.length > 0 ? projects[0] : null;
    }
  }

  // Helper to build column labels map from project
  function buildColumnLabels(project) {
    if (!project || !project.columns) return {};
    const labels = {};
    for (const col of project.columns) {
      labels[col.key] = col.label;
    }
    return labels;
  }

  // Helper to build sub-status labels map from project
  function buildSubstatusLabels(project) {
    if (!project || !project.columns) return {};
    const labels = {};
    for (const col of project.columns) {
      for (const sub of (col.substatuses || [])) {
        labels[sub.key] = sub.label;
      }
    }
    return labels;
  }

  // MCP Server
  const server = new McpServer({
    name: 'limoncello',
    version: '1.0.0',
    instructions: `You have access to Limoncello, a shared Kanban board for human-AI collaboration. This board is how you and the user coordinate work.

IMPORTANT -- DO THESE THINGS:

1. AT SESSION START: Call limoncello_board to check for pending tasks. If there are cards in "To Do" or "In Progress", prioritize them. This is not optional -- the user may have added or reprioritized cards since your last session.

2. DURING WORK: When you discover new tasks, create cards with limoncello_add. When you start a task, move it to in_progress. When blocked, move it to blocked. When done, move it to done.

3. POLL FOR CHANGES: During long sessions, periodically call limoncello_changes to check if the user has added or moved cards via the web UI.

4. CRITICAL -- DOCUMENT THE BOARD: If the project you're working on doesn't reference Limoncello in its CLAUDE.md (or equivalent), you MUST:
   a. CREATE A NEW LIMONCELLO PROJECT for this codebase using limoncello_create_project with a descriptive name (e.g., "MyApp Development", "Acme Corp Backend"). Each codebase should have its own dedicated board, NOT share the Default project.
   b. Call limoncello_onboard with the new project_id and OFFER TO MAKE THE EDITS DIRECTLY.
   c. After getting approval, edit both CLAUDE.md AND .claude/settings.json (with automation hooks), then verify both changes were made correctly.

   Documenting the board's project ID in CLAUDE.md is essential -- without it, future sessions won't know this project has a board, and work will be lost or duplicated.

The board is shared -- the user sees your card updates in real time via the web UI at /board. Treat the board as the source of truth for what needs doing.`,
  });

  // Tool: limoncello_projects
  server.tool(
    'limoncello_projects',
    'List all Limoncello projects with their columns',
    {},
    async () => {
      const projects = await api('/api/projects');

      if (projects.length === 0) {
        return {
          content: [{ type: 'text', text: 'No projects found.' }],
        };
      }

      let text = 'PROJECTS\n========\n\n';
      for (const project of projects) {
        text += `[${project.id}] ${project.name}\n`;
        if (project.description) {
          text += `  ${project.description}\n`;
        }
        text += `  Columns: ${project.columns.map(c => c.label).join(' → ')}\n`;
        for (const col of project.columns) {
          if (col.substatuses && col.substatuses.length > 0) {
            text += `    ${col.label}: ${col.substatuses.map(s => s.label).join(', ')}\n`;
          }
        }
        text += '\n';
      }

      return { content: [{ type: 'text', text: text.trim() }] };
    }
  );

  // Tool: limoncello_create_project
  server.tool(
    'limoncello_create_project',
    'Create a new Limoncello project with custom columns. Columns can be provided inline or loaded from a JSON file.',
    {
      name: z.string().optional().describe('Project name (required unless columns_file provides one)'),
      columns: z.array(z.object({
        key: z.string().describe('Column key (lowercase, underscores, e.g. "in_review")'),
        label: z.string().describe('Column display label (e.g. "In Review")'),
        substatuses: z.array(z.object({
          key: z.string().describe('Sub-status key'),
          label: z.string().describe('Sub-status label'),
        })).optional().describe('Optional sub-statuses for this column'),
      })).optional().describe('Custom columns (default: Backlog, To Do, In Progress, Blocked, Done)'),
      columns_file: z.string().optional().describe('Path to a JSON file with project definition (name and columns). File takes precedence over inline columns.'),
    },
    async ({ name, columns, columns_file }) => {
      let fileDef = {};
      if (columns_file) {
        try {
          const raw = readFileSync(columns_file, 'utf-8');
          fileDef = JSON.parse(raw);
        } catch (err) {
          return {
            content: [{
              type: 'text',
              text: `Error reading columns file: ${err.message}`,
            }],
          };
        }
      }

      const projectName = name || fileDef.name;
      if (!projectName) {
        return {
          content: [{
            type: 'text',
            text: 'Error: project name is required. Provide it as the "name" parameter or include it in the columns file.',
          }],
        };
      }

      const body = { name: projectName };
      // File columns take precedence over inline columns
      if (fileDef.columns) {
        body.columns = fileDef.columns;
      } else if (columns) {
        body.columns = columns;
      }

      const project = await api('/api/projects', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const flow = project.columns.map(c => c.label).join(' → ');
      let text = `Created project ${project.id} "${project.name}"\nColumns: ${flow}`;
      for (const col of project.columns) {
        if (col.substatuses && col.substatuses.length > 0) {
          text += `\n  ${col.label}: ${col.substatuses.map(s => s.label).join(', ')}`;
        }
      }

      text += `\n\n---\nTip: To get the most out of Limoncello, add instructions to your project's CLAUDE.md (or equivalent) so you and future sessions remember to use this board. Example:\n`;
      text += `\n## Limoncello Board\n`;
      text += `This project tracks work on a Limoncello board: **${project.name}** (\`${project.id}\`).\n`;
      text += `- At session start, run \`limoncello_board(project_id: "${project.id}")\` to check for current tasks\n`;
      text += `- Move cards to \`in_progress\` when starting work, \`done\` when finished\n`;
      text += `- Add new cards to \`backlog\` when you discover work\n`;
      text += `- If blocked or need human input, move cards to \`blocked\``;

      return { content: [{ type: 'text', text }] };
    }
  );

  // Tool: limoncello_add
  server.tool(
    'limoncello_add',
    'Create a new card on the Limoncello board. Use this whenever you discover work that needs tracking -- bugs, TODOs, follow-ups, or tasks for the user to review.',
    {
      title: z.string().describe('Card title'),
      description: z.string().optional().describe('Card description'),
      status: z.string().optional().describe('Column to place the card in (default: first column of project)'),
      substatus: z.string().optional().describe('Sub-status within the column (e.g. "human_review")'),
      tags: z.array(z.string()).optional().describe('Tags for the card (e.g. ["bug", "urgent"])'),
      project_id: z.string().optional().describe('Project ID (if not provided, uses Default project)'),
    },
    async ({ title, description, status, substatus, tags, project_id }) => {
      const body = { title };
      if (description) body.description = description;
      if (status) body.status = status;
      if (substatus) body.substatus = substatus;
      if (tags) body.tags = tags;

      const path = project_id ? `/api/projects/${project_id}/cards` : '/api/cards';
      const card = await api(path, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      // Get project info to show column label
      const project = await getProjectInfo(project_id);
      const columnLabels = buildColumnLabels(project);
      const substatusLabels = buildSubstatusLabels(project);
      const statusLabel = columnLabels[card.status] || card.status;
      const subLabel = card.substatus ? ` [${substatusLabels[card.substatus] || card.substatus}]` : '';
      const tagsLabel = card.tags && card.tags.length > 0 ? ` ${card.tags.map(t => '#' + t).join(' ')}` : '';

      return {
        content: [{
          type: 'text',
          text: `Created card ${card.id} "${card.title}" in ${statusLabel}${subLabel}${tagsLabel}`,
        }],
      };
    }
  );

  // Tool: limoncello_list
  server.tool(
    'limoncello_list',
    'List cards on the Limoncello board, optionally filtered by status',
    {
      status: z.string().optional().describe('Filter to a specific column'),
      tag: z.string().optional().describe('Filter to cards with this tag'),
      project_id: z.string().optional().describe('Project ID (if not provided, uses Default project)'),
    },
    async ({ status, tag, project_id }) => {
      const basePath = project_id ? `/api/projects/${project_id}/cards` : '/api/cards';
      const queryParams = [];
      if (status) queryParams.push(`status=${encodeURIComponent(status)}`);
      if (tag) queryParams.push(`tag=${encodeURIComponent(tag)}`);
      const path = queryParams.length > 0 ? `${basePath}?${queryParams.join('&')}` : basePath;
      const cards = await api(path);

      // Get project info for column labels
      const project = await getProjectInfo(project_id);
      if (!project) {
        return {
          content: [{ type: 'text', text: 'No project found.' }],
        };
      }

      const columnLabels = buildColumnLabels(project);
      const substatusLabels = buildSubstatusLabels(project);
      const columnKeys = project.columns.map(c => c.key);

      if (cards.length === 0) {
        const emptyMsg = status
          ? `No cards in ${columnLabels[status] || status}.`
          : 'The board is empty.';
        return {
          content: [{ type: 'text', text: emptyMsg }],
        };
      }

      // Group by status
      const grouped = {};
      for (const key of columnKeys) grouped[key] = [];
      for (const card of cards) {
        if (grouped[card.status]) {
          grouped[card.status].push(card);
        }
      }

      let text = '';
      for (const key of columnKeys) {
        if (grouped[key].length === 0) continue;
        text += `${columnLabels[key]} (${grouped[key].length})\n`;
        for (const card of grouped[key].sort((a, b) => a.position - b.position)) {
          const subLabel = card.substatus ? ` [${substatusLabels[card.substatus] || card.substatus}]` : '';
          const tagsLabel = card.tags && card.tags.length > 0 ? ` ${card.tags.map(t => '#' + t).join(' ')}` : '';
          const desc = card.description ? ` -- ${card.description}` : '';
          text += `  [${card.id}] ${card.title}${subLabel}${tagsLabel}${desc}\n`;
        }
        text += '\n';
      }

      return { content: [{ type: 'text', text: text.trim() }] };
    }
  );

  // Tool: limoncello_move
  server.tool(
    'limoncello_move',
    'Move a card to a different status column. Move cards to in_progress when starting work, blocked when waiting, and done when finished.',
    {
      card_id: z.string().describe('Card ID (e.g., crd_abc123)'),
      status: z.string().describe('Target column'),
      substatus: z.string().nullable().optional().describe('Sub-status within the target column (null to clear)'),
      tags: z.array(z.string()).optional().describe('Set tags on the card (e.g. ["bug", "urgent"])'),
      project_id: z.string().optional().describe('Project ID (if not provided, uses Default project)'),
    },
    async ({ card_id, status, substatus, tags, project_id }) => {
      const path = project_id
        ? `/api/projects/${project_id}/cards/${card_id}`
        : `/api/cards/${card_id}`;

      const body = { status };
      if (substatus !== undefined) body.substatus = substatus;
      if (tags !== undefined) body.tags = tags;

      const card = await api(path, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });

      // Get project info to show column label
      const project = await getProjectInfo(project_id);
      const columnLabels = buildColumnLabels(project);
      const substatusLabels = buildSubstatusLabels(project);
      const statusLabel = columnLabels[card.status] || card.status;
      const subLabel = card.substatus ? ` [${substatusLabels[card.substatus] || card.substatus}]` : '';
      const tagsLabel = card.tags && card.tags.length > 0 ? ` ${card.tags.map(t => '#' + t).join(' ')}` : '';

      return {
        content: [{
          type: 'text',
          text: `Moved "${card.title}" to ${statusLabel}${subLabel}${tagsLabel}`,
        }],
      };
    }
  );

  // Tool: limoncello_changes
  server.tool(
    'limoncello_changes',
    'Get cards changed since a timestamp. Call this periodically during long sessions to check if the user has added or moved cards via the web UI.',
    {
      since: z.string().describe('ISO 8601 timestamp (e.g., "2026-04-02T10:30:00.000Z"). Only cards updated after this time will be returned.'),
      project_id: z.string().optional().describe('Project ID (if not provided, uses Default project)'),
    },
    async ({ since, project_id }) => {
      const path = project_id
        ? `/api/projects/${project_id}/cards/changes?since=${encodeURIComponent(since)}`
        : `/api/cards/changes?since=${encodeURIComponent(since)}`;

      const result = await api(path);

      // Get project info for column labels
      const project = await getProjectInfo(project_id);
      if (!project) {
        return {
          content: [{ type: 'text', text: 'No project found.' }],
        };
      }

      const columnLabels = buildColumnLabels(project);
      const substatusLabels = buildSubstatusLabels(project);

      if (result.cards.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No changes since ${since}\n\nServer time: ${result.server_time}`,
          }],
        };
      }

      let text = `CHANGES SINCE ${since}\n${'='.repeat(60)}\n\n`;
      text += `Found ${result.cards.length} changed card(s):\n\n`;

      for (const card of result.cards) {
        const statusLabel = columnLabels[card.status] || card.status;
        const subLabel = card.substatus ? ` [${substatusLabels[card.substatus] || card.substatus}]` : '';
        const tagsLabel = card.tags && card.tags.length > 0 ? `\n  Tags: ${card.tags.map(t => '#' + t).join(' ')}` : '';
        const desc = card.description ? `\n  Description: ${card.description}` : '';
        text += `[${card.id}] ${card.title}\n`;
        text += `  Status: ${statusLabel}${subLabel}\n`;
        text += `  Updated: ${card.updated_at}${tagsLabel}${desc}\n\n`;
      }

      text += `Server time: ${result.server_time}\n`;
      text += `\nTip: Use this server_time value as "since" for your next poll.`;

      return { content: [{ type: 'text', text: text.trim() }] };
    }
  );

  // Tool: limoncello_board
  server.tool(
    'limoncello_board',
    'Show board summary with card counts and listings. CALL THIS AT THE START OF EVERY SESSION to check for pending tasks and priorities.',
    {
      project_id: z.string().optional().describe('Project ID (if not provided, uses Default project)'),
    },
    async ({ project_id }) => {
      const path = project_id ? `/api/projects/${project_id}/cards` : '/api/cards';
      const cards = await api(path);

      // Get project info for column labels
      const project = await getProjectInfo(project_id);
      if (!project) {
        return {
          content: [{ type: 'text', text: 'No project found.' }],
        };
      }

      const columnLabels = buildColumnLabels(project);
      const substatusLabels = buildSubstatusLabels(project);
      const columnKeys = project.columns.map(c => c.key);

      if (cards.length === 0) {
        return {
          content: [{ type: 'text', text: 'The board is empty.' }],
        };
      }

      // Group by status
      const grouped = {};
      for (const key of columnKeys) grouped[key] = [];
      for (const card of cards) {
        if (grouped[card.status]) {
          grouped[card.status].push(card);
        }
      }

      let text = 'BOARD SUMMARY\n=============\n';
      text += `Project: ${project.name}\n\n`;
      for (const key of columnKeys) {
        text += `${columnLabels[key]}: ${grouped[key].length} cards\n`;
      }
      text += `Total: ${cards.length} cards\n\n`;

      for (const key of columnKeys) {
        if (grouped[key].length === 0) continue;
        text += `--- ${columnLabels[key]} ---\n`;
        for (const card of grouped[key].sort((a, b) => a.position - b.position)) {
          const subLabel = card.substatus ? ` [${substatusLabels[card.substatus] || card.substatus}]` : '';
          const tagsLabel = card.tags && card.tags.length > 0 ? ` ${card.tags.map(t => '#' + t).join(' ')}` : '';
          text += `  [${card.id}] ${card.title}${subLabel}${tagsLabel}\n`;
        }
        text += '\n';
      }

      return { content: [{ type: 'text', text: text.trim() }] };
    }
  );

  // Tool: limoncello_onboard
  server.tool(
    'limoncello_onboard',
    'CRITICAL ONBOARDING TOOL: Call this when a project does not reference Limoncello in its CLAUDE.md. IMPORTANT: You must CREATE A NEW LIMONCELLO PROJECT first (using limoncello_create_project with a descriptive name matching the codebase), then call this tool with that project_id. Each codebase should have its own dedicated Limoncello board. After calling this tool, you MUST offer to edit CLAUDE.md and .claude.json directly (with user approval).',
    {
      project_id: z.string().describe('Project ID of the NEW Limoncello project you just created for this codebase (REQUIRED - do not use Default project)'),
      project_dir: z.string().optional().describe('Path to the project root directory (for reading/checking CLAUDE.md)'),
    },
    async ({ project_id, project_dir }) => {
      if (!project_id) {
        return {
          content: [{
            type: 'text',
            text: 'ERROR: project_id is required. You must create a NEW Limoncello project first using limoncello_create_project (with a name matching this codebase), then call limoncello_onboard with that project_id. Each codebase should have its own dedicated board.',
          }],
        };
      }

      const project = await getProjectInfo(project_id);
      if (!project) {
        return {
          content: [{ type: 'text', text: 'No project found. Create a new Limoncello project first using limoncello_create_project.' }],
        };
      }

      // Check if already onboarded
      if (project_dir) {
        try {
          const claudeMdPath = `${project_dir.replace(/\/$/, '')}/CLAUDE.md`;
          const claudeMd = readFileSync(claudeMdPath, 'utf-8');
          const lowerContent = claudeMd.toLowerCase();
          if (lowerContent.includes(project.id) || lowerContent.includes('limoncello')) {
            return {
              content: [{
                type: 'text',
                text: `This project already references Limoncello in CLAUDE.md. Board: ${project.name} (${project.id}).`,
              }],
            };
          }
        } catch {
          // File doesn't exist or can't be read -- proceed with onboarding
        }
      }

      const text = `CRITICAL: LIMONCELLO ONBOARDING REQUIRED
=========================================

You have created a dedicated Limoncello board for this codebase.
Board: ${project.name} (${project.id})

This board is SPECIFIC to this codebase - it is NOT the Default project. Each codebase should have its own dedicated board for tracking its work.

WHY DOCUMENTING THIS IS CRITICAL:
Without documenting the board ID in CLAUDE.md, future Claude sessions will not know this project has a Limoncello board. This means:
- Work tracked on the board will be invisible to future agents
- Tasks will be duplicated or lost
- Human-added cards will be ignored
- The shared coordination system breaks down

YOU MUST document this board in CLAUDE.md and .claude.json now.

--- ACTION REQUIRED ---

After presenting this plan to the user for approval, you MUST:

1. Edit (or create) CLAUDE.md in the project root directory
2. Add the following section (adjust placement as appropriate):

## Limoncello Board

This project tracks work on a dedicated Limoncello board: **${project.name}** (\`${project.id}\`).

**IMPORTANT**: This is a project-specific board created for this codebase. Always use this project_id when working with Limoncello tools.

### On session start

At the beginning of every session, check the board for current tasks:

\`\`\`
limoncello_board(project_id: "${project.id}")
\`\`\`

### Working on tasks

- Before starting work on a card, move it to \`in_progress\`
- If blocked (waiting on human input, unclear requirements), move it to \`blocked\`
- When finished, move it to \`done\`
- If you discover new work while implementing a task, add it as a new card in \`backlog\`

### Why this matters

The board is shared between humans and agents. Humans may add, reprioritize, or annotate cards via the web UI between agent sessions. Polling ensures you're working on what matters and not duplicating effort.

3. VERIFY the edit was successful by reading CLAUDE.md and confirming it contains the project ID: ${project.id}

4. Create or edit .claude/settings.json in the project directory with the following hooks configuration:

IMPORTANT: The file MUST be at .claude/settings.json (not .claude.json). Create the .claude directory first if needed.

If .claude/settings.json already exists, read it first and merge the hooks section intelligently. If it doesn't exist, create it with this content:

{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "ExitPlanMode",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Review the plan that was just presented. First, determine if it is non-trivial — defined as having more than 3 steps OR touching multiple files OR spanning multiple concerns. If the plan is trivial, respond with {\\"ok\\": true}.\\n\\nIf non-trivial, read CLAUDE.md in the current working directory to check if it contains a Limoncello board reference (look for \\"limoncello_board\\" or a project ID matching \\"prj_\\").\\n\\nThen respond with JSON only:\\n\\n- If Limoncello IS referenced with a project ID: {\\"ok\\": false, \\"reason\\": \\"Before proceeding with implementation, create Limoncello cards to track this work. Extract the project_id from CLAUDE.md (format: prj_XXXXX), then use limoncello_add to create cards for each major step of the plan. This ensures the work is tracked and visible to both you and the user on the shared board.\\"}\\n- If Limoncello is mentioned but no project ID found: {\\"ok\\": false, \\"reason\\": \\"CLAUDE.md mentions Limoncello but doesn't specify a project ID. Ask the user: Should I create a Limoncello project for this work and update CLAUDE.md with the board reference?\\"}\\n- If Limoncello is NOT referenced: {\\"ok\\": false, \\"reason\\": \\"Ask the user: This is a non-trivial task. This project doesn't use Limoncello for project management yet — should I set up a Limoncello board to track this work? (I can create a project, document it in CLAUDE.md, and create cards for each plan step.)\\"}"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "agent",
            "prompt": "SILENT HOOK - only act if needed, otherwise respond {\\"ok\\": true} immediately.\\n\\nClaude just finished a turn. Follow this logic:\\n\\n1. Check if substantial work was done:\\n   - Use git status to check for modified/new files\\n   - If no files changed AND no Edit/Write tools were used this turn, respond {\\"ok\\": true} immediately (silent pass)\\n\\n2. If substantial work was done, check for Limoncello:\\n   - Read CLAUDE.md to find Limoncello board reference (look for \\"prj_\\" pattern)\\n   - If no Limoncello reference found, respond {\\"ok\\": true} (silent pass)\\n\\n3. If Limoncello IS configured:\\n   - Extract project_id from CLAUDE.md\\n   - SILENTLY call limoncello_list with project_id and status=\\"in_progress\\"\\n   - If no in_progress cards exist, respond {\\"ok\\": true} (silent pass)\\n   - If in_progress cards exist, check if any match the work just completed (compare card titles/descriptions to files changed)\\n   - If no matching cards, respond {\\"ok\\": true} (silent pass)\\n   - If matching cards found, respond {\\"ok\\": false, \\"reason\\": \\"Found completed work on Limoncello cards. Moving [card_id] to done and committing changes.\\"}\\n\\nIMPORTANT: Be silent. Only interrupt if you're actually going to take action (move a card or commit).",
            "timeout": 60
          }
        ]
      }
    ]
  }
}

These hooks will:
- PreToolUse/ExitPlanMode: Before exiting plan mode for non-trivial tasks, prompt to create Limoncello cards for each major step
- Stop: SILENT hook that only acts when substantial work was done AND matching Limoncello cards exist. Automatically moves cards to "done" without interrupting normal workflow
- Both hooks only activate when Limoncello is configured in CLAUDE.md (safe for all projects)

5. VERIFY .claude/settings.json was created/updated correctly by reading it back and confirming the hooks are present

--- FINAL STEP ---

After editing both files and verifying the changes, call \`limoncello_board(project_id: "${project.id}")\` to confirm the connection works and review any existing cards.`;

      return { content: [{ type: 'text', text }] };
    }
  );

  // Tool: limoncello_bootstrap
  server.tool(
    'limoncello_bootstrap',
    'Provision a new API key for agent access. Use this when setting up a new agent or project that needs its own Limoncello credentials. The key is returned once and cannot be retrieved later.',
    {
      name: z.string().optional().describe('Label for the key (e.g. "Claude Code - myproject")'),
    },
    async ({ name }) => {
      const body = {};
      if (name) body.name = name;

      const result = await api('/api/keys', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const text = `API key created successfully.

Key ID: ${result.id}
API Key: ${result.key}
Name: ${result.name || '(none)'}

IMPORTANT: Save this key now -- it cannot be retrieved later.

To use this key with Claude Code:
  claude mcp add limoncello -s user --transport http \\
    --header "Authorization: Bearer ${result.key}" \\
    -- https://limoncello.fly.dev/mcp

Or set as environment variable:
  export LIMONCELLO_API_KEY=${result.key}`;

      return { content: [{ type: 'text', text }] };
    }
  );

  // Prompt: onboarding suggestion
  server.prompt(
    'limoncello_setup',
    'Suggested instructions for integrating Limoncello into your workflow',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `You have access to a Limoncello board -- a shared Kanban board for human-AI collaboration.

Consider updating your CLAUDE.md (or equivalent project instructions) to remind yourself and sub-agents to use Limoncello as part of your workflow. For example:

- Create cards for todo items discovered during work
- Create cards for items that need human review or decision
- Move cards to the appropriate column as work progresses
- Check the board at the start of a session for pending tasks

Example CLAUDE.md addition:

## Limoncello Board
Use the Limoncello MCP tools to track work on the shared Kanban board.
- When you discover a task, create a card with \`limoncello_add\`
- When a task needs human review, create a card in the appropriate column
- Move cards with \`limoncello_move\` as you complete work
- Check \`limoncello_board\` at the start of each session for context`,
        },
      }],
    })
  );

  return server;
}
