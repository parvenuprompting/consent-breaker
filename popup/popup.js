document.addEventListener('DOMContentLoaded', async () => {
    const currentDomainEl = document.getElementById('currentDomain');
    const statusBadge = document.getElementById('statusBadge');
    const siteControls = document.getElementById('siteControls');
    const systemPageMsg = document.getElementById('systemPageMsg');

    // Always bind Option button first, so it works even on system pages
    document.getElementById('openOptions').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Check if valid http/https page
    if (!tab || !tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))) {
        currentDomainEl.style.display = 'none';
        siteControls.style.display = 'none';
        systemPageMsg.style.display = 'block';
        statusBadge.textContent = 'System';
        return;
    }

    // Valid page logic
    const domain = new URL(tab.url).hostname;
    currentDomainEl.textContent = domain;

    // Load settings
    const settings = await chrome.storage.sync.get({
        perDomainOverrides: {},
        filterMode: 'normal',
        globalEnabled: true
    });

    // Check allowlist status via message
    try {
        const allowCheck = await chrome.runtime.sendMessage({
            type: 'CHECK_DOMAIN',
            data: { domain }
        });

        if (!allowCheck || !allowCheck.allowed) {
            statusBadge.textContent = 'Disabled';
            statusBadge.style.color = '#ef4444';
        }
    } catch (e) {
        // Fallback if SW not ready
        console.error(e);
    }

    // Determine current selection
    const normDomain = domain.toLowerCase().replace(/^www\./, '');
    const override = settings.perDomainOverrides[normDomain];

    if (override && override.filterMode) {
        const radio = document.querySelector(`input[value="${override.filterMode}"]`);
        if (radio) radio.checked = true;
    } else {
        const def = document.getElementById('modeDefault');
        if (def) def.checked = true;
    }

    // Bind change events
    document.querySelectorAll('input[name="mode"]').forEach(radio => {
        radio.addEventListener('change', async (e) => {
            const mode = e.target.value;
            await chrome.runtime.sendMessage({
                type: 'SET_DOMAIN_MODE',
                data: { domain, mode }
            });
            // Reload to apply
            chrome.tabs.reload(tab.id);
            window.close(); // Close popup to let user see reload
        });
    });
});
