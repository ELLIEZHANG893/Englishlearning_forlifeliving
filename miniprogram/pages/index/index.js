const { call } = require('../../utils/api');
const { choosePhoto, recognizePhoto } = require('../../utils/photo');
const { LOW_CONFIDENCE } = require('../../utils/constants');

Page({
  data: {
    loaded: false,
    quota: null,
    stats: { cardCount: 0, dueCount: 0, masteredCount: 0, streak: 0 },
    recent: [],
    busy: false
  },

  onShow() {
    this.loadProfile();
  },

  async loadProfile() {
    try {
      const p = await call('getProfile');
      this.setData({ loaded: true, quota: p.quota, stats: p.stats, recent: p.recent });
    } catch (e) {
      this.setData({ loaded: true });
      wx.showToast({ title: e.message, icon: 'none' });
    }
  },

  async onSnap() {
    if (this.data.busy) return;
    const q = this.data.quota;
    if (q && !q.canRecognize) return this.showQuotaExceeded(q);
    const path = await choosePhoto();
    if (!path) return;

    this.setData({ busy: true });
    wx.showLoading({ title: '正在认真看…', mask: true });
    try {
      const rec = await recognizePhoto(path);
      wx.hideLoading();
      await this.afterRecognize(rec);
    } catch (e) {
      wx.hideLoading();
      this.handleError(e);
    } finally {
      this.setData({ busy: false });
      this.loadProfile();
    }
  },

  // 只识别到一个且有把握的物品：直接存卡并进详情；其他情况进结果页让用户选
  async afterRecognize(rec) {
    const objs = rec.objects;
    if (objs.length === 1 && objs[0].confidence >= LOW_CONFIDENCE) {
      const o = objs[0];
      if (o.learnedCardId) {
        wx.showToast({ title: '这个你学过啦', icon: 'none' });
        call('saveSelections', { recognitionId: rec.recognitionId, selections: [{ index: 0 }] }).catch(() => {});
        return wx.navigateTo({ url: `/pages/word/word?id=${o.learnedCardId}` });
      }
      wx.showLoading({ title: '生成例句中…', mask: true });
      try {
        const saved = await call('saveSelections', { recognitionId: rec.recognitionId, selections: [{ index: 0 }] });
        wx.hideLoading();
        const card = saved.cards[0];
        return wx.navigateTo({ url: `/pages/word/word?id=${card.cardId}&justSaved=1` });
      } catch (e) {
        wx.hideLoading();
        return this.handleError(e);
      }
    }
    getApp().globalData.lastRecognition = rec;
    wx.navigateTo({ url: '/pages/result/result' });
  },

  handleError(e) {
    if (e && e.code === 'QUOTA_EXCEEDED') return this.showQuotaExceeded(e.quota || this.data.quota);
    const message = (e && e.code && e.message) || '上传失败，请稍后再试';
    wx.showModal({ title: '提示', content: message, showCancel: false, confirmText: '知道了' });
  },

  showQuotaExceeded(quota) {
    const canBuy = quota && quota.paymentEnabled;
    wx.showModal({
      title: '今日免费次数已用完',
      content: canBuy ? '可以购买点数继续识别，或者明天再来～' : '明天 0 点会恢复 10 次免费识别，明天再来吧～',
      confirmText: canBuy ? '购买点数' : '好的',
      showCancel: !!canBuy,
      cancelText: '明天再来',
      success: (r) => {
        if (canBuy && r.confirm) wx.showToast({ title: '购买功能即将开放', icon: 'none' });
      }
    });
  },

  openWord(e) {
    wx.navigateTo({ url: `/pages/word/word?id=${e.currentTarget.dataset.id}` });
  },

  goReview() {
    wx.navigateTo({ url: '/pages/review/review' });
  },

  goDecks() {
    wx.switchTab({ url: '/pages/decks/decks' });
  },

  onShareAppMessage() {
    return { title: '看到不会说的东西，拍一下就知道英文', path: '/pages/index/index' };
  }
});
