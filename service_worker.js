/**
 * Consent Breaker - Service Worker
 * Handles extension lifecycle, DNR rule management, message passing, and status tracking.
 * V2: Adds ephemeral tab status tracking & Advanced Settings.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  globalEnabled: true,
  filterMode: 'normal',
  debugMode: false,
  allowlist: [],
  advanced: {
    blockConsentSync: true, // If false, disables consent_sync rules
    assumeReject: false,    // If true, acts as Extreme fallback even in Normal
    showLogs: false         // Verbose console logging
  },
  stats: {
    bannersBlocked: 0,
    sitesProcessed: 0
  }
};

const RULESETS = {
  NORMAL: ['tracking_normal', 'consent_sync_normal'],
  EXTREME: ['tracking_normal', 'consent_sync_normal', 'tracking_extreme', 'consent_sync_extreme']
};

const tabStatus = new Map(); // tabId -> { actions: [], mode: 'normal' }

// ─────────────────────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.sync.set(DEFAULT_SETTINGS);
    await applyFilterMode('normal');
  } else if (details.reason === 'update') {
    const settings = await chrome.storage.sync.get(['filterMode']);
    if (!settings.filterMode) await chrome.storage.sync.set({ filterMode: 'normal' });
    await applyFilterMode(settings.filterMode || 'normal');
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStatus.delete(tabId);
});

// ─────────────────────────────────────────────────────────────────────────────
// Message Handling
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true;
});

async function handleMessage(message, sender) {
  const { type, data } = message;
  const tabId = sender?.tab?.id;

  switch (type) {
    case 'GET_SETTINGS':
      return await getSettings();

    case 'GET_MODE':
      const mode = await resolveDomainMode(data?.domain);
      if (tabId) updateTabStatus(tabId, { mode });
      return { mode };

    case 'SET_GLOBAL_MODE':
      await setGlobalMode(data.mode);
      return { success: true };

    case 'SET_DOMAIN_MODE':
      await setDomainMode(data.domain, data.mode);
      return { success: true };

    case 'CHECK_DOMAIN':
      return await checkDomainAllowed(data.domain);

    case 'LOG_ACTION':
      await logAction(tabId, data);
      return { success: true };

    case 'UPDATE_STATS':
      await updateStats(data);
      return { success: true };

    case 'REPORT_ACTION':
      if (tabId) {
        updateTabStatus(tabId, { action: data.action, details: data.details });
        await logAction(tabId, { action: data.action, domain: data.domain, details: data.details });
      }
      return { success: true };

    case 'GET_TAB_STATUS':
      // Called from popup
      return tabStatus.get(data.tabId) || { actions: [], mode: 'active' };

    default:
      return { error: 'Unknown message type' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Tracking
// ─────────────────────────────────────────────────────────────────────────────

function updateTabStatus(tabId, update) {
  const current = tabStatus.get(tabId) || { actions: [], mode: 'unknown' };

  if (update.mode) current.mode = update.mode;

  if (update.action) {
    const timestamp = new Date().toISOString();
    // Simple deduplication
    const last = current.actions[current.actions.length - 1];
    if (!last || last.action !== update.action || last.details !== update.details) {
      current.actions.push({
        action: update.action,
        details: update.details,
        timestamp
      });
      if (current.actions.length > 20) current.actions.shift();
    }
  }

  tabStatus.set(tabId, current);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode & Rule Management
// ─────────────────────────────────────────────────────────────────────────────

async function resolveDomainMode(domain) {
  const settings = await chrome.storage.sync.get({
    filterMode: 'normal',
    perDomainOverrides: {},
    globalEnabled: true
  });

  if (!settings.globalEnabled) return 'disabled';

  if (domain && settings.perDomainOverrides) {
    const normDomain = domain.toLowerCase().replace(/^www\./, '');
    const override = settings.perDomainOverrides[normDomain];
    if (override && override.filterMode) {
      return override.filterMode;
    }
  }

  return settings.filterMode;
}

async function setGlobalMode(mode) {
  if (mode !== 'normal' && mode !== 'extreme') return;
  await chrome.storage.sync.set({ filterMode: mode });
  await applyFilterMode(mode);
}

async function setDomainMode(domain, mode) {
  const settings = await chrome.storage.sync.get({ perDomainOverrides: {} });
  const normDomain = domain.toLowerCase().replace(/^www\./, '');

  if (!settings.perDomainOverrides[normDomain]) {
    settings.perDomainOverrides[normDomain] = {};
  }

  if (mode === 'default') {
    delete settings.perDomainOverrides[normDomain].filterMode;
  } else {
    settings.perDomainOverrides[normDomain].filterMode = mode;
  }

  await chrome.storage.sync.set({ perDomainOverrides: settings.perDomainOverrides });
}

async function applyFilterMode(mode) {
  const settings = await getSettings();
  const advanced = settings.advanced || DEFAULT_SETTINGS.advanced;

  let enableRules = [...(RULESETS[mode.toUpperCase()] || RULESETS.NORMAL)];

  // Advanced: Toggle Consent Sync rules
  if (advanced.blockConsentSync === false) {
    enableRules = enableRules.filter(r => !r.includes('consent_sync'));
  }

  const allRules = ['tracking_normal', 'consent_sync_normal', 'tracking_extreme', 'consent_sync_extreme'];
  const disableRules = allRules.filter(r => !enableRules.includes(r));

  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: enableRules,
    disableRulesetIds: disableRules
  });

  // logAction(null, { domain: 'System', details: `Applied mode: ${mode}, rules: ${enableRules.length}` });
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings & Stats
// ─────────────────────────────────────────────────────────────────────────────

async function getSettings() {
  try {
    return await chrome.storage.sync.get(DEFAULT_SETTINGS);
  } catch (error) {
    return DEFAULT_SETTINGS;
  }
}

async function checkDomainAllowed(domain) {
  const settings = await getSettings();
  if (!settings.globalEnabled) return { allowed: false, reason: 'global_disabled' };

  const isAllowlisted = settings.allowlist.some(d => domain === d || domain.endsWith(`.${d}`));
  if (isAllowlisted) return { allowed: false, reason: 'allowlisted' };

  return { allowed: true };
}

async function updateStats(data) {
  try {
    const settings = await getSettings();
    if (data.bannerBlocked) settings.stats.bannersBlocked++;
    if (data.siteProcessed) settings.stats.sitesProcessed++;
    await chrome.storage.sync.set({ stats: settings.stats });
  } catch (error) { }
}

const MAX_LOG_ENTRIES = 500;
let debugLogs = [];

async function logAction(tabId, data) {
  if (data.domain) {
    debugLogs.push({ ts: new Date().toISOString(), ...data });
    if (debugLogs.length > MAX_LOG_ENTRIES) debugLogs.shift();
  }

  if (tabId) {
    let color = '#4CAF50';
    if (data.details && data.details.includes('Extreme')) color = '#F44336';

    try {
      await chrome.action.setBadgeText({ text: '✓', tabId });
      await chrome.action.setBadgeBackgroundColor({ color, tabId });
      setTimeout(async () => {
        try { await chrome.action.setBadgeText({ text: '', tabId }); } catch (e) { }
      }, 2000);
    } catch (error) { }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Listeners
// ─────────────────────────────────────────────────────────────────────────────

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    if (changes.filterMode) {
      applyFilterMode(changes.filterMode.newValue);
    }
    // Also re-apply if advanced settings change
    if (changes.advanced) {
      // Need current mode
      chrome.storage.sync.get(['filterMode']).then(s => applyFilterMode(s.filterMode || 'normal'));
    }
  }
});
