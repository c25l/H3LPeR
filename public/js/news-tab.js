// News Tab - Clustered news stories + stocks ticker
import db from './db.js';

let newsData = null;
let stocksData = null;
let refreshInterval = null;
let isOffline = false;

const NEWS_CACHE_MAX_AGE = 60 * 60 * 1000; // 1 hour

// Check online/offline status
window.addEventListener('online', () => {
  isOffline = false;
  console.log('Back online - refreshing news data');
  loadNewsData(true);
  loadStocksData();
});

window.addEventListener('offline', () => {
  isOffline = true;
  console.log('Offline - using cached news data');
});

export async function initNewsTab() {
  console.log('Initializing News tab...');

  isOffline = !navigator.onLine;

  // Initial load
  await Promise.all([
    loadNewsData(),
    loadStocksData()
  ]);

  // Setup refresh button
  document.getElementById('refresh-news')?.addEventListener('click', () => {
    loadNewsData(true);
    loadStocksData();
  });

  // Auto-refresh only when online
  // News every 6 hours, stocks every 15 minutes
  refreshInterval = setInterval(() => {
    if (!isOffline) {
      loadNewsData();
    }
  }, 6 * 60 * 60 * 1000);

  setInterval(() => {
    if (!isOffline) {
      loadStocksData();
    }
  }, 15 * 60 * 1000);
}

async function loadNewsData(forceRefresh = false) {
  const container = document.getElementById('news-stories');
  if (!container) return;

  // Show loading state only if no data
  if (!newsData) {
    container.innerHTML = '<div class="loading-spinner"></div>';
  }

  try {
    // Try to load from cache first
    const cached = await db.getCachedCalendarData('news');
    const cacheAge = cached ? Date.now() - cached.cachedAt : null;
    const cacheIsStale = cacheAge !== null && cacheAge > NEWS_CACHE_MAX_AGE;

    if (cached && !forceRefresh) {
      newsData = cached.data;
      renderNews();
      
      // Show cache age if offline
      if (isOffline) {
        const age = Math.floor(cacheAge / (1000 * 60));
        showNewsMessage(`Offline - showing news cached ${age} minutes ago`, 'info');
      }
    }

    // If online and (no cache, forced refresh, or stale cache), fetch fresh data
    if (!isOffline && (!cached || forceRefresh || cacheIsStale)) {
      const url = `/api/helper/news${forceRefresh ? '?refresh=true' : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to load news');
      }

      newsData = await response.json();
      
      // Cache the fresh data
      await db.cacheCalendarData('news', newsData);
      
      renderNews();
    } else if (!cached && isOffline) {
      container.innerHTML = `
        <div class="empty-state">
          <h2>No Cached News</h2>
          <p>No cached news available offline. Connect to the internet to load news.</p>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error loading news:', error);
    container.innerHTML = `
      <div class="empty-state">
        <h2>News Unavailable</h2>
        <p>${error.message}</p>
        <button class="btn btn-primary" onclick="window.loadNewsData(true)">Retry</button>
      </div>
    `;
  }
}

async function loadStocksData() {
  try {
    // Try to load from cache first
    const cached = await db.getCachedCalendarData('stocks');
    if (cached) {
      stocksData = cached.data;
      renderStocksTicker();
    }

    // If online, fetch fresh data
    if (!isOffline) {
      const response = await fetch('/api/helper/stocks');
      if (!response.ok) return;

      stocksData = await response.json();
      
      // Cache the fresh data
      await db.cacheCalendarData('stocks', stocksData);
      
      renderStocksTicker();
    }
  } catch (error) {
    console.error('Error loading stocks:', error);
  }
}

function renderNews() {
  const container = document.getElementById('news-stories');
  if (!container || !newsData) return;

  let html = '';

  // Continuing Stories section (ongoing coverage from previous days)
  if (newsData.continuingStories?.length > 0) {
    html += `
      <div class="news-section">
        <h3 class="news-section-title">
          <span class="section-icon">🔄</span>
          Continuing Stories (${newsData.continuingStories.length})
        </h3>
        <div class="stories-grid">
          ${newsData.continuingStories.map(story => renderStoryCard(story, false, true)).join('')}
        </div>
      </div>
    `;
  }

  // New Stories section (appearing for the first time today)
  if (newsData.newStories?.length > 0) {
    html += `
      <div class="news-section">
        <h3 class="news-section-title">
          <span class="section-icon">🆕</span>
          New Stories (${newsData.newStories.length})
        </h3>
        <div class="stories-grid">
          ${newsData.newStories.map(story => renderStoryCard(story)).join('')}
        </div>
      </div>
    `;
  }

  // New Today articles list
  if (newsData.newToday?.length > 0) {
    html += `
      <div class="news-section">
        <h3 class="news-section-title">
          <span class="section-icon">📰</span>
          Today's Articles (${newsData.newToday.length})
        </h3>
        <div class="news-articles-list">
          ${newsData.newToday.slice(0, 10).map(article => renderArticle(article)).join('')}
        </div>
        ${newsData.newToday.length > 10 ? `<div class="show-more" onclick="toggleNewToday()">Show ${newsData.newToday.length - 10} more...</div>` : ''}
      </div>
    `;
  }

  // Tech News section (Claude-ranked tech articles from multiple sources)
  if (newsData.techNews?.length > 0) {
    html += `
      <div class="news-section tech-news-section">
        <h3 class="news-section-title">
          <span class="section-icon">💻</span>
          Tech News (${newsData.techNews.length})
        </h3>
        <div class="tech-news-list">
          ${newsData.techNews.map((article, index) => renderTechArticle(article, index + 1)).join('')}
        </div>
      </div>
    `;
  }

  // Dormant Stories section (had coverage before but none today)
  if (newsData.dormantStories?.length > 0) {
    html += `
      <div class="news-section dormant-section collapsed">
        <h3 class="news-section-title" onclick="toggleDormantStories()">
          <span class="section-icon">💤</span>
          Dormant Stories (${newsData.dormantStories.length})
          <span class="toggle-icon">▶</span>
        </h3>
        <div class="stories-grid dormant-content">
          ${newsData.dormantStories.map(story => renderStoryCard(story, true)).join('')}
        </div>
      </div>
    `;
  }

  // Last updated
  html += `
    <div class="news-footer">
      Last updated: ${formatDateTime(newsData.lastUpdated)}
    </div>
  `;

  container.innerHTML = html;
}

function renderStoryCard(story, isDormant = false, isContinuing = false) {
  const articleCount = story.articles?.length || 0;
  const totalCount = story.totalCount || articleCount;
  const sources = [...new Set(story.articles?.map(a => a.source) || [])];
  const latestDate = story.articles?.[0]?.date;
  const title = story.articles?.[0]?.title || story.representativeTitle || 'Untitled';

  // Build count display
  let countDisplay;
  if (isDormant) {
    countDisplay = `${totalCount} articles (none today)`;
  } else if (isContinuing) {
    countDisplay = `${articleCount} new today, ${totalCount} total`;
  } else {
    countDisplay = `${articleCount} article${articleCount !== 1 ? 's' : ''}`;
  }

  const storyId = story.id || Math.random().toString(36).substr(2, 9);

  return `
    <div class="story-card ${isDormant ? 'dormant' : ''} ${isContinuing ? 'continuing' : ''}" data-story-id="${storyId}">
      <div class="story-header">
        <span class="story-category ${story.status || 'news'}">${story.status || 'news'}</span>
        <span class="story-count">${countDisplay}</span>
      </div>
      <h4 class="story-title" onclick="toggleStoryExpand('${storyId}')">${escapeHtml(title)}</h4>
      <div class="story-meta">
        <span class="story-sources">${sources.slice(0, 3).join(', ')}${sources.length > 3 ? ` +${sources.length - 3}` : ''}</span>
        <span class="story-date">${formatRelativeDate(latestDate)}</span>
      </div>
      ${articleCount > 0 ? `
        <div class="story-articles hidden" id="story-articles-${storyId}">
          ${story.articles.map(article => renderArticle(article)).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderArticle(article) {
  return `
    <a href="${escapeHtml(article.url)}" target="_blank" rel="noopener" class="article-item">
      <span class="article-source">${escapeHtml(article.source)}</span>
      <span class="article-title">${escapeHtml(article.title)}</span>
      <span class="article-date">${formatRelativeDate(article.date)}</span>
    </a>
  `;
}

function renderTechArticle(article, rank) {
  const summary = article.summary ? article.summary.substring(0, 150) + (article.summary.length > 150 ? '...' : '') : '';
  return `
    <div class="tech-article-card">
      <span class="tech-rank">${rank}</span>
      <div class="tech-article-content">
        <div class="tech-article-header">
          <span class="tech-source">${escapeHtml(article.source)}</span>
          <span class="tech-date">${formatRelativeDate(article.date)}</span>
        </div>
        <a href="${escapeHtml(article.url)}" target="_blank" rel="noopener" class="tech-title">
          ${escapeHtml(article.title)}
        </a>
        ${summary ? `<p class="tech-summary">${escapeHtml(summary)}</p>` : ''}
      </div>
    </div>
  `;
}

function renderStocksTicker() {
  const container = document.getElementById('stocks-ticker');
  if (!container || !stocksData) return;

  let html = '<div class="ticker-items">';

  stocksData.forEach(quote => {
    const changeClass = quote.change >= 0 ? 'positive' : 'negative';
    const changeSymbol = quote.change >= 0 ? '+' : '';

    html += `
      <div class="ticker-item">
        <span class="ticker-symbol">${escapeHtml(quote.symbol)}</span>
        <span class="ticker-price">$${quote.price?.toFixed(2) || 'N/A'}</span>
        <span class="ticker-change ${changeClass}">
          ${changeSymbol}${quote.change?.toFixed(2) || '0.00'} (${changeSymbol}${quote.changePercent?.toFixed(2) || '0.00'}%)
        </span>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}

window.toggleStoryExpand = function(storyId) {
  const articlesDiv = document.getElementById(`story-articles-${storyId}`);
  if (articlesDiv) {
    articlesDiv.classList.toggle('hidden');
    const card = articlesDiv.closest('.story-card');
    card?.classList.toggle('expanded');
  }
};

window.toggleDormantStories = function() {
  const section = document.querySelector('.dormant-section');
  if (section) {
    section.classList.toggle('collapsed');
  }
};

window.toggleNewToday = function() {
  // Implementation for showing more articles
  const container = document.querySelector('.news-articles-list');
  if (container && newsData?.newToday) {
    container.innerHTML = newsData.newToday.map(article => renderArticle(article)).join('');
    const showMore = document.querySelector('.show-more');
    if (showMore) showMore.remove();
  }
};

function formatDateTime(isoString) {
  if (!isoString) return 'N/A';
  try {
    return new Date(isoString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return isoString;
  }
}

function formatRelativeDate(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// Expose for global access
window.loadNewsData = loadNewsData;

export function cleanupNewsTab() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}
