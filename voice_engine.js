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

    // Inicializácia Edge TTS
    const tts = new EdgeTTS();

    const results = [];
    for (const track of tracks) {
        const fileName = `track_${track.id}.mp3`;
        const filePath = path.join(outputDir, fileName);

        try {
            // Spracovanie textu na audio
            await tts.synthesize(track.text, voice);
            await tts.toFile(filePath);

            results.push({ ...track, filePath });
            console.log(`   ✨ Neural: "${track.text.substring(0, 20)}..." -> ${fileName}`);
        } catch (e) {
            console.error(`   ❌ Chyba pri Neural TTS "${track.text}":`, e);
        }
    }
    return results;
}

module.exports = { generateVoiceTracks };
