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
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
        return Buffer.from(res.data);
    } catch (e) {
        console.warn('fetchBuffer failed:', url, e.message);
        return null;
    }
}

// ==============================
// Font (download TTF once, cache)
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
        try {
            const buf = await fetchBuffer(url);
            if (!buf) continue;
            GlobalFonts.register(buf, 'DonationFont');
            fontName = 'DonationFont';
            fontReady = true;
            console.log('Font loaded:', url);
            return;
        } catch (e) {
            console.warn('Font failed:', e.message);
        }
    }
    console.warn('All fonts failed, using sans-serif fallback');
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

    // Clipped avatar
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
}

// ==============================
// Draw Robux Icon (circle with R in the middle)
// Matches the exact style in your reference image
// ==============================

function drawRobuxCircle(ctx, cx, cy, radius, color) {
    // Outer ring
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();

    // Inner R letter
    ctx.save();
    ctx.font = `bold ${Math.floor(radius * 1.1)}px ${fontName}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('R', cx + 1, cy + 1);
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

        await ensureFont();

        const numAmount = parseInt(
            typeof amount === 'string' ? amount.replace(/,/g, '') : amount
        );

        // ── Theme color based on amount ──
        let themeHex = '#00FF47';   // green  (< 10)
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

        // Transparent + radial glow
        const glow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 260);
        glow.addColorStop(0,   `rgba(${r},${g},${b},0.30)`);
        glow.addColorStop(1,   `rgba(0,0,0,0)`);
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

        // ── Layout constants ──
        const avatarRadius = 55;           // avatar circle radius
        const avatarY      = H / 2 - 14;  // vertical center for avatars

        const leftCX  = 80;               // donator center X
        const rightCX = W - 80;           // receiver center X

        // ── Draw avatars ──
        drawAvatar(ctx, dImg, leftCX,  avatarY, avatarRadius, themeHex);
        drawAvatar(ctx, rImg, rightCX, avatarY, avatarRadius, themeHex);

        // ── Center section ──
        const cx = W / 2;

        // Robux icon circle  (radius 18)
        const iconR    = 18;
        const iconCY   = H / 2 - 24;      // sits ABOVE the amount text

        drawRobuxCircle(ctx, cx - 2, iconCY, iconR, themeHex);

        // Amount — on the SAME line as the icon (to the right)
        const amtText = formatNumber(numAmount);
        ctx.font          = `bold 36px ${fontName}`;
        ctx.fillStyle     = themeHex;
        ctx.textAlign     = 'left';
        ctx.textBaseline  = 'middle';

        // Measure so we can center the icon+text group together
        const amtWidth   = ctx.measureText(amtText).width;
        const gap        = 8;
        const groupW     = (iconR * 2) + gap + amtWidth;
        const groupLeft  = cx - groupW / 2;

        // Redraw icon at correct grouped position
        drawRobuxCircle(ctx, groupLeft + iconR, iconCY, iconR, themeHex);

        // Draw amount text right of icon
        ctx.fillText(amtText, groupLeft + iconR * 2 + gap, iconCY);

        // "donated to"
        ctx.font         = `bold 20px ${fontName}`;
        ctx.fillStyle    = '#FFFFFF';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('donated to', cx, H / 2 + 22);

        // ── Usernames under avatars ──
        ctx.font         = `bold 13px ${fontName}`;
        ctx.fillStyle    = '#FFFFFF';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'alphabetic';

        const trim = (name, max = 14) =>
            name.length > max ? name.slice(0, max) + '..' : name;

        ctx.fillText('@' + trim(donatorName),  leftCX,  avatarY + avatarRadius + 20);
        ctx.fillText('@' + trim(receiverName), rightCX, avatarY + avatarRadius + 20);

        // ── Time ──
        const now  = new Date();
        const h    = now.getHours();
        const m    = now.getMinutes().toString().padStart(2, '0');
        const ap   = h >= 12 ? 'PM' : 'AM';
        const dh   = h % 12 || 12;

        // ── Send to Discord ──
        const imgBuf = canvas.toBuffer('image/png');
        const form   = new FormData();

        const payload = {
            content: `${emoji} \`@${donatorName}\` donated <:robux:1451215082640900146> **${formatNumber(numAmount)} Robux** to \`@${receiverName}\``,
            embeds: [{
                color: hexToDec(themeHex),
                image: { url: 'attachment://donation.png' },
                footer: { text: `Donated on • Today at ${dh}:${m} ${ap}` }
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
