# 🎬 Director Studio - Scenario Guide

Tento súbor popisuje, ako písať scenáre pre **Director Studio** (`director.js`). Scenár je definovaný v súbore `scenario.json` ako pole objektov (krokov).

## ⚡ Rýchly Prehľad

Každý krok môže obsahovať kombináciu akcií. Kľúčová je vlastnosť `at`, ktorá určuje čas spustenia (v sekundách).

```json
[
  {
    "at": 0.5,
    "say": "Vitajte pri analýze...",
    "duration": 3000
  },
  {
    "at": 4.0,
    "highlight": "Rows_1-3",
    "zoom": "Rows_1-3",
    "scale": 1.2
  }
]
```

---

## 🛠️ Dostupné Akcie

### 1. ⏱️ Časovanie (`at`)
Určuje presný čas v sekundách od začiatku videa, kedy sa má krok vykonať.
- **Povinné** (pre synchronizáciu).
- Hodnoty môžu byť desatinné (napr. `10.5`).

### 2. 🗣️ Hlas a Titulky (`say`)
Vygeneruje TTS hlas a zobrazí titulky.
- `say`: Text, ktorý sa má prečítať.
- `duration`: (Voliteľné) Ako dlho sa má titulok zobraziť (v ms). Ak chýba, odhadne sa automaticky, ale odporúča sa nastaviť pre presnosť.

### 3. 🔦 Zvýrazňovanie (`highlight`)
Vytvorí červený animovaný rámček okolo elementu.
- `highlight`: Selektor elementu (pozri sekciu Selektory nižšie).
- `duration`: Trvanie zobrazenia rámčeka (ms).

**Špeciálne Selektory pre Tabuľky:**
- `"Row_N"`: Označí N-tý riadok (napr. `"Row_1"`, `"Row_5"`).
- `"Rows_X-Y"`: Označí rozsah riadkov (napr. `"Rows_1-3"` spojí riadky 1 až 3 do jedného boxu).

### 4. 🎥 Kamera a Zoom (`zoom`)
Plynulo priblíži obraz na určený element.
- `zoom`: Cieľ priblíženia (rovnaké selektory ako highlight) alebo `"Reset"`.
- `scale`: Mierka priblíženia. **Odporúčané max: `1.15`**, inak sa údaje stratia mimo obrazovky. Default: `1.15`.
- `duration`: Trvanie animácie zoomu (ms).
- **Tip:** Pre resetovanie kamery použi `"zoom": "Reset", "scale": 1`.

### 5. 🧭 Navigácia (`navigate`) - *Smart*
Automaticky nájde sekciu v menu a preklikne sa tam. Ak je menu zatvorené (napr. na mobile), script ho sám otvorí.
- `navigate`: Názov sekcie presne ako v menu (napr. `"Team Analysis"`, `"Fixtures"`).
- **Zoznam podporovaných sekcií:**
  - `Dashboard`
  - `League Table`
  - `Team Analysis`
  - `Period Analysis`
  - `Fixtures`
  - `Transfer Picks`
  - `Player Stats`
  - `Detailed Analyses`

### 6. 🖱️ Interakcia (`click`, `scroll`)
- `click`: Text alebo selektor elementu, na ktorý sa má kliknúť (napr. `"Defensive"`).
- `scroll`: Pole súradníc `[x, y]` (napr. `[0, 500]`) pre posun stránky.

---

## 🎯 Selektory Elementov

Script podporuje niekoľko spôsobov, ako nájsť element:

1.  **Text:** Nájde element obsahujúci daný text (napr. `"Liverpool"`).
2.  **Aliasy:** Preddefinované skratky (v `director.js`):
    - `"Defensive"`, `"Attacking"`, `"Form"` (tlačidlá/taby).
    - `"Row_N"`, `"Rows_X-Y"` (riadky tabuľky).
3.  **CSS:** Prefix `css:` pre priame CSS selektory.
    - Príklad: `"css:.team-name"` alebo `"css:button[aria-label='Menu']"`.

---

## 💡 Tipy pre "Viral" Kvalitu

1.  **Zoom + Highlight:** Kombinuj ich pre maximálny efekt.
    ```json
    { "at": 10, "zoom": "Rows_1-3", "scale": 1.15, "highlight": "Rows_1-3", "duration": 3000 }
    ```
2.  **Resetuj Zoom:** Nezabudni vrátiť kameru späť (`"zoom": "Reset"`), inak divák stratí kontext.
3.  **Jemný Zoom:** Pre tabuľky stačí `scale: 1.1` až `1.2`. Väčší zoom (1.5+) je dobrý len na detaily jedného riadku.
4.  **Plynulosť:** Uisti sa, že `duration` pre titulky (`say`) je dostatočne dlhé, aby sa text stihol prečítať.
