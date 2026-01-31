// Google Tasks Panel
let taskLists = [];
let allTasks = [];

export async function initTasksPanel() {
  console.log('Initializing Tasks panel...');
  await loadAllTasks();
  renderTasks();
}

async function loadAllTasks() {
  try {
    const response = await fetch('/api/google/tasks/all?showCompleted=false');

    if (!response.ok) {
      if (response.status === 401) {
        const error = await response.json();
        window.handleGoogleAuthError(error);
        return;
      }
      throw new Error('Failed to load tasks');
    }

    allTasks = await response.json();
    taskLists = allTasks.map(t => ({ id: t.listId, title: t.listTitle }));
  } catch (error) {
    console.error('Error loading tasks:', error);
    showTasksError('Failed to load tasks');
  }
}

function renderTasks() {
  const container = document.getElementById('tasks-panel');

  if (allTasks.length === 0) {
    container.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.875rem;">No tasks found</p>';
    return;
  }

  let html = '';

  allTasks.forEach(taskList => {
    if (taskList.tasks.length === 0) return;

    html += `
      <div class="task-list-section">
        <h3>${escapeHtml(taskList.listTitle)}</h3>
        <div class="task-list">
          ${taskList.tasks.map(task => `
            <div class="task-item ${task.status === 'completed' ? 'completed' : ''}" data-task-id="${task.id}" data-list-id="${taskList.listId}">
              <input type="checkbox" 
                     ${task.status === 'completed' ? 'checked' : ''}
                     onchange="toggleTask('${taskList.listId}', '${task.id}')">
              <div class="task-item-content">
                <div class="task-item-title">${escapeHtml(task.title)}</div>
                ${task.notes ? `<div class="task-item-notes">${escapeHtml(task.notes)}</div>` : ''}
                ${task.due ? `<div class="task-item-due" style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.25rem;">Due: ${new Date(task.due).toLocaleDateString()}</div>` : ''}
              </div>
              <button class="btn btn-icon btn-sm" onclick="deleteTask('${taskList.listId}', '${task.id}')" title="Delete" style="opacity: 0.5;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          `).join('')}
        </div>
        <div class="task-add">
          <input type="text" 
                 placeholder="Add a task..." 
                 data-list-id="${taskList.listId}"
                 onkeypress="if(event.key==='Enter') addTask('${taskList.listId}', this.value, this)">
          <button class="btn btn-icon" onclick="addTaskFromButton('${taskList.listId}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

window.toggleTask = async function(listId, taskId) {
  try {
    const response = await fetch(`/api/google/tasks/${listId}/${taskId}/toggle`, {
      method: 'POST'
    });

    if (!response.ok) {
      if (response.status === 401) {
        const error = await response.json();
        window.handleGoogleAuthError(error);
        return;
      }
      throw new Error('Failed to toggle task');
    }

    // Reload tasks
    await loadAllTasks();
    renderTasks();
  } catch (error) {
    console.error('Error toggling task:', error);
    alert('Failed to update task');
  }
};

window.addTask = async function(listId, title, inputEl) {
  if (!title || !title.trim()) return;

  try {
    const response = await fetch(`/api/google/tasks/${listId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim() })
    });

    if (!response.ok) {
      if (response.status === 401) {
        const error = await response.json();
        window.handleGoogleAuthError(error);
        return;
      }
      throw new Error('Failed to add task');
    }

    // Clear input
    if (inputEl) {
      inputEl.value = '';
    }

    // Reload tasks
    await loadAllTasks();
    renderTasks();
  } catch (error) {
    console.error('Error adding task:', error);
    alert('Failed to add task');
  }
};

window.addTaskFromButton = function(listId) {
  const input = document.querySelector(`input[data-list-id="${listId}"]`);
  if (input) {
    addTask(listId, input.value, input);
  }
};

window.deleteTask = async function(listId, taskId) {
  if (!confirm('Delete this task?')) return;

  try {
    const response = await fetch(`/api/google/tasks/${listId}/${taskId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      if (response.status === 401) {
        const error = await response.json();
        window.handleGoogleAuthError(error);
        return;
      }
      throw new Error('Failed to delete task');
    }

    // Reload tasks
    await loadAllTasks();
    renderTasks();
  } catch (error) {
    console.error('Error deleting task:', error);
    alert('Failed to delete task');
  }
};

function showTasksError(message) {
  const container = document.getElementById('tasks-panel');
  container.innerHTML = `<p style="color: var(--error); font-size: 0.875rem;">${escapeHtml(message)}</p>`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
