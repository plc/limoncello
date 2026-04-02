#!/usr/bin/env node

/**
 * Prello MCP Server -- STDIO transport
 *
 * Runs as a local subprocess for Claude Desktop / Claude Code.
 * Environment variables:
 *   PRELLO_URL     -- Base URL of the Prello server (default: http://localhost:3654)
 *   PRELLO_API_KEY -- Bearer token for auth (optional)
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createPrelloMcpServer } from './mcp-tools.mjs';

const baseUrl = process.env.PRELLO_URL || 'http://localhost:3654';
const apiKey = process.env.PRELLO_API_KEY || '';

const server = createPrelloMcpServer(baseUrl, apiKey);
const transport = new StdioServerTransport();
await server.connect(transport);
