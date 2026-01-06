/**
 * Consent Breaker - Options Page
 * V2: Supports Advanced Settings
 */

document.addEventListener('DOMContentLoaded', loadSettings);
document.getElementById('save').addEventListener('click', saveSettings);
document.getElementById('addDomain').addEventListener('click', addDomain);
document.getElementById('export').addEventListener('click', exportSettings);
document.getElementById('import').addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', importSettings);

// Load settings
async function loadSettings() {
    const settings = await chrome.storage.sync.get({
        globalEnabled: true,
        filterMode: 'normal',
        allowlist: [],
        stats: { bannersBlocked: 0, sitesProcessed: 0 },
        advanced: { blockConsentSync: true, assumeReject: false, showLogs: false }
    });

    document.getElementById('globalToggle').checked = settings.globalEnabled;

    // Mode Radio
    const modeRadio = document.querySelector(`input[name="filterMode"][value="${settings.filterMode}"]`);
    if (modeRadio) modeRadio.checked = true;

    // Advanced
    document.getElementById('blockConsentSync').checked = settings.advanced?.blockConsentSync ?? true;
    document.getElementById('assumeReject').checked = settings.advanced?.assumeReject ?? false;
    document.getElementById('showLogs').checked = settings.advanced?.showLogs ?? false;

    renderAllowlist(settings.allowlist);

    // Stats
    document.getElementById('statBanners').textContent = settings.stats?.bannersBlocked || 0;
    document.getElementById('statSites').textContent = settings.stats?.sitesProcessed || 0;
}

// Save settings
async function saveSettings() {
    const globalEnabled = document.getElementById('globalToggle').checked;
    const filterMode = document.querySelector('input[name="filterMode"]:checked').value;

    const advanced = {
        blockConsentSync: document.getElementById('blockConsentSync').checked,
        assumeReject: document.getElementById('assumeReject').checked,
        showLogs: document.getElementById('showLogs').checked
    };

    // Get existing settings to preserve other fields
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

// Allowlist logic
function renderAllowlist(list) {
    const container = document.getElementById('allowlist');
    container.innerHTML = '';

    if (list.length === 0) {
        container.innerHTML = '<div class="empty-state">No domains allowed</div>';
        return;
    }

    list.forEach(domain => {
        const item = document.createElement('div');
        item.className = 'allowlist-item';
        item.innerHTML = `
      <span>${domain}</span>
      <button class="remove-btn" data-domain="${domain}">Remove</button>
    `;
        container.appendChild(item);
    });

    document.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const domain = e.target.dataset.domain;
            await removeDomain(domain);
        });
    });
}

async function addDomain() {
    const input = document.getElementById('newDomain');
    let domain = input.value.trim().toLowerCase();

    if (!domain) return;

    // URL cleanup
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

// Export/Import
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
    el.textContent = msg;
    el.className = 'status-msg ' + (isError ? 'error' : 'visible');
    setTimeout(() => el.className = 'status-msg', 2000);
}
