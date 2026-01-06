/**
 * Consent Breaker - Storage Wrapper
 * Unified interface for chrome.storage operations.
 */

const Storage = {
    // ─────────────────────────────────────────────────────────────────────────
    // Sync Storage
    // ─────────────────────────────────────────────────────────────────────────

    async get(keys) {
        try {
            return await chrome.storage.sync.get(keys);
        } catch (error) {
            console.error('[Storage] Error getting sync data:', error);
            return {};
        }
    },

    async set(data) {
        try {
            await chrome.storage.sync.set(data);
            return true;
        } catch (error) {
            console.error('[Storage] Error setting sync data:', error);
            return false;
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Mode Management (Normal vs Extreme)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Get the effective mode for a domain.
     * Resolves global setting and per-domain overrides.
     * @param {string} domain 
     * @returns {Promise<string>} 'normal' | 'extreme'
     */
    async getModeForDomain(domain) {
        const settings = await this.get({
            globalEnabled: true,
            filterMode: 'normal',
            perDomainOverrides: {}
        });

        if (!settings.globalEnabled) return 'disabled';

        const normalizedDomain = this.normalizeDomain(domain);
        const override = settings.perDomainOverrides[normalizedDomain];

        if (override && override.filterMode) {
            return override.filterMode;
        }

        return settings.filterMode;
    },

    async getGlobalMode() {
        const data = await this.get({ filterMode: 'normal' });
        return data.filterMode;
    },

    async setGlobalMode(mode) {
        if (!['normal', 'extreme'].includes(mode)) return false;
        return await this.set({ filterMode: mode });
    },

    async setDomainMode(domain, mode) {
        const settings = await this.get({ perDomainOverrides: {} });
        const normalizedDomain = this.normalizeDomain(domain);

        if (!settings.perDomainOverrides[normalizedDomain]) {
            settings.perDomainOverrides[normalizedDomain] = {};
        }

        if (mode === 'default') {
            delete settings.perDomainOverrides[normalizedDomain].filterMode;
            // Cleanup if empty
            if (Object.keys(settings.perDomainOverrides[normalizedDomain]).length === 0) {
                delete settings.perDomainOverrides[normalizedDomain];
            }
        } else {
            settings.perDomainOverrides[normalizedDomain].filterMode = mode;
        }

        return await this.set({ perDomainOverrides: settings.perDomainOverrides });
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Allowlist Management
    // ─────────────────────────────────────────────────────────────────────────

    async getAllowlist() {
        const data = await this.get({ allowlist: [] });
        return data.allowlist || [];
    },

    async addToAllowlist(domain) {
        const allowlist = await this.getAllowlist();
        const normalizedDomain = this.normalizeDomain(domain);

        if (!allowlist.includes(normalizedDomain)) {
            allowlist.push(normalizedDomain);
            await this.set({ allowlist });
        }
        return allowlist;
    },

    async removeFromAllowlist(domain) {
        const allowlist = await this.getAllowlist();
        const normalizedDomain = this.normalizeDomain(domain);
        const filtered = allowlist.filter(d => d !== normalizedDomain);
        await this.set({ allowlist: filtered });
        return filtered;
    },

    async isAllowlisted(domain) {
        const allowlist = await this.getAllowlist();
        const normalizedDomain = this.normalizeDomain(domain);
        return allowlist.some(d => normalizedDomain === d || normalizedDomain.endsWith(`.${d}`));
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Settings
    // ─────────────────────────────────────────────────────────────────────────

    async getGlobalEnabled() {
        const data = await this.get({ globalEnabled: true });
        return data.globalEnabled;
    },

    async setGlobalEnabled(enabled) {
        return await this.set({ globalEnabled: enabled });
    },

    async getDebugMode() {
        const data = await this.get({ debugMode: false });
        return data.debugMode;
    },

    async setDebugMode(enabled) {
        return await this.set({ debugMode: enabled });
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Export/Import
    // ─────────────────────────────────────────────────────────────────────────

    async exportSettings() {
        const data = await this.get(null); // Get all
        return JSON.stringify(data, null, 2);
    },

    async importSettings(jsonString) {
        try {
            const data = JSON.parse(jsonString);

            // Validate structure
            if (typeof data !== 'object') {
                throw new Error('Invalid settings format');
            }

            // Only import known keys
            const validKeys = ['globalEnabled', 'debugMode', 'allowlist', 'stats', 'filterMode', 'perDomainOverrides'];
            const sanitized = {};

            for (const key of validKeys) {
                if (key in data) {
                    sanitized[key] = data[key];
                }
            }

            await this.set(sanitized);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    normalizeDomain(domain) {
        // Remove protocol, www, trailing slashes
        return domain
            .toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .replace(/\/.*$/, '')
            .trim();
    }
};

// Make available globally for content scripts
if (typeof window !== 'undefined') {
    window.ConsentBreakerStorage = Storage;
}
