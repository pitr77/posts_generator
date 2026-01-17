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

    const injectSubtitles = async (p) => {
        await p.evaluate(() => {
            if (document.getElementById('director-subs')) return;

            // Premium Progress Bar
            const progress = document.createElement('div');
            progress.id = 'director-progress';
            progress.style.cssText = 'position:fixed;bottom:0;left:0;height:8px;background:linear-gradient(90deg, #ff0055, #ffcc00);z-index:999999;width:0%;transition:width 0.1s linear;';
            document.documentElement.appendChild(progress);

            // Timer (Small & Sleek)
            const timer = document.createElement('div');
            timer.id = 'director-timer';
            timer.style.cssText = 'position:fixed;top:20px;right:20px;background:rgba(0,0,0,0.5);color:white;padding:5px 10px;border-radius:20px;font-family:monospace;font-size:12px;z-index:999999;backdrop-filter:blur(5px);';
            document.documentElement.appendChild(timer);
            window._timerStart = Date.now();
            setInterval(() => {
                const total = 30000;
                const elapsed = Date.now() - window._timerStart;
                const sec = (elapsed / 1000).toFixed(1);
                timer.innerText = `${sec}s / 30s`;
                progress.style.width = Math.min(100, (elapsed / total) * 100) + '%';
            }, 50);

            // Premium Subtitles (Sleek & Subtle)
            const subs = document.createElement('div');
            subs.id = 'director-subs';
            subs.style.cssText = 'position:fixed;bottom:12%;left:50%;transform:translateX(-50%);background:rgba(20,20,20,0.6);color:white;padding:12px 24px;border-radius:15px;font-family: "Outfit", system-ui, sans-serif;font-size:20px;font-weight:700;z-index:999999;display:none;text-align:center;width:80%;box-shadow:0 10px 40px rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);line-height:1.2;text-transform:uppercase;letter-spacing:0.5px;backdrop-filter:blur(8px);animation: subtitle-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);';

            const style = document.createElement('style');
            style.innerHTML = `
                @keyframes subtitle-in { from { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.9); } to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } }
                html, body, * { cursor: none !important; }
                #director-cursor { transition: all 0.1s ease-out; }
            `;
            document.head.appendChild(style);
            document.documentElement.appendChild(subs);

            // Premium Cursor
            const cursor = document.createElement('div');
            cursor.id = 'director-cursor';
            cursor.style.cssText = 'position:fixed;pointer-events:none;width:50px;height:50px;border-radius:50%;background:radial-gradient(circle, rgba(255,0,85,0.6) 0%, rgba(255,0,85,0) 70%);border:3px solid white;z-index:999998;display:none;box-shadow:0 0 30px rgba(255,0,85,0.5);';
            document.documentElement.appendChild(cursor);

            window.showSubtitle = (text, duration) => {
                const el = document.getElementById('director-subs');
                el.innerHTML = text.replace('\\n', '<br>');
                el.style.display = 'block';
                if (window._subtitleTimeout) clearTimeout(window._subtitleTimeout);
                window._subtitleTimeout = setTimeout(() => { el.style.display = 'none'; }, duration);
            };
        });
    };

    // 3. Pre-Production: Dry-run scenario to collect speech and timing
    console.log('🔍 Analyzujem scenár pre Auto-Voice...');
    const collectedTracks = [];
    let currentAt = 0;
    const dryRunActions = {
        at: (s) => { currentAt = s; },
        say: (text) => { collectedTracks.push({ text, time: currentAt, id: collectedTracks.length }); },
        wait: () => { },
        scroll: () => { },
        click: () => { }
    };

    const scenario = require('./scenario.js');
    await scenario.run(null, dryRunActions);

    let masterAudioPath = null;
    if (collectedTracks.length > 0) {
        const { generateVoiceTracks } = require('./voice_engine.js');
        const generated = await generateVoiceTracks(collectedTracks, config.lang || 'en');

        console.log('🎹 Skladám master audio stopu...');
        const ffmpeg = require('ffmpeg-static');
        const { spawnSync } = require('child_process');
        masterAudioPath = path.join(__dirname, 'recordings', `master_${Date.now()}.mp3`);

        const filterStr = generated.map((t, i) => `[${i + 1}:a]adelay=${(t.time * 1000).toFixed(0)}|${(t.time * 1000).toFixed(0)}[a${i}]`).join(';');
        const mixStr = generated.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${generated.length}:duration=longest[out]`;

        const ffmpegArgs = [
            '-y',
            '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
            ...generated.flatMap(t => ['-i', t.filePath]),
            '-filter_complex', `${filterStr};${mixStr}`,
            '-map', '[out]',
            '-t', '35',
            masterAudioPath
        ];

        spawnSync(ffmpeg, ffmpegArgs, { stdio: 'inherit' });
    }

    console.log(`🌐 Navigujem na ${config.url}...`);
    await page.goto(config.url);
    await injectSubtitles(page);

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
    if (masterAudioPath) {
        const { exec } = require('child_process');
        const fullAudioPath = path.resolve(__dirname, masterAudioPath);
        const psCmd = `Add-Type -AssemblyName PresentationCore; $m = New-Object System.Windows.Media.MediaPlayer; $m.Open('${fullAudioPath}'); $m.Play(); Start-Sleep -s 300`;
        exec(`powershell -windowstyle hidden -c "${psCmd}"`);
        console.log('🎵 Nahrávanie spustené (Auto-Voice aktívny)...');
    }

    const scriptStartTime = (Date.now() - recordingStart) / 1000;
    const startStamp = Date.now();

    // 6. Common Helpers
    const actions = {
        wait: (ms) => page.evaluate((ms) => window.Director.wait(ms), ms),
        scroll: (y, d) => page.evaluate(({ y, d }) => window.Director.animateScrollTo(y, d), { y, d }),
        click: async (text) => {
            const locator = page.getByText(text, { exact: false }).first();
            try {
                await locator.waitFor({ state: 'visible', timeout: 5000 });
                const box = await locator.boundingBox();
                if (box) {
                    await page.evaluate(({ x, y }) => {
                        const c = document.getElementById('director-cursor');
                        c.style.display = 'block';
                        c.style.left = (x - 25) + 'px';
                        c.style.top = (y - 25) + 'px';
                        setTimeout(() => { c.style.transform = 'scale(0.8)'; }, 100);
                        setTimeout(() => { c.style.transform = 'scale(1)'; }, 200);
                    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
                    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
                    await locator.click({ delay: 100 });
                    await page.waitForTimeout(500);
                    await page.evaluate(() => { document.getElementById('director-cursor').style.display = 'none'; });
                }
            } catch (e) {
                await locator.click({ delay: 100 });
            }
        },
        say: async (text, d) => {
            await page.evaluate(({ text, d }) => { window.showSubtitle(text, d); }, { text, d });
        },
        at: async (second) => {
            const offset = config.audioOffset || 0;
            const targetTime = second + offset;
            const elapsed = (Date.now() - startStamp) / 1000;
            const toWait = targetTime - elapsed;
            if (toWait > 0) {
                await new Promise(r => setTimeout(r, toWait * 1000));
            }
        }
    };

    // Scroller logic
    await page.evaluate(() => {
        window.Director = {
            easeInOut: (t) => 0.5 - Math.cos(Math.PI * t) / 2,
            wait: (ms) => new Promise(r => setTimeout(r, ms)),
            async getScroller() {
                const candidates = Array.from(document.querySelectorAll("body *")).filter(el => {
                    const st = getComputedStyle(el);
                    return (st.overflowY === "auto" || st.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 50;
                }).sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight));
                return candidates[0] || document.scrollingElement || document.documentElement;
            },
            async getTop(s) { return (s === document.documentElement || s === document.body || s === document.scrollingElement) ? window.scrollY : s.scrollTop; },
            async setTop(s, y) { if (s === document.documentElement || s === document.body || s === document.scrollingElement) window.scrollTo(0, y); else s.scrollTop = y; },
            async animateScrollTo(targetY, durationMs) {
                const s = await this.getScroller();
                const startY = await this.getTop(s);
                const delta = targetY - startY;
                const start = performance.now();
                return new Promise(resolve => {
                    const frame = () => {
                        const now = performance.now();
                        const t = Math.min(1, (now - start) / durationMs);
                        this.setTop(s, startY + delta * this.easeInOut(t));
                        if (t < 1) requestAnimationFrame(frame); else resolve();
                    };
                    requestAnimationFrame(frame);
                });
            }
        };
    });

    // 7. Start Scenario
    try {
        console.log('🎬 Nahrávam 9:16 vertical video...');
        await scenario.run(page, actions);
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
            '-t', '30',
            '-i', rawVideoPath
        ];

        if (masterAudioPath) {
            args.push('-i', masterAudioPath);
        }

        const videoFilter = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1';

        args.push(
            '-vf', videoFilter,
            '-c:v', 'libx264',
            '-preset', 'slow',
            '-crf', '18',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '192k'
        );

        if (masterAudioPath) {
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

run().catch(console.error);
