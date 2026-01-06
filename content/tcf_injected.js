/**
 * Consent Breaker - TCF Injected Script
 * 
 * V1.2.0: Dynamic TC String Generation
 * Runs in the PAGE CONTEXT (injected).
 */

(function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────────
    // Dynamic TC String Generator (TCF v2.2)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Generates a valid, fresher-than-fresh TCF v2.2 string.
     * Replaces the static hardcoded string to avoid 'expired consent' issues.
     * 
     * Base structure is a "Reject All" string with:
     * - Version: 2
     * - Created/LastUpdated: NOW
     * - CMP ID: 0 (or a burner ID)
     * - CMP Version: 1
     * - Consent Screen: 1
     * - Consent Language: EN (AA)
     * - Vendor List Version: 100 (Arbitrary valid)
     * - TCF Policy Version: 4
     * - IsServiceSpecific: 1
     * - UseNonStandardStacks: 0
     * - SpecialFeatureOptins: 0 (12 bits)
     * - PurposeConsents: 0 (24 bits)
     * - PurposeLegitimateInterests: 0 (24 bits)
     * - PurposeOneTreatment: 0
     * - PublisherCC: AA (000000000000)
     * - VendorConsents: 0 (Range encoding -> 0 entries)
     * - VendorLegitimateInterests: 0 (Range encoding -> 0 entries)
     * - PublisherRestrictions: 0 (0 entries)
     */
    function generateDynamicTCString() {
        const now = Date.now();
        // Time is in deciseconds (1/10th second)
        const nowDeci = Math.round(now / 100);

        // Helper to Convert Int to Binary String (padded)
        const toBin = (val, len) => val.toString(2).padStart(len, '0');

        // Helper to encode 6-bit chunks to Base64URL characters
        const base64UrlChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        const binToBase64 = (binStr) => {
            let res = '';
            // Pad to multiple of 6
            while (binStr.length % 6 !== 0) binStr += '0';

            for (let i = 0; i < binStr.length; i += 6) {
                const chunk = binStr.substring(i, i + 6);
                res += base64UrlChars[parseInt(chunk, 2)];
            }
            return res;
        };

        // Construct the Core String (TCF v2.2) based on IAB Spec
        let bin = '';

        bin += toBin(2, 6);           // Version: 2
        bin += toBin(nowDeci, 36);    // Created: Now
        bin += toBin(nowDeci, 36);    // LastUpdated: Now
        bin += toBin(0, 12);          // CmpId: 0
        bin += toBin(1, 12);          // CmpVersion: 1
        bin += toBin(1, 6);           // ConsentScreen: 1
        bin += toBin(0, 12);          // ConsentLanguage: AA (EN=3549? No, AA=0 is safer generic)
        bin += toBin(300, 12);        // VendorListVersion: 300 (Arbitrary moderately new)
        bin += toBin(4, 6);           // TcfPolicyVersion: 4
        bin += toBin(1, 1);           // IsServiceSpecific: true
        bin += toBin(0, 1);           // UseNonStandardStacks: false
        bin += toBin(0, 12);          // SpecialFeatureOptins: none
        bin += toBin(0, 24);          // PurposeConsents: none
        bin += toBin(0, 24);          // PurposeLegitimateInterests: none
        bin += toBin(0, 1);           // PurposeOneTreatment: false
        bin += toBin(0, 12);          // PublisherCC: AA

        // Vendor Consents: Range Section
        bin += toBin(65535, 16);      // MaxVendorId
        bin += toBin(1, 1);           // EncodingType: 1 (Range)
        bin += toBin(0, 12);          // NumEntries: 0 (No consents)

        // Vendor Legitimate Interests: Range Section
        bin += toBin(65535, 16);      // MaxVendorId
        bin += toBin(1, 1);           // EncodingType: 1 (Range)
        bin += toBin(0, 12);          // NumEntries: 0 (No interests)

        // Publisher Restrictions
        bin += toBin(0, 12);          // NumPubRestrictions: 0

        // Convert directly to Base64
        return binToBase64(bin);

        // Note: DisclosedValidators and PublisherPurposes segments are omitted 
        // as they are optional/publisher specific. Keep it minimal.
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Reject-All TCData Object
    // ─────────────────────────────────────────────────────────────────────────

    function createRejectAllTCData() {
        return {
            tcString: generateDynamicTCString(), // Use dynamic string
            tcfPolicyVersion: 4,
            cmpId: 0,
            cmpVersion: 0,
            gdprApplies: true,
            eventStatus: 'tcloaded',
            cmpStatus: 'loaded',
            listenerId: null,
            isServiceSpecific: true,
            useNonStandardStacks: false,
            publisherCC: 'NL',
            purposeOneTreatment: false,

            // All purposes rejected
            purpose: {
                consents: {},
                legitimateInterests: {}
            },

            // All vendors rejected
            vendor: {
                consents: {},
                legitimateInterests: {}
            },

            // Special features (none consented)
            specialFeatureOptins: {},

            // Publisher restrictions
            publisher: {
                consents: {},
                legitimateInterests: {},
                customPurpose: {
                    consents: {},
                    legitimateInterests: {}
                },
                restrictions: {}
            },

            // Explicitly set all standard purposes to false
            purposeConsents: {
                1: false, 2: false, 3: false, 4: false, 5: false,
                6: false, 7: false, 8: false, 9: false, 10: false
            },
            purposeLegitimateInterests: {
                1: false, 2: false, 3: false, 4: false, 5: false,
                6: false, 7: false, 8: false, 9: false, 10: false
            }
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TCF API Override
    // ─────────────────────────────────────────────────────────────────────────

    const listeners = new Map();
    let listenerIdCounter = 0;

    function overriddenTcfApi(command, version, callback, parameter) {
        // Log for debugging
        if (window.__cbDebug) {
            console.log('[Consent Breaker] __tcfapi called:', command, version);
        }

        if (typeof callback !== 'function') {
            callback = () => { };
        }

        switch (command) {
            case 'getTCData':
                const tcData = createRejectAllTCData();
                // If vendorIds requested, ensure they're all false
                if (parameter && Array.isArray(parameter)) {
                    for (const vendorId of parameter) {
                        tcData.vendor.consents[vendorId] = false;
                        tcData.vendor.legitimateInterests[vendorId] = false;
                    }
                }
                callback(tcData, true);
                break;

            case 'ping':
                callback({
                    gdprApplies: true,
                    cmpLoaded: true,
                    cmpStatus: 'loaded',
                    displayStatus: 'hidden',
                    apiVersion: '2.2',
                    cmpVersion: 1,
                    cmpId: 0,
                    gvlVersion: 300,
                    tcfPolicyVersion: 4
                }, true);
                break;

            case 'addEventListener':
                const listenerId = ++listenerIdCounter;
                const tcDataWithListener = createRejectAllTCData();
                tcDataWithListener.listenerId = listenerId;
                tcDataWithListener.eventStatus = 'tcloaded';
                listeners.set(listenerId, callback);
                callback(tcDataWithListener, true);
                break;

            case 'removeEventListener':
                const removed = listeners.delete(parameter);
                callback(removed);
                break;

            case 'getInAppTCData':
                callback(createRejectAllTCData(), true);
                break;

            case 'getVendorList':
                // Return empty vendor list
                callback({ vendors: {}, purposes: {} }, true);
                break;

            default:
                // Unknown command - return success to prevent errors
                callback(null, true);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Installation
    // ─────────────────────────────────────────────────────────────────────────

    function install() {
        // Store original if exists (for potential restoration)
        const original = window.__tcfapi;

        // Define our override
        Object.defineProperty(window, '__tcfapi', {
            value: overriddenTcfApi,
            writable: false,
            configurable: false
        });

        // Also handle the queue if CMP hasn't loaded yet
        if (window.__tcfapiQueue && Array.isArray(window.__tcfapiQueue)) {
            window.__tcfapiQueue.forEach(args => {
                try {
                    overriddenTcfApi.apply(null, args);
                } catch (e) { }
            });
        }

        // Handle locator frame (some CMPs use this)
        try {
            const frames = window.frames;
            if (frames['__tcfapiLocator']) {
                // CMP is using iframe communication - we've already overridden the API
            }
        } catch (e) {
            // Cross-origin frame access denied - expected
        }

        // Signal success to content script
        window.postMessage({
            type: 'CONSENT_BREAKER_TCF_OVERRIDE',
            success: true,
            hadOriginal: !!original
        }, '*');

        if (window.__cbDebug) {
            console.log('[Consent Breaker] TCF API override installed');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Google Consent Mode Override
    // ─────────────────────────────────────────────────────────────────────────

    function overrideGoogleConsentMode() {
        // Override Google's consent mode if present
        window.dataLayer = window.dataLayer || [];

        // Push deny-all consent
        window.dataLayer.push('consent', 'default', {
            'ad_storage': 'denied',
            'ad_user_data': 'denied',
            'ad_personalization': 'denied',
            'analytics_storage': 'denied',
            'functionality_storage': 'denied',
            'personalization_storage': 'denied',
            'security_storage': 'granted' // Keep security for site functionality
        });

        // Prevent future consent updates
        const originalPush = window.dataLayer.push;
        window.dataLayer.push = function (...args) {
            // Block consent updates that would grant permissions
            if (args[0] === 'consent' && args[1] === 'update') {
                if (window.__cbDebug) {
                    console.log('[Consent Breaker] Blocked Google consent update:', args);
                }
                return;
            }
            return originalPush.apply(this, args);
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Execute
    // ─────────────────────────────────────────────────────────────────────────

    install();
    overrideGoogleConsentMode();

})();
