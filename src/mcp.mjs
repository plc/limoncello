#!/usr/bin/env node

/**
 * Limoncello MCP Server -- STDIO transport
 *
 * Runs as a local subprocess for Claude Desktop / Claude Code.
 * Environment variables:
 *   LIMONCELLO_URL     -- Base URL of the Limoncello server (default: http://localhost:3654)
 *   LIMONCELLO_API_KEY -- Bearer token for auth (optional)
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createLimoncelloMcpServer } from './mcp-tools.mjs';

const baseUrl = process.env.LIMONCELLO_URL || 'http://localhost:3654';
const apiKey = process.env.LIMONCELLO_API_KEY || '';

const server = createLimoncelloMcpServer(baseUrl, apiKey);
const transport = new StdioServerTransport();
await server.connect(transport);
