// Backlinks Panel

export async function loadBacklinks(filePath) {
  const container = document.getElementById('backlinks-list');
  const countEl = document.getElementById('backlinks-count');

  if (!filePath) {
    container.innerHTML = '<div class="empty-state">No file selected</div>';
    if (countEl) countEl.textContent = '';
    return;
  }

  try {
    const response = await fetch(`/api/backlinks/${encodeURIComponent(filePath)}`);

    if (!response.ok) {
      throw new Error('Failed to load backlinks');
    }

    const backlinks = await response.json();

    // Update count in header
    if (countEl) {
      countEl.textContent = backlinks.length > 0 ? `(${backlinks.length})` : '';
    }

    if (backlinks.length === 0) {
      container.innerHTML = '<div class="empty-state">No backlinks</div>';
      return;
    }

    container.innerHTML = backlinks.map(link => `
      <div class="backlink-item" onclick="openFile('${escapeAttr(link.path)}')">
        <div class="backlink-title">${escapeHtml(link.name)}</div>
        ${link.context ? `<div class="backlink-preview">${escapeHtml(link.context)}</div>` : ''}
      </div>
    `).join('');

  } catch (err) {
    console.error('Error loading backlinks:', err);
    container.innerHTML = '<div class="empty-state">Error loading backlinks</div>';
    if (countEl) countEl.textContent = '';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeAttr(text) {
  return text.replace(/'/g, "\\'").replace(/"/g, '\\"');
}
