const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const axios = require('axios');
const FormData = require('form-data');

// << Load Custom Font >> //
// Vercel doesn't have fonts installed, so we must load one!
let fontLoaded = false;
async function initFont() {
    if (fontLoaded) return;
    try {
        const url = 'https://github.com/google/fonts/raw/main/ofl/montserrat/Montserrat-Bold.ttf';
        const res = await axios.get(url, { responseType: 'arraybuffer' });
        GlobalFonts.register(res.data, 'Montserrat');
        fontLoaded = true;
    } catch (err) {
        console.error('Failed to load font', err);
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
    
    // Draw Border
    ctx.save(); ctx.beginPath(); ctx.arc(centerX, centerY, radius + borderWidth, 0, Math.PI * 2); 
    ctx.strokeStyle = borderColor; ctx.lineWidth = borderWidth; ctx.stroke(); ctx.restore();
    
    // Draw Avatar
    ctx.save(); ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, Math.PI * 2); 
    ctx.closePath(); ctx.clip(); ctx.drawImage(img, x, y, size, size); ctx.restore();
}

// Draw a proper modern Robux Icon instead of a circle!
function drawRobuxIcon(ctx, x, y, size, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(12 * Math.PI / 180); // Tilt right slightly
    
    // Outer Box
    ctx.fillStyle = color;
    ctx.beginPath();
    const rOuter = size * 0.15; const s = size / 2;
    ctx.moveTo(-s + rOuter, -s); ctx.arcTo(s, -s, s, s, rOuter); ctx.arcTo(s, s, -s, s, rOuter);
    ctx.arcTo(-s, s, -s, -s, rOuter); ctx.arcTo(-s, -s, s, -s, rOuter);
    ctx.fill();

    // Inner Hole Cutout
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    const rInner = size * 0.05; const is = size * 0.18; 
    ctx.moveTo(-is + rInner, -is); ctx.arcTo(is, -is, is, is, rInner); ctx.arcTo(is, is, -is, is, rInner);
    ctx.arcTo(-is, is, -is, -is, rInner); ctx.arcTo(-is, -is, is, -is, rInner);
    ctx.fill();
    
    ctx.restore();
}

function hexToDec(hex) {
    return parseInt(hex.replace('#', ''), 16);
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { donatorId, receiverId, donatorName, receiverName, donatorAvatar, receiverAvatar, amount, webhookUrl } = req.body;
        if (!donatorAvatar || !receiverAvatar || !amount || !webhookUrl) return res.status(400).json({ error: 'Missing fields' });

        await initFont(); // Ensure font is loaded before drawing text!

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
        const canvasWidth = 650; const canvasHeight = 220; // Slightly wider for big donations
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');

        // << Transparent Background & Glow >> //
        // We do NOT draw a solid background color anymore!
        const r = parseInt(themeHex.slice(1, 3), 16);
        const g = parseInt(themeHex.slice(3, 5), 16);
        const b = parseInt(themeHex.slice(5, 7), 16);
        
        const gradient = ctx.createRadialGradient(canvasWidth / 2, canvasHeight / 2, 0, canvasWidth / 2, canvasHeight / 2, 300);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.25)`); // Inner soft glow
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)'); // Fade entirely out to transparent
        
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

        // Draw Avatars
        drawCircularImage(ctx, donatorImg, donatorX, avatarY, avatarSize, themeHex, 4);
        drawCircularImage(ctx, receiverImg, receiverX, avatarY, avatarSize, themeHex, 4);

        // << Draw Centered Info >> //
        const formattedAmount = formatNumber(numAmount);
        
        ctx.font = '40px Montserrat';
        const textWidth = ctx.measureText(formattedAmount).width;
        const iconSize = 36;
        const gap = 12;
        
        // Calculate exact center for icon + text combined
        const totalWidth = iconSize + gap + textWidth;
        const startX = (canvasWidth - totalWidth) / 2;
        const centerY = canvasHeight / 2 - 20;

        // 1. Draw Robux Logo
        drawRobuxIcon(ctx, startX + iconSize / 2, centerY, iconSize, themeHex);

        // 2. Draw Amount Text
        ctx.fillStyle = themeHex; 
        ctx.textAlign = 'left'; 
        ctx.fillText(formattedAmount, startX + iconSize + gap, centerY + 14); // +14 aligns text with icon vertically

        // 3. Draw "donated to" Text
        ctx.font = '22px Montserrat'; 
        ctx.fillStyle = '#FFFFFF'; 
        ctx.textAlign = 'center'; 
        ctx.fillText('donated to', canvasWidth / 2, centerY + 50);

        // << Draw Usernames >> //
        ctx.font = '16px Montserrat'; 
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
