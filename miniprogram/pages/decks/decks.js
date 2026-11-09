const { call } = require('../../utils/api');

const MODE_KEY = 'deckMode';
// 卡包封面用的小图标
const ICONS = {
  厨具: '🍳', 餐具: '🥢', 食材调料: '🧂', 家电: '🔌', 清洁用品: '🧽', 洗护用品: '🧴',
  家具: '🛋️', 家居用品: '🏠', 文具: '✏️', 衣物配饰: '👕', 数码产品: '📱',
  厨房: '🍳', 餐厅: '🍽️', 客厅: '🛋️', 卧室: '🛏️', 浴室: '🛁', 超市: '🛒', 办公室: '💼', 户外: '🌳', 其他: '📦'
};

Page({
  data: { mode: 'category', system: [], custom: [], loaded: false },

  onLoad() {
    let mode = 'category';
    try { mode = wx.getStorageSync(MODE_KEY) || 'category'; } catch (e) { /* 默认按类别 */ }
    this.setData({ mode });
  },

  onShow() { this.load(); },

  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); },

  async load() {
    try {
      const res = await call('listDecks', { mode: this.data.mode });
      this.setData({
        loaded: true,
        system: res.system.map((d) => Object.assign({ icon: ICONS[d.name] || '📦' }, d)),
        custom: res.custom
      });
    } catch (e) {
      this.setData({ loaded: true });
      wx.showToast({ title: e.message, icon: 'none' });
    }
  },

  switchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.mode) return;
    this.setData({ mode, system: [] });
    try { wx.setStorageSync(MODE_KEY, mode); } catch (err) { /* 忽略 */ }
    this.load();
  },

  openSystem(e) {
    const name = e.currentTarget.dataset.name;
    wx.navigateTo({ url: `/pages/deck/deck?mode=${this.data.mode}&name=${encodeURIComponent(name)}` });
  },

  openCustom(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/deck/deck?deckId=${id}&name=${encodeURIComponent(name)}` });
  },

  createDeck() {
    wx.showModal({
      title: '新建卡包',
      editable: true,
      placeholderText: '比如：出国前要会的',
      success: async (r) => {
        if (!r.confirm || !r.content) return;
        try {
          await call('createDeck', { name: r.content });
          this.load();
        } catch (e) {
          wx.showToast({ title: e.message, icon: 'none' });
        }
      }
    });
  },

  goSnap() { wx.switchTab({ url: '/pages/index/index' }); }
});
