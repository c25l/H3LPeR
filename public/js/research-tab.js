// Research Tab - ArXiv papers
let researchData = null;
let researchDataAlt = null;
let availableDates = [];
let refreshInterval = null;

export async function initResearchTab() {
  console.log('Initializing Research tab...');

  // Load available dates first
  await loadAvailableDates();

  // Initial load
  await loadResearchData();

  // Setup date selector
  document.getElementById('research-date')?.addEventListener('change', (e) => {
    loadResearchData(e.target.value);
  });

  // Auto-refresh every 24 hours (ArXiv updates once daily)
  refreshInterval = setInterval(() => {
    loadResearchData();
  }, 24 * 60 * 60 * 1000);
}

async function loadAvailableDates() {
  try {
    const response = await fetch('/api/helper/research/dates');
    if (response.ok) {
      availableDates = await response.json();
      updateDateSelector();
    }
  } catch (error) {
    console.error('Error loading research dates:', error);
  }
}

function updateDateSelector() {
  const selector = document.getElementById('research-date');
  if (!selector) return;

  const today = new Date().toISOString().split('T')[0];

  selector.innerHTML = `
    <option value="">Today</option>
    ${availableDates.filter(d => d !== today).map(date =>
      `<option value="${date}">${formatDateLabel(date)}</option>`
    ).join('')}
  `;
}

async function loadResearchData(date = null, forceRefresh = false) {
  const container = document.getElementById('research-content');
  if (!container) return;

  // Show loading state
  if (!researchData && !researchDataAlt) {
    container.innerHTML = '<div class="loading-spinner"></div>';
  }

  try {
    const params = [];
    if (date) params.push(`date=${date}`);
    if (forceRefresh) params.push('refresh=true');
    const query = params.length > 0 ? `?${params.join('&')}` : '';

    const [primaryResponse, altResponse] = await Promise.allSettled([
      fetch(`/api/helper/research${query}`),
      fetch(`/api/helper/research/alt${query}`)
    ]);

    if (primaryResponse.status === 'fulfilled' && primaryResponse.value.ok) {
      researchData = await primaryResponse.value.json();
    }

    if (altResponse.status === 'fulfilled' && altResponse.value.ok) {
      researchDataAlt = await altResponse.value.json();
    }

    if (!researchData && !researchDataAlt) {
      throw new Error('Failed to load research papers');
    }

    renderResearch();

    // Update available dates if we got new data
    if (!date && researchData?.date && !availableDates.includes(researchData.date)) {
      await loadAvailableDates();
    }
  } catch (error) {
    console.error('Error loading research:', error);
    container.innerHTML = `
      <div class="empty-state">
        <h2>Research Papers Unavailable</h2>
        <p>${error.message}</p>
        <button class="btn btn-primary" onclick="window.loadResearchData(null, true)">Retry</button>
      </div>
    `;
  }
}

function renderResearch() {
  const container = document.getElementById('research-content');
  if (!container || (!researchData && !researchDataAlt)) return;

  let html = '<div class="research-compare">';
  html += renderResearchSection(researchData, 'primary', 'Primary Ranker');
  html += renderResearchSection(researchDataAlt, 'secondary', 'Secondary Ranker');
  html += '</div>';

  container.innerHTML = html;
}

function renderResearchSection(sectionData, sectionKey, fallbackLabel) {
  if (!sectionData) {
    return `
      <div class="research-section research-section--empty">
        <div class="empty-state">
          <h2>${escapeHtml(fallbackLabel)}</h2>
          <p>Unavailable or not configured.</p>
        </div>
      </div>
    `;
  }

  const label = sectionData.ranker?.label || fallbackLabel;
  const model = sectionData.ranker?.model;
  const labelWithModel = model ? `${label} · ${model}` : label;
  const paperCount = sectionData.papers?.length || 0;
  const dateLabel = sectionData.date ? formatDateLabel(sectionData.date) : 'Today';

  const sectionBadge = sectionKey === 'primary' ? 'Primary' : 'Secondary';
  let html = `
    <div class="research-section">
      <div class="research-section-header">
        <div class="research-section-title">
          <h3>
            <span class="ranker-badge ranker-badge--${sectionKey}">${escapeHtml(sectionBadge)}</span>
            ${escapeHtml(labelWithModel)}
          </h3>
          <div class="research-ranker-meta">
            <span class="paper-count">${paperCount} papers</span>
            <span class="research-date">for ${escapeHtml(dateLabel)}</span>
            ${model ? `<span class="ranker-model">${escapeHtml(model)}</span>` : ''}
          </div>
        </div>
        <div class="research-categories">
          ${sectionData.categories?.map(cat =>
            `<span class="category-tag">${escapeHtml(cat)}</span>`
          ).join('') || ''}
        </div>
      </div>
  `;

  if (sectionData.papers?.length > 0) {
    html += '<div class="papers-list">';
    sectionData.papers.forEach((paper, index) => {
      html += renderPaperCard(paper, index + 1, sectionKey);
    });
    html += '</div>';
  } else {
    html += `
      <div class="empty-state">
        <h2>No Papers Found</h2>
        <p>No papers available for this date.</p>
      </div>
    `;
  }

  html += '</div>';
  return html;
}

function renderPaperCard(paper, rank, sectionKey) {
  const authors = paper.authors?.slice(0, 5) || [];
  const hasMoreAuthors = paper.authors?.length > 5;
  const abstractPreview = paper.abstract?.substring(0, 300) || '';
  const hasMoreAbstract = paper.abstract?.length > 300;
  const abstractId = `abstract-${sectionKey}-${paper.id}`;

  return `
    <div class="paper-card" data-paper-id="${paper.id}">
      <div class="paper-rank">#${rank}</div>
      <div class="paper-content">
        <div class="paper-header">
          <span class="paper-category">${escapeHtml(paper.category)}</span>
          <span class="paper-id">${escapeHtml(paper.id)}</span>
        </div>
        <h4 class="paper-title">
          <a href="${escapeHtml(paper.url)}" target="_blank" rel="noopener">
            ${escapeHtml(paper.title)}
          </a>
        </h4>
        <div class="paper-authors">
          ${authors.map(a => `<span class="author">${escapeHtml(a)}</span>`).join(', ')}
          ${hasMoreAuthors ? `<span class="more-authors">+${paper.authors.length - 5} more</span>` : ''}
        </div>
        <div class="paper-abstract" id="${abstractId}">
          <p class="abstract-preview">${escapeHtml(abstractPreview)}${hasMoreAbstract ? '...' : ''}</p>
          ${hasMoreAbstract ? `
            <button class="btn btn-sm btn-link" onclick="toggleAbstract('${sectionKey}', '${paper.id}')">
              Show more
            </button>
          ` : ''}
          <p class="abstract-full hidden">${escapeHtml(paper.abstract)}</p>
        </div>
        ${paper.comment ? `
          <div class="paper-comment">
            <span class="comment-label">Note:</span> ${escapeHtml(paper.comment)}
          </div>
        ` : ''}
        <div class="paper-actions">
          <a href="${escapeHtml(paper.url)}" target="_blank" rel="noopener" class="btn btn-sm btn-secondary">
            View on ArXiv
          </a>
          <a href="${escapeHtml(paper.url?.replace('/abs/', '/pdf/'))}.pdf" target="_blank" rel="noopener" class="btn btn-sm btn-secondary">
            PDF
          </a>
        </div>
      </div>
    </div>
  `;
}

window.toggleAbstract = function(sectionKey, paperId) {
  const abstractDiv = document.getElementById(`abstract-${sectionKey}-${paperId}`);
  if (!abstractDiv) return;

  const preview = abstractDiv.querySelector('.abstract-preview');
  const full = abstractDiv.querySelector('.abstract-full');
  const btn = abstractDiv.querySelector('button');

  if (full && preview && btn) {
    const isExpanded = !full.classList.contains('hidden');
    full.classList.toggle('hidden');
    preview.classList.toggle('hidden');
    btn.textContent = isExpanded ? 'Show more' : 'Show less';
  }
};

function formatDateLabel(dateString) {
  if (!dateString) return 'Today';
  try {
    const date = new Date(dateString + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffDays = Math.floor((today - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return dateString;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// Expose for global access
window.loadResearchData = loadResearchData;

export function cleanupResearchTab() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}
