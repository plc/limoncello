#!/usr/bin/env node

/**
 * Prello MCP Server
 *
 * Exposes Prello card operations as MCP tools for Claude Desktop and Claude Code.
 * Communicates with the Prello API over HTTP.
 *
 * Environment variables:
 *   PRELLO_URL     -- Base URL of the Prello server (default: http://localhost:3654)
 *   PRELLO_API_KEY -- Bearer token for auth (optional, matches server's PRELLO_API_KEY)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const PRELLO_URL = (process.env.PRELLO_URL || 'http://localhost:3654').replace(/\/$/, '');
const PRELLO_API_KEY = process.env.PRELLO_API_KEY || '';

const VALID_STATUSES = ['backlog', 'todo', 'in_progress', 'done'];
const STATUS_LABELS = { backlog: 'Backlog', todo: 'To Do', in_progress: 'In Progress', done: 'Done' };

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

// MCP Server
const server = new McpServer({
  name: 'prello',
  version: '1.0.0',
});

// Tool: prello_add
server.tool(
  'prello_add',
  'Create a new card on the Prello board',
  {
    title: z.string().describe('Card title'),
    description: z.string().optional().describe('Card description'),
    status: z.enum(VALID_STATUSES).optional().describe('Column to place the card in (default: backlog)'),
  },
  async ({ title, description, status }) => {
    const body = { title };
    if (description) body.description = description;
    if (status) body.status = status;

    const card = await api('/api/cards', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return {
      content: [{
        type: 'text',
        text: `Created card ${card.id} "${card.title}" in ${STATUS_LABELS[card.status]}`,
      }],
    };
  }
);

// Tool: prello_list
server.tool(
  'prello_list',
  'List cards on the Prello board, optionally filtered by status',
  {
    status: z.enum(VALID_STATUSES).optional().describe('Filter to a specific column'),
  },
  async ({ status }) => {
    const path = status ? `/api/cards?status=${status}` : '/api/cards';
    const cards = await api(path);

    if (cards.length === 0) {
      return {
        content: [{ type: 'text', text: status ? `No cards in ${STATUS_LABELS[status]}.` : 'The board is empty.' }],
      };
    }

    // Group by status
    const grouped = {};
    for (const s of VALID_STATUSES) grouped[s] = [];
    for (const card of cards) grouped[card.status].push(card);

    let text = '';
    for (const s of VALID_STATUSES) {
      if (grouped[s].length === 0) continue;
      text += `${STATUS_LABELS[s]} (${grouped[s].length})\n`;
      for (const card of grouped[s].sort((a, b) => a.position - b.position)) {
        const desc = card.description ? ` -- ${card.description}` : '';
        text += `  [${card.id}] ${card.title}${desc}\n`;
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
    status: z.enum(VALID_STATUSES).describe('Target column'),
  },
  async ({ card_id, status }) => {
    const card = await api(`/api/cards/${card_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });

    return {
      content: [{
        type: 'text',
        text: `Moved "${card.title}" to ${STATUS_LABELS[card.status]}`,
      }],
    };
  }
);

// Tool: prello_board
server.tool(
  'prello_board',
  'Show a summary of the Prello board with card counts and listings',
  {},
  async () => {
    const cards = await api('/api/cards');

    if (cards.length === 0) {
      return {
        content: [{ type: 'text', text: 'The board is empty.' }],
      };
    }

    const grouped = {};
    for (const s of VALID_STATUSES) grouped[s] = [];
    for (const card of cards) grouped[card.status].push(card);

    let text = 'BOARD SUMMARY\n=============\n';
    for (const s of VALID_STATUSES) {
      text += `${STATUS_LABELS[s]}: ${grouped[s].length} cards\n`;
    }
    text += `Total: ${cards.length} cards\n\n`;

    for (const s of VALID_STATUSES) {
      if (grouped[s].length === 0) continue;
      text += `--- ${STATUS_LABELS[s]} ---\n`;
      for (const card of grouped[s].sort((a, b) => a.position - b.position)) {
        text += `  [${card.id}] ${card.title}\n`;
      }
      text += '\n';
    }

    return { content: [{ type: 'text', text: text.trim() }] };
  }
);

// Start
const transport = new StdioServerTransport();
await server.connect(transport);
