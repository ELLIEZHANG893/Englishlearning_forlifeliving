// 点数购买：开关、下单、回调与主动确认都只加一次点数、伪造回调无效
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
const pay = fake.sdk.cloudPay;
const user = (id) => fake.store.users.get(id);

test('开关默认关闭：不能下单，前端拿到 paymentEnabled=false', async () => {
  delete process.env.PAYMENT_ENABLED;
  fake.ctx.openid = 'u1';
  const info = await call('getPointsInfo');
  assert.equal(info.data.quota.paymentEnabled, false);
  assert.equal(info.data.quota.iosPaymentEnabled, false);
  assert.equal(info.data.packages.length, 2);
  assert.equal((await call('createOrder', { packageId: 'p30' })).code, 'PAYMENT_DISABLED');
});

test('下单金额按套餐来，不信任前端', async () => {
  process.env.PAYMENT_ENABLED = 'true';
  process.env.PAY_SUB_MCH_ID = '1900000001';
  fake.ctx.openid = 'u1';
  assert.equal((await call('createOrder', { packageId: 'free' })).code, 'BAD_REQUEST');
  const r = await call('createOrder', { packageId: 'p100', totalFee: 1 });
  assert.equal(r.ok, true);
  assert.equal(pay.lastUnified.totalFee, 1800);
  assert.equal(pay.lastUnified.functionName, 'api');
  assert.equal(pay.lastUnified.envId, 'test-env');
  assert.ok(r.data.payment.paySign);
});

test('未支付时确认不加点；支付后回调和主动确认合计只加一次', async () => {
  fake.ctx.openid = 'u1';
  const r = await call('createOrder', { packageId: 'p30' });
  const no = r.data.outTradeNo;
  assert.equal((await call('confirmOrder', { outTradeNo: no })).data.paid, false);
  assert.equal(user('u1').points || 0, 0);

  pay.orders[no].tradeState = 'SUCCESS';
  fake.ctx.openid = undefined;
  assert.deepEqual(await main({ outTradeNo: no, returnCode: 'SUCCESS', resultCode: 'SUCCESS' }), { errcode: 0, errmsg: '' });
  fake.ctx.openid = 'u1';
  const c = await call('confirmOrder', { outTradeNo: no });
  assert.equal(c.data.paid, true);
  assert.equal(user('u1').points, 30);
  assert.equal(c.data.quota.points, 30);
  const logs = (await call('getPointsInfo')).data.logs;
  assert.equal(logs.filter((l) => l.outTradeNo === no).length, 1);
});

test('伪造的支付回调不加点（以微信支付查询结果为准）', async () => {
  fake.ctx.openid = 'u2';
  const r = await call('createOrder', { packageId: 'p100' });
  fake.ctx.openid = undefined;
  await main({ outTradeNo: r.data.outTradeNo, returnCode: 'SUCCESS', resultCode: 'SUCCESS' });
  assert.equal((user('u2') || {}).points || 0, 0);
  // 小程序端带着 OPENID 伪造回调字段，也只会被当成普通调用
  fake.ctx.openid = 'u2';
  const fakeCb = await main({ outTradeNo: r.data.outTradeNo, returnCode: 'SUCCESS' });
  assert.equal(fakeCb.ok, false);
  assert.equal((user('u2') || {}).points || 0, 0);
});

test('不能确认别人的订单', async () => {
  fake.ctx.openid = 'u1';
  const r = await call('createOrder', { packageId: 'p30' });
  fake.ctx.openid = 'u2';
  assert.equal((await call('confirmOrder', { outTradeNo: r.data.outTradeNo })).code, 'NOT_FOUND');
});

test('统一下单失败时订单标为失败并提示', async () => {
  fake.ctx.openid = 'u3';
  fake.ctx.payFails = true;
  const r = await call('createOrder', { packageId: 'p30' });
  assert.equal(r.code, 'PAY_ERROR');
  fake.ctx.payFails = false;
  const order = [...fake.store.orders.values()].find((o) => o.openid === 'u3');
  assert.equal(order.status, 'failed');
});

test('买到的点数在免费次数用完后被使用', async () => {
  fake.ctx.openid = 'u1';
  user('u1').dailyUsed = 10;
  const p = await call('getProfile');
  assert.equal(p.data.quota.canRecognize, true);
  assert.equal(p.data.quota.points, 30);
});
