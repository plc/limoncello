// State
let cards = [];
let currentCard = null;
let draggedCard = null;
let sourceColumn = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadCards();
  setupEventListeners();
});

// API calls
async function loadCards() {
  try {
    const response = await fetch('/api/cards');
    if (!response.ok) throw new Error('Failed to load cards');
    cards = await response.json();
    renderBoard();
  } catch (error) {
    console.error('Error loading cards:', error);
  }
}

async function createCard(status, title) {
  try {
    const response = await fetch('/api/cards', {
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
    const response = await fetch(`/api/cards/${id}`, {
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
    const response = await fetch(`/api/cards/${id}`, {
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
    const response = await fetch('/api/cards/reorder', {
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

// Rendering
function renderBoard() {
  const statuses = ['backlog', 'todo', 'in_progress', 'done'];

  statuses.forEach(status => {
    const container = document.querySelector(`.cards-container[data-status="${status}"]`);
    const columnCards = cards
      .filter(card => card.status === status)
      .sort((a, b) => a.position - b.position);

    container.innerHTML = '';
    columnCards.forEach(card => {
      const cardEl = createCardElement(card);
      container.appendChild(cardEl);
    });

    updateCardCount(status, columnCards.length);
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

  cardEl.addEventListener('click', () => openCardModal(card));
  cardEl.addEventListener('dragstart', handleDragStart);
  cardEl.addEventListener('dragend', handleDragEnd);

  return cardEl;
}

function updateCardCount(status, count) {
  const column = document.querySelector(`.column[data-status="${status}"]`);
  const countEl = column.querySelector('.card-count');
  countEl.textContent = count;
}

// Add card form
function setupEventListeners() {
  const addButtons = document.querySelectorAll('.add-card-btn');
  addButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const status = e.target.dataset.status;
      showAddCardForm(status, e.target);
    });
  });

  setupDragAndDrop();
  setupModal();
}

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

// Drag and drop
function setupDragAndDrop() {
  const columns = document.querySelectorAll('.column');
  columns.forEach(column => {
    column.addEventListener('dragover', handleDragOver);
    column.addEventListener('drop', handleDrop);
    column.addEventListener('dragleave', handleDragLeave);
  });
}

function handleDragStart(e) {
  draggedCard = this;
  sourceColumn = this.closest('.column').dataset.status;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragEnd(e) {
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

function handleDragLeave(e) {
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

// Modal
function setupModal() {
  const modal = document.getElementById('cardModal');
  const closeBtn = document.getElementById('closeModal');
  const saveBtn = document.getElementById('saveCard');
  const deleteBtn = document.getElementById('deleteCard');

  closeBtn.addEventListener('click', closeModal);
  saveBtn.addEventListener('click', saveCurrentCard);
  deleteBtn.addEventListener('click', deleteCurrentCard);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display !== 'none') {
      closeModal();
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

  modal.style.display = 'flex';
}

function closeModal() {
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

  await updateCard(currentCard.id, { title, description });
  closeModal();
}

async function deleteCurrentCard() {
  if (!currentCard) return;

  if (confirm('Are you sure you want to delete this card?')) {
    await deleteCard(currentCard.id);
    closeModal();
  }
}
