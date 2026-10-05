const STORAGE_KEY = 'browslex-state';
const DEFAULT_BOOKMARKS = [
  { title: 'Google', url: 'https://www.google.com' },
  { title: 'GitHub', url: 'https://github.com' },
  { title: 'YouTube', url: 'https://www.youtube.com' },
  { title: 'News', url: 'https://news.ycombinator.com' },
  { title: 'Wikipedia', url: 'https://en.wikipedia.org' },
  { title: 'MDN', url: 'https://developer.mozilla.org' }
];

const state = {
  tabs: [],
  activeTabId: null,
  desktopMode: false,
  theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
};

const elements = {
  tabButton: document.getElementById('tabButton'),
  newTabBtn: document.getElementById('newTabBtn'),
  backBtn: document.getElementById('backBtn'),
  forwardBtn: document.getElementById('forwardBtn'),
  reloadBtn: document.getElementById('reloadBtn'),
  addressBar: document.getElementById('addressBar'),
  securityIndicator: document.getElementById('securityIndicator'),
  tabCount: document.getElementById('tabCount'),
  tabSwitcher: document.getElementById('tabSwitcher'),
  browserFrame: document.getElementById('browserFrame'),
  startPage: document.getElementById('startPage'),
  startSearch: document.getElementById('startSearch'),
  startSearchBtn: document.getElementById('startSearchBtn'),
  bookmarkGrid: document.getElementById('bookmarkGrid'),
  recentList: document.getElementById('recentList'),
  toast: document.getElementById('toast')
};

function uid() {
  return `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      tabs: state.tabs,
      activeTabId: state.activeTabId,
      desktopMode: state.desktopMode,
      theme: state.theme
    }));
  } catch {
    // Ignore storage errors.
  }
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    elements.toast.classList.remove('show');
  }, 1800);
}

function normalizeUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  if (/^([a-zA-Z]+:\/\/)/.test(trimmed)) {
    return trimmed;
  }

  if (/^([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(\/.*)?$/.test(trimmed)) {
    return `https://${trimmed}`;
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}(\/.*)?$/.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function sanitizeHost(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname || 'browser';
  } catch {
    return 'browser';
  }
}

function getFaviconText(host) {
  if (!host || host === 'browser') return 'B';
  return host.split('.')[0].slice(0, 2).toUpperCase();
}

function createEmptyTab(url = '') {
  const id = uid();
  const tab = {
    id,
    title: url ? sanitizeHost(url) : 'New Tab',
    url: url || '',
    history: url ? [url] : [],
    historyIndex: url ? 0 : -1,
    loading: false,
    desktopMode: false,
    favicon: url ? getFaviconText(sanitizeHost(url)) : 'B'
  };
  return tab;
}

function getActiveTab() {
  return state.tabs.find((tab) => tab.id === state.activeTabId) || null;
}

function getBookmarkList() {
  try {
    return JSON.parse(localStorage.getItem('browslex-bookmarks') || 'null') || DEFAULT_BOOKMARKS;
  } catch {
    return DEFAULT_BOOKMARKS;
  }
}

function renderBookmarks() {
  const bookmarks = getBookmarkList();
  elements.bookmarkGrid.innerHTML = bookmarks
    .map((bookmark) => `
      <button class="bookmark-item" data-url="${bookmark.url}">
        <span class="bookmark-icon">${bookmark.title.slice(0, 2).toUpperCase()}</span>
        <span>${bookmark.title}</span>
      </button>
    `)
    .join('');

  elements.bookmarkGrid.querySelectorAll('.bookmark-item').forEach((button) => {
    button.addEventListener('click', () => {
      navigateTo(button.dataset.url, true);
    });
  });
}

function renderRecentSites() {
  const visits = JSON.parse(localStorage.getItem('browslex-recent') || '[]');
  if (!visits.length) {
    elements.recentList.innerHTML = '<li><span>No recent pages yet</span></li>';
    return;
  }

  elements.recentList.innerHTML = visits
    .slice(0, 5)
    .map((item) => `
      <li data-url="${item.url}">
        <div class="recent-info">
          <span class="site-badge">${item.title.slice(0, 1).toUpperCase()}</span>
          <span>${item.title}</span>
        </div>
        <span>${item.domain}</span>
      </li>
    `)
    .join('');

  elements.recentList.querySelectorAll('li[data-url]').forEach((item) => {
    item.addEventListener('click', () => {
      navigateTo(item.dataset.url, true);
    });
  });
}

function saveRecentSite(url, title) {
  const domain = sanitizeHost(url);
  const visits = JSON.parse(localStorage.getItem('browslex-recent') || '[]');
  const next = [{ url, title, domain }, ...visits.filter((page) => page.url !== url)].slice(0, 8);
  localStorage.setItem('browslex-recent', JSON.stringify(next));
  renderRecentSites();
}

function updateTabSwitcher() {
  elements.tabCount.textContent = String(state.tabs.length);
  elements.tabSwitcher.innerHTML = state.tabs
    .map((tab) => `
      <div class="tab-card ${tab.id === state.activeTabId ? 'active' : ''}" data-tab-id="${tab.id}">
        <div class="tab-preview">${tab.favicon || 'B'}</div>
        <div class="tab-meta">
          <strong>${tab.title || 'New Tab'}</strong>
          <span>${tab.url || 'about:blank'}</span>
        </div>
        <button class="close-tab" data-close-tab="${tab.id}" aria-label="Close tab">×</button>
      </div>
    `)
    .join('');

  elements.tabSwitcher.querySelectorAll('.tab-card').forEach((card) => {
    card.addEventListener('click', (event) => {
      if (event.target.closest('.close-tab')) return;
      const tabId = card.dataset.tabId;
      setActiveTab(tabId);
    });
  });

  elements.tabSwitcher.querySelectorAll('.close-tab').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const tabId = button.dataset.closeTab;
      closeTab(tabId);
    });
  });
}

function updateNavigationButtons() {
  const tab = getActiveTab();
  if (!tab) {
    elements.backBtn.disabled = true;
    elements.forwardBtn.disabled = true;
    elements.reloadBtn.disabled = true;
    return;
  }

  elements.backBtn.disabled = tab.historyIndex <= 0;
  elements.forwardBtn.disabled = tab.historyIndex >= tab.history.length - 1;
  elements.reloadBtn.disabled = !tab.url;

  if (tab.url) {
    elements.addressBar.value = tab.url;
  }
}

function updateSecurityIndicator(url) {
  const safeText = url ? '🔒' : '⌂';
  elements.securityIndicator.textContent = safeText;
}

function setActiveTab(tabId) {
  state.activeTabId = tabId;
  const tab = getActiveTab();
  const isBlank = !tab || !tab.url;

  if (isBlank) {
    elements.startPage.classList.remove('hidden');
    elements.browserFrame.classList.add('hidden');
    elements.addressBar.value = '';
    updateSecurityIndicator('');
  } else {
    elements.startPage.classList.add('hidden');
    elements.browserFrame.classList.remove('hidden');
    elements.browserFrame.src = tab.url;
    elements.addressBar.value = tab.url;
    updateSecurityIndicator(tab.url);
  }

  updateNavigationButtons();
  updateTabSwitcher();
  if (state.tabs.length) {
    elements.tabSwitcher.classList.add('hidden');
  }
  saveState();
}

function navigateTo(rawUrl, fromUserInput = false) {
  const target = normalizeUrl(rawUrl || '');
  const activeTab = getActiveTab();
  if (!activeTab) return;

  if (!target) return;

  activeTab.url = target;
  activeTab.title = sanitizeHost(target);
  activeTab.favicon = getFaviconText(sanitizeHost(target));
  activeTab.loading = true;

  if (!activeTab.history.length || activeTab.history[activeTab.historyIndex] !== target) {
    activeTab.history = activeTab.history.slice(0, activeTab.historyIndex + 1);
    activeTab.history.push(target);
    activeTab.historyIndex = activeTab.history.length - 1;
  }

  elements.startPage.classList.add('hidden');
  elements.browserFrame.classList.remove('hidden');
  elements.browserFrame.src = target;
  elements.addressBar.value = target;
  updateSecurityIndicator(target);
  updateNavigationButtons();
  updateTabSwitcher();
  saveRecentSite(target, sanitizeHost(target));
  saveState();

  if (fromUserInput || rawUrl === target) {
    showToast(`Loaded ${target}`);
  }
}

function createNewTab() {
  const tab = createEmptyTab();
  state.tabs.push(tab);
  state.activeTabId = tab.id;
  setActiveTab(tab.id);
  saveState();
}

function closeTab(tabId) {
  if (state.tabs.length === 1) {
    const tab = getActiveTab();
    if (tab) {
      tab.url = '';
      tab.title = 'New Tab';
      tab.history = [];
      tab.historyIndex = -1;
      tab.loading = false;
      setActiveTab(tab.id);
      return;
    }
  }

  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) return;

  state.tabs.splice(index, 1);
  if (state.tabs.length === 0) {
    const newTab = createEmptyTab();
    state.tabs.push(newTab);
  }

  const nextTab = state.tabs[Math.min(index, state.tabs.length - 1)];
  state.activeTabId = nextTab.id;
  setActiveTab(nextTab.id);
  saveState();
}

function handleAddressSubmit(event) {
  if (event.type === 'keydown' && event.key !== 'Enter') return;
  const rawValue = elements.addressBar.value.trim();
  navigateTo(rawValue, true);
}

function handleBrowserGoBack() {
  const tab = getActiveTab();
  if (!tab || tab.historyIndex <= 0) return;
  tab.historyIndex -= 1;
  const previousUrl = tab.history[tab.historyIndex];
  tab.url = previousUrl;
  tab.loading = true;
  elements.browserFrame.src = previousUrl;
  elements.addressBar.value = previousUrl;
  updateNavigationButtons();
  updateTabSwitcher();
  updateSecurityIndicator(previousUrl);
  saveState();
}

function handleBrowserGoForward() {
  const tab = getActiveTab();
  if (!tab || tab.historyIndex >= tab.history.length - 1) return;
  tab.historyIndex += 1;
  const nextUrl = tab.history[tab.historyIndex];
  tab.url = nextUrl;
  tab.loading = true;
  elements.browserFrame.src = nextUrl;
  elements.addressBar.value = nextUrl;
  updateNavigationButtons();
  updateTabSwitcher();
  updateSecurityIndicator(nextUrl);
  saveState();
}

function handleReload() {
  const tab = getActiveTab();
  if (!tab || !tab.url) return;
  elements.browserFrame.src = tab.url;
  showToast('Reloading page');
}

function toggleTabSwitcher() {
  elements.tabSwitcher.classList.toggle('hidden');
  updateTabSwitcher();
}

function bindEvents() {
  elements.newTabBtn.addEventListener('click', createNewTab);
  elements.tabButton.addEventListener('click', toggleTabSwitcher);
  elements.backBtn.addEventListener('click', handleBrowserGoBack);
  elements.forwardBtn.addEventListener('click', handleBrowserGoForward);
  elements.reloadBtn.addEventListener('click', handleReload);
  elements.addressBar.addEventListener('keydown', handleAddressSubmit);
  elements.startSearchBtn.addEventListener('click', () => navigateTo(elements.startSearch.value, true));
  elements.startSearch.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') navigateTo(elements.startSearch.value, true);
  });

  elements.browserFrame.addEventListener('load', () => {
    const active = getActiveTab();
    if (!active) return;
    active.loading = false;
    active.title = sanitizeHost(active.url);
    active.favicon = getFaviconText(sanitizeHost(active.url));
    updateNavigationButtons();
    updateTabSwitcher();
    saveRecentSite(active.url, active.title);
    saveState();
  });

  document.addEventListener('click', (event) => {
    const tabSwitcherHidden = elements.tabSwitcher.classList.contains('hidden');
    if (!tabSwitcherHidden && !event.target.closest('#tabButton') && !event.target.closest('.tab-card')) {
      elements.tabSwitcher.classList.add('hidden');
    }
  });
}

function boot() {
  const stored = getFromStorage();

  if (stored && Array.isArray(stored.tabs) && stored.tabs.length) {
    state.tabs = stored.tabs;
    state.activeTabId = stored.activeTabId || state.tabs[0].id;
    state.desktopMode = Boolean(stored.desktopMode);
    state.theme = stored.theme || state.theme;
  } else {
    state.tabs = [createEmptyTab()];
    state.activeTabId = state.tabs[0].id;
  }

  renderBookmarks();
  renderRecentSites();
  bindEvents();
  setActiveTab(state.activeTabId);
  updateTabSwitcher();
  updateNavigationButtons();
}

boot();

window.addEventListener('beforeunload', saveState);

window.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.key.toLowerCase() === 'l') {
    event.preventDefault();
    elements.addressBar.focus();
  }
  if (event.ctrlKey && event.key.toLowerCase() === 't') {
    event.preventDefault();
    createNewTab();
  }
  if (event.key === 'Escape') {
    elements.tabSwitcher.classList.add('hidden');
  }
});

function clearBrowserData(kind) {
  if (kind === 'history') {
    localStorage.removeItem('browslex-recent');
    state.tabs = [createEmptyTab()];
    state.activeTabId = state.tabs[0].id;
    setActiveTab(state.activeTabId);
    showToast('History cleared');
  }

  if (kind === 'cookies') {
    document.cookie.split(';').forEach((cookie) => {
      const name = cookie.split('=')[0].trim();
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    });
    showToast('Cookies cleared');
  }

  if (kind === 'cache') {
    localStorage.clear();
    renderRecentSites();
    renderBookmarks();
    showToast('Cache cleared');
  }

  if (kind === 'site-data') {
    sessionStorage.clear();
    localStorage.removeItem('browslex-state');
    renderRecentSites();
    showToast('Site data cleared');
  }

  saveState();
}

window.clearBrowserData = clearBrowserData;
