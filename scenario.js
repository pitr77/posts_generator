const fs = require('fs');
const path = require('path');

module.exports = {
    /**
     * @param {import('playwright').Page} page
     * @param {object} actions - Helper actions
     */
    async run(page, { wait, scroll, click, move, say, at, highlight, zoom, navigate }, phase = 'all') {
        const jsonPath = path.join(__dirname, 'scenario.json');
        if (!fs.existsSync(jsonPath)) {
            console.error('❌ scenario.json nebol nájdený!');
            return;
        }

        const timeline = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const stepsToRun = timeline.filter(step => {
            if (phase === 'all') return true;
            if (phase === 'setup') return step.setup === true;
            if (phase === 'main') return !step.setup;
            return true;
        });

        console.log(`🎬 Spúšťam JSON engine (${phase} phase, ${stepsToRun.length} krokov)...`);

        for (const step of stepsToRun) {
            // 1. Časovanie
            if (step.at !== undefined) await at(step.at);

            // 2. Titulky / Hlas
            if (step.say) {
                // Vypočítame dĺžku zobrazenia titulku (napr. do ďalšieho kroku alebo fixed 4s)
                const duration = step.duration || 4000;
                await say(step.say, duration);
            }

            // 3. Kliknutia / Pohyby / Zoom / Navigácia
            if (step.navigate) await navigate(step.navigate);
            if (step.click) await click(step.click);
            if (step.move || step.hover) await move(step.move || step.hover);
            if (step.highlight) await highlight(step.highlight, step.duration || 2000);
            if (step.zoom) await zoom(step.zoom, step.scale, step.duration);

            // 4. Scrollovanie [targetY, durationMs] ALEBO [targetX, targetY, durationMs]
            if (step.scroll) {
                if (step.scroll.length === 3) {
                    // [X, Y, Duration]
                    await scroll(step.scroll[0], step.scroll[1], step.scroll[2]);
                } else {
                    // [Y, Duration] -> Default X = 0
                    await scroll(0, step.scroll[0], step.scroll[1]);
                }
            }

            // 5. Čakanie
            if (step.wait) await wait(step.wait);
        }
    }
};
