/**
 * Consent Breaker - Service Worker
 * Handles extension lifecycle, DNR rule management, and message passing.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  globalEnabled: true,
  debugMode: false,
  allowlist: [],
  stats: {
    bannersBlocked: 0,
    sitesProcessed: 0
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.sync.set(DEFAULT_SETTINGS);
    log('Extension installed, default settings applied');
  } else if (details.reason === 'update') {
    log(`Extension updated to version ${chrome.runtime.getManifest().version}`);
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

    case 'CHECK_DOMAIN':
      return await checkDomainAllowed(data.domain);

    case 'LOG_ACTION':
      await logAction(sender.tab?.id, data);
      return { success: true };

    case 'UPDATE_STATS':
      await updateStats(data);
      return { success: true };

    case 'GET_DEBUG_LOGS':
      return await getDebugLogs();

    default:
      log(`Unknown message type: ${type}`);
      return { error: 'Unknown message type' };
  }
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
  
  // Check allowlist (sites where extension is disabled)
  const isAllowlisted = settings.allowlist.some(d => {
    return domain === d || domain.endsWith(`.${d}`);
  });
  
  if (isAllowlisted) {
    return { allowed: false, reason: 'allowlisted' };
  }
  
  return { allowed: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Statistics
// ─────────────────────────────────────────────────────────────────────────────

async function updateStats(data) {
  try {
    const settings = await getSettings();
    
    if (data.bannerBlocked) {
      settings.stats.bannersBlocked++;
    }
    if (data.siteProcessed) {
      settings.stats.sitesProcessed++;
    }
    
    await chrome.storage.sync.set({ stats: settings.stats });
  } catch (error) {
    log(`Error updating stats: ${error.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Debug Logging (Ring Buffer)
// ─────────────────────────────────────────────────────────────────────────────

const MAX_LOG_ENTRIES = 500;
let debugLogs = [];

async function log(message, level = 'info') {
  const settings = await getSettings();
  
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message
  };
  
  debugLogs.push(entry);
  
  // Ring buffer: keep only last MAX_LOG_ENTRIES
  if (debugLogs.length > MAX_LOG_ENTRIES) {
    debugLogs = debugLogs.slice(-MAX_LOG_ENTRIES);
  }
  
  if (settings.debugMode) {
    console.log(`[Consent Breaker] [${level.toUpperCase()}] ${message}`);
  }
}

async function logAction(tabId, data) {
  const { action, domain, details } = data;
  await log(`[${domain}] ${action}: ${JSON.stringify(details)}`);
  
  // Update badge to show activity
  if (tabId) {
    try {
      await chrome.action.setBadgeText({ 
        text: '✓', 
        tabId 
      });
      await chrome.action.setBadgeBackgroundColor({ 
        color: '#4CAF50', 
        tabId 
      });
      
      // Clear badge after 2 seconds
      setTimeout(async () => {
        try {
          await chrome.action.setBadgeText({ text: '', tabId });
        } catch (e) {
          // Tab might be closed
        }
      }, 2000);
    } catch (error) {
      // Ignore badge errors (tab might not exist)
    }
  }
}

async function getDebugLogs() {
  return debugLogs;
}

// ─────────────────────────────────────────────────────────────────────────────
// DNR Rule Management
// ─────────────────────────────────────────────────────────────────────────────

// Dynamic rules can be added per-domain if needed
async function enableDNRForDomain(domain) {
  // Placeholder for dynamic rule management
  // For now, static rules in rules/ folder are sufficient
  log(`DNR rules active for: ${domain}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Export for testing
// ─────────────────────────────────────────────────────────────────────────────

// Service worker scope exports
self.consentBreaker = {
  getSettings,
  checkDomainAllowed,
  log,
  getDebugLogs
};
