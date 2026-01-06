/**
 * Consent Breaker - Options Page JS
 * MVP: global toggle, allowlist management, debug mode, export/import
 */

document.addEventListener('DOMContentLoaded', init);

async function init() {
    await loadSettings();
    bindEvents();
}

// ─────────────────────────────────────────────────────────────────────────────
// Load Settings
// ─────────────────────────────────────────────────────────────────────────────

async function loadSettings() {
    const defaults = {
        globalEnabled: true,
        debugMode: false,
        allowlist: [],
        stats: { bannersBlocked: 0, sitesProcessed: 0 }
    };

    try {
        const settings = await chrome.storage.sync.get(defaults);

        // Global enabled toggle
        document.getElementById('globalEnabled').checked = settings.globalEnabled;

        // Debug mode toggle
        document.getElementById('debugMode').checked = settings.debugMode;

        // Allowlist
        renderAllowlist(settings.allowlist);

        // Stats
        document.getElementById('statBanners').textContent = settings.stats?.bannersBlocked || 0;
        document.getElementById('statSites').textContent = settings.stats?.sitesProcessed || 0;
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bind Events
// ─────────────────────────────────────────────────────────────────────────────

function bindEvents() {
    // Global toggle
    document.getElementById('globalEnabled').addEventListener('change', async (e) => {
        await chrome.storage.sync.set({ globalEnabled: e.target.checked });
    });

    // Debug toggle
    document.getElementById('debugMode').addEventListener('change', async (e) => {
        await chrome.storage.sync.set({ debugMode: e.target.checked });
    });

    // Add domain
    document.getElementById('addDomain').addEventListener('click', addDomain);
    document.getElementById('newDomain').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addDomain();
    });

    // Export
    document.getElementById('exportSettings').addEventListener('click', exportSettings);

    // Import
    document.getElementById('importSettings').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', importSettings);
}

// ─────────────────────────────────────────────────────────────────────────────
// Allowlist
// ─────────────────────────────────────────────────────────────────────────────

function renderAllowlist(allowlist) {
    const list = document.getElementById('allowlist');
    const emptyState = document.getElementById('emptyAllowlist');

    list.innerHTML = '';

    if (!allowlist || allowlist.length === 0) {
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    for (const domain of allowlist) {
        const li = document.createElement('li');
        li.innerHTML = `
      <span class="domain-name">${escapeHtml(domain)}</span>
      <button class="btn btn-danger" data-domain="${escapeHtml(domain)}">Verwijderen</button>
    `;
        list.appendChild(li);
    }

    // Bind remove buttons
    list.querySelectorAll('.btn-danger').forEach(btn => {
        btn.addEventListener('click', () => removeDomain(btn.dataset.domain));
    });
}

async function addDomain() {
    const input = document.getElementById('newDomain');
    let domain = input.value.trim();

    if (!domain) return;

    // Normalize domain
    domain = normalizeDomain(domain);

    if (!isValidDomain(domain)) {
        alert('Ongeldig domein');
        return;
    }

    try {
        const { allowlist = [] } = await chrome.storage.sync.get({ allowlist: [] });

        if (allowlist.includes(domain)) {
            alert('Dit domein staat al in de allowlist');
            return;
        }

        allowlist.push(domain);
        await chrome.storage.sync.set({ allowlist });

        renderAllowlist(allowlist);
        input.value = '';
    } catch (error) {
        console.error('Failed to add domain:', error);
    }
}

async function removeDomain(domain) {
    try {
        const { allowlist = [] } = await chrome.storage.sync.get({ allowlist: [] });
        const filtered = allowlist.filter(d => d !== domain);
        await chrome.storage.sync.set({ allowlist: filtered });
        renderAllowlist(filtered);
    } catch (error) {
        console.error('Failed to remove domain:', error);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Export/Import
// ─────────────────────────────────────────────────────────────────────────────

async function exportSettings() {
    try {
        const settings = await chrome.storage.sync.get(null);
        const json = JSON.stringify(settings, null, 2);

        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'consent-breaker-settings.json';
        a.click();

        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Export failed:', error);
        alert('Export mislukt');
    }
}

async function importSettings(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        // Validate structure
        if (typeof data !== 'object') {
            throw new Error('Invalid format');
        }

        // Only import known keys
        const validKeys = ['globalEnabled', 'debugMode', 'allowlist', 'stats'];
        const sanitized = {};

        for (const key of validKeys) {
            if (key in data) {
                sanitized[key] = data[key];
            }
        }

        await chrome.storage.sync.set(sanitized);
        await loadSettings();

        alert('Instellingen geïmporteerd');
    } catch (error) {
        console.error('Import failed:', error);
        alert('Import mislukt: ongeldig bestand');
    }

    // Reset file input
    event.target.value = '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeDomain(domain) {
    return domain
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/.*$/, '')
        .trim();
}

function isValidDomain(domain) {
    // Simple validation: alphanumeric, dots, hyphens
    return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i.test(domain);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
