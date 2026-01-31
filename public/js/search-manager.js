import db from './db.js';

let dbInitRef = null;
let bufferManagerRef = null;
let renderBufferTabsRef = null;

export function initSearchManager({ getDbInitialized, getBufferManager, renderBufferTabs }) {
  dbInitRef = getDbInitialized;
  bufferManagerRef = getBufferManager;
  renderBufferTabsRef = renderBufferTabs;
}

export function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Emit search results into a read-only buffer tab
function emitSearchBuffer(query, files) {
  const bufferManager = bufferManagerRef();
  if (!bufferManager) return;
  const lines = [`# Search: "${query}"`, '', `${files.length} results`, ''];
  files.forEach(file => {
    const lineRef = file.lineNumber ? `:${file.lineNumber}` : '';
    lines.push(`- [[${file.path}]]${lineRef}`);
    if (file.matchLine && file.matchLine.trim()) {
      lines.push(`  > ${file.matchLine.trim()}`);
    } else if (file.context) {
      lines.push(`  > ${file.context}`);
    }
    if (file.children) {
      file.children.split('\n').forEach(child => {
        lines.push(`  > ${child}`);
      });
    }
    lines.push('');
  });
  const content = lines.join('\n');
  const bufferId = `search:${query}`;

  bufferManager.openBuffer({
    id: bufferId,
    content,
    meta: { title: `Search: ${query}` },
    policy: { readOnly: true }
  });
  bufferManager.setActive(bufferId);
  if (renderBufferTabsRef) renderBufferTabsRef();
}

// Enrich local IndexedDB search results with line numbers and children
function enrichLocalSearchResults(rawFiles, query) {
  const lowerQuery = query.toLowerCase();
  const isTagQuery = /^#[A-Za-z0-9_.-]+$/.test(query.trim());

  return rawFiles.map(file => {
    const result = {
      path: file.path,
      name: file.name,
      nameMatch: file.path.toLowerCase().includes(lowerQuery),
      contentMatch: false,
      context: '',
      lineNumber: null,
      matchLine: '',
      children: ''
    };

    if (file.content) {
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQuery)) {
          result.contentMatch = true;
          result.lineNumber = i + 1;
          result.matchLine = lines[i];

          if (isTagQuery) {
            const baseIndent = lines[i].match(/^(\s*)/)[1].length;
            const childLines = [];
            for (let j = i + 1; j < lines.length; j++) {
              if (lines[j].trim() === '') {
                childLines.push('');
                continue;
              }
              const indent = lines[j].match(/^(\s*)/)[1].length;
              if (indent > baseIndent) {
                childLines.push(lines[j]);
              } else {
                break;
              }
            }
            while (childLines.length > 0 && childLines[childLines.length - 1] === '') {
              childLines.pop();
            }
            if (childLines.length > 0) {
              result.children = childLines.join('\n');
            }
          }

          break;
        }
      }
    }

    return result;
  });
}

// Search
export function initSearch() {
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  let searchTimeout = null;
  let lastSearchFiles = [];

  async function performSearch(query) {
    try {
      let files;

      // Try server search first for richer results (line numbers, children)
      if (navigator.onLine) {
        try {
          const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
          files = await response.json();
        } catch (err) {
          console.error('Server search error:', err);
          files = null;
        }
      }

      // Fallback to IndexedDB with client-side enrichment
      if (!files && dbInitRef && dbInitRef() && db && db.db) {
        try {
          const rawFiles = await db.searchFiles(query);
          files = enrichLocalSearchResults(rawFiles, query);
        } catch (err) {
          console.error('IndexedDB search error:', err);
          files = null;
        }
      }

      if (!files) files = [];
      lastSearchFiles = files;

      if (files.length === 0) {
        results.innerHTML = '<div class="search-result"><span class="search-result-title">No results</span></div>';
      } else {
        results.innerHTML = files.map(file => {
          let preview = '';
          if (file.matchLine) {
            const lineLabel = file.lineNumber ? `<span class="search-result-line">L${file.lineNumber}</span> ` : '';
            preview = `<div class="search-result-context">${lineLabel}${escapeHtml(file.matchLine.trim())}</div>`;
          } else if (file.context) {
            preview = `<div class="search-result-context">${escapeHtml(file.context)}</div>`;
          }
          return `
            <div class="search-result" onclick="openFile('${file.path.replace(/'/g, "\\'")}')">
              <div class="search-result-title">${escapeHtml(file.name)}</div>
              <div class="search-result-path">${escapeHtml(file.path)}</div>
              ${preview}
            </div>
          `;
        }).join('');
      }

      results.classList.remove('hidden');
    } catch (err) {
      console.error('Search error:', err);
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const query = input.value.trim();

    if (!query) {
      results.classList.add('hidden');
      lastSearchFiles = [];
      return;
    }

    searchTimeout = setTimeout(() => performSearch(query), 300);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = input.value.trim();
      if (query && lastSearchFiles.length > 0) {
        emitSearchBuffer(query, lastSearchFiles);
        results.classList.add('hidden');
      }
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => results.classList.add('hidden'), 200);
  });
}

// Tags
export function initTags() {
  loadTags();

  document.getElementById('refresh-tags-btn').addEventListener('click', () => {
    loadTags();
  });
}

export async function loadTags() {
  const tagsList = document.getElementById('tags-list');
  if (!tagsList) return;

  tagsList.innerHTML = '<div class="tags-loading">Loading tags...</div>';

  try {
    let tags;

    // Try IndexedDB first for instant results
    if (dbInitRef && dbInitRef() && db && db.db) {
      try {
        tags = await db.getTags();
        // Sort by count
        tags.sort((a, b) => b.totalCount - a.totalCount);
      } catch (err) {
        console.error('IndexedDB tags error:', err);
        tags = null;
      }
    }

    // Fallback to server
    if (!tags) {
      const response = await fetch('/api/tags');
      tags = await response.json();
    }

    if (tags.length === 0) {
      tagsList.innerHTML = '<div class="tags-empty">No tags found</div>';
      return;
    }

    tagsList.innerHTML = tags.map(({ tag, files, totalCount }) => `
      <div class="tag-item" data-tag="${tag}">
        <span class="tag-name">${tag}</span>
        <span class="tag-count">${totalCount}</span>
      </div>
    `).join('');

    // Add click handlers
    document.querySelectorAll('.tag-item').forEach(item => {
      item.addEventListener('click', () => {
        const tag = item.dataset.tag;
        searchByTag(tag);
      });
    });
  } catch (err) {
    console.error('Error loading tags:', err);
    tagsList.innerHTML = '<div class="tags-error">Error loading tags</div>';
  }
}

async function searchByTag(tag) {
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');

  // Search for the tag
  if (input) input.value = tag;

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(tag)}`);
    const files = await response.json();

    if (results) {
      if (files.length === 0) {
        results.innerHTML = '<div class="search-result"><span class="search-result-title">No files with this tag</span></div>';
      } else {
        results.innerHTML = files.map(file => {
          let preview = '';
          if (file.matchLine) {
            const lineLabel = file.lineNumber ? `<span class="search-result-line">L${file.lineNumber}</span> ` : '';
            preview = `<div class="search-result-context">${lineLabel}${escapeHtml(file.matchLine.trim())}</div>`;
          }
          return `
            <div class="search-result" onclick="openFile('${file.path.replace(/'/g, "\\'")}')">
              <div class="search-result-title">${escapeHtml(file.name)}</div>
              <div class="search-result-path">${escapeHtml(file.path)}</div>
              ${preview}
            </div>
          `;
        }).join('');
      }
      results.classList.remove('hidden');
    }

    // Emit tag search results into a buffer
    if (files.length > 0) {
      emitSearchBuffer(tag, files);
    }

    if (input) input.focus();
  } catch (err) {
    console.error('Tag search error:', err);
  }
}
