// 随手拍英语 云函数入口：按 action 分发
const cloud = require('wx-server-sdk');
const { CATEGORIES, PLACES, FREE_DAILY } = require('./lib/constants');
const { beijingDate, addDays } = require('./lib/time');
const { summarize, chargeSource } = require('./lib/quota');
const { wordKey } = require('./lib/words');
const { config: aiConfig, chatJson } = require('./lib/ai');
const { detectPrompt, detailPrompt } = require('./lib/prompts');
const { normalizeDetection, normalizeDetail } = require('./lib/normalize');
const { MASTERED_STAGE, schedule, nextStreak, currentStreak, buildQuestion } = require('./lib/review');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

const users = () => db.collection('users');
const cards = () => db.collection('cards');
const words = () => db.collection('words');
const decks = () => db.collection('decks');
const recognitions = () => db.collection('recognitions');

const PAGE_SIZE = 20;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

class AppError extends Error {
  constructor(code, message, extra) { super(message); this.code = code; this.extra = extra; }
}

const paymentEnabled = () => process.env.PAYMENT_ENABLED === 'true';

async function getDoc(coll, id) {
  try { return (await coll.doc(id).get()).data; } catch (e) { return null; }
}

// 取用户；不存在则创建；跨天则重置当日计数
async function ensureUser(openid, today) {
  let user = await getDoc(users(), openid);
  if (!user) {
    user = { points: 0, dailyDate: today, dailyUsed: 0, detectCount: 0, voice: 'us', createdAt: db.serverDate() };
    await users().doc(openid).set({ data: user });
    return Object.assign({ _id: openid }, user);
  }
  if (user.dailyDate !== today) {
    await users().doc(openid).update({ data: { dailyDate: today, dailyUsed: 0, detectCount: 0 } });
    Object.assign(user, { dailyDate: today, dailyUsed: 0, detectCount: 0 });
  }
  return user;
}

const yesterdayOf = () => beijingDate(addDays(new Date(), -1));

// 学了新词或完成复习都算当天学习过
async function touchStreak(openid, today) {
  const user = await getDoc(users(), openid);
  if (user && user.lastStudyDate === today) return;
  await users().doc(openid).update({ data: nextStreak(user, today, yesterdayOf()) });
}

async function ownedCard(openid, cardId) {
  const card = cardId && await getDoc(cards(), cardId);
  if (!card || card.openid !== openid) throw new AppError('NOT_FOUND', '卡片不存在');
  return card;
}

// ---------- 首页 ----------

async function getProfile(openid) {
  const today = beijingDate();
  const user = await ensureUser(openid, today);
  const [total, due, mastered, recent] = await Promise.all([
    cards().where({ openid }).count(),
    cards().where({ openid, 'review.nextReviewAt': _.lte(new Date()) }).count(),
    cards().where({ openid, 'review.stage': _.gte(MASTERED_STAGE) }).count(),
    cards().where({ openid }).orderBy('createdAt', 'desc').limit(6)
      .field({ en: true, zh: true, fileID: true }).get()
  ]);
  return {
    quota: summarize(user, today, paymentEnabled()),
    voice: user.voice || 'us',
    stats: {
      cardCount: total.total,
      dueCount: due.total,
      masteredCount: mastered.total,
      streak: currentStreak(user, today, yesterdayOf())
    },
    reminderSubs: user.reminderSubs || 0,
    recent: recent.data
  };
}

// ---------- 识别 ----------

async function recognize(openid, { fileID, imageWidth, imageHeight }) {
  if (typeof fileID !== 'string' || !fileID.startsWith('cloud://')) throw new AppError('BAD_REQUEST', '图片无效');
  const today = beijingDate();
  const user = await ensureUser(openid, today);
  const quota = summarize(user, today, paymentEnabled());
  if (!quota.canRecognize) throw new AppError('QUOTA_EXCEEDED', '今日免费次数已用完，明天再来吧', { quota });
  if (quota.detectLimitReached) throw new AppError('DETECT_LIMIT', '今天识别得太多啦，休息一下明天再来');

  // 先记一次调用（不论成功与否），用于防刷
  await users().doc(openid).update({ data: { detectCount: _.inc(1) } });

  const { fileContent } = await cloud.downloadFile({ fileID });
  if (fileContent.length > MAX_IMAGE_BYTES) throw new AppError('BAD_REQUEST', '图片太大了，换一张试试');
  const mime = /\.png$/i.test(fileID) ? 'image/png' : 'image/jpeg';

  let raw;
  try {
    raw = await chatJson({
      model: aiConfig().visionModel,
      timeoutMs: 25000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mime};base64,${fileContent.toString('base64')}` } },
          { type: 'text', text: detectPrompt() }
        ]
      }]
    });
  } catch (e) {
    console.error('detect failed', e);
    throw new AppError('AI_ERROR', '识别服务开小差了，请稍后再试');
  }

  const det = normalizeDetection(raw, { imageWidth: Number(imageWidth), imageHeight: Number(imageHeight) });
  if (!det.objects.length) throw new AppError('NOT_RECOGNIZED', '没看清，换个角度再拍一次');

  // 标出已经学过的词
  const keys = det.objects.map((o) => o.en);
  const learned = await cards().where({ openid, wordKey: _.in(keys) }).field({ wordKey: true }).get();
  const learnedMap = {};
  learned.data.forEach((c) => { learnedMap[c.wordKey] = c._id; });
  const objects = det.objects.map((o) => Object.assign({}, o, { learnedCardId: learnedMap[o.en] || null }));

  const { _id } = await recognitions().add({
    data: {
      openid, fileID, place: det.place, objects,
      imageWidth: Number(imageWidth) || 0, imageHeight: Number(imageHeight) || 0,
      charged: false, createdAt: db.serverDate()
    }
  });
  return { recognitionId: _id, fileID, place: det.place, objects };
}

// 取单词详情：先查全局缓存，没有再让模型生成并写入缓存
async function getWordDetail(en, zh) {
  const key = wordKey(en);
  const hit = await words().where({ wordKey: key }).limit(1).get();
  if (hit.data.length) return hit.data[0].detail;
  let detail;
  try {
    const raw = await chatJson({ model: aiConfig().textModel, messages: [{ role: 'user', content: detailPrompt(key, zh) }] });
    detail = normalizeDetail(raw, key, zh);
  } catch (e) {
    console.error('detail failed', key, e);
    throw new AppError('AI_ERROR', '生成单词详情失败，请稍后再试');
  }
  await words().add({ data: { wordKey: key, detail, createdAt: db.serverDate() } });
  return detail;
}

// 扣一次：优先免费次数，其次点数。用条件更新防止并发超扣
async function chargeOnce(openid, today, user) {
  if (chargeSource(user, today) === 'free') {
    const r = await users().where({ _id: openid, dailyDate: today, dailyUsed: _.lt(FREE_DAILY) })
      .update({ data: { dailyUsed: _.inc(1) } });
    if (r.stats.updated === 1) return 'free';
  }
  const r = await users().where({ _id: openid, points: _.gt(0) }).update({ data: { points: _.inc(-1) } });
  if (r.stats.updated === 1) {
    await db.collection('point_logs').add({ data: { openid, delta: -1, reason: 'recognize', createdAt: db.serverDate() } });
    return 'points';
  }
  return null;
}

// 用户确认要学的物品 → 生成详情 → 存入卡包。一次识别最多扣 1 次，已学过的词不扣
async function saveSelections(openid, { recognitionId, selections }) {
  const rec = recognitionId && await getDoc(recognitions(), recognitionId);
  if (!rec || rec.openid !== openid) throw new AppError('NOT_FOUND', '识别记录不存在');
  if (!Array.isArray(selections) || !selections.length) throw new AppError('BAD_REQUEST', '请至少选择一个物品');

  // 解析选择：可以选识别结果本身，也可以选它的候选叫法
  const picks = [];
  const seen = new Set();
  for (const s of selections.slice(0, rec.objects.length)) {
    const obj = rec.objects[s && s.index];
    if (!obj) continue;
    const alt = s.en && s.en !== obj.en ? obj.alternatives.find((a) => a.en === s.en) : null;
    if (s.en && s.en !== obj.en && !alt) continue;
    const en = alt ? alt.en : obj.en;
    if (seen.has(en)) continue;
    seen.add(en);
    picks.push({ en, zh: alt ? alt.zh : obj.zh, obj });
  }
  if (!picks.length) throw new AppError('BAD_REQUEST', '请至少选择一个物品');

  const existing = await cards().where({ openid, wordKey: _.in(picks.map((p) => p.en)) }).field({ wordKey: true }).get();
  const existingMap = {};
  existing.data.forEach((c) => { existingMap[c.wordKey] = c._id; });
  const toCreate = picks.filter((p) => !existingMap[p.en]);

  const today = beijingDate();
  let user = await ensureUser(openid, today);
  if (toCreate.length && !rec.charged && !chargeSource(user, today)) {
    throw new AppError('QUOTA_EXCEEDED', '今日免费次数已用完，明天再来吧', { quota: summarize(user, today, paymentEnabled()) });
  }

  // 先生成详情（失败不扣次数）
  const details = await Promise.all(toCreate.map((p) => getWordDetail(p.en, p.zh)));

  if (toCreate.length && !rec.charged) {
    const mark = await recognitions().where({ _id: recognitionId, charged: false }).update({ data: { charged: true } });
    if (mark.stats.updated === 1) {
      const source = await chargeOnce(openid, today, user);
      if (!source) {
        await recognitions().doc(recognitionId).update({ data: { charged: false } });
        user = await ensureUser(openid, today);
        throw new AppError('QUOTA_EXCEEDED', '今日免费次数已用完，明天再来吧', { quota: summarize(user, today, paymentEnabled()) });
      }
    }
  }

  const now = new Date();
  const result = [];
  for (let i = 0; i < picks.length; i++) {
    const p = picks[i];
    if (existingMap[p.en]) {
      // 同一次识别重复保存只记一次"再次遇见"
      await cards().where({ _id: existingMap[p.en], lastRecognitionId: _.neq(recognitionId) })
        .update({ data: { encounterCount: _.inc(1), lastRecognitionId: recognitionId, lastSeenAt: db.serverDate() } });
      result.push({ cardId: existingMap[p.en], en: p.en, isNew: false });
      continue;
    }
    const detail = details[toCreate.indexOf(p)];
    const { _id } = await cards().add({
      data: {
        openid,
        wordKey: p.en,
        en: p.en,
        zh: detail.zh || p.zh,
        category: p.obj.category,
        place: rec.place,
        deckIds: [],
        fileID: rec.fileID,
        bbox: p.obj.bbox,
        recognitionId,
        lastRecognitionId: recognitionId,
        detail,
        encounterCount: 1,
        review: { stage: 0, nextReviewAt: addDays(now, 1), lastReviewedAt: null },
        createdAt: db.serverDate()
      }
    });
    result.push({ cardId: _id, en: p.en, isNew: true });
  }

  if (result.some((c) => c.isNew)) await touchStreak(openid, today);
  user = await ensureUser(openid, today);
  return { cards: result, quota: summarize(user, today, paymentEnabled()) };
}

// ---------- 卡片与卡包 ----------

async function getCard(openid, { cardId }) {
  const card = await ownedCard(openid, cardId);
  const deckList = card.deckIds && card.deckIds.length
    ? (await decks().where({ _id: _.in(card.deckIds), openid }).get()).data : [];
  return { card, decks: deckList };
}

function modeField(mode) { return mode === 'place' ? 'place' : 'category'; }

async function listDecks(openid, { mode }) {
  const field = modeField(mode);
  const order = field === 'place' ? PLACES : CATEGORIES;
  const now = new Date();
  const agg = await cards().aggregate()
    .match({ openid })
    .group({
      _id: `$${field}`,
      count: $.sum(1),
      due: $.sum($.cond({ if: $.lte(['$review.nextReviewAt', now]), then: 1, else: 0 }))
    })
    .end();
  const system = agg.list
    .map((g) => ({ name: g._id, count: g.count, due: g.due }))
    .sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));

  const custom = (await decks().where({ openid }).orderBy('createdAt', 'asc').get()).data;
  let customCounts = {};
  if (custom.length) {
    const c = await cards().aggregate().match({ openid }).unwind('$deckIds')
      .group({ _id: '$deckIds', count: $.sum(1) }).end();
    c.list.forEach((g) => { customCounts[g._id] = g.count; });
  }
  return {
    mode: field,
    system,
    custom: custom.map((d) => ({ deckId: d._id, name: d.name, count: customCounts[d._id] || 0 }))
  };
}

async function listCards(openid, { mode, name, deckId, skip = 0, sort = 'new' }) {
  const where = { openid };
  if (deckId) where.deckIds = deckId;
  else if (name) where[modeField(mode)] = name;
  const res = await cards().where(where)
    .orderBy('createdAt', sort === 'old' ? 'asc' : 'desc')
    .skip(Math.max(0, Number(skip) || 0)).limit(PAGE_SIZE)
    .field({ en: true, zh: true, fileID: true, bbox: true, 'detail.phonetic': true, review: true })
    .get();
  return { list: res.data, hasMore: res.data.length === PAGE_SIZE };
}

async function updateCard(openid, { cardId, category, place, deckIds }) {
  await ownedCard(openid, cardId);
  const data = {};
  if (category !== undefined) {
    if (!CATEGORIES.includes(category)) throw new AppError('BAD_REQUEST', '类别无效');
    data.category = category;
  }
  if (place !== undefined) {
    if (!PLACES.includes(place)) throw new AppError('BAD_REQUEST', '地点无效');
    data.place = place;
  }
  if (deckIds !== undefined) {
    const ids = Array.isArray(deckIds) ? [...new Set(deckIds.filter((d) => typeof d === 'string'))] : [];
    if (ids.length) {
      const owned = await decks().where({ _id: _.in(ids), openid }).count();
      if (owned.total !== ids.length) throw new AppError('BAD_REQUEST', '卡包无效');
    }
    data.deckIds = ids;
  }
  if (Object.keys(data).length) await cards().doc(cardId).update({ data });
  return { updated: true };
}

async function createDeck(openid, { name }) {
  const n = typeof name === 'string' ? name.trim() : '';
  if (!n || n.length > 20) throw new AppError('BAD_REQUEST', '卡包名 1～20 个字');
  const dup = await decks().where({ openid, name: n }).count();
  if (dup.total) throw new AppError('BAD_REQUEST', '已经有同名卡包了');
  const { _id } = await decks().add({ data: { openid, name: n, createdAt: db.serverDate() } });
  return { deckId: _id, name: n };
}

async function deleteCard(openid, { cardId }) {
  await ownedCard(openid, cardId);
  await cards().doc(cardId).remove();
  return { deleted: true };
}

async function setVoice(openid, { voice }) {
  if (voice !== 'us' && voice !== 'uk') throw new AppError('BAD_REQUEST', '发音偏好无效');
  await ensureUser(openid, beijingDate());
  await users().doc(openid).update({ data: { voice } });
  return { voice };
}

// ---------- 复习 ----------

const REVIEW_LIMIT = 20;
const POOL_SIZE = 100;

// 取到期的卡片并出题；可以限定在某个卡包里
async function getReviewSession(openid, { mode, name, deckId, limit }) {
  const where = { openid, 'review.nextReviewAt': _.lte(new Date()) };
  if (deckId) where.deckIds = deckId;
  else if (name) where[modeField(mode)] = name;
  const n = Math.min(REVIEW_LIMIT, Math.max(1, Number(limit) || REVIEW_LIMIT));
  const fields = { en: true, zh: true, wordKey: true, fileID: true, 'detail.phonetic': true, review: true };
  const [due, pool] = await Promise.all([
    cards().where(where).orderBy('review.nextReviewAt', 'asc').limit(n).field(fields).get(),
    cards().where({ openid }).orderBy('createdAt', 'desc').limit(POOL_SIZE).field(fields).get()
  ]);
  return { questions: due.data.map((c) => buildQuestion(c, pool.data)) };
}

async function submitReview(openid, { cardId, grade }) {
  const card = await ownedCard(openid, cardId);
  let review;
  try { review = schedule(card.review, grade); } catch (e) { throw new AppError('BAD_REQUEST', '复习结果无效'); }
  await cards().doc(cardId).update({ data: { review } });
  await ensureUser(openid, beijingDate());
  await touchStreak(openid, beijingDate());
  return { stage: review.stage, nextReviewAt: review.nextReviewAt, mastered: review.stage >= MASTERED_STAGE };
}

// 用户每同意一次订阅，就可以给他发一条提醒（微信一次性订阅消息的规则）
async function subscribeReminder(openid) {
  await ensureUser(openid, beijingDate());
  await users().doc(openid).update({ data: { reminderSubs: _.inc(1) } });
  const user = await getDoc(users(), openid);
  return { reminderSubs: user.reminderSubs };
}

const handlers = {
  getProfile, recognize, saveSelections, getCard, listDecks, listCards, updateCard, createDeck, deleteCard, setVoice,
  getReviewSession, submitReview, subscribeReminder
};

// ---------- 每日复习提醒（定时触发） ----------
// 订阅消息模板在小程序后台选，字段名要和模板对上。这里按「学习提醒」类模板：
//   thing1 学习内容，thing2 温馨提示。换模板时改 REMIND_FIELDS
const REMIND_FIELDS = { content: 'thing1', tip: 'thing2' };

async function sendReminders() {
  const templateId = process.env.REMIND_TEMPLATE_ID;
  if (!templateId) return { sent: 0, skipped: 'REMIND_TEMPLATE_ID 未配置' };
  const now = new Date();
  let sent = 0;
  let failed = 0;
  const list = (await users().where({ reminderSubs: _.gt(0) }).limit(100).get()).data;
  for (const u of list) {
    const due = await cards().where({ openid: u._id, 'review.nextReviewAt': _.lte(now) }).count();
    if (!due.total) continue;
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: u._id,
        templateId,
        page: 'pages/review/review',
        data: {
          [REMIND_FIELDS.content]: { value: `今天有 ${due.total} 个单词待复习` },
          [REMIND_FIELDS.tip]: { value: '花两分钟复习一下，记得更牢' }
        }
      });
      sent++;
    } catch (e) {
      failed++;
      console.error('remind failed', u._id, e.errCode || e.message);
    }
    // 不论成败都用掉这次授权（失败通常是用户已拒收）
    await users().doc(u._id).update({ data: { reminderSubs: _.inc(-1) } });
  }
  return { sent, failed };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  // 定时触发器调用时没有 OPENID；小程序端的调用一定带 OPENID，伪造不了
  if (!OPENID && event && event.Type === 'Timer') return sendReminders();
  if (!OPENID) return { ok: false, code: 'BAD_REQUEST', message: '未登录' };
  const handler = handlers[event && event.action];
  if (!handler) return { ok: false, code: 'BAD_REQUEST', message: '未知操作' };
  try {
    const data = await handler(OPENID, event || {});
    return { ok: true, data };
  } catch (e) {
    if (e instanceof AppError) return Object.assign({ ok: false, code: e.code, message: e.message }, e.extra || {});
    console.error(event.action, e);
    return { ok: false, code: 'SERVER_ERROR', message: '服务器开小差了，请稍后再试' };
  }
};
