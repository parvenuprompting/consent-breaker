# 🛡️ Consent Breaker

Chrome Extension (Manifest V3) die automatisch cookie consent banners weigert. Focus op TCF/IAB CMP's en custom banners met minimale site-breakage.

## Wat doet deze extensie?

1. **TCF/CMP Auto-Reject**: Detecteert IAB TCF v2.x omgevingen en forceert "geen consent" via de TCF API
2. **Banner Slayer**: Verwijdert consent overlays via heuristieken (structural signals > tekst keywords)
3. **Network Blocking**: Blokkeert bekende tracking en consent-sync endpoints (conservatief)
4. **Per-site Control**: Allowlist om sites uit te sluiten van de extensie

## Installatie

1. Download of clone deze repository
2. Open Chrome en ga naar `chrome://extensions/`
3. Schakel "Developer mode" in (rechtsboven)
4. Klik "Load unpacked" en selecteer de `consent-breaker` map
5. De extensie is nu actief

## Gebruik

### Instellingen openen
- Klik rechts op het extensie-icoon → "Options"
- Of via `chrome://extensions/` → Consent Breaker → "Details" → "Extension options"

### Site uitsluiten (allowlist)
1. Ga naar de Options pagina
2. Voer het domein in (bijv. `voorbeeld.nl`)
3. Klik "Toevoegen"
4. De extensie is nu uitgeschakeld op die site

### Debug mode
- Schakel "Debug modus" in via Options
- Open DevTools (F12) → Console
- Je ziet nu logs van alle acties

## Beperkingen (Known Limitations)

| Situatie | Reden | Workaround |
|----------|-------|------------|
| Server-side consent | Niet mogelijk te overriden via client | Geen |
| Anti-automation detectie | Sommige CMPs detecteren snelle clicks | Voeg site toe aan allowlist |
| Paywall + consent combo | Niet altijd te onderscheiden | Voeg site toe aan allowlist |
| Sommige custom banners | Te uniek voor heuristieken | Meld het via GitHub issues |

## Architectuur

```
consent-breaker/
├── manifest.json           # MV3 configuratie
├── service_worker.js       # Background service worker
├── storage.js              # Chrome storage wrapper
├── content/
│   ├── bootstrap.js        # Entry point, orchestratie
│   ├── tcf_enforcer.js     # TCF detectie + injectie management
│   ├── tcf_injected.js     # Page context TCF override
│   ├── banner_slayer.js    # Heuristische banner removal
│   ├── dom_utils.js        # DOM helpers
│   └── cmp_signatures.json # CMP provider database
├── rules/
│   ├── dnr_rules_tracking.json     # Ad/tracking blocklist
│   └── dnr_rules_consent_sync.json # Consent sync blocklist
├── options/
│   ├── options.html
│   ├── options.css
│   └── options.js
└── docs/
    ├── README.md
    └── TESTING.md
```

## Privacy

Deze extensie:
- ✅ Verzamelt **geen** gebruikersdata
- ✅ Maakt **geen** externe verbindingen
- ✅ Slaat alleen lokale instellingen op (chrome.storage.sync)
- ✅ Is volledig open source

## Troubleshooting

### Banner verdwijnt niet
1. Schakel Debug mode in
2. Open DevTools Console
3. Check of de site een bekende CMP gebruikt
4. Check of de site in de allowlist staat

### Site werkt niet goed
1. Voeg site toe aan allowlist
2. Reload de pagina
3. Meld het probleem via GitHub issues

### Extensie werkt helemaal niet
1. Check of "Extensie actief" aan staat in Options
2. Herlaad de extensie via `chrome://extensions/`
3. Check de Service Worker logs in DevTools

## Licentie

MIT License
