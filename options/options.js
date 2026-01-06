/**
 * Consent Breaker - Options Page JS
 * MVP: global toggle, allowlist management, debug mode, export/import, filter modes
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
        filterMode: 'normal',
        allowlist: [],
        stats: { bannersBlocked: 0, sitesProcessed: 0 }
    };

    try {
        const settings = await chrome.storage.sync.get(defaults);

        // Global toggle
        document.getElementById('globalEnabled').checked = settings.globalEnabled;

        // Filter mode radio
        const mode = settings.filterMode || 'normal';
        document.querySelector(`input[name="filterMode"][value="${mode}"]`).checked = true;

        // Debug mode
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

    // Filter mode radios
    document.querySelectorAll('input[name="filterMode"]').forEach(radio => {
        radio.addEventListener('change', async (e) => {
            await chrome.runtime.sendMessage({
                type: 'SET_GLOBAL_MODE',
                data: { mode: e.target.value }
            });
            // Also sync standard storage if message handler doesn't fully cover persist
            // (The SW handler does persist it, so we strictly don't need to manually set here if message succeeds)
        });
    });

    // Debug toggle
    document.getElementById('debugMode').addEventListener('change', async (e) => {
        await chrome.storage.sync.set({ debugMode: e.target.checked });
    });

    // Allowlist
    document.getElementById('addDomain').addEventListener('click', addDomain);
    document.getElementById('newDomain').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addDomain();
    });

    // Export/Import
    document.getElementById('exportSettings').addEventListener('click', exportSettings);
    document.getElementById('importSettings').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', importSettings);
}

// ─────────────────────────────────────────────────────────────────────────────
// Allowlist (unchanged logic)
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

    list.querySelectorAll('.btn-danger').forEach(btn => {
        btn.addEventListener('click', () => removeDomain(btn.dataset.domain));
    });
}

async function addDomain() {
    const input = document.getElementById('newDomain');
    let domain = input.value.trim();
    if (!domain) return;
    domain = normalizeDomain(domain);
    if (!isValidDomain(domain)) { alert('Ongeldig domein'); return; }

    try {
        const { allowlist = [] } = await chrome.storage.sync.get({ allowlist: [] });
        if (allowlist.includes(domain)) { alert('Reeds in lijst'); return; }
        allowlist.push(domain);
        await chrome.storage.sync.set({ allowlist });
        renderAllowlist(allowlist);
        input.value = '';
    } catch (error) { console.error(error); }
}

async function removeDomain(domain) {
    try {
        const { allowlist = [] } = await chrome.storage.sync.get({ allowlist: [] });
        const filtered = allowlist.filter(d => d !== domain);
        await chrome.storage.sync.set({ allowlist: filtered });
        renderAllowlist(filtered);
    } catch (error) { console.error(error); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Export/Import (Updated valid keys)
// ─────────────────────────────────────────────────────────────────────────────

async function exportSettings() {
    try {
        const settings = await chrome.storage.sync.get(null);
        const json = JSON.stringify(settings, null, 2);
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'consent-breaker-settings.json';
        a.click();
    } catch (error) { console.error(error); }
}

async function importSettings(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        const data = JSON.parse(await file.text());
        if (typeof data !== 'object') throw new Error('Invalid format');

        const validKeys = ['globalEnabled', 'debugMode', 'allowlist', 'stats', 'filterMode', 'perDomainOverrides'];
        const sanitized = {};
        for (const key of validKeys) if (key in data) sanitized[key] = data[key];

        await chrome.storage.sync.set(sanitized);
        await loadSettings();
        alert('Geïmporteerd');
    } catch (error) { alert('Import mislukt'); }
    event.target.value = '';
}

function normalizeDomain(d) { return d.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').trim(); }
function isValidDomain(d) { return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i.test(d); }
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
