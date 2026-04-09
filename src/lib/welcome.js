/**
 * Shared welcome card content used when a new project is created.
 *
 * Used by src/routes/projects.js (manual project creation) and
 * src/routes/keys.js (auto-created project for a new agent key).
 */

const WELCOME_TITLE = 'Welcome to Limoncello!';

const WELCOME_DESCRIPTION = `This is your Limoncello board. Here's how to get started:

**For Humans (Web UI):**
- Click the + button in any column to add a new card
- Drag cards between columns to update their status
- Click a card to edit its title, description, or tags
- Use tags to categorize and filter your work

**For AI Agents (MCP):**
Agents can interact with this board via the Limoncello MCP server. Common operations:
- \`limoncello_add\` -- create a new card
- \`limoncello_list\` -- list cards (filter by status or tag)
- \`limoncello_move\` -- update card status or tags
- \`limoncello_board\` -- view board summary
- \`limoncello_changes\` -- poll for changes since a timestamp

**Tips:**
- Move cards to "In Progress" when you start work
- Use "Blocked" status when waiting for input or dependencies
- Mark cards as "Done" when complete
- Add new cards whenever you discover work that needs tracking

You can delete this card once you're comfortable with the basics.`;

module.exports = { WELCOME_TITLE, WELCOME_DESCRIPTION };
