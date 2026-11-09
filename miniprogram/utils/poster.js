// 用 Canvas 2D 画单词卡海报，尺寸 750 x 1200
const W = 750;
const H = 1200;
const PAD = 48;
const COLORS = { bg: '#FFF8F0', card: '#FFFFFF', text: '#2B2420', muted: '#8A7F75', accent: '#E8603C', line: '#F0E6DC' };

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 按宽度折行，最多 maxLines 行，超出加省略号
function wrap(ctx, text, maxWidth, maxLines) {
  const tokens = /[一-鿿]/.test(text) ? text.split('') : text.split(/(\s+)/);
  const lines = [];
  let line = '';
  for (const t of tokens) {
    const next = line + t;
    if (ctx.measureText(next).width > maxWidth && line.trim()) {
      lines.push(line.trim());
      line = t.trimStart();
    } else {
      line = next;
    }
  }
  if (line.trim()) lines.push(line.trim());
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = last + '…';
    return kept;
  }
  return lines;
}

function loadImage(canvas, src) {
  return new Promise((resolve, reject) => {
    const img = canvas.createImage();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// 按 aspectFill 方式把图片画进指定区域
function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

const FONT = '"PingFang SC", "Helvetica Neue", sans-serif';

async function drawPoster(canvas, { card, photoPath, qrPath }) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  // 照片
  const photoH = 520;
  if (photoPath) {
    try {
      const img = await loadImage(canvas, photoPath);
      ctx.save();
      roundRect(ctx, PAD, PAD, W - PAD * 2, photoH, 28);
      ctx.clip();
      drawCover(ctx, img, PAD, PAD, W - PAD * 2, photoH);
      ctx.restore();
    } catch (e) { /* 照片加载失败就留空 */ }
  }

  // 单词卡片
  const cardY = PAD + photoH + 32;
  const cardH = H - cardY - 220;
  ctx.fillStyle = COLORS.card;
  roundRect(ctx, PAD, cardY, W - PAD * 2, cardH, 28);
  ctx.fill();

  const x = PAD + 40;
  const maxW = W - PAD * 2 - 80;
  let y = cardY + 84;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.text;
  ctx.font = `bold 64px ${FONT}`;
  wrap(ctx, card.en, maxW, 1).forEach((l) => ctx.fillText(l, x, y));

  y += 50;
  ctx.font = `30px ${FONT}`;
  ctx.fillStyle = COLORS.muted;
  const ph = (card.phonetic && card.phonetic.us) || '';
  ctx.fillText(`${ph}${ph ? '   ' : ''}${card.zh || ''}`, x, y);

  const ex = card.examples && card.examples[0];
  if (ex) {
    y += 30;
    ctx.fillStyle = COLORS.line;
    ctx.fillRect(x, y, maxW, 2);
    y += 56;
    ctx.fillStyle = COLORS.text;
    ctx.font = `32px ${FONT}`;
    wrap(ctx, ex.en, maxW, 2).forEach((l) => { ctx.fillText(l, x, y); y += 44; });
    ctx.fillStyle = COLORS.muted;
    ctx.font = `28px ${FONT}`;
    wrap(ctx, ex.zh, maxW, 1).forEach((l) => { ctx.fillText(l, x, y); y += 40; });
  }

  // 底部：品牌 + 小程序码
  const footY = H - 190;
  ctx.fillStyle = COLORS.accent;
  ctx.font = `bold 40px ${FONT}`;
  ctx.fillText('随手拍英语', PAD, footY + 70);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `26px ${FONT}`;
  ctx.fillText('看到不会说的东西，拍一下就知道', PAD, footY + 116);
  ctx.fillText(qrPath ? '长按识别小程序码' : '在微信里搜索「随手拍英语」', PAD, footY + 156);

  if (qrPath) {
    try {
      const qr = await loadImage(canvas, qrPath);
      ctx.drawImage(qr, W - PAD - 160, footY, 160, 160);
    } catch (e) { /* 忽略 */ }
  }
}

module.exports = { drawPoster, W, H };
