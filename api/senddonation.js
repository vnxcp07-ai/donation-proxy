const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const axios = require('axios');
const FormData = require('form-data');

function formatNumber(n) {
    return parseInt(n).toLocaleString('en-US');
}

function hexToDec(hex) {
    return parseInt(hex.replace('#', ''), 16);
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
    const radius = size / 2;
    const centerX = x + radius;
    const centerY = y + radius;

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + borderWidth, 0, Math.PI * 2);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidth;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
}

// Load and tint Robux logo with the theme color
async function drawRobuxLogo(ctx, x, y, size, color) {
    try {
        // Fetch official Roblox icon PNG
        const buf = await fetchImage('https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Roblox_Logo.svg/512px-Roblox_Logo.svg.png');
        if (!buf) throw new Error('no buf');
        const img = await loadImage(buf);

        // Draw to offscreen canvas and tint it
        const off = createCanvas(size, size);
        const offCtx = off.getContext('2d');
        offCtx.drawImage(img, 0, 0, size, size);
        offCtx.globalCompositeOperation = 'source-in';
        offCtx.fillStyle = color;
        offCtx.fillRect(0, 0, size, size);

        ctx.drawImage(off, x - size / 2, y - size / 2);
    } catch (e) {
        // Fallback: draw a colored square with R$
        ctx.save();
        const pad = size * 0.15;
        const r = size * 0.2;
        const x1 = x - size / 2 + pad;
        const y1 = y - size / 2 + pad;
        const w = size - pad * 2;
        const h = size - pad * 2;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x1 + r, y1);
        ctx.lineTo(x1 + w - r, y1);
        ctx.quadraticCurveTo(x1 + w, y1, x1 + w, y1 + r);
        ctx.lineTo(x1 + w, y1 + h - r);
        ctx.quadraticCurveTo(x1 + w, y1 + h, x1 + w - r, y1 + h);
        ctx.lineTo(x1 + r, y1 + h);
        ctx.quadraticCurveTo(x1, y1 + h, x1, y1 + h - r);
        ctx.lineTo(x1, y1 + r);
        ctx.quadraticCurveTo(x1, y1, x1 + r, y1);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

// Vercel has no system fonts installed
// so we force-register fonts from npm packages
function registerFonts() {
    try {
        // These packages come pre-built with TTF files we can use
        const path = require('path');
        const fs = require('fs');

        // Try to find any ttf file in node_modules
        const possiblePaths = [
            path.join(process.cwd(), 'node_modules', '@fontsource', 'roboto', 'files', 'roboto-latin-700-normal.woff2'),
        ];

        // Instead just register a basic font via buffer trick
        // We use a tiny base64 embedded font (Chunk of Open Sans Bold)
        // that is just enough to render latin characters
        return false; // We will use the fallback below
    } catch(e) {
        return false;
    }
}

// The real font fix: download once and cache in module scope
let fontRegistered = false;
async function ensureFont() {
    if (fontRegistered) return 'CustomFont';

    const sources = [
        'https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlfBBc4AMP6lQ.woff2',
        'https://fonts.gstatic.com/s/opensans/v34/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsjZ0C57.woff2',
    ];

    // woff2 might not work with napi-rs/canvas, try TTF sources
    const ttfSources = [
        'https://github.com/google/fonts/raw/refs/heads/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf',
        'https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-Bold.ttf',
        'https://github.com/google/fonts/raw/main/apache/roboto/static/Roboto-Bold.ttf',
    ];

    for (const url of ttfSources) {
        try {
            console.log('Trying font:', url);
            const res = await axios.get(url, { 
                responseType: 'arraybuffer',
                timeout: 8000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            GlobalFonts.register(Buffer.from(res.data), 'CustomFont');
            fontRegistered = true;
            console.log('Font loaded from:', url);
            return 'CustomFont';
        } catch (e) {
            console.warn('Font source failed:', url, e.message);
        }
    }

    console.error('All font sources failed!');
    return 'sans-serif'; // last resort fallback
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const {
            donatorName, receiverName,
            donatorAvatar, receiverAvatar,
            amount, webhookUrl
        } = req.body;

        if (!donatorAvatar || !receiverAvatar || !amount || !webhookUrl) {
            return res.status(400).json({ error: 'Missing fields' });
        }

        // Load font before drawing
        const fontName = await ensureFont();
        console.log('Using font:', fontName);

        const numAmount = parseInt(typeof amount === 'string' ? amount.replace(/,/g, '') : amount);

        // Dynamic theme color
        let themeHex = '#00FF47';
        let emoji = '<:robux:1451215082640900146>';

        if (numAmount >= 10000) {
            themeHex = '#FF0000';
            emoji = '<:starfall:1490655938506395829>';
        } else if (numAmount >= 1000) {
            themeHex = '#FF0066';
            emoji = '<:smitebro:1490655992025841804>';
        } else if (numAmount >= 100) {
            themeHex = '#9900FF';
            emoji = '<:nukeig:1490656026603683940>';
        } else if (numAmount >= 10) {
            themeHex = '#00E6FF';
            emoji = '<:blimp:1451215188031181024>';
        }

        const r = parseInt(themeHex.slice(1, 3), 16);
        const g = parseInt(themeHex.slice(3, 5), 16);
        const b = parseInt(themeHex.slice(5, 7), 16);
        const embedColorDec = hexToDec(themeHex);

        const canvasWidth = 650;
        const canvasHeight = 240;
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');

        // Transparent background with radial glow
        const gradient = ctx.createRadialGradient(
            canvasWidth / 2, canvasHeight / 2, 0,
            canvasWidth / 2, canvasHeight / 2, 300
        );
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.35)`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Load avatar images
        const donatorImgBuffer = await fetchImage(donatorAvatar);
        const receiverImgBuffer = await fetchImage(receiverAvatar);
        if (!donatorImgBuffer || !receiverImgBuffer) {
            return res.status(500).json({ error: 'Failed to load avatars' });
        }

        const donatorImg = await loadImage(donatorImgBuffer);
        const receiverImg = await loadImage(receiverImgBuffer);

        const avatarSize = 110;
        const avatarY = (canvasHeight - avatarSize) / 2 - 15;
        const donatorX = 40;
        const receiverX = canvasWidth - avatarSize - 40;
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2 - 10;

        drawCircularImage(ctx, donatorImg, donatorX, avatarY, avatarSize, themeHex, 4);
        drawCircularImage(ctx, receiverImg, receiverX, avatarY, avatarSize, themeHex, 4);

        // Draw Robux icon in center
        await drawRobuxLogo(ctx, centerX, centerY - 22, 44, themeHex);

        // Draw amount text
        ctx.font = `bold 40px "${fontName}"`;
        ctx.fillStyle = themeHex;
        ctx.textAlign = 'center';
        ctx.fillText(formatNumber(numAmount), centerX, centerY + 30);

        // Draw "donated to" text
        ctx.font = `bold 20px "${fontName}"`;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText('donated to', centerX, centerY + 58);

        // Draw usernames
        ctx.font = `bold 14px "${fontName}"`;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';

        const maxLen = 13;
        const dName = donatorName.length > maxLen ? donatorName.substring(0, maxLen) + '..' : donatorName;
        const rName = receiverName.length > maxLen ? receiverName.substring(0, maxLen) + '..' : receiverName;

        ctx.fillText('@' + dName, donatorX + avatarSize / 2, avatarY + avatarSize + 26);
        ctx.fillText('@' + rName, receiverX + avatarSize / 2, avatarY + avatarSize + 26);

        // Time
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const displayHour = hours % 12 || 12;

        // Send to Discord
        const imageBuffer = canvas.toBuffer('image/png');
        const form = new FormData();

        const payload = {
            content: `${emoji} \`@${donatorName}\` donated <:robux:1451215082640900146> **${formatNumber(numAmount)} Robux** to \`@${receiverName}\``,
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
        console.error(err);
        res.status(500).json({ error: err.message });
    }
};
