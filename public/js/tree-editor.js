function joinPath(base, name) {
  if (!base) return name;
  return `${base.replace(/\/$/, '')}/${name.replace(/^\//, '')}`;
}

function getParentPath(path) {
  if (!path) return '';
  const parts = path.split('/').filter(Boolean);
  if (parts.length <= 1) return '';
  return parts.slice(0, -1).join('/');
}

function ensureMarkdown(name) {
  if (!name) return name;
  return name.endsWith('.md') ? name : `${name}.md`;
}

export function initTreeEditor({
  container,
  toolbar,
  type = 'files',
  initialTree = null,
  onOpenFile = null,
  policyProvider = null
} = {}) {
  if (!container) {
    throw new Error('Tree container is required');
  }

  const state = {
    type,
    tree: Array.isArray(initialTree) ? initialTree : null,
    expanded: new Set(),
    selected: null
  };

  function setSelected(el, node) {
    const prev = container.querySelector('.tree-selected');
    if (prev) prev.classList.remove('tree-selected');
    if (el) el.classList.add('tree-selected');
    state.selected = node;
  }

  function buildNode(item, level = 0) {
    if (item.type === 'folder') {
      const folder = document.createElement('div');
      folder.className = 'tree-folder tree-node';
      folder.style.paddingLeft = `${level * 16}px`;
      folder.dataset.path = item.path;
      folder.dataset.nodeType = 'folder';

      const toggle = document.createElement('span');
      toggle.className = 'folder-toggle';
      toggle.textContent = '▶';
      if (state.expanded.has(item.path)) {
        toggle.classList.add('open');
      }

      const name = document.createElement('span');
      name.className = 'folder-name';
      name.textContent = item.name;

      folder.appendChild(toggle);
      folder.appendChild(name);

      const contents = document.createElement('div');
      contents.className = 'folder-contents';
      if (!state.expanded.has(item.path)) {
        contents.classList.add('hidden');
      }

      folder.addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.expanded.has(item.path)) {
          state.expanded.delete(item.path);
          toggle.classList.remove('open');
          contents.classList.add('hidden');
        } else {
          state.expanded.add(item.path);
          toggle.classList.add('open');
          contents.classList.remove('hidden');
        }
        setSelected(folder, item);
      });

      if (item.children) {
        item.children.forEach(child => {
          contents.appendChild(buildNode(child, level + 1));
        });
      }

      const wrapper = document.createElement('div');
      wrapper.appendChild(folder);
      wrapper.appendChild(contents);
      return wrapper;
    }

    const file = document.createElement('div');
    file.className = 'tree-file tree-node';
    file.style.paddingLeft = `${(level * 16) + 16}px`;
    file.dataset.path = item.path;
    file.dataset.nodeType = 'file';

    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = item.name;

    file.appendChild(name);

    file.addEventListener('click', (e) => {
      e.stopPropagation();
      setSelected(file, item);
      if (onOpenFile) onOpenFile(item.path);
    });

    return file;
  }

  function renderTree() {
    container.innerHTML = '';
    if (!state.tree) return;
    state.tree.forEach(item => {
      container.appendChild(buildNode(item, 0));
    });
  }

  async function loadTree() {
    const response = await fetch(`/api/tree?type=${encodeURIComponent(state.type)}`);
    if (!response.ok) {
      throw new Error('Failed to load tree');
    }
    const data = await response.json();
    state.tree = Array.isArray(data.items) ? data.items : data;
    renderTree();
  }

  function getSelectionTargetPath() {
    if (!state.selected) return '';
    if (state.selected.type === 'folder') return state.selected.path;
    return getParentPath(state.selected.path);
  }

  async function getPolicy(path, nodeType, operation) {
    if (!policyProvider) return null;
    return policyProvider({ path, nodeType, operation });
  }

  function isAllowed(policy, operation) {
    if (!policy) return true;
    if (policy.readOnly) return false;
    if (operation === 'create' && policy.allowCreate === false) return false;
    if (operation === 'rename' && policy.allowRename === false) return false;
    if (operation === 'delete' && policy.allowDelete === false) return false;
    return true;
  }

  async function createFile() {
    const folder = getSelectionTargetPath();
    const policy = await getPolicy(folder, 'folder', 'create');
    if (!isAllowed(policy, 'create')) {
      alert('Creation is restricted for this location.');
      return;
    }
    const name = prompt('File name:');
    if (!name) return;
    const filePath = joinPath(folder, ensureMarkdown(name.trim()));

    const response = await fetch(`/api/tree/${encodeURIComponent(state.type)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, nodeType: 'file', content: `# ${name.replace(/\.md$/, '')}\n\n` })
    });

    if (!response.ok) {
      const err = await response.json();
      alert(err.error || 'Failed to create file');
      return;
    }

    await refresh();
    if (onOpenFile) onOpenFile(filePath);
  }

  async function createFolder() {
    const folder = getSelectionTargetPath();
    const policy = await getPolicy(folder, 'folder', 'create');
    if (!isAllowed(policy, 'create')) {
      alert('Creation is restricted for this location.');
      return;
    }
    const name = prompt('Folder name:');
    if (!name) return;
    const folderPath = joinPath(folder, name.trim());

    const response = await fetch(`/api/tree/${encodeURIComponent(state.type)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: folderPath, nodeType: 'folder' })
    });

    if (!response.ok) {
      const err = await response.json();
      alert(err.error || 'Failed to create folder');
      return;
    }

    state.expanded.add(folderPath);
    await refresh();
  }

  async function renameSelected() {
    if (!state.selected) return;
    const policy = await getPolicy(state.selected.path, state.selected.type, 'rename');
    if (!isAllowed(policy, 'rename')) {
      alert('Renaming is restricted for this item.');
      return;
    }
    const current = state.selected.path;
    const nextName = prompt('Rename to:', current);
    if (!nextName || nextName === current) return;

    let nextPath = nextName.trim();
    if (state.selected.type === 'file') {
      nextPath = ensureMarkdown(nextPath);
    }

    const response = await fetch(`/api/tree/${encodeURIComponent(state.type)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: current, to: nextPath })
    });

    if (!response.ok) {
      const err = await response.json();
      alert(err.error || 'Failed to rename');
      return;
    }

    await refresh();
  }

  async function deleteSelected() {
    if (!state.selected) return;
    const policy = await getPolicy(state.selected.path, state.selected.type, 'delete');
    if (!isAllowed(policy, 'delete')) {
      alert('Deletion is restricted for this item.');
      return;
    }
    const label = state.selected.type === 'folder' ? 'folder' : 'file';
    const confirmed = confirm(`Delete ${label} "${state.selected.path}"?\n\nThis cannot be undone.`);
    if (!confirmed) return;

    const response = await fetch(`/api/tree/${encodeURIComponent(state.type)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: state.selected.path, nodeType: state.selected.type, hardDelete: true })
    });

    if (!response.ok) {
      const err = await response.json();
      alert(err.error || 'Failed to delete');
      return;
    }

    state.selected = null;
    await refresh();
  }

  async function refresh() {
    await loadTree();
  }

  function setActivePath(path) {
    const node = container.querySelector(`.tree-file[data-path="${CSS.escape(path)}"]`);
    if (node) {
      setSelected(node, { type: 'file', path });
      node.classList.add('active');
    }
    container.querySelectorAll('.tree-file').forEach(el => {
      if (el !== node) el.classList.remove('active');
    });
  }

  if (toolbar) {
    toolbar.newFileBtn?.addEventListener('click', () => createFile());
    toolbar.newFolderBtn?.addEventListener('click', () => createFolder());
    toolbar.renameBtn?.addEventListener('click', () => renameSelected());
    toolbar.deleteBtn?.addEventListener('click', () => deleteSelected());
    toolbar.refreshBtn?.addEventListener('click', () => refresh());
  }

  if (state.tree) {
    renderTree();
  } else {
    loadTree().catch(err => console.error(err));
  }

  return {
    refresh,
    setActivePath,
    createFile,
    createFolder,
    renameSelected,
    deleteSelected,
    getSelectedNode: () => state.selected
  };
}
