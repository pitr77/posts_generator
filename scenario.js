const fs = require('fs');
const path = require('path');

module.exports = {
    /**
     * @param {import('playwright').Page} page
     * @param {object} actions - Helper actions
     */
    async run(page, { wait, scroll, click, say, at }) {
        const jsonPath = path.join(__dirname, 'scenario.json');
        if (!fs.existsSync(jsonPath)) {
            console.error('❌ scenario.json nebol nájdený!');
            return;
        }

        const timeline = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        console.log(`🎬 Spúšťam JSON engine (${timeline.length} krokov)...`);

        for (const step of timeline) {
            // 1. Časovanie
            if (step.at !== undefined) await at(step.at);

            // 2. Titulky / Hlas
            if (step.say) {
                // Vypočítame dĺžku zobrazenia titulku (napr. do ďalšieho kroku alebo fixed 4s)
                const duration = step.duration || 4000;
                await say(step.say, duration);
            }

            // 3. Kliknutia
            if (step.click) await click(step.click);

            // 4. Scrollovanie [targetY, durationMs]
            if (step.scroll) {
                await scroll(step.scroll[0], step.scroll[1]);
            }

            // 5. Čakanie
            if (step.wait) await wait(step.wait);
        }
    }
};
