const { call } = require('../../utils/api');
const audio = require('../../utils/audio');
const config = require('../../config');

Page({
  data: {
    loading: true,
    queue: [],
    pos: 0,
    total: 0,
    finished: 0,
    q: null,
    revealed: false,
    picked: -1,
    voice: 'us',
    stats: { reviewed: 0, remembered: 0 },
    done: false,
    canRemind: !!config.reviewTemplateId,
    reminded: false
  },

  onLoad(query) {
    this.filter = { mode: query.mode, name: query.name ? decodeURIComponent(query.name) : '', deckId: query.deckId };
    if (this.filter.name) wx.setNavigationBarTitle({ title: `复习 · ${this.filter.name}` });
    let voice = 'us';
    try { voice = wx.getStorageSync('voice') || 'us'; } catch (e) { /* 默认美音 */ }
    this.setData({ voice });
    this.load();
  },

  async load() {
    try {
      const { questions } = await call('getReviewSession', this.filter);
      this.setData({ loading: false, queue: questions, total: questions.length });
      if (questions.length) this.show(0);
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.message, icon: 'none' });
    }
  },

  show(pos) {
    const q = this.data.queue[pos];
    this.setData({ pos, q, revealed: false, picked: -1 });
    if (q.type === 'listen') setTimeout(() => this.speak(), 300);
  },

  speak() {
    if (this.data.q) audio.play(this.data.q.en, this.data.voice);
  },

  // 看图说词：先自己想，再看答案
  reveal() {
    this.setData({ revealed: true });
    this.speak();
  },

  // 选择题
  pick(e) {
    if (this.data.revealed) return;
    const i = Number(e.currentTarget.dataset.i);
    this.setData({ picked: i, revealed: true });
    if (this.data.q.type === 'zh2en' || i !== this.data.q.answer) this.speak();
  },

  rate(e) {
    this.finish(e.currentTarget.dataset.g);
  },

  next() {
    this.finish(this.data.picked === this.data.q.answer ? 'good' : 'again');
  },

  finish(grade) {
    const q = this.data.q;
    const queue = this.data.queue.slice();
    const stats = Object.assign({}, this.data.stats);
    let finished = this.data.finished;
    if (!q.retry) {
      // 每个词只按第一次的结果排期；答错的词本轮末尾再看一遍，不重复计分
      call('submitReview', { cardId: q.cardId, grade }).catch((err) => wx.showToast({ title: err.message, icon: 'none' }));
      stats.reviewed++;
      if (grade !== 'again') stats.remembered++;
      finished++;
    }
    if (grade === 'again' && !q.retry) queue.push(Object.assign({}, q, { type: 'recall', retry: true }));
    this.setData({ queue, stats, finished });
    if (this.data.pos + 1 < queue.length) this.show(this.data.pos + 1);
    else this.setData({ done: true, q: null });
  },

  remind() {
    const id = config.reviewTemplateId;
    wx.requestSubscribeMessage({
      tmplIds: [id],
      success: async (res) => {
        if (res[id] !== 'accept') return;
        try {
          await call('subscribeReminder');
          this.setData({ reminded: true });
          wx.showToast({ title: '有词要复习时会提醒你', icon: 'none' });
        } catch (e) {
          wx.showToast({ title: e.message, icon: 'none' });
        }
      }
    });
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  goSnap() {
    wx.switchTab({ url: '/pages/index/index' });
  }
});
