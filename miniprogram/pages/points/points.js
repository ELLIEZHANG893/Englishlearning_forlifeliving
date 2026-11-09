const { call } = require('../../utils/api');
const { canBuy, isIOS } = require('../../utils/platform');

const promisify = (fn) => (opts = {}) => new Promise((resolve, reject) => fn(Object.assign({}, opts, { success: resolve, fail: reject })));
const REASONS = { purchase: '购买', recognize: '识别' };

Page({
  data: { quota: null, packages: [], logs: [], canBuy: false, iosBlocked: false, paying: false },

  onShow() { this.load(); },

  async load() {
    try {
      const info = await call('getPointsInfo');
      const ok = canBuy(info.quota);
      this.setData({
        quota: info.quota,
        packages: info.packages,
        canBuy: ok,
        iosBlocked: info.quota.paymentEnabled && !ok && isIOS(),
        logs: info.logs.map((l) => {
          const d = new Date(l.createdAt);
          return Object.assign({}, l, {
            reasonText: REASONS[l.reason] || l.reason,
            timeText: isNaN(d) ? '' : `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
          });
        })
      });
    } catch (e) {
      wx.showToast({ title: e.message, icon: 'none' });
    }
  },

  async buy(e) {
    if (this.data.paying) return;
    const packageId = e.currentTarget.dataset.id;
    this.setData({ paying: true });
    let order;
    try {
      order = await call('createOrder', { packageId });
    } catch (err) {
      this.setData({ paying: false });
      return wx.showToast({ title: err.message, icon: 'none' });
    }
    try {
      await promisify(wx.requestPayment)(order.payment);
    } catch (err) {
      this.setData({ paying: false });
      const cancelled = /cancel/.test((err && err.errMsg) || '');
      return wx.showToast({ title: cancelled ? '已取消支付' : '支付没有成功', icon: 'none' });
    }
    // 支付成功后向服务器确认，回调偶尔会慢一点，最多试 3 次
    wx.showLoading({ title: '确认中…', mask: true });
    let paid = false;
    for (let i = 0; i < 3 && !paid; i++) {
      try {
        const r = await call('confirmOrder', { outTradeNo: order.outTradeNo });
        paid = r.paid;
      } catch (err) { /* 再试 */ }
      if (!paid) await new Promise((r) => setTimeout(r, 1500));
    }
    wx.hideLoading();
    this.setData({ paying: false });
    wx.showToast({ title: paid ? '购买成功' : '支付成功，点数稍后到账', icon: 'none' });
    this.load();
  }
});
