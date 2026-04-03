// State
let projects = [];
let currentProject = null;
let cards = [];
let currentCard = null;
let draggedCard = null;
let sourceColumn = null;

// Auth -- stored in localStorage, prompted on 401
function getApiKey() {
  return localStorage.getItem('limoncello_api_key') || '';
}

function setApiKey(key) {
  localStorage.setItem('limoncello_api_key', key);
}

async function apiFetch(url, options = {}) {
  const key = getApiKey();
  const headers = { ...options.headers };
  if (key) {
    headers['Authorization'] = `Bearer ${key}`;
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    const newKey = prompt('API key required:');
    if (newKey) {
      setApiKey(newKey);
      headers['Authorization'] = `Bearer ${newKey}`;
      return fetch(url, { ...options, headers });
    }
  }

  return response;
}

// Persistence for selected project
function getSavedProjectId() {
  return localStorage.getItem('limoncello_project_id') || '';
}

function saveProjectId(id) {
  localStorage.setItem('limoncello_project_id', id);
}

// API base path for the current project
function cardsBasePath() {
  return `/api/projects/${currentProject.id}/cards`;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupModal();
  setupProjectModal();
  setupHeaderButtons();
  loadProjects();
  connectWebSocket();
});

// --- Projects ---

async function loadProjects() {
  try {
    const response = await apiFetch('/api/projects');
    if (!response.ok) throw new Error('Failed to load projects');
    projects = await response.json();

    renderProjectSelector();

    // Restore saved selection or use first project
    const savedId = getSavedProjectId();
    const saved = projects.find(p => p.id === savedId);
    selectProject(saved || projects[0]);
  } catch (error) {
    console.error('Error loading projects:', error);
  }
}

function renderProjectSelector() {
  const select = document.getElementById('projectSelect');
  select.innerHTML = '';
  projects.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
}

function selectProject(project) {
  if (!project) return;
  currentProject = project;
  saveProjectId(project.id);
  document.getElementById('projectSelect').value = project.id;
  wsSubscribe(project.id);
  renderColumns();
  loadCards();
}

function setupHeaderButtons() {
  document.getElementById('projectSelect').addEventListener('change', (e) => {
    const project = projects.find(p => p.id === e.target.value);
    selectProject(project);
  });

  document.getElementById('newProjectBtn').addEventListener('click', () => {
    openProjectModal(null); // null = create new
  });

  document.getElementById('editProjectBtn').addEventListener('click', () => {
    if (currentProject) openProjectModal(currentProject);
  });
}

// --- Cards API ---

async function loadCards() {
  try {
    const response = await apiFetch(cardsBasePath());
    if (!response.ok) throw new Error('Failed to load cards');
    cards = await response.json();
    renderBoard();
  } catch (error) {
    console.error('Error loading cards:', error);
  }
}

async function createCard(status, title) {
  try {
    const response = await apiFetch(cardsBasePath(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, status })
    });
    if (!response.ok) throw new Error('Failed to create card');
    const newCard = await response.json();
    cards.push(newCard);
    renderBoard();
  } catch (error) {
    console.error('Error creating card:', error);
  }
}

async function updateCard(id, updates) {
  try {
    const response = await apiFetch(`${cardsBasePath()}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error('Failed to update card');
    const updatedCard = await response.json();
    const index = cards.findIndex(c => c.id === id);
    if (index !== -1) {
      cards[index] = updatedCard;
    }
    renderBoard();
  } catch (error) {
    console.error('Error updating card:', error);
  }
}

async function deleteCard(id) {
  try {
    const response = await apiFetch(`${cardsBasePath()}/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete card');
    cards = cards.filter(c => c.id !== id);
    renderBoard();
  } catch (error) {
    console.error('Error deleting card:', error);
  }
}

async function reorderCards(reorderData) {
  try {
    const response = await apiFetch(`${cardsBasePath()}/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cards: reorderData })
    });
    if (!response.ok) throw new Error('Failed to reorder cards');
    await loadCards();
  } catch (error) {
    console.error('Error reordering cards:', error);
  }
}

// --- Rendering ---

function renderColumns() {
  const board = document.getElementById('board');
  board.innerHTML = '';

  if (!currentProject) return;

  currentProject.columns.forEach(col => {
    const columnEl = document.createElement('div');
    columnEl.className = 'column';
    columnEl.dataset.status = col.key;

    columnEl.innerHTML = `
      <div class="column-header">
        <h2>${escapeHtml(col.label)}</h2>
        <span class="card-count">0</span>
      </div>
      <div class="cards-container" data-status="${col.key}"></div>
      <button class="add-card-btn" data-status="${col.key}">Add card</button>
    `;

    // Add card button
    const addBtn = columnEl.querySelector('.add-card-btn');
    addBtn.addEventListener('click', (e) => {
      showAddCardForm(col.key, e.target);
    });

    // Drag-and-drop on column
    columnEl.addEventListener('dragover', handleDragOver);
    columnEl.addEventListener('drop', handleDrop);
    columnEl.addEventListener('dragleave', handleDragLeave);

    board.appendChild(columnEl);
  });
}

function renderBoard() {
  if (!currentProject) return;

  currentProject.columns.forEach(col => {
    const container = document.querySelector(`.cards-container[data-status="${col.key}"]`);
    if (!container) return;

    const columnCards = cards
      .filter(card => card.status === col.key)
      .sort((a, b) => a.position - b.position);

    container.innerHTML = '';
    columnCards.forEach(card => {
      const cardEl = createCardElement(card);
      container.appendChild(cardEl);
    });

    updateCardCount(col.key, columnCards.length);
  });
}

function createCardElement(card) {
  const cardEl = document.createElement('div');
  cardEl.className = 'card';
  cardEl.draggable = true;
  cardEl.dataset.id = card.id;

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = card.title;
  cardEl.appendChild(title);

  if (card.description) {
    const description = document.createElement('div');
    description.className = 'card-description';
    description.textContent = card.description;
    cardEl.appendChild(description);
  }

  if (card.substatus) {
    const badge = document.createElement('span');
    badge.className = 'substatus-badge';
    // Find the substatus label from the current project's columns
    const col = currentProject.columns.find(c => c.key === card.status);
    const sub = col && (col.substatuses || []).find(s => s.key === card.substatus);
    badge.textContent = sub ? sub.label : card.substatus;
    cardEl.appendChild(badge);
  }

  cardEl.addEventListener('click', () => openCardModal(card));
  cardEl.addEventListener('dragstart', handleDragStart);
  cardEl.addEventListener('dragend', handleDragEnd);

  return cardEl;
}

function updateCardCount(status, count) {
  const column = document.querySelector(`.column[data-status="${status}"]`);
  if (!column) return;
  const countEl = column.querySelector('.card-count');
  countEl.textContent = count;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- Add card form ---

function showAddCardForm(status, button) {
  const form = document.createElement('div');
  form.className = 'add-card-form';
  form.innerHTML = `
    <input type="text" placeholder="Card title..." class="card-title-input" />
    <div class="add-card-form-buttons">
      <button class="submit-btn">Add</button>
      <button class="cancel-btn">Cancel</button>
    </div>
  `;

  const input = form.querySelector('.card-title-input');
  const submitBtn = form.querySelector('.submit-btn');
  const cancelBtn = form.querySelector('.cancel-btn');

  submitBtn.addEventListener('click', async () => {
    const title = input.value.trim();
    if (title) {
      await createCard(status, title);
      form.remove();
      button.style.display = 'block';
    }
  });

  cancelBtn.addEventListener('click', () => {
    form.remove();
    button.style.display = 'block';
  });

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const title = input.value.trim();
      if (title) {
        await createCard(status, title);
        form.remove();
        button.style.display = 'block';
      }
    } else if (e.key === 'Escape') {
      form.remove();
      button.style.display = 'block';
    }
  });

  button.style.display = 'none';
  button.parentElement.appendChild(form);
  input.focus();
}

// --- Drag and drop ---

function handleDragStart(e) {
  draggedCard = this;
  sourceColumn = this.closest('.column').dataset.status;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragEnd() {
  this.classList.remove('dragging');
  document.querySelectorAll('.column').forEach(col => {
    col.classList.remove('drag-over');
  });
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';
  this.classList.add('drag-over');
  return false;
}

function handleDragLeave() {
  this.classList.remove('drag-over');
}

async function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }
  e.preventDefault();

  this.classList.remove('drag-over');

  const targetColumn = this.dataset.status;
  const cardId = draggedCard.dataset.id;

  if (sourceColumn === targetColumn) {
    await handleReorderInColumn(targetColumn, cardId, e);
  } else {
    await updateCard(cardId, { status: targetColumn });
  }

  return false;
}

async function handleReorderInColumn(status, cardId, e) {
  const container = document.querySelector(`.cards-container[data-status="${status}"]`);
  const cardElements = Array.from(container.querySelectorAll('.card'));

  const draggedIndex = cardElements.findIndex(el => el.dataset.id === cardId);
  let dropIndex = cardElements.length;

  for (let i = 0; i < cardElements.length; i++) {
    const rect = cardElements[i].getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      dropIndex = i;
      break;
    }
  }

  if (draggedIndex === dropIndex || draggedIndex + 1 === dropIndex) {
    return;
  }

  const columnCards = cards
    .filter(card => card.status === status)
    .sort((a, b) => a.position - b.position);

  const movedCard = columnCards[draggedIndex];
  columnCards.splice(draggedIndex, 1);
  const insertIndex = draggedIndex < dropIndex ? dropIndex - 1 : dropIndex;
  columnCards.splice(insertIndex, 0, movedCard);

  const reorderData = columnCards.map((card, index) => ({
    id: card.id,
    position: index
  }));

  await reorderCards(reorderData);
}

// --- Card Modal ---

function setupModal() {
  const modal = document.getElementById('cardModal');
  const closeBtn = document.getElementById('closeModal');
  const saveBtn = document.getElementById('saveCard');
  const deleteBtn = document.getElementById('deleteCard');

  closeBtn.addEventListener('click', closeCardModal);
  saveBtn.addEventListener('click', saveCurrentCard);
  deleteBtn.addEventListener('click', deleteCurrentCard);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeCardModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const cardModal = document.getElementById('cardModal');
      const projectModal = document.getElementById('projectModal');
      if (cardModal.style.display !== 'none') {
        closeCardModal();
      } else if (projectModal.style.display !== 'none') {
        closeProjectModal();
      }
    }
  });
}

function openCardModal(card) {
  currentCard = card;
  const modal = document.getElementById('cardModal');
  const title = document.getElementById('modalTitle');
  const description = document.getElementById('modalDescription');

  title.textContent = card.title;
  description.value = card.description || '';

  // Substatus dropdown
  const substatusContainer = document.getElementById('substatusContainer');
  const col = currentProject.columns.find(c => c.key === card.status);
  const subs = col && (col.substatuses || []);

  if (subs && subs.length > 0) {
    substatusContainer.style.display = 'block';
    const select = document.getElementById('modalSubstatus');
    select.innerHTML = '<option value="">None</option>';
    for (const sub of subs) {
      const opt = document.createElement('option');
      opt.value = sub.key;
      opt.textContent = sub.label;
      if (card.substatus === sub.key) opt.selected = true;
      select.appendChild(opt);
    }
  } else {
    substatusContainer.style.display = 'none';
  }

  modal.style.display = 'flex';
}

function closeCardModal() {
  const modal = document.getElementById('cardModal');
  modal.style.display = 'none';
  currentCard = null;
}

async function saveCurrentCard() {
  if (!currentCard) return;

  const title = document.getElementById('modalTitle').textContent.trim();
  const description = document.getElementById('modalDescription').value.trim();

  if (!title) {
    alert('Title cannot be empty');
    return;
  }

  const updates = { title, description };

  // Include substatus if the container is visible
  const substatusContainer = document.getElementById('substatusContainer');
  if (substatusContainer.style.display !== 'none') {
    const substatus = document.getElementById('modalSubstatus').value || null;
    updates.substatus = substatus;
  }

  await updateCard(currentCard.id, updates);
  closeCardModal();
}

async function deleteCurrentCard() {
  if (!currentCard) return;

  if (confirm('Are you sure you want to delete this card?')) {
    await deleteCard(currentCard.id);
    closeCardModal();
  }
}

// --- Project Modal ---

let editingProject = null; // null = creating new, object = editing existing

function setupProjectModal() {
  const modal = document.getElementById('projectModal');
  const closeBtn = document.getElementById('closeProjectModal');
  const saveBtn = document.getElementById('saveProject');
  const deleteBtn = document.getElementById('deleteProject');
  const addColBtn = document.getElementById('addColumnBtn');

  closeBtn.addEventListener('click', closeProjectModal);
  saveBtn.addEventListener('click', saveProjectSettings);
  deleteBtn.addEventListener('click', deleteCurrentProject);
  addColBtn.addEventListener('click', addColumnRow);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeProjectModal();
    }
  });
}

function openProjectModal(project) {
  editingProject = project;
  const modal = document.getElementById('projectModal');
  const titleEl = document.getElementById('projectModalTitle');
  const nameInput = document.getElementById('projectName');
  const deleteBtn = document.getElementById('deleteProject');

  if (project) {
    titleEl.textContent = 'Project Settings';
    nameInput.value = project.name;
    deleteBtn.style.display = 'block';
    renderColumnsEditor(project.columns);
  } else {
    titleEl.textContent = 'New Project';
    nameInput.value = '';
    deleteBtn.style.display = 'none';
    renderColumnsEditor([
      { key: 'backlog', label: 'Backlog', substatuses: [] },
      { key: 'todo', label: 'To Do', substatuses: [] },
      { key: 'in_progress', label: 'In Progress', substatuses: [] },
      { key: 'blocked', label: 'Blocked', substatuses: [
        { key: 'human_review', label: 'Human Review' },
        { key: 'agent_review', label: 'Agent Review' },
      ]},
      { key: 'done', label: 'Done', substatuses: [] },
    ]);
  }

  modal.style.display = 'flex';
  nameInput.focus();
}

function closeProjectModal() {
  const modal = document.getElementById('projectModal');
  modal.style.display = 'none';
  editingProject = null;
}

function renderColumnsEditor(columns) {
  const editor = document.getElementById('columnsEditor');
  editor.innerHTML = '';
  columns.forEach(col => {
    addColumnRowWith(col.key, col.label, col.substatuses || []);
  });
}

function addColumnRow() {
  addColumnRowWith('', '', []);
}

let draggedWrapper = null;

function addColumnRowWith(key, label, substatuses) {
  const editor = document.getElementById('columnsEditor');
  const wrapper = document.createElement('div');
  wrapper.className = 'column-editor-wrapper';
  wrapper.draggable = true;

  const row = document.createElement('div');
  row.className = 'column-editor-row';
  row.innerHTML = `
    <span class="drag-handle">&#8942;&#8942;</span>
    <input type="text" class="col-key-input" placeholder="key" value="${escapeHtml(key)}" />
    <input type="text" class="col-label-input" placeholder="Label" value="${escapeHtml(label)}" />
    <button class="substatus-toggle-btn" title="Sub-statuses">${substatuses.length > 0 ? `(${substatuses.length})` : '+'}</button>
    <button class="remove-col-btn" title="Remove column">&times;</button>
  `;

  const subEditor = document.createElement('div');
  subEditor.className = 'substatus-editor';
  subEditor.style.display = substatuses.length > 0 ? 'block' : 'none';

  // Add existing substatuses
  for (const sub of substatuses) {
    addSubstatusRow(subEditor, sub.key, sub.label);
  }

  // Add substatus button
  const addSubBtn = document.createElement('button');
  addSubBtn.className = 'add-substatus-btn';
  addSubBtn.textContent = '+ Add sub-status';
  addSubBtn.addEventListener('click', () => addSubstatusRow(subEditor, '', ''));
  subEditor.appendChild(addSubBtn);

  // Toggle button
  const toggleBtn = row.querySelector('.substatus-toggle-btn');
  toggleBtn.addEventListener('click', () => {
    const visible = subEditor.style.display !== 'none';
    subEditor.style.display = visible ? 'none' : 'block';
  });

  const removeBtn = row.querySelector('.remove-col-btn');
  removeBtn.addEventListener('click', () => wrapper.remove());

  // Auto-generate key from label
  const labelInput = row.querySelector('.col-label-input');
  const keyInput = row.querySelector('.col-key-input');
  labelInput.addEventListener('input', () => {
    if (!keyInput.dataset.edited) {
      keyInput.value = labelInput.value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
    }
  });
  keyInput.addEventListener('input', () => {
    keyInput.dataset.edited = 'true';
  });
  if (key) keyInput.dataset.edited = 'true';

  // Drag-and-drop reordering
  const handle = row.querySelector('.drag-handle');
  handle.addEventListener('mousedown', () => { wrapper.dataset.handleHeld = 'true'; });
  document.addEventListener('mouseup', () => { delete wrapper.dataset.handleHeld; });

  wrapper.addEventListener('dragstart', (e) => {
    if (!wrapper.dataset.handleHeld) { e.preventDefault(); return; }
    draggedWrapper = wrapper;
    wrapper.classList.add('dragging-column');
    e.dataTransfer.effectAllowed = 'move';
  });
  wrapper.addEventListener('dragend', () => {
    wrapper.classList.remove('dragging-column');
    draggedWrapper = null;
    editor.querySelectorAll('.column-editor-wrapper').forEach(w => w.classList.remove('drag-over-column'));
  });
  wrapper.addEventListener('dragover', (e) => {
    if (!draggedWrapper || draggedWrapper === wrapper) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    editor.querySelectorAll('.column-editor-wrapper').forEach(w => w.classList.remove('drag-over-column'));
    wrapper.classList.add('drag-over-column');
  });
  wrapper.addEventListener('dragleave', () => {
    wrapper.classList.remove('drag-over-column');
  });
  wrapper.addEventListener('drop', (e) => {
    e.preventDefault();
    wrapper.classList.remove('drag-over-column');
    if (!draggedWrapper || draggedWrapper === wrapper) return;
    const rect = wrapper.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (e.clientY < midY) {
      editor.insertBefore(draggedWrapper, wrapper);
    } else {
      editor.insertBefore(draggedWrapper, wrapper.nextSibling);
    }
  });

  wrapper.appendChild(row);
  wrapper.appendChild(subEditor);
  editor.appendChild(wrapper);
}

function addSubstatusRow(container, key, label) {
  const row = document.createElement('div');
  row.className = 'substatus-row';
  row.innerHTML = `
    <input type="text" class="sub-key-input" placeholder="key" value="${escapeHtml(key)}" />
    <input type="text" class="sub-label-input" placeholder="Label" value="${escapeHtml(label)}" />
    <button class="remove-sub-btn" title="Remove">&times;</button>
  `;

  const removeBtn = row.querySelector('.remove-sub-btn');
  removeBtn.addEventListener('click', () => row.remove());

  // Auto-generate key from label
  const labelInput = row.querySelector('.sub-label-input');
  const keyInput = row.querySelector('.sub-key-input');
  labelInput.addEventListener('input', () => {
    if (!keyInput.dataset.edited) {
      keyInput.value = labelInput.value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
    }
  });
  keyInput.addEventListener('input', () => {
    keyInput.dataset.edited = 'true';
  });
  if (key) keyInput.dataset.edited = 'true';

  // Insert before the "Add sub-status" button
  const addBtn = container.querySelector('.add-substatus-btn');
  container.insertBefore(row, addBtn);
}

function getColumnsFromEditor() {
  const wrappers = document.querySelectorAll('#columnsEditor .column-editor-wrapper');
  const columns = [];
  for (const wrapper of wrappers) {
    const row = wrapper.querySelector('.column-editor-row');
    const key = row.querySelector('.col-key-input').value.trim();
    const label = row.querySelector('.col-label-input').value.trim();
    if (key && label) {
      const subRows = wrapper.querySelectorAll('.substatus-row');
      const substatuses = [];
      for (const subRow of subRows) {
        const subKey = subRow.querySelector('.sub-key-input').value.trim();
        const subLabel = subRow.querySelector('.sub-label-input').value.trim();
        if (subKey && subLabel) {
          substatuses.push({ key: subKey, label: subLabel });
        }
      }
      columns.push({ key, label, substatuses });
    }
  }
  return columns;
}

async function saveProjectSettings() {
  const name = document.getElementById('projectName').value.trim();
  if (!name) {
    alert('Project name is required');
    return;
  }

  const columns = getColumnsFromEditor();
  if (columns.length === 0) {
    alert('At least one column is required');
    return;
  }

  try {
    if (editingProject) {
      // Update existing
      const response = await apiFetch(`/api/projects/${editingProject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, columns })
      });
      if (!response.ok) {
        const err = await response.json();
        alert(err.error || 'Failed to update project');
        return;
      }
      const updated = await response.json();
      const idx = projects.findIndex(p => p.id === updated.id);
      if (idx !== -1) projects[idx] = updated;
      renderProjectSelector();
      selectProject(updated);
    } else {
      // Create new
      const response = await apiFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, columns })
      });
      if (!response.ok) {
        const err = await response.json();
        alert(err.error || 'Failed to create project');
        return;
      }
      const created = await response.json();
      projects.push(created);
      renderProjectSelector();
      selectProject(created);
    }
    closeProjectModal();
  } catch (error) {
    console.error('Error saving project:', error);
    alert('Failed to save project');
  }
}

async function deleteCurrentProject() {
  if (!editingProject) return;

  if (!confirm(`Delete project "${editingProject.name}"? This cannot be undone.`)) return;

  try {
    const response = await apiFetch(`/api/projects/${editingProject.id}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      const err = await response.json();
      alert(err.error || 'Failed to delete project');
      return;
    }
    projects = projects.filter(p => p.id !== editingProject.id);
    renderProjectSelector();
    selectProject(projects[0]);
    closeProjectModal();
  } catch (error) {
    console.error('Error deleting project:', error);
    alert('Failed to delete project');
  }
}

// --- WebSocket for real-time updates ---

let ws = null;
let wsReconnectDelay = 1000;
const WS_MAX_RECONNECT_DELAY = 30000;

function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const key = getApiKey();
  const params = key ? `?token=${encodeURIComponent(key)}` : '';
  const url = `${protocol}//${location.host}/ws${params}`;

  ws = new WebSocket(url);

  ws.addEventListener('open', () => {
    wsReconnectDelay = 1000;
    if (currentProject) {
      ws.send(JSON.stringify({ type: 'subscribe', projectId: currentProject.id }));
    }
  });

  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleWsMessage(msg);
    } catch (e) {
      console.error('WebSocket message parse error:', e);
    }
  });

  ws.addEventListener('close', () => {
    ws = null;
    setTimeout(connectWebSocket, wsReconnectDelay);
    wsReconnectDelay = Math.min(wsReconnectDelay * 2, WS_MAX_RECONNECT_DELAY);
  });

  ws.addEventListener('error', () => {
    if (ws) ws.close();
  });
}

function wsSubscribe(projectId) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'subscribe', projectId }));
  }
}

function handleWsMessage(msg) {
  switch (msg.type) {
    case 'card_created':
      if (!cards.find(c => c.id === msg.card.id)) {
        cards.push(msg.card);
        renderBoard();
      }
      break;

    case 'card_updated': {
      const idx = cards.findIndex(c => c.id === msg.card.id);
      if (idx !== -1) {
        cards[idx] = msg.card;
      } else {
        cards.push(msg.card);
      }
      renderBoard();
      if (currentCard && currentCard.id === msg.card.id) {
        currentCard = msg.card;
        openCardModal(msg.card);
      }
      break;
    }

    case 'card_deleted':
      cards = cards.filter(c => c.id !== msg.cardId);
      renderBoard();
      if (currentCard && currentCard.id === msg.cardId) {
        closeCardModal();
      }
      break;

    case 'cards_reordered':
      for (const update of msg.cards) {
        const card = cards.find(c => c.id === update.id);
        if (card) card.position = update.position;
      }
      renderBoard();
      break;
  }
}
