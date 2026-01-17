/**
 * DIRECTOR STUDIO - ULTIMATE CONSOLE VERSION
 * Copy and paste this into your Chrome console.
 */
(() => {
    // Styles for the UI
    const style = document.createElement('style');
    style.innerHTML = `
    #director-ui {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 300px;
      background: rgba(15, 15, 15, 0.9);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      color: white;
      font-family: 'Inter', system-ui, sans-serif;
      z-index: 1000000;
      padding: 20px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      user-select: none;
      transition: all 0.3s ease;
    }
    #director-ui h2 { margin: 0 0 10px 0; font-size: 16px; color: #00ffcc; text-transform: uppercase; letter-spacing: 1px; }
    #director-ui p { font-size: 12px; color: #aaa; margin-bottom: 20px; }
    .director-btn {
      background: #00ffcc;
      color: #000;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      font-weight: bold;
      cursor: pointer;
      width: 100%;
      transition: transform 0.1s;
    }
    .director-btn:active { transform: scale(0.98); }
    .director-btn:hover { background: #00e6b8; }
    .director-btn.stop { background: #ff4d4d; color: white; margin-top: 10px; display: none; }
    #director-status { font-family: monospace; font-size: 11px; margin-top: 15px; color: #888; height: 40px; overflow: hidden; }
    #director-cursor {
      position: fixed;
      pointer-events: none;
      width: 24px;
      height: 24px;
      background: rgba(0, 255, 204, 0.4);
      border: 2px solid white;
      border-radius: 50%;
      z-index: 1000001;
      display: none;
      transition: all 0.2s cubic-bezier(0.165, 0.84, 0.44, 1);
      box-shadow: 0 0 15px rgba(0, 255, 204, 0.6);
    }
    #director-countdown {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 120px;
      font-weight: 900;
      color: white;
      text-shadow: 0 0 50px rgba(0,0,0,1);
      z-index: 2000000;
      pointer-events: none;
      display: none;
    }
  `;
    document.head.appendChild(style);

    // UI Components
    const ui = document.createElement('div');
    ui.id = 'director-ui';
    ui.innerHTML = `
    <h2>Director Studio</h2>
    <p>Pripravte si nahrávanie a stlačte Štart.</p>
    <button id="director-start" class="director-btn">ŠTART SCENÁR</button>
    <button id="director-stop" class="director-btn stop">ZASTAVIŤ</button>
    <div id="director-status">Pripravený...</div>
  `;
    document.body.appendChild(ui);

    const cursor = document.createElement('div');
    cursor.id = 'director-cursor';
    document.body.appendChild(cursor);

    const countdownEl = document.createElement('div');
    countdownEl.id = 'director-countdown';
    document.body.appendChild(countdownEl);

    const statusEl = document.getElementById('director-status');
    const startBtn = document.getElementById('director-start');
    const stopBtn = document.getElementById('director-stop');

    let isRunning = false;

    const log = (msg) => {
        statusEl.innerHTML = msg;
        console.log(`[Director] ${msg}`);
    };

    // Logic Helpers
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const easeInOut = (t) => 0.5 - Math.cos(Math.PI * t) / 2;

    const getScroller = () => {
        const candidates = Array.from(document.querySelectorAll("body *"))
            .filter(el => {
                const st = getComputedStyle(el);
                return (st.overflowY === "auto" || st.overflowY === "scroll") &&
                    el.scrollHeight > el.clientHeight + 50;
            })
            .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
        return candidates[0] || document.scrollingElement || document.documentElement;
    };

    const getTop = (s) => (s === document.documentElement || s === document.body || s === document.scrollingElement) ? window.scrollY : s.scrollTop;
    const setTop = (s, y) => {
        if (s === document.documentElement || s === document.body || s === document.scrollingElement) window.scrollTo(0, y);
        else s.scrollTop = y;
    };

    async function animateScrollTo(targetY, durationMs) {
        const scroller = getScroller();
        const startY = getTop(scroller);
        const delta = targetY - startY;
        const start = performance.now();

        return new Promise(resolve => {
            const frame = (now) => {
                if (!isRunning) return resolve();
                const t = Math.min(1, (now - start) / durationMs);
                setTop(scroller, startY + delta * easeInOut(t));
                if (t < 1) requestAnimationFrame(frame);
                else resolve();
            };
            requestAnimationFrame(frame);
        });
    }

    function moveCursor(el) {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        cursor.style.display = 'block';
        cursor.style.left = (rect.left + rect.width / 2 - 12) + 'px';
        cursor.style.top = (rect.top + rect.height / 2 - 12) + 'px';
        cursor.style.transform = 'scale(1.5)';
        setTimeout(() => { cursor.style.transform = 'scale(1)'; }, 200);
    }

    function clickByText(text) {
        const wanted = text.trim().toUpperCase();
        const pool = [
            ...document.querySelectorAll("button"),
            ...document.querySelectorAll("[role='button']"),
            ...document.querySelectorAll("a"),
            ...document.querySelectorAll("span"),
            ...document.querySelectorAll("div"),
        ];

        const el = pool.find(e => {
            if (e.children.length > 0 && Array.from(e.children).some(c => c.textContent.trim().toUpperCase() === wanted)) return false;
            return (e.textContent || "").trim().toUpperCase() === wanted;
        });

        if (!el) {
            log("⚠️ Nenájdené: " + text);
            return false;
        }

        moveCursor(el);
        el.click();
        log("🖱️ Klik: " + text);
        return true;
    }

    // ---------- THE SCENARIO RUNNER ----------
    async function runScenario() {
        isRunning = true;
        startBtn.style.display = 'none';
        stopBtn.style.display = 'block';
        ui.style.opacity = '0.3'; // Fade out during recording

        // Countdown
        countdownEl.style.display = 'block';
        for (let i = 3; i > 0; i--) {
            countdownEl.innerText = i;
            await wait(1000);
            if (!isRunning) break;
        }
        countdownEl.style.display = 'none';

        if (!isRunning) return;

        // --- YOUR AI SCENARIO START ---

        // Intro
        log("🎬 Štartujem...");
        await animateScrollTo(0, 600);
        await wait(2400);

        const roundTrip = async (label, downY) => {
            if (!isRunning) return;
            clickByText(label);
            await wait(1400);
            if (!isRunning) return;
            await animateScrollTo(downY, 2000);
            await wait(1000);
            if (!isRunning) return;
            await animateScrollTo(0, 1600);
            await wait(800);
        };

        // AI generated calls:
        await roundTrip("DEF", 900);
        await roundTrip("MID", 900);
        await roundTrip("FWD", 900);

        // Outro
        if (isRunning) {
            log("🎬 Končím...");
            await wait(800);
            await animateScrollTo(350, 1200);
            await wait(600);
            await animateScrollTo(0, 1800);
            await wait(900);
        }

        // --- YOUR AI SCENARIO END ---

        stopScenario();
    }

    function stopScenario() {
        isRunning = false;
        startBtn.style.display = 'block';
        stopBtn.style.display = 'none';
        ui.style.opacity = '1';
        cursor.style.display = 'none';
        log("Hotovo.");
    }

    startBtn.onclick = runScenario;
    stopBtn.onclick = stopScenario;

    log("Director pripravený.");
})();
