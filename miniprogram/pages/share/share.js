// 好友打开分享链接或扫海报上的小程序码看到的单词卡
const { call } = require('../../utils/api');
const audio = require('../../utils/audio');

Page({
  data: { card: null, error: '' },

  onLoad(q) {
    // 扫小程序码进来时卡片 ID 在 scene 里
    this.cardId = q.id || (q.scene ? decodeURIComponent(q.scene) : '');
    this.load();
  },

  async load() {
    if (!this.cardId) return this.setData({ error: '链接不完整' });
    try {
      const card = await call('getSharedCard', { cardId: this.cardId });
      this.setData({ card });
      audio.play(card.en);
    } catch (e) {
      this.setData({ error: e.message });
    }
  },

  speak() { audio.play(this.data.card.en); },

  speakText(e) { audio.play(e.currentTarget.dataset.text); },

  openMine() {
    wx.redirectTo({ url: `/pages/word/word?id=${this.cardId}` });
  },

  goSnap() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  onShareAppMessage() {
    const c = this.data.card;
    return {
      title: c ? `${c.zh} 用英语怎么说？` : '随手拍英语',
      path: `/pages/share/share?id=${this.cardId}`,
      imageUrl: c && c.photoUrl ? c.photoUrl : undefined
    };
  }
});
