const googleTTS = require('google-tts-api');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');

// Define your script here (Synchronized with scenario.js)
const script = [
    { id: "intro", text: "Čaute manažéri! Dnes sa pozrieme na najlepšie prestupy cez FPL Studio.", pauseAfter: 1 },
    { id: "scroll", text: "Poďme si prebehnúť kľúčové pozície pre tento Gameweek.", pauseAfter: 2 },
    { id: "def", text: "V obrane momentálne dominujú tieto mená...", pauseAfter: 1 },
    { id: "mid", text: "V zálohe hľadáme hlavne formu a isté minúty.", pauseAfter: 1 },
    { id: "fwd", text: "A v útoku je to o návrate kráľa a zraneniach.", pauseAfter: 1 },
    { id: "outro", text: "Veľa šťastia pri prestupoch! Vidíme sa pri ďalšom videu.", pauseAfter: 2 }
];

async function generate() {
    console.log('🎙️ Generujem audio nahrávky...');
    const tmpDir = path.join(__dirname, 'tmp_audio');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

    const timings = {};
    let currentTime = 0;
    const inputs = [];

    for (let i = 0; i < script.length; i++) {
        const item = script[i];
        const url = googleTTS.getAudioUrl(item.text, { lang: 'sk', slow: false, host: 'https://translate.google.com' });
        const filePath = path.join(tmpDir, `part_${i}.mp3`);

        console.log(`- Sťahujem: "${item.text.substring(0, 30)}..."`);
        const response = await fetch(url);
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(filePath, buffer);

        // Get duration using ffmpeg
        const durationStr = execSync(`"${ffmpeg}" -i "${filePath}" 2>&1 | grep "Duration" | cut -d ' ' -f 4 | sed s/,//`).toString().trim();
        const [hours, minutes, seconds] = durationStr.split(':').map(parseFloat);
        const duration = hours * 3600 + minutes * 60 + seconds;

        timings[item.id] = currentTime + 0.2; // Add a tiny buffer
        currentTime += duration + item.pauseAfter;
        inputs.push(`file '${filePath}'`);
        // Add silence/pause
        if (item.pauseAfter > 0) {
            const silencePath = path.join(tmpDir, `silence_${i}.mp3`);
            execSync(`"${ffmpeg}" -y -f lavfi -i anullsrc=r=44100:cl=mono -t ${item.pauseAfter} -q:a 9 -acodec libmp3lame "${silencePath}"`);
            inputs.push(`file '${silencePath}'`);
        }
    }

    // Merge audio files
    console.log('📦 Spájam do hlas.mp3...');
    const listPath = path.join(tmpDir, 'list.txt');
    fs.writeFileSync(listPath, inputs.join('\n'));
    execSync(`"${ffmpeg}" -y -f concat -safe 0 -i "${listPath}" -c copy hlas.mp3`);

    // Save timings
    fs.writeFileSync('timings.json', JSON.stringify(timings, null, 2));
    console.log('✅ Hotovo! Vygenerované: hlas.mp3 a timings.json');
}

generate().catch(console.error);
