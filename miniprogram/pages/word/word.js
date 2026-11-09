const { call } = require('../../utils/api');
const audio = require('../../utils/audio');
const { CATEGORIES, PLACES } = require('../../utils/constants');

const VOICE_KEY = 'voice';

Page({
  data: {
    card: null,
    decks: [],
    voice: 'us',
    categories: CATEGORIES,
    places: PLACES,
    categoryIndex: 0,
    placeIndex: 0,
    createdText: ''
  },

  onLoad(q) {
    this.cardId = q.id;
    this.justSaved = q.justSaved === '1';
    let voice = 'us';
    try { voice = wx.getStorageSync(VOICE_KEY) || 'us'; } catch (e) { /* 读不到就用美音 */ }
    this.setData({ voice });
    this.load();
  },

  async load(autoplay = true) {
    try {
      const { card, decks } = await call('getCard', { cardId: this.cardId });
      const d = new Date(card.createdAt);
      this.setData({
        card,
        decks,
        categoryIndex: Math.max(0, CATEGORIES.indexOf(card.category)),
        placeIndex: Math.max(0, PLACES.indexOf(card.place)),
        createdText: isNaN(d) ? '' : `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
      });
      if (this.justSaved) {
        this.justSaved = false;
        wx.showToast({ title: `已存入【${card.category}】`, icon: 'none', duration: 2000 });
      }
      if (autoplay) this.speak();
    } catch (e) {
      wx.showModal({ title: '提示', content: e.message, showCancel: false, success: () => wx.navigateBack() });
    }
  },

  speak() {
    if (this.data.card) audio.play(this.data.card.en, this.data.voice);
  },

  speakText(e) {
    audio.play(e.currentTarget.dataset.text, this.data.voice);
  },

  switchVoice(e) {
    const voice = e.currentTarget.dataset.v;
    if (voice === this.data.voice) return;
    this.setData({ voice });
    try { wx.setStorageSync(VOICE_KEY, voice); } catch (err) { /* 忽略 */ }
    call('setVoice', { voice }).catch(() => {});
    this.speak();
  },

  async onCategoryChange(e) {
    const category = CATEGORIES[e.detail.value];
    await this.update({ category }, { 'card.category': category, categoryIndex: Number(e.detail.value) });
  },

  async onPlaceChange(e) {
    const place = PLACES[e.detail.value];
    await this.update({ place }, { 'card.place': place, placeIndex: Number(e.detail.value) });
  },

  async update(patch, viewPatch) {
    try {
      await call('updateCard', Object.assign({ cardId: this.cardId }, patch));
      this.setData(viewPatch);
      wx.showToast({ title: '已修改', icon: 'none' });
    } catch (e) {
      wx.showToast({ title: e.message, icon: 'none' });
    }
  },

  // 加入 / 移出自定义卡包
  async onCustomDeck() {
    let res;
    try { res = await call('listDecks', { mode: 'category' }); } catch (e) { return wx.showToast({ title: e.message, icon: 'none' }); }
    const custom = res.custom.slice(0, 5);
    const current = new Set(this.data.card.deckIds || []);
    const items = custom.map((d) => (current.has(d.deckId) ? `✓ ${d.name}` : d.name)).concat('＋ 新建卡包');
    wx.showActionSheet({
      itemList: items,
      success: async ({ tapIndex }) => {
        if (tapIndex === custom.length) return this.createDeckAndAdd(current);
        const id = custom[tapIndex].deckId;
        current.has(id) ? current.delete(id) : current.add(id);
        await this.saveDecks([...current]);
      }
    });
  },

  createDeckAndAdd(current) {
    wx.showModal({
      title: '新建卡包',
      editable: true,
      placeholderText: '比如：出国前要会的',
      success: async (r) => {
        if (!r.confirm || !r.content) return;
        try {
          const deck = await call('createDeck', { name: r.content });
          current.add(deck.deckId);
          await this.saveDecks([...current]);
        } catch (e) {
          wx.showToast({ title: e.message, icon: 'none' });
        }
      }
    });
  },

  async saveDecks(deckIds) {
    try {
      await call('updateCard', { cardId: this.cardId, deckIds });
      await this.load(false);
      wx.showToast({ title: '已更新卡包', icon: 'none' });
    } catch (e) {
      wx.showToast({ title: e.message, icon: 'none' });
    }
  },

  previewPhoto() {
    wx.previewImage({ urls: [this.data.card.fileID] });
  },

  onDelete() {
    wx.showModal({
      title: '删除这张卡片？',
      content: '删除后复习记录也会一起删除',
      confirmColor: '#E8603C',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await call('deleteCard', { cardId: this.cardId });
          wx.showToast({ title: '已删除', icon: 'none' });
          setTimeout(() => wx.navigateBack(), 600);
        } catch (e) {
          wx.showToast({ title: e.message, icon: 'none' });
        }
      }
    });
  },

  onShareAppMessage() {
    const c = this.data.card;
    return {
      title: c ? `${c.zh} 用英语怎么说？` : '随手拍英语',
      path: '/pages/index/index',
      imageUrl: c ? c.fileID : undefined
    };
  }
});
