# 🛡️ Consent Breaker (v2.0.0)

![Version](https://img.shields.io/badge/version-2.0.0-success.svg)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue.svg)
![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![JavaScript](https://img.shields.io/badge/Language-JavaScript-F7DF1E?logo=javascript&logoColor=black)
![Shadow DOM](https://img.shields.io/badge/Shadow_DOM-Supported-purple.svg)
![Privacy First](https://img.shields.io/badge/Privacy-100%25-green.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

**De compromisloze consent enforcement engine voor Google Chrome.**
Automatisch cookie consent banners weigeren door technisch in te grijpen op TCF/CMP API's en DOM-niveau. Uitgerust met Shadow DOM traversal, Safe Force-Hide, `role="dialog"` detectie en een **Neon Glass UI**.

---

## ✨ Kenmerken & Wat is er nieuw in v2.0

* 🛡️ **Shadow DOM Traversal**: Volledig vernieuwde `ConsentBreakerDOM` utils die transparant door open Shadow DOM bomen heen zoeken.
* 🚪 **Dialog & Role Detection**: Automatische detectie en scoring-bonus (`+30`) voor expliciete `role="dialog"`, `role="alertdialog"` en `<dialog>` elementen.
* 🛡️ **Safe Force-Hide**: Banners worden veilig verborgen via strakke CSS properties (`display: none !important`, `aria-hidden`, `pointer-events: none`) én automatische backdrop/overlay-demping in plaats van destructieve `.remove()`.
* ⚡ **Performance & Throttling**: MutationObserver throttling (800ms in Extreme mode, 1500ms in Normal mode) met specifieke attribuutfilters tegen onnodige CPU-spikes.
* 🎨 **Neon Glass Interface**: Volledig vernieuwde "Cyberpunk Glassmorphism" UI voor zowel Popup als Options dashboard.
* 📜 **Audit-proof TCF Override**: Dynamic TCF strings (nooit meer expired strings) en direct negeren van `purposes`, `vendors` en `legitimateInterests`.

---

## 🛠️ Hoe het werkt

1. **TCF/CMP Auto-Reject**: Detecteert IAB TCF v2.x omgevingen en forceert "geen consent" direct via de TCF API (`__tcfapi`).
2. **Banner Slayer (Heuristieken & Roles)**: Detecteert banners via structurele signalen, `role="dialog"`, z-index, schermdekking en safeguard keywords.
3. **Safe Force Hide**: Schakelt hardnekkige banners en hun verduisterende backdrops uit zonder de DOM-structuur te breken.
4. **Scroll Lock Herstel**: Herstelt automatisch `overflow: hidden`, `modal-open` en `no-scroll` op `<body>` en `<html>`.
5. **Network Blocking**: Blokkeert bekende tracking en consent-sync endpoints via Declarative Net Request (DNR) regels.

---

## 🆚 Vergelijking: Consent-O-Matic vs Consent Breaker

| Aspect | Consent-O-Matic | Consent Breaker |
| :--- | :--- | :--- |
| **Kernfilosofie** | **Klik-assistent**. Doet alsof een gebruiker handmatig klikt. | **Enforcement Engine**. Dwingt consent technisch af. |
| **TCF / IAB** | Klikt reject in UI. Vertrouwt op CMP. | **Directe override**. Forceert `purposes=false`, `vendors=false`. |
| **Shadow DOM** | Beperkt. | **Full Shadow DOM Support** via recursive tree walker. |
| **Verwijdering** | Vertrouwt op knop-klik. | **Safe Force-Hide** + backdrop demping als fallback. |
| **Resultaat** | Vriendelijk, faalt stilzwijgend. | Agressief, privacy-first. |

---

## 🔥 Filter Modi

- **Normal (Standaard) 🛡️**: Optimale balans tussen privacy en site-stabiliteit. Target confidence \(\ge 60\).
- **Extreme 🔨**: Maximale privacy. Snellere polling (800ms), lagere drempelwaarde (\(\ge 40\)) en automatische Safe Hide fallback voor hardnekkige banners.

---

## 🚀 Installatie (Developer Mode)

1. Clone deze repository:
   ```bash
   git clone https://github.com/parvenuprompting/consent-breaker.git
   ```
2. Open Chrome en navigeer naar `chrome://extensions/`.
3. Schakel **Developer mode** in (rechtsboven).
4. Klik **Load unpacked** en selecteer de `consent-breaker` map.

---

## 📂 Project Structuur

```
consent-breaker/
├── manifest.json           # MV3 configuratie
├── service_worker.js       # Background logic (State, DNR rules, Stats Batching)
├── storage.js              # Sync/Local storage helpers
├── content/
│   ├── bootstrap.js        # Entry point & Mode orchestration
│   ├── tcf_enforcer.js     # TCF API Overrides & Injection
│   ├── tcf_injected.js     # Page-context: Dynamic TCF String Generation
│   ├── banner_slayer.js    # Heuristic removal + Dialog Scoring & Throttling
│   ├── dom_utils.js        # Deep DOM Inspection (Shadow DOM & Safe Hide)
│   └── cmp_signatures.json # Known CMP definities
├── popup/                  # Neon Glass UI (CSS Variables System)
│   ├── popup.html
│   ├── popup.css
│   └── theme.css           # Design Tokens (Shared)
├── options/                # Options Dashboard
│   ├── options.html
│   └── options.css
└── rules/                  # Declarative Net Request (DNR) Rulesets
```

---

## 🔒 Privacy & Licentie

* ✅ Verzamelt **geen** gebruikersdata.
* ✅ Geen externe netwerkverzoeken naar derden.
* **Licentie**: [MIT License](LICENSE)
