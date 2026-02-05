const { EdgeTTS } = require('@andresaya/edge-tts');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

/**
 * Generates audio snippets using configured TTS provider
 * @param {Array} tracks - Array of { text, time, id }
 * @param {String} lang - Language code
 * @param {Object} config - Script configuration
 */
async function generateVoiceTracks(tracks, lang = 'en', config = {}) {
    const outputDir = path.join(__dirname, 'temp_audio');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    const provider = config.tts_provider || 'edge'; // 'edge' or 'openai'
    const results = [];

    if (provider === 'openai' && config.openai?.api_key && config.openai.api_key !== 'sk-...') {
        console.log(`🎙️ Generujem OpenAI TTS (Model: tts-1)...`);
        const openai = new OpenAI({ apiKey: config.openai.api_key });

        for (const track of tracks) {
            const fileName = `track_${track.id}.mp3`;
            const filePath = path.join(outputDir, fileName);

            try {
                const mp3 = await openai.audio.speech.create({
                    model: "tts-1",
                    voice: config.openai.voice || (lang.startsWith('en') ? "nova" : "onyx"),
                    input: track.text,
                });
                const buffer = Buffer.from(await mp3.arrayBuffer());
                fs.writeFileSync(filePath, buffer);

                if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
                    results.push({ ...track, filePath });
                    console.log(`   ✨ OpenAI: "${track.text.substring(0, 20)}..." -> ${fileName}`);
                }
            } catch (e) {
                console.error(`   ❌ Chyba pri OpenAI TTS "${track.text}":`, e.message);
            }
        }
    } else {
        // Fallback to Microsoft Edge Neural TTS
        const edgeConfig = config.edge || {};
        const voice = edgeConfig.voice || (lang.startsWith('en') ? 'en-US-AvaNeural' : 'sk-SK-LukasNeural');
        console.log(`🎙️ Generujem Microsoft Neural TTS (Hlas: ${voice})...`);

        for (const track of tracks) {
            const fileName = `track_${track.id}.mp3`;
            const filePath = path.join(outputDir, fileName);
            const tts = new EdgeTTS();

            try {
                await tts.synthesize(track.text, voice);
                const buffer = await tts.toBuffer();
                fs.writeFileSync(filePath, buffer);

                if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
                    results.push({ ...track, filePath });
                    console.log(`   ✨ Neural: "${track.text.substring(0, 20)}..." -> ${fileName}`);
                }
            } catch (e) {
                console.error(`   ❌ Chyba pri Neural TTS "${track.text}":`, e);
            }
        }
    }
    return results;
}

module.exports = { generateVoiceTracks };
