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
        deviceScaleFactor: 2, // Stable high quality
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
                subs.style.cssText = 'position:fixed;bottom:10%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:white;padding:12px 20px;border-radius:18px;font-family: "Outfit", system-ui, sans-serif;font-size:18px;font-weight:700;z-index:999999;display:none;text-align:center;width:82%;box-shadow:0 15px 50px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.15);line-height:1.4;letter-spacing:0.3px;backdrop-filter:blur(20px);animation: subtitle-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);';

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
                // Add padding to make it wider/higher
                const paddingX = 15;
                const paddingY = 8;
                el.style.cssText = `position:absolute;left:${absX - paddingX}px;top:${absY - paddingY}px;width:${w + paddingX * 2}px;height:${h + paddingY * 2}px;border:6px solid #ff0055;border-radius:16px;box-shadow:0 0 30px rgba(255,0,85,0.7);z-index:999997;pointer-events:none;box-sizing:border-box;display:block !important;visible:visible;`;

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
        move: () => { },
        highlight: () => { },
        zoom: () => { },
        navigate: () => { }
    };

    const scenario = require('./scenario.js');
    await scenario.run(null, dryRunActions, 'main');

    // Dynamic duration with 2s buffer
    const dynamicDuration = Math.ceil(maxTime + 2);
    console.log(`⏱️ Zistená dĺžka scenára: ${maxTime.toFixed(1)}s (Exportujem ${dynamicDuration}s)`);

    let masterAudioPath = null;
    const recordingsDir = path.resolve(__dirname, 'recordings');
    if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir);

    if (collectedTracks.length > 0) {
        const { generateVoiceTracks } = require('./voice_engine.js');
        const generated = await generateVoiceTracks(collectedTracks, config.lang || 'en', config);

        console.log('🎹 Skladám master audio stopu...');
        const ffmpeg = require('ffmpeg-static');
        const { spawnSync } = require('child_process');
        masterAudioPath = path.resolve(recordingsDir, `master_${Date.now()}.mp3`);

        const musicFile = config.background_music && fs.existsSync(path.resolve(__dirname, config.background_music))
            ? path.resolve(__dirname, config.background_music)
            : null;

        // Base silence source
        const inputs = ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'];
        generated.forEach(t => inputs.push('-i', path.resolve(t.filePath)));

        // Voice delay filters
        const voiceFilters = generated.map((t, i) => `[${i + 1}:a]adelay=${Math.round(t.time * 1000)}:all=1[a${i}]`).join(';');

        // Mix voices first
        const voiceMixStr = generated.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${generated.length}:duration=longest:dropout_transition=0[v_mixed]`;

        let filterStr = `${voiceFilters};${voiceMixStr}`;
        let finalOutputTag = '[v_mixed]';

        // Add music if available
        if (musicFile) {
            inputs.push('-stream_loop', '-1', '-i', musicFile);
            const musicIdx = generated.length + 1;
            const musicVol = config.music_volume || 0.1;
            filterStr += `;[${musicIdx}:a]volume=${musicVol}[bg_music];[v_mixed][bg_music]amix=inputs=2:duration=first:dropout_transition=0[out]`;
            finalOutputTag = '[out]';
        }

        const ffmpegArgs = [
            '-y',
            ...inputs,
            '-filter_complex', filterStr,
            '-map', finalOutputTag,
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

    // 4. Manual Preparation MOVED DOWN

    // Audio playback logic moved to Step 7

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
            "Menu": "css:button:has(.lucide-menu), .lucide-menu, button i.fa-bars, .fa-bars, [aria-label='Toggle navigation'], .navbar-toggler, button:has(svg path[d*='M4 6h16']), button:has(svg), [data-testid='menu-button'], nav button",
            "Defensive": "css:button:has-text('Defensive'), [role='button']:has-text('Defensive'), [role='tab']:has-text('Defensive'), a:has-text('Defensive')",
            "Form": "css:button:has-text('Form'), [role='button']:has-text('Form'), [role='tab']:has-text('Form'), a:has-text('Form')",
            "Row_1": "css:tr:has-text('#1'), [role='row']:has-text('#1')",
            "Row_2": "css:tr:has-text('#2'), [role='row']:has-text('#2')",
            "Row_3": "css:tr:has-text('#3'), [role='row']:has-text('#3')"
        };
        const target = aliases[text] || text;

        let locator;
        if (typeof target === 'string' && target.startsWith('css:')) {
            locator = page.locator(target.replace('css:', ''));
        } else {
            locator = page.getByText(target, { exact: false });
        }

        try {
            // Iterate to find the first VISIBLE one
            const count = await locator.count();
            for (let i = 0; i < count; ++i) {
                const candidate = locator.nth(i);
                if (await candidate.isVisible()) {
                    const box = await candidate.boundingBox();
                    if (box) return { box, locator: candidate };
                }
            }

            // Fallback: if none are strictly visible right now, maybe wait for the first one?
            // But if we are here, it means we didn't find any visible one.
            // Let's rely on standard wait for the first one as a backup, 
            // incase it's a timing issue and it will BECOME visible.
            const first = locator.first();
            await first.waitFor({ state: 'visible', timeout: 3000 });
            const box = await first.boundingBox();
            return box ? { box, locator: first } : null;

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
                c.style.transform = 'scale(1.5)';
                setTimeout(() => { c.style.transform = 'scale(1)'; }, 300);
            }, { x: targetX, y: targetY });
            await page.mouse.move(targetX, targetY, { steps: 12 });
            await page.waitForTimeout(1000); // Wait 1s before click/action while showing cursor
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
                await page.evaluate(() => {
                    const c = document.getElementById('director-cursor');
                    if (c) {
                        c.style.transform = 'scale(0.8)';
                        setTimeout(() => { c.style.display = 'none'; }, 800);
                    }
                });
                await res.locator.click({ delay: 100 }).catch(() => res.locator.click({ force: true }));
                await page.waitForTimeout(800);
            } else {
                console.log(`ℹ️ Skipping click on "${text}" (not found/visible)`);
            }
        },
        highlight: async (text, d) => {
            const res = await findTarget(text);
            if (res) {
                const { box, locator } = res;

                // Calculate absolute Y coordinate
                const scrollY = await page.evaluate(() => window.scrollY);
                const absoluteY = box.y + scrollY;

                // Target Y: place element at ~25% from the top of viewport to keep it visible above subtitles
                const targetY = Math.max(0, absoluteY - 230);

                // Natural smooth scroll
                await page.evaluate(({ y }) => window.Director.animateScrollTo(0, y, 900), { y: targetY });
                await page.waitForTimeout(1000);

                // Re-fetch box after scroll
                const finalBox = await locator.boundingBox() || box;

                await page.evaluate(({ x, y, w, h, d }) => {
                    window.Director.showHighlight(x, y, w, h, d);
                }, { x: finalBox.x, y: finalBox.y, w: finalBox.width, h: finalBox.height, d });
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
                const viewportCenterX = 195;
                const centerY = box.y + box.height / 2;
                await page.evaluate(({ s, x, y, d }) => window.Director.zoom(s, x, y, d), { s: scale || 1.15, x: viewportCenterX, y: centerY, d: duration || 1000 });
            }
        },
        navigate: async (text) => {
            console.log(`🧭 Navigating to: "${text}"`);

            const findVisibleLink = async () => {
                const locator = page.getByText(text, { exact: false });
                const count = await locator.count();
                // console.log(`   found ${count} potential links for "${text}"`);
                for (let i = 0; i < count; ++i) {
                    const l = locator.nth(i);
                    if (await l.isVisible()) return l;
                }
                return null;
            };

            const performClick = async (link) => {
                try {
                    await link.click({ force: true, timeout: 2000 });
                    return true;
                } catch (e) {
                    console.log(`   ⚠️ Click failed: ${e.message}`);
                    return false;
                }
            };

            let link = await findVisibleLink();

            // 1. Try to click if found immediately
            if (link) {
                console.log("   found candidate link, trying to click...");
                if (await performClick(link)) {
                    await page.waitForTimeout(1000);
                    return;
                }
                console.log("   ❌ Direct click failed, assuming menu needs opening...");
            } else {
                console.log(`   Link not visible, attempting to open menu...`);
            }

            // 2. Open Menu
            let menuRes = await findTarget("Menu");
            if (!menuRes) {
                console.log("   ⚠️ Standard Menu alias failed, trying direct .lucide-menu selector...");
                const fallback = page.locator('.lucide-menu, button:has(.lucide-menu)').first();
                if (await fallback.count() > 0) menuRes = { locator: fallback };
            }

            if (menuRes) {
                console.log("   ✅ Menu button found, clicking...");
                await menuRes.locator.click({ force: true });
                await page.waitForTimeout(1500);
                link = await findVisibleLink();
            } else {
                console.error("   ❌ CRITICAL: Could not find Menu button!");
            }

            // 3. Click again
            if (link) {
                console.log("   ✅ Target link found (in menu), clicking...");
                if (!await performClick(link)) {
                    console.error("   ❌ Click failed again. Forcing click on first match...");
                    try {
                        await page.getByText(text, { exact: false }).first().click({ force: true, timeout: 2000 });
                    } catch (e) { console.error("   ❌ Forced click failed."); }
                } else {
                    await page.waitForTimeout(1000);
                }
            } else {
                console.error("   ❌ FAILED: Link still not visible even after menu open");
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

    let startStamp = Date.now();
    let scriptStartTime = 0;

    // 6. Setup Phase & User Prompt
    try {
        console.log('🏗️ Spúšťam SETUP fázu (navigácia)...');
        startStamp = Date.now(); // Initialize for setup timing
        await scenario.run(page, actions, 'setup');
    } catch (e) {
        console.error("Setup failed (continuing to prompt):", e);
    }

    console.log('\n--- 🚦 AUTO-VOICE STUDIO (Auto-Proceed) ---');
    console.log('Automating start in 2 seconds...');
    await new Promise(r => setTimeout(r, 2000));

    // Start Recording Markers
    scriptStartTime = (Date.now() - recordingStart) / 1000;
    startStamp = Date.now();

    // Reset timer
    await page.evaluate(() => { window._timerStart = Date.now(); });


    // Play Master Audio Locally
    if (masterAudioPath && fs.existsSync(masterAudioPath)) {
        const { exec } = require('child_process');
        const safePath = masterAudioPath.replace(/\\/g, '/');
        const psCmd = `Add-Type -AssemblyName PresentationCore; $m = New-Object System.Windows.Media.MediaPlayer; $m.Open('${safePath}'); $m.Play(); Start-Sleep -s 300`;
        exec(`powershell -windowstyle hidden -c "${psCmd}"`);
        console.log('🎵 Nahrávanie spustené (Auto-Voice aktívny)...');
    }

    // 7. Start Scenario (Main Recording)
    try {
        console.log('🎬 Nahrávam 9:16 vertical video...');
        await scenario.run(page, actions, 'main');

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
            '-tune', 'stillimage',
            '-crf', '10', // Near-lossless quality
            '-profile:v', 'high',
            '-level', '4.2',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '320k',
            '-ar', '48000'
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
