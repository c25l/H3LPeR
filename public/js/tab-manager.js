const TAB_NAMES = ['calendar', 'journal', 'weather', 'news', 'research'];

let activeTab = 'weather';
let calendarTabInitialized = false;
let emailTabInitialized = false;
let weatherTabInitialized = false;
let newsTabInitialized = false;
let researchTabInitialized = false;

let saveFileRef = null;
let isDirtyRef = null;

export function initTabManager({ saveFile, getIsDirty }) {
  saveFileRef = saveFile;
  isDirtyRef = getIsDirty;
}

export function getActiveTab() {
  return activeTab;
}

export function getTabNames() {
  return TAB_NAMES;
}

export function getTabFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  return TAB_NAMES.includes(tab) ? tab : null;
}

export async function setActiveTab(tabName, { updateUrl = false, replaceUrl = false, skipDirtyCheck = false } = {}) {
  if (!TAB_NAMES.includes(tabName)) return;

  const needsInit =
    (tabName === 'calendar' && !calendarTabInitialized) ||
    (tabName === 'weather' && !weatherTabInitialized) ||
    (tabName === 'news' && !newsTabInitialized) ||
    (tabName === 'research' && !researchTabInitialized);

  if (activeTab === tabName && !updateUrl && !needsInit) {
    return;
  }

  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  if (activeTab === 'journal' && isDirtyRef && isDirtyRef() && !skipDirtyCheck) {
    await saveFileRef();
  }

  tabBtns.forEach(b => b.classList.remove('active'));
  tabContents.forEach(c => c.classList.remove('active'));

  const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  const activeContent = document.getElementById(`${tabName}-tab`);

  if (activeBtn) activeBtn.classList.add('active');
  if (activeContent) activeContent.classList.add('active');

  activeTab = tabName;

  if (updateUrl) {
    updateUrlState(tabName, { replace: replaceUrl });
  }

  if (tabName === 'calendar' && !calendarTabInitialized) {
    await initCalendarTab();
    calendarTabInitialized = true;
  } else if (tabName === 'weather' && !weatherTabInitialized) {
    await initWeatherTabModule();
    weatherTabInitialized = true;
  } else if (tabName === 'news' && !newsTabInitialized) {
    await initNewsTabModule();
    newsTabInitialized = true;
  } else if (tabName === 'research' && !researchTabInitialized) {
    await initResearchTabModule();
    researchTabInitialized = true;
  }
}

// Initialize tab navigation
export function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;

      const tabName = btn.dataset.tab;

      await setActiveTab(tabName, { updateUrl: true });
    });
  });
}

// Lazy load calendar tab
async function initCalendarTab() {
  try {
    const { initCalendarTab: init } = await import('./calendar-tab.js');
    await init();
  } catch (error) {
    console.error('Error loading calendar tab:', error);
    showAuthError('Failed to load calendar. Please try again.');
  }
}

// Lazy load email indicator
export async function initEmailIndicator() {
  try {
    const { initEmailIndicator: init } = await import('./email-tab.js');
    await init();
  } catch (error) {
    console.error('Error loading email indicator:', error);
  }
}

// Lazy load weather tab
async function initWeatherTabModule() {
  try {
    const { initWeatherTab } = await import('./weather-tab.js');
    await initWeatherTab();
  } catch (error) {
    console.error('Error loading weather tab:', error);
    document.getElementById('weather-content').innerHTML = `
      <div class="empty-state">
        <h2>Weather Unavailable</h2>
        <p>${error.message}</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

// Lazy load news tab
async function initNewsTabModule() {
  try {
    const { initNewsTab } = await import('./news-tab.js');
    await initNewsTab();
  } catch (error) {
    console.error('Error loading news tab:', error);
    document.getElementById('news-stories').innerHTML = `
      <div class="empty-state">
        <h2>News Unavailable</h2>
        <p>${error.message}</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

// Lazy load research tab
async function initResearchTabModule() {
  try {
    const { initResearchTab } = await import('./research-tab.js');
    await initResearchTab();
  } catch (error) {
    console.error('Error loading research tab:', error);
    document.getElementById('research-content').innerHTML = `
      <div class="empty-state">
        <h2>Research Unavailable</h2>
        <p>${error.message}</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

// Show auth error banner
function showAuthError(message) {
  const banner = document.getElementById('google-auth-banner');
  const messageEl = document.getElementById('auth-banner-message');

  messageEl.textContent = message || 'Google authentication required. Please reconnect your account.';
  banner.classList.remove('hidden');
}

// URL state helpers
export function getFilePathFromUrl() {
  const match = window.location.pathname.match(/^\/edit\/(.+)$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function buildUrlForState(tabName, pathOverride) {
  const url = new URL(window.location.href);
  if (pathOverride) {
    url.pathname = pathOverride;
  }
  if (tabName && tabName !== 'journal') {
    url.searchParams.set('tab', tabName);
  } else {
    url.searchParams.delete('tab');
  }
  return url.pathname + url.search;
}

export function updateUrlState(tabName, { path, replace = false } = {}) {
  const url = buildUrlForState(tabName, path);
  const state = { path: path || window.location.pathname, tab: tabName };
  if (replace) {
    history.replaceState(state, '', url);
  } else {
    history.pushState(state, '', url);
  }
}

// Check Google authentication status
export async function checkGoogleAuth() {
  try {
    const response = await fetch('/api/google/status');
    const googleAuthStatus = await response.json();

    // Enable/disable tabs based on auth
    const calendarBtn = document.getElementById('calendar-tab-btn');
    const emailBtn = document.getElementById('email-tab-btn');

    if (googleAuthStatus.authenticated) {
      calendarBtn.disabled = false;
      emailBtn.disabled = false;
    } else {
      calendarBtn.disabled = true;
      emailBtn.disabled = true;
      calendarBtn.title = 'Connect Google account to use Calendar';
      emailBtn.title = 'Connect Google account to use Email';
    }

    return googleAuthStatus;
  } catch (error) {
    console.error('Error checking Google auth:', error);
    return null;
  }
}
