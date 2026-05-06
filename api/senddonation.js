const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const axios = require('axios');
const FormData = require('form-data');

// ==============================
// Helpers
// ==============================

function formatNumber(n) {
    return parseInt(n).toLocaleString('en-US');
}

function hexToDec(hex) {
    return parseInt(hex.replace('#', ''), 16);
}

async function fetchBuffer(url) {
    try {
        const res = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        return Buffer.from(res.data);
    } catch (e) {
        console.warn('fetchBuffer failed:', url, e.message);
        return null;
    }
}

// ==============================
// Font
// ==============================

let fontName = 'sans-serif';
let fontReady = false;

async function ensureFont() {
    if (fontReady) return;
    const urls = [
        'https://github.com/google/fonts/raw/main/apache/roboto/static/Roboto-Bold.ttf',
        'https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-Bold.ttf',
    ];
    for (const url of urls) {
        const buf = await fetchBuffer(url);
        if (buf) {
            try {
                GlobalFonts.register(buf, 'DonationFont');
                fontName = 'DonationFont';
                fontReady = true;
                console.log('Font OK:', url);
                return;
            } catch (e) {
                console.warn('Font register failed:', e.message);
            }
        }
    }
}

// ==============================
// Robux Icon - tinted properly
// This version works even if background is white
// It multiplies the color over the dark pixels only
// ==============================

let robuxIconCache = null;

async function getRobuxIcon() {
    if (robuxIconCache) return robuxIconCache;
    const buf = await fetchBuffer('https://i.imgur.com/Yzmxrvr.png');
    if (buf) {
        try {
            robuxIconCache = await loadImage(buf);
            console.log('Robux icon loaded OK');
        } catch (e) {
            console.warn('Robux icon loadImage failed:', e.message);
        }
    }
    return robuxIconCache;
}

// Smart tint: draws icon, removes white background, applies color
function tintIcon(img, size, hexColor) {
    const off = createCanvas(size, size);
    const ctx = off.getContext('2d');

    // Step 1: draw the original icon
    ctx.drawImage(img, 0, 0, size, size);

    // Step 2: get pixel data and remove white/light pixels
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;

    const tr = parseInt(hexColor.slice(1, 3), 16);
    const tg = parseInt(hexColor.slice(3, 5), 16);
    const tb = parseInt(hexColor.slice(5, 7), 16);

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        // Brightness of this pixel (0 = black, 255 = white)
        const brightness = (r + g + b) / 3;

        if (brightness > 200 && a > 10) {
            // Very light/white pixel → make fully transparent (background removal)
            data[i + 3] = 0;
        } else if (a > 10) {
            // Dark pixel (the actual icon shape) → tint it with the theme color
            // Blend: the darker the original pixel, the more opaque it is
            const strength = 1 - brightness / 255;
            data[i]     = tr;
            data[i + 1] = tg;
            data[i + 2] = tb;
            data[i + 3] = Math.floor(255 * strength * (a / 255));
        }
    }

    ctx.putImageData(imageData, 0, 0);
    return off;
}

// ==============================
// Draw text with black stroke
// ==============================

function drawStrokedText(ctx, text, x, y, fillColor, strokeWidth = 4) {
    ctx.save();
    ctx.lineJoin    = 'round';
    ctx.miterLimit  = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineWidth   = strokeWidth;
    ctx.strokeText(text, x, y);
    ctx.fillStyle   = fillColor;
    ctx.fillText(text, x, y);
    ctx.restore();
}

// ==============================
// Draw circular avatar
// ==============================

function drawAvatar(ctx, img, cx, cy, radius, borderColor) {
    // Border ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();

    // Clipped image
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
}

// ==============================
// Main Handler
// ==============================

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            donatorName,
            receiverName,
            donatorAvatar,
            receiverAvatar,
            amount,
            webhookUrl
        } = req.body;

        if (!donatorAvatar || !receiverAvatar || !amount || !webhookUrl) {
            return res.status(400).json({ error: 'Missing fields' });
        }

        await Promise.all([ensureFont(), getRobuxIcon()]);

        const numAmount = parseInt(
            typeof amount === 'string' ? amount.replace(/,/g, '') : amount
        );

        // ── Theme color ──
        let themeHex = '#00FF47';
        let emoji    = '<:robux:1451215082640900146>';

        if (numAmount >= 10000) {
            themeHex = '#FF0000';
            emoji    = '<:starfall:1490655938506395829>';
        } else if (numAmount >= 1000) {
            themeHex = '#FF0066';
            emoji    = '<:smitebro:1490655992025841804>';
        } else if (numAmount >= 100) {
            themeHex = '#9900FF';
            emoji    = '<:nukeig:1490656026603683940>';
        } else if (numAmount >= 10) {
            themeHex = '#00E6FF';
            emoji    = '<:blimp:1451215188031181024>';
        }

        const r = parseInt(themeHex.slice(1, 3), 16);
        const g = parseInt(themeHex.slice(3, 5), 16);
        const b = parseInt(themeHex.slice(5, 7), 16);

        // ── Canvas ──
        const W = 620, H = 210;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');

        // Transparent radial glow background
        const glow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 260);
        glow.addColorStop(0, `rgba(${r},${g},${b},0.30)`);
        glow.addColorStop(1, `rgba(0,0,0,0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);

        // ── Load avatars ──
        const [dBuf, rBuf] = await Promise.all([
            fetchBuffer(donatorAvatar),
            fetchBuffer(receiverAvatar)
        ]);

        if (!dBuf || !rBuf) {
            return res.status(500).json({ error: 'Avatar fetch failed' });
        }

        const [dImg, rImg] = await Promise.all([
            loadImage(dBuf),
            loadImage(rBuf)
        ]);

        // ── Layout ──
        const avatarRadius = 55;
        const avatarCY     = H / 2 - 12;
        const leftCX       = 80;
        const rightCX      = W - 80;
        const centerX      = W / 2;

        drawAvatar(ctx, dImg, leftCX,  avatarCY, avatarRadius, themeHex);
        drawAvatar(ctx, rImg, rightCX, avatarCY, avatarRadius, themeHex);

        // ── Center: Icon + Amount ──
        const iconSize = 50;
        const amtText  = formatNumber(numAmount);
        const gap      = 10;

        ctx.font         = `bold 50px ${fontName}`;
        ctx.textBaseline = 'middle';
        const amtWidth   = ctx.measureText(amtText).width;

        // Total group width centered
        const groupW    = iconSize + gap + amtWidth;
        const groupLeft = centerX - groupW / 2;
        const rowY      = H / 2 - 18;

        // Draw Robux icon (properly tinted, white background removed)
        if (robuxIconCache) {
            const tinted = tintIcon(robuxIconCache, iconSize, themeHex);
            ctx.drawImage(tinted, groupLeft, rowY - iconSize / 2, iconSize, iconSize);
        }

        // Amount text with stroke
        ctx.textAlign = 'left';
        drawStrokedText(ctx, amtText, groupLeft + iconSize + gap, rowY, themeHex, 6);

        // "donated to" with stroke
        ctx.font         = `bold 22px ${fontName}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'alphabetic';
        drawStrokedText(ctx, 'donated to', centerX, H / 2 + 32, '#FFFFFF', 4);

        // Usernames with stroke
        ctx.font      = `bold 14px ${fontName}`;
        ctx.textAlign = 'center';

        const trim = (s, max = 14) => s.length > max ? s.slice(0, max) + '..' : s;

        drawStrokedText(ctx, '@' + trim(donatorName),  leftCX,  avatarCY + avatarRadius + 22, '#FFFFFF', 3);
        drawStrokedText(ctx, '@' + trim(receiverName), rightCX, avatarCY + avatarRadius + 22, '#FFFFFF', 3);

        // ── Time ──
        const now = new Date();
        const hh  = now.getHours();
        const mm  = now.getMinutes().toString().padStart(2, '0');
        const ap  = hh >= 12 ? 'PM' : 'AM';
        const dh  = hh % 12 || 12;

        // ── Send to Discord ──
        const imgBuf = canvas.toBuffer('image/png');
        const form   = new FormData();

        const payload = {
            content: `${emoji} \`@${donatorName}\` donated <:robux:1451215082640900146> **${formatNumber(numAmount)} Robux** to \`@${receiverName}\``,
            embeds: [{
                color: hexToDec(themeHex),
                image: { url: 'attachment://donation.png' },
                footer: { text: `Donated on • Today at ${dh}:${mm} ${ap}` }
            }]
        };

        form.append('payload_json', JSON.stringify(payload));
        form.append('files[0]', imgBuf, {
            filename:    'donation.png',
            contentType: 'image/png'
        });

        await axios.post(webhookUrl, form, { headers: form.getHeaders() });
        return res.status(200).json({ success: true });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
    }
};
