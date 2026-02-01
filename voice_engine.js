const { EdgeTTS } = require('@andresaya/edge-tts');
const fs = require('fs');
const path = require('path');

/**
 * Generates audio snippets using Microsoft Edge Neural TTS
 * @param {Array} tracks - Array of { text, time, id }
 */
async function generateVoiceTracks(tracks, lang = 'en') {
    const outputDir = path.join(__dirname, 'temp_audio');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    // Výber hlasu - en-US-AvaNeural (Female) je perfektná
    const voice = lang.startsWith('en') ? 'en-US-AvaNeural' : 'sk-SK-LukasNeural';

    console.log(`🎙️ Generujem Microsoft Neural TTS (Hlas: ${voice})...`);

    const results = [];
    for (const track of tracks) {
        const fileName = `track_${track.id}.mp3`;
        const filePath = path.join(outputDir, fileName);

        // Inicializácia pre každú vetu zvlášť - toto opravuje to "násobenie" hlasov
        const tts = new EdgeTTS();

        try {
            await tts.synthesize(track.text, voice);
            const buffer = await tts.toBuffer();
            fs.writeFileSync(filePath, buffer);

            if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
                results.push({ ...track, filePath });
                console.log(`   ✨ Neural: "${track.text.substring(0, 20)}..." -> ${fileName}`);
            } else {
                console.error(`   ❌ Súbor ${fileName} sa nepodarilo uložiť z buffera.`);
            }
        } catch (e) {
            console.error(`   ❌ Chyba pri Neural TTS "${track.text}":`, e);
        }
    }
    return results;
}

module.exports = { generateVoiceTracks };
