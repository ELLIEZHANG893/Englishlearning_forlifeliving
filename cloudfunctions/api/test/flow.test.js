// 用内存数据库 + 假模型跑通：识别 → 选物品 → 入卡包 → 扣次数
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const { createFake } = require('./fake-cloud');

const fake = createFake();
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'wx-server-sdk') return fake.sdk;
  return origLoad.call(this, request, ...rest);
};

const ai = require('../lib/ai');
let detectReply = null;
let detailCalls = 0;
ai.chatJson = async ({ messages }) => {
  if (Array.isArray(messages[0].content)) return detectReply;
  detailCalls++;
  const en = messages[0].content.match(/单词 "([^"]+)"/)[1];
  return { zh: '中文', phonetic: { us: '/x/', uk: '/y/' }, examples: [{ en: `I use the ${en}.`, zh: '我用它。' }], collocations: [], confusables: null, usUk: null };
};
const { main } = require('../index');
const { FREE_DAILY } = require('../lib/constants');

const call = (action, data = {}) => main(Object.assign({ action }, data));
const FILE = 'cloud://env/photos/1.jpg';
const twoObjects = {
  place: '厨房',
  objects: [
    { en: 'wok', zh: '炒锅', category: '厨具', bbox: [0, 0, 500, 500], confidence: 0.9 },
    { en: 'spatula', zh: '锅铲', category: '厨具', bbox: [500, 500, 900, 900], confidence: 0.4, alternatives: [{ en: 'turner', zh: '翻铲' }] }
  ]
};
const user = () => fake.store.users.get(fake.ctx.openid);

test('多物品识别一次只扣 1 次，并生成两张卡', async () => {
  detectReply = twoObjects;
  const r = await call('recognize', { fileID: FILE, imageWidth: 800, imageHeight: 600 });
  assert.equal(r.ok, true);
  assert.equal(r.data.objects.length, 2);
  assert.equal(user().dailyUsed, 0, '识别本身不扣次数');

  const s = await call('saveSelections', { recognitionId: r.data.recognitionId, selections: [{ index: 0 }, { index: 1, en: 'turner' }] });
  assert.equal(s.ok, true);
  assert.deepEqual(s.data.cards.map((c) => [c.en, c.isNew]), [['wok', true], ['turner', true]]);
  assert.equal(user().dailyUsed, 1);
  assert.equal(s.data.quota.freeLeft, FREE_DAILY - 1);

  const card = fake.store.cards.get(s.data.cards[0].cardId);
  assert.equal(card.category, '厨具');
  assert.equal(card.place, '厨房');
  assert.equal(card.openid, 'user_a');
});

test('同一次识别重复保存不会再扣', async () => {
  const recId = [...fake.store.recognitions.keys()][0];
  const s = await call('saveSelections', { recognitionId: recId, selections: [{ index: 0 }] });
  assert.equal(s.ok, true);
  assert.equal(s.data.cards[0].isNew, false);
  assert.equal(user().dailyUsed, 1);
});

test('再次拍到学过的词：标记学过、不扣次数、不重复生成详情', async () => {
  detectReply = { place: '厨房', objects: [{ en: 'Wok', zh: '炒锅', category: '厨具', confidence: 0.95 }] };
  const before = detailCalls;
  const r = await call('recognize', { fileID: FILE });
  assert.ok(r.data.objects[0].learnedCardId);
  const s = await call('saveSelections', { recognitionId: r.data.recognitionId, selections: [{ index: 0 }] });
  assert.equal(s.data.cards[0].isNew, false);
  assert.equal(user().dailyUsed, 1);
  assert.equal(detailCalls, before);
  const card = fake.store.cards.get(s.data.cards[0].cardId);
  assert.equal(card.encounterCount, 2);
});

test('单词详情全局缓存：其他用户学同一个词不再调用模型', async () => {
  fake.ctx.openid = 'user_b';
  detectReply = { place: '超市', objects: [{ en: 'wok', zh: '炒锅', category: '厨具', confidence: 0.9 }] };
  const before = detailCalls;
  const r = await call('recognize', { fileID: FILE });
  assert.equal(r.data.objects[0].learnedCardId, null, '别人的卡不算学过');
  const s = await call('saveSelections', { recognitionId: r.data.recognitionId, selections: [{ index: 0 }] });
  assert.equal(s.data.cards[0].isNew, true);
  assert.equal(detailCalls, before);
  assert.equal(user().dailyUsed, 1);
});

test('不能读取或保存别人的识别记录和卡片', async () => {
  fake.ctx.openid = 'user_a';
  const bRec = [...fake.store.recognitions.values()].find((x) => x.openid === 'user_b');
  const s = await call('saveSelections', { recognitionId: bRec._id, selections: [{ index: 0 }] });
  assert.equal(s.code, 'NOT_FOUND');
  const bCard = [...fake.store.cards.values()].find((x) => x.openid === 'user_b');
  assert.equal((await call('getCard', { cardId: bCard._id })).code, 'NOT_FOUND');
  assert.equal((await call('deleteCard', { cardId: bCard._id })).code, 'NOT_FOUND');
});

test('候选叫法之外的词不能保存', async () => {
  fake.ctx.openid = 'user_a';
  const recId = [...fake.store.recognitions.keys()][0];
  const s = await call('saveSelections', { recognitionId: recId, selections: [{ index: 1, en: 'lamborghini' }] });
  assert.equal(s.code, 'BAD_REQUEST');
});

test('识别失败不扣次数', async () => {
  fake.ctx.openid = 'user_c';
  detectReply = { place: '其他', objects: [] };
  const r = await call('recognize', { fileID: FILE });
  assert.equal(r.code, 'NOT_RECOGNIZED');
  assert.equal(user().dailyUsed, 0);
  assert.equal(user().detectCount, 1);
});

test('免费用完后：没点数拒绝；有点数扣点数；支付开关默认关闭', async () => {
  fake.ctx.openid = 'user_d';
  await call('getProfile');
  user().dailyUsed = FREE_DAILY;
  detectReply = { place: '厨房', objects: [{ en: 'ladle', zh: '汤勺', category: '厨具', confidence: 0.9 }] };
  const r = await call('recognize', { fileID: FILE });
  assert.equal(r.code, 'QUOTA_EXCEEDED');
  assert.equal(r.quota.paymentEnabled, false);

  user().points = 2;
  const r2 = await call('recognize', { fileID: FILE });
  assert.equal(r2.ok, true);
  const s = await call('saveSelections', { recognitionId: r2.data.recognitionId, selections: [{ index: 0 }] });
  assert.equal(s.ok, true);
  assert.equal(user().points, 1);
  assert.equal(user().dailyUsed, FREE_DAILY);
});

test('跨天自动重置免费次数', async () => {
  fake.ctx.openid = 'user_d';
  user().dailyDate = '2000-01-01';
  const p = await call('getProfile');
  assert.equal(p.data.quota.freeLeft, FREE_DAILY);
});

test('修改卡片类别和地点要校验取值', async () => {
  fake.ctx.openid = 'user_a';
  const card = [...fake.store.cards.values()].find((x) => x.openid === 'user_a');
  assert.equal((await call('updateCard', { cardId: card._id, category: '武器' })).code, 'BAD_REQUEST');
  assert.equal((await call('updateCard', { cardId: card._id, place: '浴室' })).ok, true);
  assert.equal(fake.store.cards.get(card._id).place, '浴室');
  const d = await call('createDeck', { name: '出国前要会的' });
  assert.equal((await call('updateCard', { cardId: card._id, deckIds: [d.data.deckId] })).ok, true);
  assert.equal((await call('createDeck', { name: '出国前要会的' })).code, 'BAD_REQUEST');
});

test('复习：只取到期的卡，提交后按排期顺延，并记连续学习天数', async () => {
  fake.ctx.openid = 'user_a';
  const mine = [...fake.store.cards.values()].filter((c) => c.openid === 'user_a');
  mine[0].review.nextReviewAt = new Date(Date.now() - 1000);
  const s = await call('getReviewSession');
  assert.equal(s.ok, true);
  assert.deepEqual(s.data.questions.map((q) => q.cardId), [mine[0]._id]);

  const r = await call('submitReview', { cardId: mine[0]._id, grade: 'good' });
  assert.equal(r.ok, true);
  assert.equal(r.data.stage, 1);
  assert.equal((await call('getReviewSession')).data.questions.length, 0);
  assert.equal((await call('getProfile')).data.stats.streak, 1);
  assert.equal((await call('submitReview', { cardId: mine[0]._id, grade: 'meh' })).code, 'BAD_REQUEST');
});

test('复习：不能提交别人的卡', async () => {
  fake.ctx.openid = 'user_a';
  const bCard = [...fake.store.cards.values()].find((x) => x.openid === 'user_b');
  assert.equal((await call('submitReview', { cardId: bCard._id, grade: 'good' })).code, 'NOT_FOUND');
});

test('提醒：定时触发只给有到期词且订阅过的人发，并用掉一次订阅', async () => {
  process.env.REMIND_TEMPLATE_ID = 'tmpl';
  fake.ctx.openid = 'user_a';
  await call('subscribeReminder');
  fake.ctx.openid = 'user_c';
  await call('subscribeReminder');
  const aCard = [...fake.store.cards.values()].find((x) => x.openid === 'user_a');
  aCard.review.nextReviewAt = new Date(Date.now() - 1000);

  fake.ctx.openid = undefined;
  const res = await main({ Type: 'Timer' });
  assert.equal(res.sent, 1);
  assert.equal(fake.sentMessages[0].touser, 'user_a');
  assert.equal(fake.store.users.get('user_a').reminderSubs, 0);
  assert.equal(fake.store.users.get('user_c').reminderSubs, 1, '没有到期词的人保留订阅');
});

test('小程序端伪造定时触发无效', async () => {
  fake.ctx.openid = 'user_a';
  const before = fake.sentMessages.length;
  const res = await main({ Type: 'Timer' });
  assert.equal(res.ok, false);
  assert.equal(fake.sentMessages.length, before);
});
