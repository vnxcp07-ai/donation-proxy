const { createCanvas, loadImage } = require('@napi-rs/canvas');
const axios = require('axios');
const FormData = require('form-data');

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

function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.lineTo(x + width - radius, y); ctx.quadraticCurveTo(x + width, y, x + width, y + radius); ctx.lineTo(x + width, y + height - radius); ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height); ctx.lineTo(x + radius, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - radius); ctx.lineTo(x, y + radius); ctx.quadraticCurveTo(x, y, x + radius, y); ctx.closePath();
}

function drawCircularImage(ctx, img, x, y, size, borderColor, borderWidth) {
    const radius = size / 2; const centerX = x + radius; const centerY = y + radius;
    ctx.save(); ctx.beginPath(); ctx.arc(centerX, centerY, radius + borderWidth, 0, Math.PI * 2); ctx.strokeStyle = borderColor; ctx.lineWidth = borderWidth; ctx.stroke(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, Math.PI * 2); ctx.closePath(); ctx.clip(); ctx.drawImage(img, x, y, size, size); ctx.restore();
}

// Convert Hex to Decimal for Discord Embeds
function hexToDec(hex) {
    return parseInt(hex.replace('#', ''), 16);
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { donatorId, receiverId, donatorName, receiverName, donatorAvatar, receiverAvatar, amount, webhookUrl } = req.body;
        if (!donatorAvatar || !receiverAvatar || !amount || !webhookUrl) return res.status(400).json({ error: 'Missing fields' });

        // Clean amount to integer for math
        const numAmount = parseInt(typeof amount === 'string' ? amount.replace(/,/g, '') : amount);
        
        // << Determine Dynamic Colors >> //
        let themeHex = '#00FF47'; // Default Green (< 10)
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

        const canvasWidth = 600; const canvasHeight = 220;
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');

        // << Background Setup >> //
        // 1. Draw solid dark background
        roundedRect(ctx, 0, 0, canvasWidth, canvasHeight, 16);
        ctx.fillStyle = '#1e1f22'; 
        ctx.fill();

        // 2. Draw glowing radial gradient in the center
        ctx.save();
        roundedRect(ctx, 0, 0, canvasWidth, canvasHeight, 16);
        ctx.clip(); // Keep gradient inside rounded corners
        
        // Convert hex to rgb for rgba gradient
        const r = parseInt(themeHex.slice(1, 3), 16);
        const g = parseInt(themeHex.slice(3, 5), 16);
        const b = parseInt(themeHex.slice(5, 7), 16);
        
        const gradient = ctx.createRadialGradient(canvasWidth / 2, canvasHeight / 2, 0, canvasWidth / 2, canvasHeight / 2, 300);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.25)`); // Inner glow
        gradient.addColorStop(1, 'rgba(30, 31, 34, 0)'); // Fades to dark
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.restore();

        // << Load Avatars >> //
        const donatorImgBuffer = await fetchImage(donatorAvatar);
        const receiverImgBuffer = await fetchImage(receiverAvatar);
        if (!donatorImgBuffer || !receiverImgBuffer) return res.status(500).json({ error: 'Failed to load avatars' });

        const donatorImg = await loadImage(donatorImgBuffer);
        const receiverImg = await loadImage(receiverImgBuffer);

        const avatarSize = 120; const avatarY = (canvasHeight - avatarSize) / 2 - 10; // moved slightly up for text space
        const donatorX = 50; const receiverX = canvasWidth - avatarSize - 50;

        // Draw avatars with dynamic border color
        drawCircularImage(ctx, donatorImg, donatorX, avatarY, avatarSize, themeHex, 4);
        drawCircularImage(ctx, receiverImg, receiverX, avatarY, avatarSize, themeHex, 4);

        // << Draw Center Information >> //
        const centerX = canvasWidth / 2;

        // Robux Logo (Middle)
        ctx.save(); ctx.beginPath(); ctx.arc(centerX - 60, canvasHeight / 2 - 25, 20, 0, Math.PI * 2); ctx.strokeStyle = themeHex; ctx.lineWidth = 4; ctx.stroke(); ctx.restore();
        ctx.font = 'bold 18px Arial'; ctx.fillStyle = themeHex; ctx.textAlign = 'center'; ctx.fillText('R$', centerX - 60, canvasHeight / 2 - 18);

        // Formatted Amount
        const formattedAmount = formatNumber(numAmount);
        ctx.font = '900 42px Arial'; // Thicker, bigger text
        ctx.fillStyle = themeHex; 
        ctx.textAlign = 'left'; 
        ctx.fillText(formattedAmount, centerX - 30, canvasHeight / 2 - 10);

        // "donated to" Text
        ctx.font = 'bold 22px Arial'; 
        ctx.fillStyle = '#FFFFFF'; 
        ctx.textAlign = 'center'; 
        ctx.fillText('donated to', centerX, canvasHeight / 2 + 30);

        // << Usernames >> //
        ctx.font = 'bold 15px Arial'; ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center';
        ctx.fillText('@' + (donatorName.length > 12 ? donatorName.substring(0, 12) + '..' : donatorName), donatorX + avatarSize / 2, avatarY + avatarSize + 25);
        ctx.fillText('@' + (receiverName.length > 12 ? receiverName.substring(0, 12) + '..' : receiverName), receiverX + avatarSize / 2, avatarY + avatarSize + 25);

        // << Date Formatting >> //
        const now = new Date(); const hours = now.getHours(); const minutes = now.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM'; const displayHour = hours % 12 || 12;

        // << Send To Discord >> //
        const imageBuffer = canvas.toBuffer('image/png');
        const form = new FormData();
        
        const payload = {
            content: `${emoji} \`@${donatorName}\` donated <:robux:1451215082640900146> **${formattedAmount} Robux** to \`@${receiverName}\``,
            embeds: [{ 
                color: embedColorDec, // Dynamic Discord Embed Color!
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
