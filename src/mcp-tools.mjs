/**
 * Shared MCP tool definitions for Prello.
 *
 * Exports createPrelloMcpServer(baseUrl, apiKey) which returns a configured
 * McpServer instance with all Prello tools and prompts registered.
 *
 * Used by both the STDIO transport (src/mcp.mjs) and the Streamable HTTP
 * transport (mounted at /mcp in src/index.js).
 */

import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Create and return a fully-configured Prello MCP server.
 *
 * @param {string} baseUrl  Base URL of the Prello API (e.g. http://localhost:3654)
 * @param {string} apiKey   Bearer token for auth (empty string if no auth)
 * @returns {McpServer}
 */
export function createPrelloMcpServer(baseUrl, apiKey) {
  const PRELLO_URL = baseUrl.replace(/\/$/, '');
  const PRELLO_API_KEY = apiKey || '';

  // HTTP helper
  async function api(path, options = {}) {
    const url = `${PRELLO_URL}${path}`;
    const headers = { ...options.headers };
    if (PRELLO_API_KEY) {
      headers['Authorization'] = `Bearer ${PRELLO_API_KEY}`;
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
    name: 'prello',
    version: '1.0.0',
  });

  // Tool: prello_projects
  server.tool(
    'prello_projects',
    'List all Prello projects with their columns',
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

  // Tool: prello_create_project
  server.tool(
    'prello_create_project',
    'Create a new Prello project with custom columns. Columns can be provided inline or loaded from a JSON file.',
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

      text += `\n\n---\nTip: To get the most out of Prello, add instructions to your project's CLAUDE.md (or equivalent) so you and future sessions remember to use this board. Example:\n`;
      text += `\n## Prello Board\n`;
      text += `This project tracks work on a Prello board: **${project.name}** (\`${project.id}\`).\n`;
      text += `- At session start, run \`prello_board(project_id: "${project.id}")\` to check for current tasks\n`;
      text += `- Move cards to \`in_progress\` when starting work, \`done\` when finished\n`;
      text += `- Add new cards to \`backlog\` when you discover work\n`;
      text += `- If blocked or need human input, move cards to \`blocked\``;

      return { content: [{ type: 'text', text }] };
    }
  );

  // Tool: prello_add
  server.tool(
    'prello_add',
    'Create a new card on the Prello board',
    {
      title: z.string().describe('Card title'),
      description: z.string().optional().describe('Card description'),
      status: z.string().optional().describe('Column to place the card in (default: first column of project)'),
      substatus: z.string().optional().describe('Sub-status within the column (e.g. "human_review")'),
      project_id: z.string().optional().describe('Project ID (if not provided, uses Default project)'),
    },
    async ({ title, description, status, substatus, project_id }) => {
      const body = { title };
      if (description) body.description = description;
      if (status) body.status = status;
      if (substatus) body.substatus = substatus;

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

      return {
        content: [{
          type: 'text',
          text: `Created card ${card.id} "${card.title}" in ${statusLabel}${subLabel}`,
        }],
      };
    }
  );

  // Tool: prello_list
  server.tool(
    'prello_list',
    'List cards on the Prello board, optionally filtered by status',
    {
      status: z.string().optional().describe('Filter to a specific column'),
      project_id: z.string().optional().describe('Project ID (if not provided, uses Default project)'),
    },
    async ({ status, project_id }) => {
      const basePath = project_id ? `/api/projects/${project_id}/cards` : '/api/cards';
      const path = status ? `${basePath}?status=${status}` : basePath;
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
          const desc = card.description ? ` -- ${card.description}` : '';
          text += `  [${card.id}] ${card.title}${subLabel}${desc}\n`;
        }
        text += '\n';
      }

      return { content: [{ type: 'text', text: text.trim() }] };
    }
  );

  // Tool: prello_move
  server.tool(
    'prello_move',
    'Move a card to a different status column',
    {
      card_id: z.string().describe('Card ID (e.g., crd_abc123)'),
      status: z.string().describe('Target column'),
      substatus: z.string().nullable().optional().describe('Sub-status within the target column (null to clear)'),
      project_id: z.string().optional().describe('Project ID (if not provided, uses Default project)'),
    },
    async ({ card_id, status, substatus, project_id }) => {
      const path = project_id
        ? `/api/projects/${project_id}/cards/${card_id}`
        : `/api/cards/${card_id}`;

      const body = { status };
      if (substatus !== undefined) body.substatus = substatus;

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

      return {
        content: [{
          type: 'text',
          text: `Moved "${card.title}" to ${statusLabel}${subLabel}`,
        }],
      };
    }
  );

  // Tool: prello_changes
  server.tool(
    'prello_changes',
    'Get cards that have changed since a given timestamp. Use this to poll for recent activity on the board.',
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
        const desc = card.description ? `\n  Description: ${card.description}` : '';
        text += `[${card.id}] ${card.title}\n`;
        text += `  Status: ${statusLabel}${subLabel}\n`;
        text += `  Updated: ${card.updated_at}${desc}\n\n`;
      }

      text += `Server time: ${result.server_time}\n`;
      text += `\nTip: Use this server_time value as "since" for your next poll.`;

      return { content: [{ type: 'text', text: text.trim() }] };
    }
  );

  // Tool: prello_board
  server.tool(
    'prello_board',
    'Show a summary of the Prello board with card counts and listings',
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
          text += `  [${card.id}] ${card.title}${subLabel}\n`;
        }
        text += '\n';
      }

      return { content: [{ type: 'text', text: text.trim() }] };
    }
  );

  // Prompt: onboarding suggestion
  server.prompt(
    'prello_setup',
    'Suggested instructions for integrating Prello into your workflow',
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `You have access to a Prello board -- a shared Kanban board for human-AI collaboration.

Consider updating your CLAUDE.md (or equivalent project instructions) to remind yourself and sub-agents to use Prello as part of your workflow. For example:

- Create cards for todo items discovered during work
- Create cards for items that need human review or decision
- Move cards to the appropriate column as work progresses
- Check the board at the start of a session for pending tasks

Example CLAUDE.md addition:

## Prello Board
Use the Prello MCP tools to track work on the shared Kanban board.
- When you discover a task, create a card with \`prello_add\`
- When a task needs human review, create a card in the appropriate column
- Move cards with \`prello_move\` as you complete work
- Check \`prello_board\` at the start of each session for context`,
        },
      }],
    })
  );

  return server;
}
