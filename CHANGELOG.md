# Changelog

## 2026-04-02

### Added
- Initial Prello implementation
- SQLite database with cards table (id, title, description, status, position, timestamps)
- REST API for card CRUD at `/api/cards` with status filtering and batch reorder
- Web UI: four-column Kanban board with drag-and-drop, inline card creation, edit/delete modal
- Claude Code slash commands: `/prello-add`, `/prello-list`, `/prello-move`, `/prello-board`
- Docker and Fly.io configuration
- Project documentation (CLAUDE.md, README.md, SPEC.md)

### Architecture decisions
- SQLite over Postgres: local-first, zero-config, single file at `./data/prello.db`
- Vanilla HTML/CSS/JS: no build step, no framework, served statically
- Slash commands over MCP: simpler, uses curl against the local API
- nanoid with `crd_` prefix for card IDs
- Schema-on-startup pattern (CREATE TABLE IF NOT EXISTS)
