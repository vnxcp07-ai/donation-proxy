const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const axios = require('axios');
const FormData = require('form-data');

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
// Robux Icon
// ==============================

const ROBUX_URL = 'https://raw.githubusercontent.com/vnxcp07-ai/donation-proxy/main/edfae9388da4cd8496b885a8a2df613372500d9c-removebg-preview.png';

let robuxIconCache = null;

async function getRobuxIcon() {
    if (robuxIconCache) return robuxIconCache;
    const buf = await fetchBuffer(ROBUX_URL);
    if (buf) {
        try {
            robuxIconCache = await loadImage(buf);
            console.log('Robux icon loaded OK');
        } catch (e) {
            console.warn('Robux icon load failed:', e.message);
        }
    }
    return robuxIconCache;
}

function tintIcon(img, size, hexColor) {
    const off = createCanvas(size, size);
    const ctx = off.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = hexColor;
    ctx.fillRect(0, 0, size, size);
    return off;
}

function drawRobuxWithStroke(ctx, img, cx, cy, iconSize, color, strokeWidth) {
    const strokeSize = iconSize + strokeWidth * 1;

    const blackOff = createCanvas(strokeSize, strokeSize);
    const blackCtx = blackOff.getContext('2d');
    blackCtx.drawImage(img, 0, 0, strokeSize, strokeSize);
    blackCtx.globalCompositeOperation = 'source-in';
    blackCtx.fillStyle = 'rgba(0,0,0,0.9)';
    blackCtx.fillRect(0, 0, strokeSize, strokeSize);

    const offsets = [
        [-strokeWidth, -strokeWidth],
        [0,            -strokeWidth],
        [strokeWidth,  -strokeWidth],
        [-strokeWidth,  0],
        [strokeWidth,   0],
        [-strokeWidth,  strokeWidth],
        [0,             strokeWidth],
        [strokeWidth,   strokeWidth],
    ];

    for (const [ox, oy] of offsets) {
        ctx.drawImage(
            blackOff,
            cx - iconSize / 2 + ox - strokeWidth,
            cy - iconSize / 2 + oy - strokeWidth,
            strokeSize,
            strokeSize
        );
    }

    const tinted = tintIcon(img, iconSize, color);
    ctx.drawImage(tinted, cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize);
}

// ==============================
// Draw text with black stroke
// ==============================

function drawStrokedText(ctx, text, x, y, fillColor, strokeWidth) {
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
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
}

// ==============================
// Glow / gradient helpers
// ==============================

/**
 * tier:
 *   'none'     — no glow (nuke / ≥100 < 1000)
 *   'bottom'   — subtle glow only at the very bottom strip (smite / ≥1000 < 10000)
 *   'half'     — glow fills bottom half (starfall / ≥10000)
 *   'full'     — original full gradient (default blimp tier, unused now but kept)
 */
function drawBackground(ctx, W, H, r, g, b, tier) {
    // Always fill black first
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    if (tier === 'none') {
        // Pure black — no glow at all
        return;
    }

    if (tier === 'bottom') {
        // Glow only in the bottom ~25% of the image
        const glow = ctx.createLinearGradient(0, H, 0, H * 0.75);
        glow.addColorStop(0,   `rgba(${r},${g},${b},0.45)`);
        glow.addColorStop(1,   `rgba(${r},${g},${b},0.00)`);
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);
        return;
    }

    if (tier === 'half') {
        // Glow fills the bottom half
        const glow = ctx.createLinearGradient(0, H, 0, H * 0.5);
        glow.addColorStop(0,   `rgba(${r},${g},${b},0.50)`);
        glow.addColorStop(0.6, `rgba(${r},${g},${b},0.20)`);
        glow.addColorStop(1,   `rgba(${r},${g},${b},0.00)`);
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);
        return;
    }

    // 'full' — original behavior (kept for safety)
    const glow = ctx.createLinearGradient(0, H, 0, 0);
    glow.addColorStop(0,   `rgba(${r},${g},${b},0.35)`);
    glow.addColorStop(0.5, `rgba(${r},${g},${b},0.10)`);
    glow.addColorStop(1,   `rgba(0,0,0,0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
}

// ==============================
// VxidLogs Watermark
// ==============================

function drawVxidWatermark(ctx, W, H, themeHex) {
    ctx.save();
    ctx.font         = `bold 11px ${fontName}`;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'bottom';
    ctx.globalAlpha  = 0.45;
    ctx.fillStyle    = themeHex;
    ctx.fillText('VxidLogs', W - 10, H - 6);
    ctx.globalAlpha  = 1;
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
            webhookUrl,
            // Dev product fields (optional)
            devProductId,
            devProductName,
        } = req.body;

        if (!donatorAvatar || !receiverAvatar || !amount || !webhookUrl) {
            return res.status(400).json({ error: 'Missing fields' });
        }

        const numAmount = parseInt(
            typeof amount === 'string' ? amount.replace(/,/g, '') : amount
        );

        // ── Block donations under 100 Robux ──
        if (numAmount < 100) {
            console.log(`Skipping donation of ${numAmount} — below minimum of 100`);
            return res.status(200).json({ success: false, skipped: true, reason: 'Below minimum threshold of 100 Robux' });
        }

        await Promise.all([ensureFont(), getRobuxIcon()]);

        // ── Theme + tier ──
        let themeHex  = '#ff00bf'; // nuke default (100–999)
        let emoji     = '<:nukeig:1490656026603683940>';
        let glowTier  = 'none';    // nuke = no glow

        if (numAmount >= 10000) {
            themeHex = '#FF0037';
            emoji    = '<:starfall:1490655938506395829>';
            glowTier = 'half';
        } else if (numAmount >= 1000) {
            themeHex = '#FF0062';
            emoji    = '<:smitebro:1490655992025841804>';
            glowTier = 'bottom';
        }
        // 100–999: nuke, no glow (defaults above)

        const r = parseInt(themeHex.slice(1, 3), 16);
        const g = parseInt(themeHex.slice(3, 5), 16);
        const b = parseInt(themeHex.slice(5, 7), 16);

        // ── Canvas ──
        const W = 620, H = 210;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');

        drawBackground(ctx, W, H, r, g, b, glowTier);

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

        // ── Center: Robux Icon + Amount on same row ──
        const iconSize = 38;
        const amtText  = formatNumber(numAmount);
        const gap      = 12;

        ctx.font         = `bold 44px ${fontName}`;
        ctx.textBaseline = 'middle';
        const amtWidth   = ctx.measureText(amtText).width;

        const groupW    = iconSize + gap + amtWidth;
        const groupLeft = centerX - groupW / 2;
        const rowY      = H / 2 - 18;

        if (robuxIconCache) {
            drawRobuxWithStroke(
                ctx,
                robuxIconCache,
                groupLeft + iconSize / 2,
                rowY,
                iconSize,
                themeHex,
                2
            );
        }

        ctx.textAlign = 'left';
        drawStrokedText(ctx, amtText, groupLeft + iconSize + gap, rowY, themeHex, 5);

        // "donated to"
        ctx.font         = `bold 20px ${fontName}`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'alphabetic';
        drawStrokedText(ctx, 'donated to', centerX, H / 2 + 30, '#FFFFFF', 4);

        // Dev product label (shown below "donated to" if provided)
        if (devProductName) {
            ctx.font      = `bold 13px ${fontName}`;
            ctx.textAlign = 'center';
            drawStrokedText(
                ctx,
                `via ${devProductName}`,
                centerX,
                H / 2 + 50,
                themeHex,
                3
            );
        }

        // Usernames
        ctx.font      = `bold 13px ${fontName}`;
        ctx.textAlign = 'center';

        const trim = (s, max = 14) => s.length > max ? s.slice(0, max) + '..' : s;

        drawStrokedText(ctx, '@' + trim(donatorName),  leftCX,  avatarCY + avatarRadius + 22, '#FFFFFF', 4);
        drawStrokedText(ctx, '@' + trim(receiverName), rightCX, avatarCY + avatarRadius + 22, '#FFFFFF', 4);

        // VxidLogs watermark
        drawVxidWatermark(ctx, W, H, themeHex);

        // ── Time ──
        const now = new Date();
        const hh  = now.getHours();
        const mm  = now.getMinutes().toString().padStart(2, '0');
        const ap  = hh >= 12 ? 'PM' : 'AM';
        const dh  = hh % 12 || 12;

        // ── Send to Discord ──
        const imgBuf = canvas.toBuffer('image/png');
        const form   = new FormData();

        // Build content string — include dev product info if provided
        let contentStr = `${emoji} \`@${donatorName}\` donated <:robux:1451215082640900146> **${formatNumber(numAmount)} Robux** to \`@${receiverName}\``;
        if (devProductName) {
            contentStr += ` via **${devProductName}**`;
            if (devProductId) contentStr += ` (ID: \`${devProductId}\`)`;
        }

        const embedFields = [];
        if (devProductName) {
            embedFields.push({
                name: '🛒 Dev Product',
                value: devProductId
                    ? `${devProductName} — \`${devProductId}\``
                    : devProductName,
                inline: true
            });
        }

        const payload = {
            content: contentStr,
            embeds: [{
                color: hexToDec(themeHex),
                fields: embedFields.length > 0 ? embedFields : undefined,
                image: { url: 'attachment://donation.png' },
                footer: { text: `VxidLogs • Donated on • Today at ${dh}:${mm} ${ap}` }
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
