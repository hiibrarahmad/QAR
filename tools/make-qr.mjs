// Generates qr-card.svg in the project root.
// Usage: node tools/make-qr.mjs <url>
//
// Design goals:
//  - QR: error-correction H, generous quiet zone → scannable by any camera app
//  - dense field of unique shapes in the border band → rich, non-repetitive
//    features for MindAR image tracking (a bare QR is a poor tracking target)
import QRCode from "qrcode";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const url = process.argv[2];
if (!url) { console.error("Usage: node tools/make-qr.mjs <url>"); process.exit(1); }

const W = 1200;          // card size
const QR = 660;          // QR size
const OFF = (W - QR) / 2;
const CLEAR = 185;       // protected white zone: rect(CLEAR..W-CLEAR) — QR + quiet zone

const qr = QRCode.create(url, { errorCorrectionLevel: "H" });
const size = qr.modules.size;
const data = qr.modules.data;
let d = "";
for (let r = 0; r < size; r++)
  for (let c = 0; c < size; c++)
    if (data[r * size + c]) d += `M${c},${r}h1v1h-1z`;

// deterministic PRNG so the card (and its compiled tracking data) is reproducible
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260715);
const colors = ["#2f81f7", "#e5484d", "#46a758", "#f5a623", "#8250df", "#0d1117"];

function shape(x, y, s, color, kind, rot) {
  const half = s / 2;
  const t = `transform="rotate(${rot} ${x} ${y})"`;
  switch (kind) {
    case 0: return `<circle cx="${x}" cy="${y}" r="${half}" fill="${color}"/>`;
    case 1: return `<rect x="${x - half}" y="${y - half}" width="${s}" height="${s}" fill="${color}" ${t}/>`;
    case 2: return `<path d="M${x},${y - half} L${x + half},${y + half} L${x - half},${y + half} Z" fill="${color}" ${t}/>`;
    case 3: { const a = s / 6;
      return `<path d="M${x - a},${y - half} h${2 * a} v${half - a} h${half - a} v${2 * a} h-${half - a} v${half - a} h-${2 * a} v-${half - a} h-${half - a} v-${2 * a} h${half - a} Z" fill="${color}" ${t}/>`; }
    case 4: return `<circle cx="${x}" cy="${y}" r="${half}" fill="none" stroke="${color}" stroke-width="${Math.max(4, s / 5)}"/>`;
  }
}

// scatter shapes in the border band, avoiding the QR zone and the text strips
const shapes = [];
let attempts = 0;
const placed = [];
while (shapes.length < 60 && attempts++ < 4000) {
  const s = 18 + rnd() * 30;
  const x = 30 + rnd() * (W - 60);
  const y = 30 + rnd() * (W - 60);
  const m = s / 2 + 6;
  const inQRZone = x > CLEAR - m && x < W - CLEAR + m && y > CLEAR - m && y < W - CLEAR + m;
  const inTopText = y < 165 && x > 170 && x < W - 170;
  const inBotText = y > W - 165 && x > 220 && x < W - 220;
  const collides = placed.some(p => Math.hypot(p.x - x, p.y - y) < (p.s + s) / 2 + 10);
  if (inQRZone || inTopText || inBotText || collides) continue;
  placed.push({ x, y, s });
  shapes.push(shape(x, y, s, colors[(rnd() * colors.length) | 0], (rnd() * 5) | 0, (rnd() * 360) | 0));
}

// corner brackets hugging the QR quiet zone — strong, distinctive corners
const B = CLEAR - 12, L = 92, SWl = 13;
const brackets = [
  `M${B - L},${B} H${B} V${B - L}`,
  `M${W - B + L},${B} H${W - B} V${B - L}`,
  `M${B - L},${W - B} H${B} V${W - B + L}`,
  `M${W - B + L},${W - B} H${W - B} V${W - B + L}`,
].map(p => `<path d="${p}" fill="none" stroke="#0d1117" stroke-width="${SWl}" stroke-linecap="square"/>`).join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">
<rect width="${W}" height="${W}" fill="#ffffff"/>
<rect x="6" y="6" width="${W - 12}" height="${W - 12}" fill="none" stroke="#0d1117" stroke-width="12" rx="28"/>
<g transform="translate(${OFF},${OFF}) scale(${QR / size})"><path d="${d}" fill="#000000"/></g>
${brackets}
${shapes.join("\n")}
<text x="${W / 2}" y="84" text-anchor="middle" font-family="Arial, sans-serif" font-size="50" font-weight="bold" fill="#0d1117">HIIBRARAHMAD</text>
<text x="${W / 2}" y="138" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" fill="#2f81f7" font-weight="bold">SCAN WITH YOUR CAMERA — AR INSIDE</text>
<text x="${W / 2}" y="${W - 108}" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" fill="#57606a">Keep the code in view after scanning</text>
<text x="${W / 2}" y="${W - 62}" text-anchor="middle" font-family="Consolas, monospace" font-size="26" fill="#8b949e">${url.replace("https://", "")}</text>
</svg>`;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
writeFileSync(join(root, "qr-card.svg"), svg);
console.log(`qr-card.svg — ${size}x${size} modules, ${placed.length} feature shapes, url: ${url}`);
