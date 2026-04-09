/**
 * Self-describing API manual endpoint.
 *
 * GET /api/man -- returns a structured JSON object documenting every
 * endpoint, schema, concept, WebSocket protocol, and MCP tool.
 * No auth required, like /health.
 */

const manual = {
  name: 'limoncello',
  version: '1.0.0',
  description: 'Local-first Kanban board for human-AI collaboration. Humans use the web UI, Claude uses the MCP server. Both create and manage cards on shared projects.',
  base_url: 'http://localhost:3654',

  authentication: {
    type: 'bearer',
    header: 'Authorization',
    format: 'Bearer <token>',
    types: [
      {
        type: 'admin',
        source: 'LIMONCELLO_API_KEY env var',
        capabilities: 'Full access to every project and card, plus key management. Bypasses all ownership checks.',
      },
      {
        type: 'agent',
        source: 'Database-backed agent keys (lmn_ prefix)',
        capabilities: 'Full CRUD on projects the key owns and the cards inside them. Cannot see other keys\' projects at all (cross-tenant reads return 404). Cannot manage other keys.',
      },
      {
        type: 'none',
        source: 'No admin key AND no agent keys exist',
        capabilities: 'All routes are open (local dev)',
      },
    ],
    unauthenticated_endpoints: [
      'GET /health',
      'GET /api/man',
      'POST /api/keys',
    ],
  },

  errors: {
    format: { error: '<message>' },
    common_codes: [
      { status: 400, meaning: 'Bad request -- invalid input, missing required fields, or constraint violation' },
      { status: 401, meaning: 'Unauthorized -- missing or invalid Bearer token' },
      { status: 403, meaning: 'Forbidden -- agent key used for admin-only endpoint' },
      { status: 404, meaning: 'Not found -- resource does not exist' },
      { status: 429, meaning: 'Rate limited -- too many requests' },
      { status: 500, meaning: 'Internal server error' },
    ],
  },

  concepts: {
    terminology: 'IMPORTANT: In Limoncello, a "project" is a board with custom columns (like separate Trello boards). Cards are individual tasks that belong to a project/board. This naming can be confusing when working on software projects, but each software codebase typically gets its own dedicated Limoncello project/board.',
    projects: 'A project is a board with its own set of columns. Every card belongs to a project. A Default project is created on first run and is owned by the admin (invisible to agent keys).',
    ownership: 'Every project has an owner_key_id. Agent keys see and mutate ONLY the projects they own (and the cards inside them); cross-tenant reads return 404 so existence is never leaked. The admin key bypasses all ownership checks. When an agent key calls POST /api/keys or POST /api/projects, the new project is automatically stamped with that key\'s id as owner.',
    cards: 'A card is a task or item on the board. It has a title, optional description, status (column), optional substatus, optional tags, and a position within its column. Every card inherits its parent project\'s ownership.',
    columns: 'Each project defines an ordered list of columns (statuses). Default columns: backlog, todo, in_progress, blocked, done. Column keys are lowercase with underscores.',
    substatuses: 'Columns can define optional sub-statuses. For example, the "blocked" column has sub-statuses "human_review" and "agent_review". A card\'s substatus auto-clears when it moves to a different column.',
    tags: 'Cards can have an array of string tags for categorization and filtering. Tags are stored as JSON and can be filtered via query parameters.',
    ids: 'Projects use "prj_" prefix, cards use "crd_" prefix, both followed by a nanoid string. Example: crd_XhslNkie9dum, prj_vDi0hGAhCrUP.',
    api_keys: 'Agent-provisioned API keys for authentication. Keys use the lmn_ prefix and are stored as SHA-256 hashes. POST /api/keys atomically creates a key + a private project owned by that key + a welcome card; the response includes the new project_id. Admin can list and revoke keys.',
  },

  schemas: {
    project: {
      id: { type: 'string', example: 'prj_abc123', description: 'Unique project ID (prj_ prefix)' },
      name: { type: 'string', example: 'My Project', description: 'Project display name' },
      description: { type: 'string', example: 'Tracking work for myproject', description: 'Optional human-readable description' },
      owner_key_id: { type: 'string|null', example: 'key_abc123', description: 'ID of the agent key that owns this project. NULL means admin-owned.' },
      columns: {
        type: 'array',
        description: 'Ordered list of column definitions',
        items: {
          key: { type: 'string', example: 'in_progress' },
          label: { type: 'string', example: 'In Progress' },
          substatuses: {
            type: 'array',
            items: { key: 'string', label: 'string' },
            description: 'Optional sub-statuses for this column',
          },
        },
      },
      created_at: { type: 'string', format: 'ISO 8601', example: '2026-04-03T12:00:00.000Z' },
      updated_at: { type: 'string', format: 'ISO 8601', example: '2026-04-03T12:00:00.000Z' },
    },
    card: {
      id: { type: 'string', example: 'crd_XhslNkie9dum', description: 'Unique card ID (crd_ prefix)' },
      project_id: { type: 'string', example: 'prj_abc123', description: 'Parent project ID' },
      title: { type: 'string', example: 'Fix login bug', description: 'Card title (required)' },
      description: { type: 'string', example: 'Users see a blank screen after login', description: 'Optional card description' },
      status: { type: 'string', example: 'in_progress', description: 'Column key the card belongs to' },
      substatus: { type: 'string|null', example: 'human_review', description: 'Optional sub-status within the column' },
      tags: { type: 'array', example: ['bug', 'urgent'], description: 'Optional string tags for categorization' },
      position: { type: 'integer', example: 0, description: 'Sort order within the column' },
      created_at: { type: 'string', format: 'ISO 8601', example: '2026-04-03T12:00:00.000Z' },
      updated_at: { type: 'string', format: 'ISO 8601', example: '2026-04-03T12:00:00.000Z' },
    },
    api_key: {
      id: { type: 'string', example: 'key_abc123', description: 'Unique key ID (key_ prefix)' },
      key: { type: 'string', example: 'lmn_a3Bf9x...', description: 'Plaintext API key (returned once at creation, never stored)' },
      name: { type: 'string', example: 'Claude Code - myproject', description: 'Optional label for the key' },
      created_at: { type: 'string', format: 'ISO 8601' },
      last_used: { type: 'string|null', format: 'ISO 8601', description: 'Last time this key was used for authentication' },
      revoked: { type: 'boolean', description: 'Whether the key has been revoked' },
    },
  },

  endpoints: [
    // Health + Manual
    {
      method: 'GET',
      path: '/health',
      summary: 'Health check',
      auth: false,
      response: '{ status: "ok", timestamp: "<ISO 8601>" }',
    },
    {
      method: 'GET',
      path: '/api/man',
      summary: 'This endpoint. Returns the full API manual as JSON.',
      auth: false,
      response: '(this document)',
    },

    // API key management
    {
      method: 'POST',
      path: '/api/keys',
      summary: 'Atomically create a new agent API key, a private project owned by that key, and a welcome card. Unauthenticated, rate-limited to 10 requests/min/IP.',
      auth: false,
      rate_limit: '10 requests per minute per IP address',
      body: {
        name: { type: 'string', required: false, description: 'Optional label for the key; also used as prefix for the auto-created project name' },
      },
      response: '{ id: "key_...", key: "lmn_...", name: "...", project_id: "prj_...", setup: {...} } (201). Key is shown once. project_id points at the new private board owned by the key -- agent keys cannot see pre-existing admin-owned projects.',
    },
    {
      method: 'GET',
      path: '/api/keys',
      summary: 'List all agent API keys (admin only)',
      auth: 'admin',
      response: 'Array of { id, name, created_at, last_used, revoked }',
    },
    {
      method: 'DELETE',
      path: '/api/keys/:id',
      summary: 'Revoke an agent API key (admin only)',
      auth: 'admin',
      params: { id: 'Key ID' },
      response: '204 No Content',
    },

    // Project endpoints
    {
      method: 'GET',
      path: '/api/projects',
      summary: 'List all projects',
      auth: true,
      response: 'Array of project objects',
    },
    {
      method: 'POST',
      path: '/api/projects',
      summary: 'Create a new project',
      auth: true,
      body: {
        name: { type: 'string', required: true, description: 'Project name' },
        columns: { type: 'array', required: false, description: 'Custom column definitions. Default: backlog, todo, in_progress, blocked, done' },
      },
      response: 'Created project object (201)',
    },
    {
      method: 'GET',
      path: '/api/projects/:id',
      summary: 'Get a single project',
      auth: true,
      params: { id: 'Project ID' },
      response: 'Project object',
    },
    {
      method: 'PATCH',
      path: '/api/projects/:id',
      summary: 'Update a project name and/or columns',
      auth: true,
      params: { id: 'Project ID' },
      body: {
        name: { type: 'string', required: false, description: 'New project name' },
        columns: { type: 'array', required: false, description: 'New column definitions. Rejects removal of columns that have cards.' },
      },
      response: 'Updated project object',
    },
    {
      method: 'DELETE',
      path: '/api/projects/:id',
      summary: 'Delete a project (must have no cards, cannot be the last project)',
      auth: true,
      params: { id: 'Project ID' },
      response: '204 No Content',
    },

    // Project-scoped card endpoints
    {
      method: 'GET',
      path: '/api/projects/:projectId/cards',
      summary: 'List cards in a project',
      auth: true,
      params: { projectId: 'Project ID' },
      query: {
        status: { required: false, description: 'Filter by column key' },
        tag: { required: false, description: 'Filter by tag' },
      },
      response: 'Array of card objects',
    },
    {
      method: 'GET',
      path: '/api/projects/:projectId/cards/changes',
      summary: 'Get cards changed since a timestamp',
      auth: true,
      params: { projectId: 'Project ID' },
      query: {
        since: { required: true, description: 'ISO 8601 timestamp' },
      },
      response: '{ cards: [...], server_time: "<ISO 8601>" }',
    },
    {
      method: 'POST',
      path: '/api/projects/:projectId/cards',
      summary: 'Create a card in a project',
      auth: true,
      params: { projectId: 'Project ID' },
      body: {
        title: { type: 'string', required: true, description: 'Card title' },
        description: { type: 'string', required: false, description: 'Card description' },
        status: { type: 'string', required: false, description: 'Column key (default: first column)' },
        substatus: { type: 'string', required: false, description: 'Sub-status key within the column' },
        tags: { type: 'array', required: false, description: 'Array of string tags' },
      },
      response: 'Created card object (201)',
    },
    {
      method: 'GET',
      path: '/api/projects/:projectId/cards/:id',
      summary: 'Get a single card',
      auth: true,
      params: { projectId: 'Project ID', id: 'Card ID' },
      response: 'Card object',
    },
    {
      method: 'PATCH',
      path: '/api/projects/:projectId/cards/:id',
      summary: 'Update a card (partial update)',
      auth: true,
      params: { projectId: 'Project ID', id: 'Card ID' },
      body: {
        title: { type: 'string', required: false, description: 'New title' },
        description: { type: 'string', required: false, description: 'New description' },
        status: { type: 'string', required: false, description: 'Move to column (substatus auto-clears unless provided)' },
        substatus: { type: 'string|null', required: false, description: 'Set or clear sub-status' },
        tags: { type: 'array', required: false, description: 'Set tags' },
        position: { type: 'integer', required: false, description: 'Set sort position' },
      },
      response: 'Updated card object',
    },
    {
      method: 'DELETE',
      path: '/api/projects/:projectId/cards/:id',
      summary: 'Delete a card',
      auth: true,
      params: { projectId: 'Project ID', id: 'Card ID' },
      response: '204 No Content',
    },
    {
      method: 'PATCH',
      path: '/api/projects/:projectId/cards/reorder',
      summary: 'Batch update card positions',
      auth: true,
      params: { projectId: 'Project ID' },
      body: {
        cards: { type: 'array', required: true, description: 'Array of { id, position } objects' },
      },
      response: '{ updated: <count> }',
    },

    // Backward-compat card endpoints (Default project)
    {
      method: 'GET',
      path: '/api/cards',
      summary: 'List cards in the Default project',
      auth: true,
      query: {
        status: { required: false, description: 'Filter by column key' },
        tag: { required: false, description: 'Filter by tag' },
      },
      response: 'Array of card objects',
    },
    {
      method: 'GET',
      path: '/api/cards/changes',
      summary: 'Get changed cards in the Default project',
      auth: true,
      query: {
        since: { required: true, description: 'ISO 8601 timestamp' },
      },
      response: '{ cards: [...], server_time: "<ISO 8601>" }',
    },
    {
      method: 'POST',
      path: '/api/cards',
      summary: 'Create a card in the Default project',
      auth: true,
      body: {
        title: { type: 'string', required: true, description: 'Card title' },
        description: { type: 'string', required: false, description: 'Card description' },
        status: { type: 'string', required: false, description: 'Column key (default: first column)' },
        substatus: { type: 'string', required: false, description: 'Sub-status key within the column' },
        tags: { type: 'array', required: false, description: 'Array of string tags' },
      },
      response: 'Created card object (201)',
    },
    {
      method: 'GET',
      path: '/api/cards/:id',
      summary: 'Get a single card from the Default project',
      auth: true,
      params: { id: 'Card ID' },
      response: 'Card object',
    },
    {
      method: 'PATCH',
      path: '/api/cards/:id',
      summary: 'Update a card in the Default project',
      auth: true,
      params: { id: 'Card ID' },
      body: {
        title: { type: 'string', required: false, description: 'New title' },
        description: { type: 'string', required: false, description: 'New description' },
        status: { type: 'string', required: false, description: 'Move to column' },
        substatus: { type: 'string|null', required: false, description: 'Set or clear sub-status' },
        tags: { type: 'array', required: false, description: 'Set tags' },
        position: { type: 'integer', required: false, description: 'Set sort position' },
      },
      response: 'Updated card object',
    },
    {
      method: 'DELETE',
      path: '/api/cards/:id',
      summary: 'Delete a card from the Default project',
      auth: true,
      params: { id: 'Card ID' },
      response: '204 No Content',
    },
    {
      method: 'PATCH',
      path: '/api/cards/reorder',
      summary: 'Batch update card positions in the Default project',
      auth: true,
      body: {
        cards: { type: 'array', required: true, description: 'Array of { id, position } objects' },
      },
      response: '{ updated: <count> }',
    },
  ],

  websocket: {
    path: '/ws',
    auth: 'If LIMONCELLO_API_KEY is set, connect with ?token=<key> query parameter. Otherwise no auth needed.',
    protocol: {
      subscribe: {
        direction: 'client -> server',
        message: '{ "type": "subscribe", "projectId": "<project-id>" }',
        description: 'Subscribe to card mutation events for a project. Only one subscription at a time; sending a new subscribe replaces the previous.',
      },
      events: {
        direction: 'server -> client',
        types: [
          { type: 'card_created', payload: '{ type: "card_created", card: <card object> }' },
          { type: 'card_updated', payload: '{ type: "card_updated", card: <card object> }' },
          { type: 'card_deleted', payload: '{ type: "card_deleted", cardId: "<card-id>" }' },
          { type: 'cards_reordered', payload: '{ type: "cards_reordered", cards: [{ id, position }] }' },
        ],
      },
      keepalive: 'Server sends ping every 30s; dead connections are terminated.',
    },
  },

  mcp: {
    http_endpoint: '/mcp',
    http_transport: 'Streamable HTTP (stateful sessions). POST with initialize request to start a session. Include Mcp-Session-Id header for subsequent requests.',
    stdio_command: 'node src/mcp.mjs',
    stdio_env: {
      LIMONCELLO_URL: 'Base URL of the Limoncello API',
      LIMONCELLO_API_KEY: 'Bearer token for auth',
    },
    tools: [
      { name: 'limoncello_bootstrap', description: 'Provision a new agent API key', params: ['name?'] },
      { name: 'limoncello_projects', description: 'List all projects with their columns' },
      { name: 'limoncello_create_project', description: 'Create a new project with custom columns', params: ['name?', 'columns?', 'columns_file?'] },
      { name: 'limoncello_add', description: 'Create a new card', params: ['title', 'description?', 'status?', 'substatus?', 'tags?', 'project_id?'] },
      { name: 'limoncello_list', description: 'List cards, optionally filtered', params: ['status?', 'tag?', 'project_id?'] },
      { name: 'limoncello_move', description: 'Move a card to a different column', params: ['card_id', 'status', 'substatus?', 'tags?', 'project_id?'] },
      { name: 'limoncello_board', description: 'Show board summary with card counts', params: ['project_id?'] },
      { name: 'limoncello_changes', description: 'Get cards changed since a timestamp', params: ['since', 'project_id?'] },
    ],
  },
};

function manHandler(req, res) {
  res.json(manual);
}

module.exports = { manHandler, manual };
