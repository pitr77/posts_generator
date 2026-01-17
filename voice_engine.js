const googleTTS = require('google-tts-api');
const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * Downloads audio from URL
 */
function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
}

/**
 * Generates audio snippets for a list of scenario actions
 * @param {Array} tracks - Array of { text, time, id }
 */
async function generateVoiceTracks(tracks, lang = 'en') {
    const outputDir = path.join(__dirname, 'temp_audio');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    console.log(`🎙️ Generujem ${tracks.length} zvukových stôp (Jazyk: ${lang})...`);

    const results = [];
    for (const track of tracks) {
        const fileName = `track_${track.id}.mp3`;
        const filePath = path.join(outputDir, fileName);

        try {
            const url = googleTTS.getAudioUrl(track.text, {
                lang: lang,
                slow: false,
                host: 'https://translate.google.com',
            });

            await download(url, filePath);
            results.push({ ...track, filePath });
            console.log(`   ✅ Vygenerované: "${track.text.substring(0, 20)}..." -> ${fileName}`);
        } catch (e) {
            console.error(`   ❌ Chyba pri generovaní "${track.text}":`, e);
        }
    }
    return results;
}

module.exports = { generateVoiceTracks };
