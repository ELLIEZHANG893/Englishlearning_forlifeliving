const { call } = require('../../utils/api');
const { drawPoster, W, H } = require('../../utils/poster');

const promisify = (fn) => (opts = {}) => new Promise((resolve, reject) => fn(Object.assign({}, opts, { success: resolve, fail: reject })));

Page({
  data: { image: '', loading: true },

  onLoad(q) {
    this.cardId = q.id;
    this.build();
  },

  async build() {
    wx.showLoading({ title: '生成中…' });
    try {
      const { card, fileID, qrcode } = await call('getPoster', { cardId: this.cardId });
      const photo = await wx.cloud.downloadFile({ fileID }).then((r) => r.tempFilePath).catch(() => '');
      let qrPath = '';
      if (qrcode) {
        qrPath = `${wx.env.USER_DATA_PATH}/qr_${this.cardId}.png`;
        wx.getFileSystemManager().writeFileSync(qrPath, qrcode, 'base64');
      }
      const canvas = await new Promise((resolve) => {
        wx.createSelectorQuery().in(this).select('#poster').node().exec((res) => resolve(res[0].node));
      });
      await drawPoster(canvas, { card, photoPath: photo, qrPath });
      const { tempFilePath } = await promisify(wx.canvasToTempFilePath)({ canvas, destWidth: W, destHeight: H, fileType: 'jpg', quality: 0.92 });
      this.setData({ image: tempFilePath, loading: false });
    } catch (e) {
      console.error(e);
      this.setData({ loading: false });
      wx.showToast({ title: (e && e.message) || '生成失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async save() {
    try {
      await promisify(wx.saveImageToPhotosAlbum)({ filePath: this.data.image });
      wx.showToast({ title: '已保存到相册，可以发朋友圈啦', icon: 'none' });
    } catch (e) {
      // 用户之前拒绝过相册权限，引导去设置里打开
      if (/auth/.test((e && e.errMsg) || '')) {
        wx.showModal({
          title: '需要相册权限',
          content: '保存图片需要允许访问相册',
          confirmText: '去设置',
          success: (r) => { if (r.confirm) wx.openSetting(); }
        });
      }
    }
  },

  // 直接调起微信的图片分享菜单（发给朋友、发朋友圈、收藏）
  shareImage() {
    if (!wx.showShareImageMenu) return this.save();
    wx.showShareImageMenu({ path: this.data.image });
  },

  preview() {
    wx.previewImage({ urls: [this.data.image] });
  }
});
