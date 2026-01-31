import db from './db.js';

let currentConflict = null;

export function showConflictWarning(path, localContent, serverContent) {
  currentConflict = { path, localContent, serverContent };

  const modal = document.getElementById('conflict-modal');
  document.getElementById('conflict-local').textContent = localContent.substring(0, 500) + (localContent.length > 500 ? '...' : '');
  document.getElementById('conflict-server').textContent = serverContent.substring(0, 500) + (serverContent.length > 500 ? '...' : '');

  modal.classList.remove('hidden');
}

export async function resolveConflict(choice, loadFile) {
  if (!currentConflict) return;

  const content = choice === 'local' ? currentConflict.localContent : currentConflict.serverContent;

  try {
    // Save chosen version
    await db.saveFile(currentConflict.path, content);

    // Sync to server - don't send lastModified since we're force-resolving
    if (navigator.onLine) {
      const response = await fetch(`/api/files/${encodeURIComponent(currentConflict.path)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      if (response.ok) {
        await db.markFileAsSynced(currentConflict.path, Date.now());
      }
    }

    // Reload the file (this will update lastKnownModified)
    await loadFile(currentConflict.path);

    // Close modal
    document.getElementById('conflict-modal').classList.add('hidden');
    currentConflict = null;
  } catch (err) {
    console.error('Error resolving conflict:', err);
    alert('Failed to resolve conflict');
  }
}
