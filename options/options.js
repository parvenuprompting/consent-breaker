/**
 * Consent Breaker - Options Page
 * V2.1: Neon Glass UI & Auto-save
 */

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    initializeTabs();
    initializeEventListeners();
});

// ─────────────────────────────────────────────────────────────────────────────
// Init & Navigation
// ─────────────────────────────────────────────────────────────────────────────

function initializeTabs() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active state
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

            // Add active state
            btn.classList.add('active');
            const target = btn.dataset.tab;
            const section = document.getElementById(`section-${target}`);
            if (section) section.classList.add('active');
        });
    });
}

function initializeEventListeners() {
    // Auto-save on all inputs
    const inputs = document.querySelectorAll('input[type="checkbox"], input[type="radio"]');
    inputs.forEach(input => {
        input.addEventListener('change', () => {
            saveSettings();
            // Visual feedback for radios
            if (input.name === 'filterMode') updateModeUI();
        });
    });

    // Domain management
    const addBtn = document.getElementById('addDomain');
    if (addBtn) addBtn.addEventListener('click', addDomain);

    // Import/Export
    const exportBtn = document.getElementById('export');
    if (exportBtn) exportBtn.addEventListener('click', exportSettings);

    const importBtn = document.getElementById('import');
    if (importBtn) importBtn.addEventListener('click', () => document.getElementById('importFile').click());

    const importFile = document.getElementById('importFile');
    if (importFile) importFile.addEventListener('change', importSettings);
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings Management
// ─────────────────────────────────────────────────────────────────────────────

async function loadSettings() {
    const settings = await chrome.storage.sync.get({
        globalEnabled: true,
        filterMode: 'normal',
        allowlist: [],
        stats: { bannersBlocked: 0, sitesProcessed: 0 },
        advanced: { blockConsentSync: true, assumeReject: false, showLogs: false }
    });

    // Toggles
    setCheck('globalToggle', settings.globalEnabled);
    setCheck('blockConsentSync', settings.advanced?.blockConsentSync ?? true);
    setCheck('assumeReject', settings.advanced?.assumeReject ?? false);
    setCheck('showLogs', settings.advanced?.showLogs ?? false);

    // Mode Radio
    const modeRadio = document.querySelector(`input[name="filterMode"][value="${settings.filterMode}"]`);
    if (modeRadio) modeRadio.checked = true;

    // List & Stats
    renderAllowlist(settings.allowlist);

    const statBanners = document.getElementById('statBanners');
    if (statBanners) statBanners.textContent = settings.stats?.bannersBlocked || 0;

    // Note: statSites removed from UI or optional? Check HTML.
}

async function saveSettings() {
    const globalEnabled = getCheck('globalToggle');

    const modeEl = document.querySelector('input[name="filterMode"]:checked');
    const filterMode = modeEl ? modeEl.value : 'normal';

    const advanced = {
        blockConsentSync: getCheck('blockConsentSync'),
        assumeReject: getCheck('assumeReject'),
        showLogs: getCheck('showLogs')
    };

    // Preserve other data
    const current = await chrome.storage.sync.get({ allowlist: [], stats: {}, perDomainOverrides: {} });

    await chrome.storage.sync.set({
        globalEnabled,
        filterMode,
        advanced,
        allowlist: current.allowlist,
        stats: current.stats,
        perDomainOverrides: current.perDomainOverrides
    });

    showStatus('Settings saved');
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function setCheck(id, val) {
    const el = document.getElementById(id);
    if (el) el.checked = val;
}

function getCheck(id) {
    const el = document.getElementById(id);
    return el ? el.checked : false;
}

function updateModeUI() {
    // Optional: Add glow effect to selected card
}


// ─────────────────────────────────────────────────────────────────────────────
// Allowlist Logic
// ─────────────────────────────────────────────────────────────────────────────

function renderAllowlist(list) {
    const container = document.getElementById('allowlist');
    if (!container) return;

    container.innerHTML = '';

    if (!list || list.length === 0) {
        container.innerHTML = '<div class="empty-state">No domains allowed</div>';
        return;
    }

    list.forEach(domain => {
        const item = document.createElement('div');
        item.className = 'allowlist-item';
        item.innerHTML = `
      <span>${domain}</span>
      <span class="remove-btn" data-domain="${domain}">✕</span>
    `;
        container.appendChild(item);
    });

    // Add listeners to X buttons
    container.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const domain = e.target.dataset.domain;
            await removeDomain(domain);
        });
    });
}

async function addDomain() {
    const input = document.getElementById('newDomain');
    if (!input) return;

    let domain = input.value.trim().toLowerCase();
    if (!domain) return;

    try {
        const url = new URL(domain.startsWith('http') ? domain : `http://${domain}`);
        domain = url.hostname;
    } catch (e) { }

    const settings = await chrome.storage.sync.get({ allowlist: [] });
    if (!settings.allowlist.includes(domain)) {
        settings.allowlist.push(domain);
        await chrome.storage.sync.set({ allowlist: settings.allowlist });
        renderAllowlist(settings.allowlist);
        input.value = '';
        showStatus('Domain added');
    }
}

async function removeDomain(domain) {
    const settings = await chrome.storage.sync.get({ allowlist: [] });
    const updated = settings.allowlist.filter(d => d !== domain);
    await chrome.storage.sync.set({ allowlist: updated });
    renderAllowlist(updated);
}

// ─────────────────────────────────────────────────────────────────────────────
// Export/Import
// ─────────────────────────────────────────────────────────────────────────────

function exportSettings() {
    chrome.storage.sync.get(null, (items) => {
        const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `consent-breaker-settings-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
    });
}

function importSettings(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const settings = JSON.parse(event.target.result);
            // Validation could go here
            await chrome.storage.sync.set(settings);
            loadSettings();
            showStatus('Settings imported');
        } catch (err) {
            showStatus('Import failed: Invalid JSON', true);
        }
    };
    reader.readAsText(file);
}

function showStatus(msg, isError = false) {
    const el = document.getElementById('status');
    if (!el) return;

    el.textContent = msg;
    el.className = 'toast ' + (isError ? 'error' : 'visible');

    // Reset after 2s
    setTimeout(() => {
        el.className = 'toast hidden';
    }, 2000);
}
