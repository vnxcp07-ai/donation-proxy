const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const axios = require('axios');
const FormData = require('form-data');

// << 1. Load Font Fix for Vercel >> //
let fontLoaded = false;
async function initFont() {
    if (fontLoaded) return;
    try {
        // Download Roboto Bold directly from Google Fonts
        const url = 'https://github.com/google/fonts/raw/main/apache/roboto/Roboto-Bold.ttf';
        const res = await axios.get(url, { responseType: 'arraybuffer' });
        GlobalFonts.register(res.data, 'Roboto');
        fontLoaded = true;
    } catch (err) {
        console.error('Failed to load font:', err);
    }
}

// << Helper Functions >> //
function formatNumber(n) {
    return parseInt(n).toLocaleString('en-US');
}

async function fetchImage(url) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(response.data, 'binary');
    } catch (err) {
        return null;
    }
}

function drawCircularImage(ctx, img, x, y, size, borderColor, borderWidth) {
    const radius = size / 2; const centerX = x + radius; const centerY = y + radius;
    ctx.save(); ctx.beginPath(); ctx.arc(centerX, centerY, radius + borderWidth, 0, Math.PI * 2); 
    ctx.strokeStyle = borderColor; ctx.lineWidth = borderWidth; ctx.stroke(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, Math.PI * 2); 
    ctx.closePath(); ctx.clip(); ctx.drawImage(img, x, y, size, size); ctx.restore();
}

function hexToDec(hex) {
    return parseInt(hex.replace('#', ''), 16);
}

// << Official Robux Logo SVG >>
const robuxSvg = `
<svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <g transform="rotate(12 128 128)">
    <path d="M56 32h144a24 24 0 0 1 24 24v144a24 24 0 0 1-24 24H56a24 24 0 0 1-24-24V56a24 24 0 0 1 24-24zm40 64a8 8 0 0 0-8 8v48a8 8 0 0 0 8 8h48a8 8 0 0 0 8-8v-48a8 8 0 0 0-8-8H96z" fill="white" fill-rule="evenodd"/>
  </g>
</svg>`;
const robuxSvgBase64 = "data:image/svg+xml;base64," + Buffer.from(robuxSvg).toString('base64');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { donatorId, receiverId, donatorName, receiverName, donatorAvatar, receiverAvatar, amount, webhookUrl } = req.body;
        if (!donatorAvatar || !receiverAvatar || !amount || !webhookUrl) return res.status(400).json({ error: 'Missing fields' });

        // Wait for font to load so text doesn't turn invisible!
        await initFont(); 

        const numAmount = parseInt(typeof amount === 'string' ? amount.replace(/,/g, '') : amount);
        
        // << Dynamic Colors >> //
        let themeHex = '#00FF47'; // Green
        let emoji = '<:robux:1451215082640900146>';

        if (numAmount >= 10000) {
            themeHex = '#FF0000'; // Red
            emoji = '<:starfall:1490655938506395829>';
        } else if (numAmount >= 1000) {
            themeHex = '#FF0066'; // Pink
            emoji = '<:smitebro:1490655992025841804>';
        } else if (numAmount >= 100) {
            themeHex = '#9900FF'; // Purple
            emoji = '<:nukeig:1490656026603683940>';
        } else if (numAmount >= 10) {
            themeHex = '#00E6FF'; // Cyan
            emoji = '<:blimp:1451215188031181024>';
        }

        const embedColorDec = hexToDec(themeHex);
        const canvasWidth = 650; const canvasHeight = 220; 
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');

        // << Fully Transparent Background + Glow >> //
        const r = parseInt(themeHex.slice(1, 3), 16);
        const g = parseInt(themeHex.slice(3, 5), 16);
        const b = parseInt(themeHex.slice(5, 7), 16);
        
        const gradient = ctx.createRadialGradient(canvasWidth / 2, canvasHeight / 2, 0, canvasWidth / 2, canvasHeight / 2, 300);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.35)`); // Inner soft glow
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); // Fade completely out
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // << Load Avatars >> //
        const donatorImgBuffer = await fetchImage(donatorAvatar);
        const receiverImgBuffer = await fetchImage(receiverAvatar);
        if (!donatorImgBuffer || !receiverImgBuffer) return res.status(500).json({ error: 'Failed to load avatars' });

        const donatorImg = await loadImage(donatorImgBuffer);
        const receiverImg = await loadImage(receiverImgBuffer);

        const avatarSize = 110; 
        const avatarY = (canvasHeight - avatarSize) / 2 - 15;
        const donatorX = 40; 
        const receiverX = canvasWidth - avatarSize - 40;

        drawCircularImage(ctx, donatorImg, donatorX, avatarY, avatarSize, themeHex, 4);
        drawCircularImage(ctx, receiverImg, receiverX, avatarY, avatarSize, themeHex, 4);

        // << Draw Centered Info >> //
        const formattedAmount = formatNumber(numAmount);
        
        // Use our loaded Roboto font!
        ctx.font = 'bold 42px Roboto, sans-serif';
        const metrics = ctx.measureText(formattedAmount);
        const textWidth = metrics.width || (formattedAmount.length * 20); // Fallback math just in case
        
        const iconSize = 42;
        const gap = 10;
        
        // Calculate exact center
        const totalWidth = iconSize + gap + textWidth;
        const startX = (canvasWidth - totalWidth) / 2;
        const centerY = canvasHeight / 2 - 20;

        // 1. Draw and Colorize the Official Robux Logo
        const offscreen = createCanvas(iconSize, iconSize);
        const offCtx = offscreen.getContext('2d');
        const rbIcon = await loadImage(robuxSvgBase64);
        offCtx.drawImage(rbIcon, 0, 0, iconSize, iconSize);
        
        // Apply color to logo
        offCtx.globalCompositeOperation = 'source-in';
        offCtx.fillStyle = themeHex;
        offCtx.fillRect(0, 0, iconSize, iconSize);
        
        // Draw colored logo onto main canvas
        ctx.drawImage(offscreen, startX, centerY - iconSize / 2 + 5);

        // 2. Draw Amount Text
        ctx.fillStyle = themeHex; 
        ctx.textAlign = 'left'; 
        ctx.fillText(formattedAmount, startX + iconSize + gap, centerY + 18);

        // 3. Draw "donated to" Text
        ctx.font = 'bold 20px Roboto, sans-serif'; 
        ctx.fillStyle = '#FFFFFF'; 
        ctx.textAlign = 'center'; 
        ctx.fillText('donated to', canvasWidth / 2, centerY + 55);

        // << Draw Usernames >> //
        ctx.font = 'bold 15px Roboto, sans-serif'; 
        ctx.fillStyle = '#FFFFFF'; 
        ctx.textAlign = 'center';
        
        ctx.fillText('@' + (donatorName.length > 12 ? donatorName.substring(0, 12) + '..' : donatorName), donatorX + avatarSize / 2, avatarY + avatarSize + 28);
        ctx.fillText('@' + (receiverName.length > 12 ? receiverName.substring(0, 12) + '..' : receiverName), receiverX + avatarSize / 2, avatarY + avatarSize + 28);

        // << Date Formatting >> //
        const now = new Date(); const hours = now.getHours(); const minutes = now.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM'; const displayHour = hours % 12 || 12;

        // << Send To Discord >> //
        const imageBuffer = canvas.toBuffer('image/png');
        const form = new FormData();
        
        const payload = {
            content: `${emoji} \`@${donatorName}\` donated <:robux:1451215082640900146> **${formattedAmount} Robux** to \`@${receiverName}\``,
            embeds: [{ 
                color: embedColorDec,
                image: { url: 'attachment://donation.png' }, 
                footer: { text: `Donated on • Today at ${displayHour}:${minutes} ${ampm}` } 
            }]
        };

        form.append('payload_json', JSON.stringify(payload));
        form.append('files[0]', imageBuffer, { filename: 'donation.png', contentType: 'image/png' });

        await axios.post(webhookUrl, form, { headers: form.getHeaders() });
        res.status(200).json({ success: true });

    } catch (err) {
        console.error(err); res.status(500).json({ error: err.message });
    }
};
