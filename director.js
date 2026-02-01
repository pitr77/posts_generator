const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function run() {
    // 1. Load configuration
    const configPath = path.join(__dirname, 'config.json');
    if (!fs.existsSync(configPath)) {
        console.error('config.json not found! Please create one based on the template.');
        process.exit(1);
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // 2. Launch browser
    console.log('🚀 Štartujem Director Studio (Auto-Voice Mode)...');
    const browser = await chromium.launch({ headless: false });

    const { devices } = require('playwright');
    const device = config.isMobile ? devices['iPhone 12'] : {};
    const videoDir = path.join(__dirname, 'recordings');

    const context = await browser.newContext({
        ...device,
        viewport: config.viewport || device.viewport,
        recordVideo: {
            dir: videoDir,
            size: config.viewport || device.viewport
        }
    });

    const page = await context.newPage();
    const recordingStart = Date.now();

    const setupInjectedScripts = async (p, totalDuration) => {
        await p.addInitScript((totalDuration) => {
            // --- 1. Director Helpers ---
            window.Director = {
                easeInOut: (t) => 0.5 - Math.cos(Math.PI * t) / 2,
                wait: (ms) => new Promise(r => setTimeout(r, ms)),
                async getVerticalScroller() {
                    const candidates = Array.from(document.querySelectorAll("body *")).filter(el => {
                        const st = getComputedStyle(el);
                        return (st.overflowY === "auto" || st.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 50;
                    }).sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
                    return candidates[0] || document.scrollingElement || document.documentElement;
                },
                async getHorizontalScroller() {
                    const candidates = Array.from(document.querySelectorAll("body *")).filter(el => {
                        const st = getComputedStyle(el);
                        return (st.overflowX === "auto" || st.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 50;
                    }).sort((a, b) => (b.scrollWidth - b.clientWidth) - (a.scrollWidth - a.clientWidth));
                    return candidates[0] || document.scrollingElement || document.documentElement;
                },
                async getTop(s) { return (s === document.documentElement || s === document.body || s === document.scrollingElement) ? window.scrollY : s.scrollTop; },
                async getLeft(s) { return (s === document.documentElement || s === document.body || s === document.scrollingElement) ? window.scrollX : s.scrollLeft; },
                async setTop(s, y) {
                    if (s === document.documentElement || s === document.body || s === document.scrollingElement) window.scrollTo(window.scrollX, y);
                    else s.scrollTop = y;
                },
                async setLeft(s, x) {
                    if (s === document.documentElement || s === document.body || s === document.scrollingElement) window.scrollTo(x, window.scrollY);
                    else s.scrollLeft = x;
                },
                async animateScrollTo(targetX, targetY, durationMs) {
                    const sY = await this.getVerticalScroller();
                    const sX = await this.getHorizontalScroller();
                    const startX = await this.getLeft(sX);
                    const startY = await this.getTop(sY);
                    const deltaX = targetX - startX;
                    const deltaY = targetY - startY;
                    const start = performance.now();
                    return new Promise(resolve => {
                        const frame = () => {
                            const now = performance.now();
                            const t = Math.min(1, (now - start) / durationMs);
                            const eased = this.easeInOut(t);
                            if (deltaY !== 0) this.setTop(sY, startY + deltaY * eased);
                            if (deltaX !== 0) this.setLeft(sX, startX + deltaX * eased);
                            if (t < 1) requestAnimationFrame(frame);
                            else resolve();
                        };
                        requestAnimationFrame(frame);
                    });
                },
                zoom: (scale, x, y, duration) => {
                    const el = document.body;
                    el.style.transition = `transform ${duration}ms cubic-bezier(0.45, 0, 0.55, 1), transform-origin ${duration}ms cubic-bezier(0.45, 0, 0.55, 1)`;
                    if (scale === 1) {
                        el.style.transform = 'scale(1)';
                        // Reset origin after transition or keep it? Keeping it is smoother for zoom out
                        // But finding center is safer.
                        el.style.transformOrigin = '50% 50%';
                    } else {
                        el.style.transformOrigin = `${x}px ${y}px`;
                        el.style.transform = `scale(${scale})`;
                    }
                }
            };

            // --- 2. Subtitle & UI Logic ---
            const initUI = () => {
                if (document.getElementById('director-subs')) return;

                // Progress Bar
                const progress = document.createElement('div');
                progress.id = 'director-progress';
                progress.style.cssText = 'position:fixed;bottom:0;left:0;height:8px;background:linear-gradient(90deg, #ff0055, #ffcc00);z-index:999999;width:0%;transition:width 0.1s linear;';
                document.documentElement.appendChild(progress);

                // Timer
                const timer = document.createElement('div');
                timer.id = 'director-timer';
                timer.style.cssText = 'position:fixed;top:20px;right:20px;background:rgba(0,0,0,0.5);color:white;padding:5px 10px;border-radius:20px;font-family:monospace;font-size:12px;z-index:999999;backdrop-filter:blur(5px);';
                document.documentElement.appendChild(timer);

                // Subtitles
                const subs = document.createElement('div');
                subs.id = 'director-subs';
                subs.style.cssText = 'position:fixed;bottom:28%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.1);color:white;padding:12px 20px;border-radius:15px;font-family: "Outfit", system-ui, sans-serif;font-size:16px;font-weight:700;z-index:999999;display:none;text-align:center;width:75%;box-shadow:0 10px 40px rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);line-height:1.3;text-transform:uppercase;letter-spacing:0.5px;backdrop-filter:blur(10px);animation: subtitle-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);';

                const style = document.createElement('style');
                style.innerHTML = `
                    @keyframes subtitle-in { from { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.9); } to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } }
                    #director-cursor { transition: all 0.1s ease-out; }
                `;
                document.head.appendChild(style);
                document.documentElement.appendChild(subs);

                // Cursor
                const cursor = document.createElement('div');
                cursor.id = 'director-cursor';
                cursor.style.cssText = 'position:fixed;pointer-events:none;width:50px;height:50px;border-radius:50%;background:radial-gradient(circle, rgba(255,0,85,0.6) 0%, rgba(255,0,85,0) 70%);border:3px solid white;z-index:999998;display:none;box-shadow:0 0 30px rgba(255,0,85,0.5);';
                document.documentElement.appendChild(cursor);

                // Global function (attached here to ensure it's available)
                window.showSubtitle = (text, duration) => {
                    const el = document.getElementById('director-subs');
                    if (!el) return;
                    el.innerHTML = text.replace('\\n', '<br>');
                    el.style.display = 'block';
                    if (window._subtitleTimeout) clearTimeout(window._subtitleTimeout);
                    window._subtitleTimeout = setTimeout(() => { el.style.display = 'none'; }, duration);
                };

                // Sync Timer/Progress
                if (!window._timerInterval) {
                    window._timerInterval = setInterval(() => {
                        if (!window._timerStart) return;
                        const total = totalDuration * 1000;
                        const elapsed = Date.now() - window._timerStart;
                        const sec = (elapsed / 1000).toFixed(1);
                        const tEl = document.getElementById('director-timer');
                        const pEl = document.getElementById('director-progress');
                        if (tEl) tEl.innerText = `${sec}s / ${totalDuration}s`;
                        if (pEl) pEl.style.width = Math.min(100, (elapsed / total) * 100) + '%';
                    }, 50);
                }
            };

            window.Director.showHighlight = (x, y, w, h, duration = 2000) => {
                const el = document.createElement('div');
                // Use absolute positioning relative to body so it scales with zoom
                const absX = x + window.scrollX;
                const absY = y + window.scrollY;
                el.style.cssText = `position:absolute;left:${absX}px;top:${absY}px;width:${w}px;height:${h}px;border:5px solid #ff0055;border-radius:12px;box-shadow:0 0 25px rgba(255,0,85,0.6);z-index:999997;pointer-events:none;box-sizing:border-box;display:block !important;visible:visible;`;

                // Animation
                el.animate([
                    { transform: 'scale(1.1)', opacity: 0 },
                    { transform: 'scale(1)', opacity: 1 }
                ], {
                    duration: 400,
                    easing: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                    fill: 'forwards'
                });

                document.body.appendChild(el);

                setTimeout(() => {
                    const anim = el.animate([
                        { opacity: 1 },
                        { opacity: 0 }
                    ], { duration: 500, fill: 'forwards' });
                    anim.onfinish = () => el.remove();
                }, duration);
            };


            // Run on load and periodically in case of dynamic DOM wipes
            if (document.readyState === 'complete') initUI();
            else window.addEventListener('load', initUI);

            // Re-check periodically
            setInterval(initUI, 1000);
        }, totalDuration);
    };

    // 3. Pre-Production: Dry-run scenario to collect speech and timing
    console.log('🔍 Analyzujem scenár pre Auto-Voice...');
    const collectedTracks = [];
    let currentAt = 0;
    let maxTime = 0;
    const dryRunActions = {
        at: (s) => {
            currentAt = s;
            if (s > maxTime) maxTime = s;
        },
        say: (text, duration = 4000) => {
            collectedTracks.push({ text, time: currentAt, id: collectedTracks.length });
            const end = currentAt + (duration / 1000);
            if (end > maxTime) maxTime = end;
        },
        wait: (ms) => {
            const end = currentAt + (ms / 1000);
            if (end > maxTime) maxTime = end;
        },
        scroll: () => { },
        click: () => { },
        move: () => { },
        highlight: () => { },
        zoom: () => { }
    };

    const scenario = require('./scenario.js');
    await scenario.run(null, dryRunActions);

    // Dynamic duration with 2s buffer
    const dynamicDuration = Math.ceil(maxTime + 2);
    console.log(`⏱️ Zistená dĺžka scenára: ${maxTime.toFixed(1)}s (Exportujem ${dynamicDuration}s)`);

    let masterAudioPath = null;
    const recordingsDir = path.resolve(__dirname, 'recordings');
    if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir);

    if (collectedTracks.length > 0) {
        const { generateVoiceTracks } = require('./voice_engine.js');
        const generated = await generateVoiceTracks(collectedTracks, config.lang || 'en');

        console.log('🎹 Skladám master audio stopu...');
        const ffmpeg = require('ffmpeg-static');
        const { spawnSync } = require('child_process');
        masterAudioPath = path.resolve(recordingsDir, `master_${Date.now()}.mp3`);

        // Use all=1 for adelay to ensure all channels are delayed
        const filterStr = generated.map((t, i) => `[${i + 1}:a]adelay=${Math.round(t.time * 1000)}:all=1[a${i}]`).join(';');
        // amix=inputs=N will divide volume by N. We compensate later or inside here.
        // dropout_transition=0 prevents volume changes when tracks end.
        const mixStr = `[0:a]` + generated.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${generated.length + 1}:duration=longest:dropout_transition=0[out]`;

        const ffmpegArgs = [
            '-y',
            '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', // Base silence
            ...generated.flatMap(t => ['-i', path.resolve(t.filePath)]),
            '-filter_complex', `${filterStr};${mixStr}`,
            '-map', '[out]',
            '-t', (dynamicDuration + 5).toString(),
            masterAudioPath
        ];

        const res = spawnSync(ffmpeg, ffmpegArgs, { stdio: 'inherit' });
        if (res.status === 0 && fs.existsSync(masterAudioPath)) {
            console.log('✅ Master audio je pripravené.');
        } else {
            console.error('❌ FFmpeg Audio Assembly zlyhalo.');
            masterAudioPath = null;
        }
    }

    // Set up scripts to be ready on any navigation
    await setupInjectedScripts(page, dynamicDuration);

    const targetUrl = config.url || 'https://www.fplstudio.com';
    console.log(`🌐 Navigujem na ${targetUrl}...`);
    await page.goto(targetUrl);

    // 4. Manual Preparation
    console.log('\n--- 🚦 AUTO-VOICE STUDIO ---');
    console.log('1. V prehliadači si nastav scénu.');
    console.log('2. Daj ENTER pre "One-Click" produkciu.');
    console.log('----------------------------\n');

    process.stdin.resume();
    await new Promise(resolve => process.stdin.once('data', resolve));
    process.stdin.pause();

    // Reset timer on Enter
    await page.evaluate(() => { window._timerStart = Date.now(); });

    // Play Master Audio Locally
    if (masterAudioPath && fs.existsSync(masterAudioPath)) {
        const { exec } = require('child_process');
        // Použijeme dopredné lomky (/), ktoré PowerShell na Windowse bez problémov akceptuje
        const safePath = masterAudioPath.replace(/\\/g, '/');
        const psCmd = `Add-Type -AssemblyName PresentationCore; $m = New-Object System.Windows.Media.MediaPlayer; $m.Open('${safePath}'); $m.Play(); Start-Sleep -s 300`;
        exec(`powershell -windowstyle hidden -c "${psCmd}"`);
        console.log('🎵 Nahrávanie spustené (Auto-Voice aktívny)...');
    } else if (masterAudioPath) {
        console.warn('⚠️ Master audio súbor nebol nájdený pre živý náhľad.');
    }

    const scriptStartTime = (Date.now() - recordingStart) / 1000;
    const startStamp = Date.now();

    // 6. Common Helpers
    const findTarget = async (text) => {
        // Special composite targets
        // Dynamic Range: Rows_X-Y (e.g. Rows_1-3)
        const rangeMatch = text.match(/^Rows_(\d+)-(\d+)$/);
        if (rangeMatch) {
            const start = parseInt(rangeMatch[1]);
            const end = parseInt(rangeMatch[2]);
            const rStart = await findTarget(`Row_${start}`);
            const rEnd = await findTarget(`Row_${end}`);
            if (rStart && rEnd) {
                const box = {
                    x: Math.min(rStart.box.x, rEnd.box.x),
                    y: Math.min(rStart.box.y, rEnd.box.y),
                    width: Math.max(rStart.box.x + rStart.box.width, rEnd.box.x + rEnd.box.width) - Math.min(rStart.box.x, rEnd.box.x),
                    height: Math.max(rStart.box.y + rStart.box.height, rEnd.box.y + rEnd.box.height) - Math.min(rStart.box.y, rEnd.box.y)
                };
                return { box, locator: rStart.locator };
            }
        }

        // Dynamic Single: Row_X (e.g. Row_1)
        const rowMatch = text.match(/^Row_(\d+)$/);
        if (rowMatch) {
            const n = rowMatch[1];
            return findTarget(`css:tr:has-text('#${n}'), [role='row']:has-text('#${n}')`);
        }

        const aliases = {
            "Improving_Button": "Improving",
            "Worsening_Button": "Worsening",
            "Menu": "css:button i.fa-bars, .fa-bars, button[aria-label='Menu'], button:has(i.fa-bars)",
            "Defensive": "css:button:has-text('Defensive'), [role='button']:has-text('Defensive'), [role='tab']:has-text('Defensive'), a:has-text('Defensive')",
            "Form": "css:button:has-text('Form'), [role='button']:has-text('Form'), [role='tab']:has-text('Form'), a:has-text('Form')",
            "Row_1": "css:tr:has-text('#1'), [role='row']:has-text('#1')",
            "Row_2": "css:tr:has-text('#2'), [role='row']:has-text('#2')",
            "Row_3": "css:tr:has-text('#3'), [role='row']:has-text('#3')"
        };
        const target = aliases[text] || text;

        let locator;
        if (typeof target === 'string' && target.startsWith('css:')) {
            locator = page.locator(target.replace('css:', '')).first();
        } else {
            locator = page.getByText(target, { exact: false }).first();
        }

        try {
            await locator.waitFor({ state: 'visible', timeout: 3000 });
            const box = await locator.boundingBox();
            return box ? { box, locator } : null;
        } catch (e) {
            return null;
        }
    };

    const moveToElement = async (text) => {
        const res = await findTarget(text);
        if (res) {
            const { box } = res;
            const targetX = box.x + box.width / 2;
            const targetY = box.y + box.height / 2;
            await page.evaluate(({ x, y }) => {
                const c = document.getElementById('director-cursor');
                if (!c) return;
                c.style.display = 'block';
                c.style.left = (x - 25) + 'px';
                c.style.top = (y - 25) + 'px';
                setTimeout(() => { c.style.transform = 'scale(0.8)'; }, 100);
                setTimeout(() => { c.style.transform = 'scale(1)'; }, 200);
            }, { x: targetX, y: targetY });
            await page.mouse.move(targetX, targetY, { steps: 8 });
            return res;
        }
        return null;
    };

    const actions = {
        wait: (ms) => page.evaluate((ms) => window.Director.wait(ms), ms),
        scroll: (x, y, d) => page.evaluate(({ x, y, d }) => window.Director.animateScrollTo(x, y, d), { x, y, d }),
        move: async (text) => {
            await moveToElement(text);
        },
        click: async (text) => {
            const res = await moveToElement(text);
            if (res) {
                await res.locator.click({ delay: 100 });
                await page.waitForTimeout(600);
                await page.evaluate(() => {
                    const c = document.getElementById('director-cursor');
                    if (c) c.style.display = 'none';
                });
            } else {
                console.log(`ℹ️ Skipping click on "${text}" (not found/visible)`);
            }
        },
        highlight: async (text, d) => {
            const res = await findTarget(text);
            if (res) {
                const { box } = res;
                await page.evaluate(({ x, y, w, h, d }) => {
                    window.Director.showHighlight(x, y, w, h, d);
                }, { x: box.x, y: box.y, w: box.width, h: box.height, d });
            }
        },
        say: async (text, d) => {
            await page.evaluate(({ text, d }) => { window.showSubtitle(text, d); }, { text, d });
        },
        zoom: async (text, scale, duration) => {
            if (!text || text === "Reset" || scale === 1) {
                await page.evaluate(({ d }) => window.Director.zoom(1, 0, 0, d), { d: duration || 1000 });
                return;
            }
            const res = await findTarget(text);
            if (res) {
                const { box } = res;
                const centerX = box.x + box.width / 2;
                const centerY = box.y + box.height / 2;
                await page.evaluate(({ s, x, y, d }) => window.Director.zoom(s, x, y, d), { s: scale || 1.5, x: centerX, y: centerY, d: duration || 1000 });
            }
        },
        at: async (second) => {
            if (second === 0) {
                await page.evaluate(() => { document.body.style.cursor = 'none'; });
            }
            const offset = config.audioOffset || 0;
            const targetTime = second + offset;
            const elapsed = (Date.now() - startStamp) / 1000;
            const toWait = targetTime - elapsed;
            if (toWait > 0) {
                await new Promise(r => setTimeout(r, toWait * 1000));
            }
        }
    };

    // 7. Start Scenario
    try {
        console.log('🎬 Nahrávam 9:16 vertical video...');
        await scenario.run(page, actions);

        // Poistka: Počkáme, kým uplynie celá vypočítaná dĺžka videa
        await actions.at(dynamicDuration);

        console.log('✅ Scenár úspešne dokončený!');
    } catch (err) {
        console.error('❌ Chyba:', err);
    }

    const rawVideoPath = await page.video().path();
    await browser.close();

    // 8. Final Processing (9:16 CROP & SCALE)
    const finalVideoPath = path.join(__dirname, 'recordings', `auto_produced_${Date.now()}.mp4`);

    console.log(`🎬 Finálny master (1080x1920 + Auto-Voice)...`);
    const ffmpeg = require('ffmpeg-static');
    const { spawnSync } = require('child_process');

    try {
        let args = [
            '-y',
            '-ss', scriptStartTime.toFixed(3),
            '-t', dynamicDuration.toString(),
            '-i', rawVideoPath
        ];

        const audioExists = masterAudioPath && fs.existsSync(masterAudioPath);
        if (audioExists) {
            args.push('-i', masterAudioPath);
        } else {
            console.warn('⚠️ Master audio chýba, video bude bez zvuku.');
        }

        const videoFilter = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1';

        // We boost volume to counteract amix normalization, then normalize with loudnorm
        const trackCount = collectedTracks.length;
        const volumeBoost = Math.max(1, trackCount * 0.9).toFixed(1);
        const audioFilter = `volume=${volumeBoost},loudnorm`;

        args.push(
            '-vf', videoFilter,
            '-af', audioFilter,
            '-c:v', 'libx264',
            '-preset', 'slow',
            '-crf', '18',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '192k'
        );

        if (audioExists) {
            args.push('-map', '0:v:0', '-map', '1:a:0');
        } else {
            args.push('-map', '0:v:0');
        }

        args.push(finalVideoPath);

        console.log('⚙️ Generujem finálne video...');
        const result = spawnSync(ffmpeg, args, { stdio: 'inherit' });

        if (result.status === 0) {
            console.log(`\n🎉 HOTOVO! Video v TOP kvalite: ${finalVideoPath}`);
            // Cleanup temp audio
            if (fs.existsSync(path.join(__dirname, 'temp_audio'))) {
                fs.rmSync(path.join(__dirname, 'temp_audio'), { recursive: true, force: true });
            }
        } else {
            console.log(`\n❌ Spracovanie sa nepodarilo.`);
        }
    } catch (e) {
        console.error('\n❌ Neočakávaná chyba:', e);
    }
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
}).then(() => {
    process.exit(0);
});
