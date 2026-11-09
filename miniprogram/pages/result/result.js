const { call } = require('../../utils/api');
const { LOW_CONFIDENCE } = require('../../utils/constants');

Page({
  data: {
    rec: null,
    objects: [],
    selectedCount: 0,
    saving: false,
    saved: null
  },

  onLoad() {
    const rec = getApp().globalData.lastRecognition;
    if (!rec) return wx.navigateBack();
    // 默认选中第一个没学过的物品
    const firstNew = rec.objects.findIndex((o) => !o.learnedCardId);
    const objects = rec.objects.map((o, i) => Object.assign({}, o, {
      selected: i === firstNew,
      lowConfidence: o.confidence < LOW_CONFIDENCE,
      chosenEn: o.en,
      options: [{ en: o.en, zh: o.zh }].concat(o.alternatives || [])
    }));
    this.setData({ rec, objects });
    this.updateCount();
  },

  updateCount() {
    this.setData({ selectedCount: this.data.objects.filter((o) => o.selected).length });
  },

  toggle(e) {
    const i = e.currentTarget.dataset.i;
    this.setData({ [`objects[${i}].selected`]: !this.data.objects[i].selected });
    this.updateCount();
  },

  // 低置信度时用户从候选叫法里选一个
  chooseName(e) {
    const { i, en } = e.currentTarget.dataset;
    this.setData({ [`objects[${i}].chosenEn`]: en, [`objects[${i}].selected`]: true });
    this.updateCount();
  },

  async onSave() {
    const selections = this.data.objects
      .map((o, index) => ({ o, index }))
      .filter(({ o }) => o.selected)
      .map(({ o, index }) => ({ index, en: o.chosenEn }));
    if (!selections.length) return wx.showToast({ title: '先点选要学的物品', icon: 'none' });

    this.setData({ saving: true });
    wx.showLoading({ title: '生成例句中…', mask: true });
    try {
      const res = await call('saveSelections', { recognitionId: this.data.rec.recognitionId, selections });
      wx.hideLoading();
      if (res.cards.length === 1) {
        return wx.redirectTo({ url: `/pages/word/word?id=${res.cards[0].cardId}&justSaved=${res.cards[0].isNew ? 1 : 0}` });
      }
      this.setData({ saved: res.cards });
      wx.showToast({ title: `已存入 ${res.cards.filter((c) => c.isNew).length} 个新词`, icon: 'none' });
    } catch (e) {
      wx.hideLoading();
      const quotaOut = e.code === 'QUOTA_EXCEEDED';
      wx.showModal({ title: quotaOut ? '今日免费次数已用完' : '提示', content: quotaOut ? '明天 0 点会恢复 10 次免费识别～' : e.message, showCancel: false });
    } finally {
      this.setData({ saving: false });
    }
  },

  noop() {},

  openWord(e) {
    wx.navigateTo({ url: `/pages/word/word?id=${e.currentTarget.dataset.id}` });
  }
});
