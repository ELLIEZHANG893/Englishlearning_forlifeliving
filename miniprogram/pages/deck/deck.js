const { call } = require('../../utils/api');

Page({
  data: { list: [], hasMore: true, loading: false, sort: 'new', name: '' },

  onLoad(q) {
    this.query = { mode: q.mode, name: q.name ? decodeURIComponent(q.name) : '', deckId: q.deckId };
    this.setData({ name: this.query.name });
    wx.setNavigationBarTitle({ title: this.query.name || '卡包' });
  },

  onShow() { this.reload(); },

  reload() {
    this.setData({ list: [], hasMore: true });
    return this.loadMore();
  },

  async loadMore() {
    if (this.data.loading || !this.data.hasMore) return;
    this.setData({ loading: true });
    try {
      const res = await call('listCards', Object.assign({ skip: this.data.list.length, sort: this.data.sort }, this.query));
      this.setData({ list: this.data.list.concat(res.list), hasMore: res.hasMore });
    } catch (e) {
      wx.showToast({ title: e.message, icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onReachBottom() { this.loadMore(); },

  toggleSort() {
    this.setData({ sort: this.data.sort === 'new' ? 'old' : 'new' });
    this.reload();
  },

  review() {
    const q = this.query;
    const parts = [];
    if (q.deckId) parts.push(`deckId=${q.deckId}`);
    else parts.push(`mode=${q.mode}`);
    parts.push(`name=${encodeURIComponent(q.name)}`);
    wx.navigateTo({ url: `/pages/review/review?${parts.join('&')}` });
  },

  openWord(e) {
    wx.navigateTo({ url: `/pages/word/word?id=${e.currentTarget.dataset.id}` });
  }
});
