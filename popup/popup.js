/**
 * Consent Breaker - Popup v2
 */

document.addEventListener('DOMContentLoaded', async () => {
    // Elements
    const mainContent = document.getElementById('mainContent');
    const systemPage = document.getElementById('systemPage');
    const domainName = document.getElementById('domainName');
    const effectiveModeBadge = document.getElementById('effectiveModeBadge');
    const modeSelector = document.getElementById('modeSelector');
    const statusList = document.getElementById('statusList');
    const escalateBtn = document.getElementById('escalateBtn');
    const disableBtn = document.getElementById('disableBtn');
    const enableBtn = document.getElementById('enableBtn');

    // Navigation
    document.getElementById('optionsLink').addEventListener('click', () => chrome.runtime.openOptionsPage());
    document.getElementById('sysOptionsBtn').addEventListener('click', () => chrome.runtime.openOptionsPage());

    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Validate Tab
    if (!tab || !tab.url || (!tab.url.startsWith('http') && !tab.url.startsWith('https'))) {
        mainContent.style.display = 'none';
        systemPage.style.display = 'block';
        return;
    }

    const domain = new URL(tab.url).hostname;
    domainName.textContent = domain;

    // Load initial state
    await refreshState(tab.id, domain);

    // Poll for status updates
    setInterval(() => updateStatusBlock(tab.id), 2000);

    // ─────────────────────────────────────────────────────────────────────────
    // Logic
    // ─────────────────────────────────────────────────────────────────────────

    async function refreshState(tabId, domain) {
        // 1. Get Settings & Mode
        const settings = await chrome.storage.sync.get({
            perDomainOverrides: {},
            allowlist: [],
            filterMode: 'normal'
        });

        // 2. Check Allowlist (Disabled)
        const isAllowlisted = settings.allowlist.some(d => domain === d || domain.endsWith(`.${d}`));
        if (isAllowlisted) {
            setVisualMode('disabled');
            modeSelector.disabled = true;
            disableBtn.style.display = 'none';
            enableBtn.style.display = 'block';
        } else {
            modeSelector.disabled = false;
            disableBtn.style.display = 'block';
            enableBtn.style.display = 'none';

            // 3. Check Overrides
            const normDomain = domain.toLowerCase().replace(/^www\./, '');
            const override = settings.perDomainOverrides[normDomain]?.filterMode;

            // Set Selector
            modeSelector.value = override || 'default';

            // Calculate Effective Mode
            const effective = override || settings.filterMode;
            setVisualMode(effective);

            // Escalate Button Logic
            if (effective === 'normal') {
                escalateBtn.style.display = 'block';
            } else {
                escalateBtn.style.display = 'none';
            }
        }

        // 4. Update Status Block immediately
        await updateStatusBlock(tabId);
    }

    async function updateStatusBlock(tabId) {
        try {
            const status = await chrome.runtime.sendMessage({
                type: 'GET_TAB_STATUS',
                data: { tabId }
            });

            if (status && status.actions && status.actions.length > 0) {
                statusList.innerHTML = '';
                // Show last 3
                const recent = status.actions.slice(-3).reverse();

                recent.forEach(act => {
                    const row = document.createElement('div');
                    row.className = 'status-item';
                    row.innerHTML = `<span class="icon-success">✓</span> ${escapeHtml(act.action)}`;
                    statusList.appendChild(row);
                });
            } else {
                // Keep default if empty, or "No actions yet"
                // statusList.innerHTML = '<div class="status-item"><span class="icon-info">ℹ️</span> No actions yet</div>';
            }
        } catch (e) { }
    }

    function setVisualMode(mode) {
        effectiveModeBadge.className = `mode-badge ${mode}`;
        effectiveModeBadge.textContent = mode.toUpperCase();
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Event Handlers
    // ─────────────────────────────────────────────────────────────────────────

    // Mode Selector Change
    modeSelector.addEventListener('change', async (e) => {
        const mode = e.target.value;
        await chrome.runtime.sendMessage({
            type: 'SET_DOMAIN_MODE',
            data: { domain, mode }
        });
        chrome.tabs.reload(tab.id);
        window.close();
    });

    // Escalate
    escalateBtn.addEventListener('click', async () => {
        await chrome.runtime.sendMessage({
            type: 'SET_DOMAIN_MODE',
            data: { domain, mode: 'extreme' }
        });
        chrome.tabs.reload(tab.id);
        window.close();
    });

    // Disable (Add to Allowlist)
    disableBtn.addEventListener('click', async () => {
        // We need to add to allowlist. SW doesn't have a direct msg for this maybe?
        // Let's check storage.js or direct storage manipulation.
        // Popup can access storage directly.
        const { allowlist = [] } = await chrome.storage.sync.get({ allowlist: [] });

        // Normalize
        const norm = domain.toLowerCase().replace(/^www\./, '');
        // Add both just in case, or match storage.js logic
        if (!allowlist.includes(norm)) {
            allowlist.push(norm);
            await chrome.storage.sync.set({ allowlist });
        }

        chrome.tabs.reload(tab.id);
        window.close();
    });

    // Enable (Remove from Allowlist)
    enableBtn.addEventListener('click', async () => {
        const { allowlist = [] } = await chrome.storage.sync.get({ allowlist: [] });
        const norm = domain.toLowerCase().replace(/^www\./, '');

        const filtered = allowlist.filter(d => d !== norm && d !== domain);
        await chrome.storage.sync.set({ allowlist: filtered });

        chrome.tabs.reload(tab.id);
        window.close();
    });
});
