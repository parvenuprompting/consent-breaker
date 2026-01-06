/**
 * Consent Breaker - Service Worker
 * Handles extension lifecycle, DNR rule management, and message passing.
 * Now supports Normal/Extreme modes.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  globalEnabled: true,
  filterMode: 'normal',
  debugMode: false,
  allowlist: [],
  stats: {
    bannersBlocked: 0,
    sitesProcessed: 0
  }
};

const RULESETS = {
  NORMAL: ['tracking_normal', 'consent_sync_normal'],
  EXTREME: ['tracking_normal', 'consent_sync_normal', 'tracking_extreme', 'consent_sync_extreme']
};

// ─────────────────────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.sync.set(DEFAULT_SETTINGS);
    // Ensure correct rules are active (default normal)
    await applyFilterMode('normal');
    log('Extension installed, default settings applied');
  } else if (details.reason === 'update') {
    // Migration: ensure filterMode exists
    const settings = await chrome.storage.sync.get(['filterMode']);
    if (!settings.filterMode) {
      await chrome.storage.sync.set({ filterMode: 'normal' });
    }
    // Re-apply rules based on stored setting
    const current = await chrome.storage.sync.get(['filterMode']);
    await applyFilterMode(current.filterMode || 'normal');
    log(`Extension updated to version ${chrome.runtime.getManifest().version}, mode: ${current.filterMode}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Message Handling
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message, sender) {
  const { type, data } = message;

  switch (type) {
    case 'GET_SETTINGS':
      return await getSettings();

    case 'GET_MODE':
      // Return effective mode for a domain
      const mode = await resolveDomainMode(data?.domain);
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
      await logAction(sender.tab?.id, data);
      return { success: true };

    case 'UPDATE_STATS':
      await updateStats(data);
      return { success: true };

    default:
      // log(`Unknown message type: ${type}`);
      return { error: 'Unknown message type' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode & Rule Management
// ─────────────────────────────────────────────────────────────────────────────

async function resolveDomainMode(domain) {
  // Use imported Storage wrapper logic if possible, or reimplement lightweight here
  // Since we don't import Storage in SW easily without ES modules in MV3 (unless configured),
  // we'll read directly.
  const settings = await chrome.storage.sync.get({
    filterMode: 'normal',
    perDomainOverrides: {},
    globalEnabled: true
  });

  if (!settings.globalEnabled) return 'disabled';

  if (domain && settings.perDomainOverrides) {
    // Simple normalization
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

  // NOTE: DNR rules are global. Changing a single domain's mode
  // does NOT change global DNR rules. Per-domain overrides only affect
  // content scripts (Banner/TCF) behavior.
  // This is a documented design decision.
}

async function applyFilterMode(mode) {
  const enableRules = RULESETS[mode.toUpperCase()] || RULESETS.NORMAL;

  // Disable all known rulesets first to be clean, or calculate diff
  const allRules = ['tracking_normal', 'consent_sync_normal', 'tracking_extreme', 'consent_sync_extreme'];

  const disableRules = allRules.filter(r => !enableRules.includes(r));

  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: enableRules,
    disableRulesetIds: disableRules
  });

  log(`Applied filter mode: ${mode} (Rules: ${enableRules.join(', ')})`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings Management
// ─────────────────────────────────────────────────────────────────────────────

async function getSettings() {
  try {
    const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    return settings;
  } catch (error) {
    log(`Error getting settings: ${error.message}`);
    return DEFAULT_SETTINGS;
  }
}

async function checkDomainAllowed(domain) {
  const settings = await getSettings();

  if (!settings.globalEnabled) {
    return { allowed: false, reason: 'global_disabled' };
  }

  const isAllowlisted = settings.allowlist.some(d => {
    return domain === d || domain.endsWith(`.${d}`);
  });

  if (isAllowlisted) {
    return { allowed: false, reason: 'allowlisted' };
  }

  return { allowed: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Statistics & Logging
// ─────────────────────────────────────────────────────────────────────────────

async function updateStats(data) {
  try {
    const settings = await getSettings();

    if (data.bannerBlocked) settings.stats.bannersBlocked++;
    if (data.siteProcessed) settings.stats.sitesProcessed++;

    await chrome.storage.sync.set({ stats: settings.stats });
  } catch (error) {
    log(`Error updating stats: ${error.message}`);
  }
}

const MAX_LOG_ENTRIES = 500;
let debugLogs = [];

async function log(message, level = 'info') {
  const settings = await getSettings();
  const entry = { timestamp: new Date().toISOString(), level, message };

  debugLogs.push(entry);
  if (debugLogs.length > MAX_LOG_ENTRIES) debugLogs = debugLogs.slice(-MAX_LOG_ENTRIES);

  if (settings.debugMode) {
    console.log(`[Consent Breaker SW] [${level.toUpperCase()}] ${message}`);
  }
}

async function logAction(tabId, data) {
  const { action, domain, details } = data;
  await log(`[${domain}] ${action}: ${JSON.stringify(details)}`);

  // Badge logic (Green for Normal, Red/Orange for Extreme? Or just Green)
  if (tabId) {
    try {
      // Determine mode for badge color?
      // const mode = await resolveDomainMode(domain);
      // const color = mode === 'extreme' ? '#F44336' : '#4CAF50';
      const color = '#4CAF50';

      await chrome.action.setBadgeText({ text: '✓', tabId });
      await chrome.action.setBadgeBackgroundColor({ color, tabId });
      setTimeout(async () => {
        try { await chrome.action.setBadgeText({ text: '', tabId }); } catch (e) { }
      }, 2000);
    } catch (error) { }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Other listeners
// ─────────────────────────────────────────────────────────────────────────────

// Listen for storage changes to update DNR rules if global mode changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.filterMode) {
    applyFilterMode(changes.filterMode.newValue);
  }
});
