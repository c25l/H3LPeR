// Sidebar Panel Manager - Obsidian-style icon rail + panel area

const SIDEBAR_ICONS = {
  search: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  clock: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  folder: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  tag: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
  calendar: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  filePlus: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`,
  panelLeft: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`,
  hamburger: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`
};

export { SIDEBAR_ICONS };

export function createSidebarManager({ iconRail, panelContainer, headerEl, stateKey = 'h3lper-sidebar-state' }) {
  const panels = new Map();
  const panelEls = new Map();
  let activePanel = null;
  let collapsed = false;

  const sidebar = iconRail?.closest('.sidebar') || document.getElementById('app-sidebar');
  const panelArea = panelContainer?.closest('.sidebar-panel-area') || document.getElementById('sidebar-panels');
  const titleEl = headerEl || document.getElementById('sidebar-panel-title');
  const railTop = document.getElementById('icon-rail-top');

  function loadState() {
    try {
      const raw = localStorage.getItem(stateKey);
      if (raw) {
        const state = JSON.parse(raw);
        collapsed = Boolean(state.collapsed);
        return state.activePanel || null;
      }
    } catch { /* ignore */ }
    return null;
  }

  function saveState() {
    try {
      localStorage.setItem(stateKey, JSON.stringify({
        collapsed,
        activePanel: activePanel
      }));
    } catch { /* ignore */ }
  }

  function register({ id, title, icon, order = 50, render, onShow, onHide }) {
    panels.set(id, { id, title, icon, order, render, onShow, onHide, initialized: false });
  }

  function init() {
    const savedPanel = loadState();

    // Sort panels by order and render icon buttons
    const sorted = Array.from(panels.values()).sort((a, b) => a.order - b.order);

    if (railTop) {
      railTop.innerHTML = '';
      sorted.forEach(panel => {
        const btn = document.createElement('button');
        btn.className = 'icon-rail-btn';
        btn.id = `icon-rail-btn-${panel.id}`;
        btn.title = panel.title;
        btn.innerHTML = panel.icon;
        btn.addEventListener('click', () => togglePanel(panel.id));
        railTop.appendChild(btn);
      });
    }

    // Apply collapsed state
    if (collapsed && sidebar) {
      sidebar.classList.add('collapsed');
    }

    // Restore active panel
    const restoreId = savedPanel && panels.has(savedPanel) ? savedPanel : (sorted.length > 0 ? sorted[2]?.id || sorted[0].id : null);
    if (restoreId && !collapsed) {
      showPanel(restoreId);
    } else if (collapsed) {
      // Store which panel to show when uncollapsing
      activePanel = restoreId;
      updateIconStates();
    }
  }

  function ensurePanelEl(id) {
    if (panelEls.has(id)) return panelEls.get(id);

    const panel = panels.get(id);
    if (!panel) return null;

    const el = document.createElement('div');
    el.className = 'sidebar-panel-content';
    el.id = `sidebar-panel-${id}`;
    el.style.display = 'none';

    if (panelContainer) {
      panelContainer.appendChild(el);
    }

    // Call render once (lazy init)
    if (panel.render && !panel.initialized) {
      panel.render(el);
      panel.initialized = true;
    }

    panelEls.set(id, el);
    return el;
  }

  function showPanel(id) {
    const panel = panels.get(id);
    if (!panel) return;

    // Hide current panel
    if (activePanel && activePanel !== id) {
      const oldEl = panelEls.get(activePanel);
      if (oldEl) oldEl.style.display = 'none';
      const oldPanel = panels.get(activePanel);
      if (oldPanel?.onHide && panelEls.has(activePanel)) {
        oldPanel.onHide(panelEls.get(activePanel));
      }
    }

    activePanel = id;

    // Ensure panel element exists
    const el = ensurePanelEl(id);
    if (el) el.style.display = '';

    // Show panel area
    if (sidebar) sidebar.classList.remove('panel-hidden');

    // Update title
    if (titleEl) titleEl.textContent = panel.title;

    // Call onShow
    if (panel.onShow && el) {
      panel.onShow(el);
    }

    updateIconStates();
    saveState();
  }

  function hidePanel() {
    if (activePanel) {
      const el = panelEls.get(activePanel);
      if (el) el.style.display = 'none';
      const panel = panels.get(activePanel);
      if (panel?.onHide && el) {
        panel.onHide(el);
      }
    }

    if (sidebar) sidebar.classList.add('panel-hidden');
    activePanel = null;
    updateIconStates();
    saveState();
  }

  function togglePanel(id) {
    if (collapsed) {
      // Uncollapse and show this panel
      collapsed = false;
      if (sidebar) sidebar.classList.remove('collapsed');
      showPanel(id);
      return;
    }

    if (activePanel === id) {
      // Clicking active icon hides the panel area (rail stays)
      hidePanel();
    } else {
      showPanel(id);
    }
  }

  function toggleCollapse() {
    collapsed = !collapsed;
    if (sidebar) {
      sidebar.classList.toggle('collapsed', collapsed);
    }
    if (collapsed) {
      // Hide panel content but remember which was active
      panelEls.forEach((el) => { el.style.display = 'none'; });
    } else {
      // Restore the active panel
      if (activePanel) {
        showPanel(activePanel);
      } else {
        // Show default (files)
        const sorted = Array.from(panels.values()).sort((a, b) => a.order - b.order);
        const defaultId = sorted[2]?.id || sorted[0]?.id;
        if (defaultId) showPanel(defaultId);
      }
    }
    saveState();
  }

  function isCollapsed() {
    return collapsed;
  }

  function updateIconStates() {
    panels.forEach((panel) => {
      const btn = document.getElementById(`icon-rail-btn-${panel.id}`);
      if (btn) {
        btn.classList.toggle('active', panel.id === activePanel && !collapsed);
      }
    });
  }

  return {
    register,
    init,
    togglePanel,
    toggleCollapse,
    isCollapsed
  };
}
