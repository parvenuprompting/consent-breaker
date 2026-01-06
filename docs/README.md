# 🛡️ Consent Breaker

**Consent enforcement engine for Chrome.**
Automatisch cookie consent banners weigeren door technisch in te grijpen op TCF/CMP API's en DOM-niveau.

## Wat doet deze extensie?

1.  **TCF/CMP Auto-Reject**: Detecteert IAB TCF v2.x omgevingen en forceert "geen consent" direct via de TCF API (`__tcfapi`). Override `purposes`, `vendors` en `legitimateInterests` naar `false`.
2.  **Banner Slayer**: Verwijdert consent overlays via heuristieken (structural signals > tekst keywords) en "Banner Slaying" logica.
3.  **Network Blocking**: Blokkeert bekende tracking en consent-sync endpoints als fallback.
4.  **Per-site Control**: Granulaire controle per site via pop-up (Normal/Extreme modes).

---

## 🆚 Filosofie & Vergelijking

Consent Breaker is fundamenteel anders dan tools zoals **Consent-O-Matic**.

| Aspect | Consent-O-Matic | Consent Breaker |
| :--- | :--- | :--- |
| **Kernfilosofie** | **Klik-assistent**. Doet alsof een brave gebruiker klikt. | **Enforcement Engine**. Dwingt consent technisch af. |
| **Aanpak** | Volgt de UX-flow van de CMP. Zoekt "Reject" knoppen via regels. | Negeert UX. Overschrijft TCF API's. Sloopt banners. |
| **TCF / IAB** | Klikt reject in UI. Vertrouwt erop dat CMP correct data stuurt. | **Directe override**. Forceert `purposes=false`, `vendors=false`. CMP-UX is irrelevant. |
| **Custom Banners** | Werkt nauwelijks zonder specifieke regels. | **Heuristieken**. Slayt banners o.b.v. overlay, z-index, keywords. |
| **Fallback** | Geen. Als CMP faalt, gebeurt tracking alsnog. | **Network Blocking**. Blokkeert tracking endpoints als vangnet. |
| **Resultaat** | Vriendelijk, faalt stilzwijgend. | Agressief, privacy-first. |

### Waarom Consent Breaker "anders" voelt
Consent Breaker gaat tegen de intentie van CMP's (Consent Management Platforms) in. Het breekt "dark patterns" en dwingt privacy af waar anderen volgen. Dit vereist soms een **Extreme Mode** voor hardnekkige sites, wat de UX kan beïnvloeden. Dit is een architecturale keuze voor privacy boven esthetiek.

---

## 🔥 Filter Modi

De extensie heeft twee hoofdniveaus, instelbaar per site of globaal:

### 1. Normal (Standaard) 🛡️
*   **Focus**: Stabiliteit & UX.
*   **Gedrag**: Probeert netjes te weigeren via TCF overrides en bekende knoppen ("Alles weigeren").
*   **Banner Removal**: Alleen bij hoge zekerheid (confidence ≥ 60).
*   **Netwerk**: Conservatief blokkeren.

### 2. Extreme 🔨
*   **Focus**: Privacy & Snelheid.
*   **Gedrag**: Neemt aan dat TCF faalt. Verwijdert banners direct.
*   **Banner Removal**: Agressief (confidence ≥ 40).
*   **Netwerk**: Blokkeert extra tracking & consent-sync endpoints.
*   *Let op: Kan embeds (Youtube, Twitter) of andere site-functies breken.*

---

## 🛠 Gebruik

### Popup Menu (v2)
Klik op het icoon in de werkbalk voor snelle bediening:
*   **Effective Mode**: Zie direct welke bescherming actief is.
*   **Override**: Forceer "Normal" of "Extreme" voor de huidige site.
*   **Status Block**: Zie wat de extensie net gedaan heeft (e.g. "✓ TCF Rejected").
*   **Escalate**: Eén klik om op te schalen naar Extreme als een banner blijft hangen.
*   **Disable**: Noodrem om de extensie op de site uit te schakelen.

### Instellingen
Via "More Settings" kom je in het uitgebreide beheerpaneel:
*   **Global Default**: Stel het standaardgedrag in voor alle sites.
*   **Allowlist**: Beheer uitzonderingen.
*   **Advanced**:
    *   *Block Consent Sync*: Voorkom dat CMPs voorkeuren delen tussen domeinen.
    *   *Assume Reject*: Forceer verwijdering als TCF override faalt (Extreme behavior in Normal mode).

---

## Installatie (Developer Mode)

1.  Download of clone deze repository.
2.  Open Chrome en ga naar `chrome://extensions/`.
3.  Schakel "Developer mode" in (rechtsboven).
4.  Klik "Load unpacked" en selecteer de `consent-breaker` map.

---

## Architectuur

```
consent-breaker/
├── manifest.json           # MV3 configuratie
├── service_worker.js       # Background logic (State, DNR rules, Reporting)
├── content/
│   ├── bootstrap.js        # Entry point & Mode orchestration
│   ├── tcf_enforcer.js     # TCF API Overrides & Injection
│   ├── tcf_injected.js     # Page-context script
│   ├── banner_slayer.js    # Heuristic removal logic
│   └── cmp_signatures.json # Known CMP definities
├── rules/                  # Declarative Net Request Rulesets
│   ├── dnr_rules_tracking_normal.json
│   ├── dnr_rules_tracking_extreme.json
│   └── ...
└── popup/                  # v2 UI met Status Reporting
```

## Privacy & Licentie
*   ✅ Verzamelt **geen** gebruikersdata.
*   ✅ Geen externe calls.
*   MIT License.
