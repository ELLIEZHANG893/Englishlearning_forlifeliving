// 分享：只有主人分享过的卡片别人才能看，且不暴露个人数据
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
const { main } = require('../index');
const call = (action, data = {}) => main(Object.assign({ action }, data));

const CARD_ID = 'card_1';
fake.store.cards = new Map([[CARD_ID, {
  _id: CARD_ID, openid: 'owner', en: 'wok', zh: '炒锅', fileID: 'cloud://env/p.jpg', deckIds: ['d1'],
  detail: { phonetic: { us: '/wɑːk/' }, examples: [{ en: 'Heat the wok.', zh: '把锅烧热。' }], collocations: [] },
  review: { stage: 2 }
}]]);

test('没分享过的卡片，别人看不到', async () => {
  fake.ctx.openid = 'friend';
  assert.equal((await call('getSharedCard', { cardId: CARD_ID })).code, 'NOT_FOUND');
});

test('别人不能替主人分享或生成海报', async () => {
  fake.ctx.openid = 'friend';
  assert.equal((await call('shareCard', { cardId: CARD_ID })).code, 'NOT_FOUND');
  assert.equal((await call('getPoster', { cardId: CARD_ID })).code, 'NOT_FOUND');
});

test('主人分享后好友能看到公开内容，不含复习和卡包数据', async () => {
  fake.ctx.openid = 'owner';
  assert.equal((await call('shareCard', { cardId: CARD_ID })).ok, true);
  fake.ctx.openid = 'friend';
  const r = await call('getSharedCard', { cardId: CARD_ID });
  assert.equal(r.ok, true);
  assert.equal(r.data.en, 'wok');
  assert.equal(r.data.isOwner, false);
  assert.equal(r.data.photoUrl, 'https://tmp/cloud://env/p.jpg');
  assert.equal(r.data.review, undefined);
  assert.equal(r.data.deckIds, undefined);
  assert.equal(r.data.openid, undefined);
});

test('海报：返回小程序码；小程序未发布时返回空码而不是报错', async () => {
  fake.ctx.openid = 'owner';
  const r = await call('getPoster', { cardId: CARD_ID });
  assert.equal(Buffer.from(r.data.qrcode, 'base64').toString(), `qr:${CARD_ID}`);
  fake.ctx.qrFails = true;
  const r2 = await call('getPoster', { cardId: CARD_ID });
  assert.equal(r2.ok, true);
  assert.equal(r2.data.qrcode, '');
});
