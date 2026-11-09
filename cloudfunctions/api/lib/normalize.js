// 校验、清洗模型输出，保证前端拿到的数据结构稳定
const { CATEGORIES, PLACES, MAX_OBJECTS } = require('./constants');
const { wordKey } = require('./words');

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const clamp01 = (v) => Math.min(1, Math.max(0, v));

// 统一转换成 0~1 的 [x, y, w, h]；无法解析时返回 null（前端就不画框）
// 模型被要求输出 0~1000 的 [x1,y1,x2,y2]，但不同模型可能给 0~1 或像素坐标，这里做兼容
function normalizeBbox(raw, imageWidth, imageHeight) {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const n = raw.map(Number);
  if (n.some((v) => !Number.isFinite(v) || v < 0)) return null;
  const max = Math.max(...n);
  let sx = 1000; let sy = 1000;
  if (max <= 1) { sx = 1; sy = 1; } else if (max > 1000 && imageWidth > 0 && imageHeight > 0) {
    sx = imageWidth; sy = imageHeight;
  }
  const x1 = clamp01(n[0] / sx); const y1 = clamp01(n[1] / sy);
  const x2 = clamp01(n[2] / sx); const y2 = clamp01(n[3] / sy);
  if (x2 - x1 < 0.01 || y2 - y1 < 0.01) return null;
  const r = (v) => Math.round(v * 1000) / 1000;
  return [r(x1), r(y1), r(x2 - x1), r(y2 - y1)];
}

function normalizeDetection(raw, { imageWidth, imageHeight } = {}) {
  const place = PLACES.includes(raw && raw.place) ? raw.place : '其他';
  const seen = new Set();
  const objects = [];
  for (const o of (raw && Array.isArray(raw.objects) ? raw.objects : [])) {
    const en = wordKey(str(o && o.en, 60));
    if (!en || seen.has(en)) continue;
    seen.add(en);
    const confidence = Number.isFinite(Number(o.confidence)) ? clamp01(Number(o.confidence)) : 0.5;
    const alternatives = (Array.isArray(o.alternatives) ? o.alternatives : [])
      .map((a) => ({ en: wordKey(str(a && a.en, 60)), zh: str(a && a.zh, 30) }))
      .filter((a) => a.en && a.en !== en)
      .slice(0, 2);
    objects.push({
      en,
      zh: str(o.zh, 30),
      category: CATEGORIES.includes(o.category) ? o.category : '其他',
      bbox: normalizeBbox(o.bbox, imageWidth, imageHeight),
      confidence,
      alternatives
    });
    if (objects.length >= MAX_OBJECTS) break;
  }
  return { place, objects };
}

function pairs(list, max) {
  return (Array.isArray(list) ? list : [])
    .map((p) => ({ en: str(p && p.en, 200), zh: str(p && p.zh, 200) }))
    .filter((p) => p.en)
    .slice(0, max);
}

function normalizeDetail(raw, en, fallbackZh) {
  if (!raw || typeof raw !== 'object') throw new Error('单词详情为空');
  const phonetic = raw.phonetic || {};
  const examples = pairs(raw.examples, 3);
  if (!examples.length) throw new Error('单词详情缺少例句');
  let confusables = null;
  if (raw.confusables && Array.isArray(raw.confusables.words) && raw.confusables.words.length >= 2 && str(raw.confusables.explanation)) {
    confusables = {
      words: raw.confusables.words.map((w) => str(w, 40)).filter(Boolean).slice(0, 4),
      explanation: str(raw.confusables.explanation, 300)
    };
  }
  let usUk = null;
  if (raw.usUk && str(raw.usUk.us) && str(raw.usUk.uk) && wordKey(raw.usUk.us) !== wordKey(raw.usUk.uk)) {
    usUk = { us: str(raw.usUk.us, 60), uk: str(raw.usUk.uk, 60), note: str(raw.usUk.note, 200) };
  }
  return {
    en,
    zh: str(raw.zh, 30) || fallbackZh || '',
    phonetic: { us: str(phonetic.us, 60), uk: str(phonetic.uk, 60) },
    examples,
    collocations: pairs(raw.collocations, 4),
    confusables,
    usUk
  };
}

module.exports = { normalizeBbox, normalizeDetection, normalizeDetail };
