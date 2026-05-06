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
        return;
      } catch {}
    }
  }
}

// ==============================
// Robux Icon (BASE64 FIXED)
// ==============================
let robuxIconCache = null;

async function getRobuxIcon() {
  if (robuxIconCache) return robuxIconCache;

  try {
    const base64 = `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`;

    const buffer = Buffer.from(base64, 'base64');
    robuxIconCache = await loadImage(buffer);
  } catch (e) {
    console.warn('Base64 icon load failed:', e.message);
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
            themeHex = '#FF0037';
            emoji    = '<:starfall:1490655938506395829>';
        } else if (numAmount >= 1000) {
            themeHex = '#FF0062';
            emoji    = '<:smitebro:1490655992025841804>';
        } else if (numAmount >= 100) {
            themeHex = '#ff00bf';
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
