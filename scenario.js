module.exports = {
    /**
     * @param {import('playwright').Page} page
     * @param {object} actions - Helper actions
     */
    async run(page, { wait, scroll, click, say, at }) {
        console.log("🎬 Spúšťam upravený 30s English scenár...");

        // 0.0 – 4.0: Intro
        await at(0);
        await say("FPL update for the next Gameweek", 4000);
        await scroll(0, 500);

        // 4.0 – 8.0: Context
        await at(4);
        await say("Look beyond big names", 4000);
        await scroll(250, 2000);
        await wait(500);
        await scroll(0, 1500);

        // 8.0 – 12.0: DEF
        await at(8);
        await say("Defence\nCheap starters matter", 4000);
        await click("DEF");
        await scroll(650, 1500);
        await wait(500);
        await scroll(0, 1500);

        // 12.0 – 17.0: MID
        await at(12);
        await say("Midfield\nMinutes over hype", 5000);
        await click("MID");
        await scroll(650, 2000);
        await wait(1000);
        await scroll(0, 1500);

        // 17.0 – 22.0: FWD
        await at(17);
        await say("Forwards\nWatch penalties", 5000);
        await click("FWD");
        await scroll(650, 2000);
        await wait(1000);
        await scroll(0, 1500);

        // 22.0 – 30.0: Outro
        await at(22);
        await say("Data beats opinions\nFPL Studio", 8000);
        await scroll(0, 1000);
        await scroll(300, 4000);
        await wait(500);
        await scroll(0, 3000);

        // 30.0s exactly
        await at(30);
        console.log("🏁 30.0s reached. Final production export triggered.");
    }
};
