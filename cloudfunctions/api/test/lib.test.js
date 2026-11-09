const test = require('node:test');
const assert = require('node:assert/strict');
const { beijingDate } = require('../lib/time');
const { summarize, chargeSource } = require('../lib/quota');
const { extractJson } = require('../lib/ai');
const { normalizeBbox, normalizeDetection, normalizeDetail } = require('../lib/normalize');
const { wordKey } = require('../lib/words');

test('北京时间日期：UTC 16:00 已经是第二天', () => {
  assert.equal(beijingDate(new Date('2026-11-08T15:59:59Z')), '2026-11-08');
  assert.equal(beijingDate(new Date('2026-11-08T16:00:00Z')), '2026-11-09');
});

test('额度：新的一天重置免费次数', () => {
  const q = summarize({ dailyDate: '2026-11-08', dailyUsed: 10, points: 0 }, '2026-11-09');
  assert.equal(q.freeLeft, 10);
  assert.equal(q.canRecognize, true);
});

test('额度：免费用完且没点数时不能识别', () => {
  const user = { dailyDate: '2026-11-09', dailyUsed: 10, points: 0 };
  assert.equal(summarize(user, '2026-11-09').canRecognize, false);
  assert.equal(chargeSource(user, '2026-11-09'), null);
});

test('额度：优先扣免费次数，用完再扣点数', () => {
  assert.equal(chargeSource({ dailyDate: '2026-11-09', dailyUsed: 9, points: 5 }, '2026-11-09'), 'free');
  assert.equal(chargeSource({ dailyDate: '2026-11-09', dailyUsed: 10, points: 5 }, '2026-11-09'), 'points');
});

test('额度：支付开关透传给前端', () => {
  assert.equal(summarize({}, '2026-11-09').paymentEnabled, false);
  assert.equal(summarize({}, '2026-11-09', true).paymentEnabled, true);
});

test('extractJson 兼容代码块和多余文字', () => {
  assert.deepEqual(extractJson('好的：\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('结果 {"a":{"b":2}} 完'), { a: { b: 2 } });
  assert.throws(() => extractJson('没有'));
});

test('bbox：0~1000、0~1、像素坐标都能转成 0~1 的 [x,y,w,h]', () => {
  assert.deepEqual(normalizeBbox([100, 200, 600, 700]), [0.1, 0.2, 0.5, 0.5]);
  assert.deepEqual(normalizeBbox([0.1, 0.2, 0.6, 0.7]), [0.1, 0.2, 0.5, 0.5]);
  assert.deepEqual(normalizeBbox([300, 400, 1800, 1400], 3000, 2000), [0.1, 0.2, 0.5, 0.5]);
  assert.equal(normalizeBbox([1, 2, 3]), null);
  assert.equal(normalizeBbox([500, 500, 500, 600]), null);
});

test('识别结果清洗：去重、非法类别归为其他、限制数量', () => {
  const raw = {
    place: '火星',
    objects: [
      { en: ' Colander ', zh: '沥水篮', category: '厨具', bbox: [0, 0, 500, 500], confidence: 0.9, alternatives: [{ en: 'strainer', zh: '滤网' }, { en: 'colander' }] },
      { en: 'colander', zh: '重复' },
      { en: 'Wok', zh: '炒锅', category: '武器' },
      ...Array.from({ length: 10 }, (_, i) => ({ en: `thing ${i}` }))
    ]
  };
  const r = normalizeDetection(raw);
  assert.equal(r.place, '其他');
  assert.equal(r.objects.length, 5);
  assert.equal(r.objects[0].en, 'colander');
  assert.deepEqual(r.objects[0].alternatives, [{ en: 'strainer', zh: '滤网' }]);
  assert.equal(r.objects[1].en, 'wok');
  assert.equal(r.objects[1].category, '其他');
  assert.equal(r.objects[1].bbox, null);
});

test('单词详情清洗：英美说法相同则不显示，缺例句报错', () => {
  const d = normalizeDetail({
    zh: '炒锅',
    phonetic: { us: '/wɑːk/', uk: '/wɒk/' },
    examples: [{ en: 'Heat the wok first.', zh: '先把锅烧热。' }],
    collocations: [{ en: 'stir-fry in a wok', zh: '用炒锅炒' }],
    confusables: { words: ['wok', 'pan', 'pot'], explanation: 'wok 是圆底炒锅' },
    usUk: { us: 'wok', uk: 'Wok' }
  }, 'wok');
  assert.equal(d.usUk, null);
  assert.equal(d.confusables.words.length, 3);
  assert.throws(() => normalizeDetail({ examples: [] }, 'wok'));
});

test('wordKey 统一大小写和空格', () => {
  assert.equal(wordKey('  Rice   Cooker '), 'rice cooker');
});
