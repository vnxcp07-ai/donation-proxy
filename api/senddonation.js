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

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { donatorId, receiverId, donatorName, receiverName, donatorAvatar, receiverAvatar, amount, webhookUrl } = req.body;
        if (!donatorAvatar || !receiverAvatar || !amount || !webhookUrl) return res.status(400).json({ error: 'Missing fields' });

        const canvasWidth = 600; const canvasHeight = 220;
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');

        roundedRect(ctx, 0, 0, canvasWidth, canvasHeight, 16);
        ctx.fillStyle = '#1e1f22'; ctx.fill();
        ctx.fillStyle = '#FF00FF'; ctx.fillRect(0, 0, 5, canvasHeight);

        const donatorImgBuffer = await fetchImage(donatorAvatar);
        const receiverImgBuffer = await fetchImage(receiverAvatar);
        if (!donatorImgBuffer || !receiverImgBuffer) return res.status(500).json({ error: 'Failed to load avatars' });

        const donatorImg = await loadImage(donatorImgBuffer);
        const receiverImg = await loadImage(receiverImgBuffer);

        const avatarSize = 120; const avatarY = (canvasHeight - avatarSize) / 2;
        const donatorX = 40; const receiverX = canvasWidth - avatarSize - 40;

        drawCircularImage(ctx, donatorImg, donatorX, avatarY, avatarSize, '#FF00FF', 4);
        drawCircularImage(ctx, receiverImg, receiverX, avatarY, avatarSize, '#FF00FF', 4);

        const centerX = canvasWidth / 2;
        ctx.save(); ctx.beginPath(); ctx.arc(centerX, canvasHeight / 2 - 20, 30, 0, Math.PI * 2); ctx.strokeStyle = '#FF00FF'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();

        ctx.font = 'bold 24px Arial'; ctx.fillStyle = '#FF00FF'; ctx.textAlign = 'center'; ctx.fillText('R$', centerX, canvasHeight / 2 - 8);

        const formattedAmount = formatNumber(typeof amount === 'string' ? amount.replace(/,/g, '') : amount);
        ctx.font = 'bold 28px Arial'; ctx.fillStyle = '#FF00FF'; ctx.textAlign = 'center'; ctx.fillText(formattedAmount, centerX, canvasHeight / 2 + 25);

        ctx.font = 'bold 16px Arial'; ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.fillText('donated to', centerX, canvasHeight / 2 + 50);

        ctx.font = 'bold 14px Arial'; ctx.fillStyle = '#AAAAAA'; ctx.textAlign = 'center';
        ctx.fillText('@' + (donatorName.length > 12 ? donatorName.substring(0, 12) + '..' : donatorName), donatorX + avatarSize / 2, avatarY + avatarSize + 20);
        ctx.fillText('@' + (receiverName.length > 12 ? receiverName.substring(0, 12) + '..' : receiverName), receiverX + avatarSize / 2, avatarY + avatarSize + 20);

        const now = new Date(); const hours = now.getHours(); const minutes = now.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM'; const displayHour = hours % 12 || 12;

        const imageBuffer = canvas.toBuffer('image/png');
        const form = new FormData();
        const payload = {
            content: `<:robux:1451215082640900146> \`@${donatorName}\` donated <:robux:1451215082640900146> **${formattedAmount} Robux** to \`@${receiverName}\``,
            embeds: [{ color: 0xFF00FF, image: { url: 'attachment://donation.png' }, footer: { text: `Donated on • Today at ${displayHour}:${minutes} ${ampm}` } }]
        };

        form.append('payload_json', JSON.stringify(payload));
        form.append('files[0]', imageBuffer, { filename: 'donation.png', contentType: 'image/png' });

        await axios.post(webhookUrl, form, { headers: form.getHeaders() });
        res.status(200).json({ success: true });

    } catch (err) {
        console.error(err); res.status(500).json({ error: err.message });
    }
};
