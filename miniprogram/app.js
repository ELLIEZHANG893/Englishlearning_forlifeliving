const config = require('./config');

App({
  onLaunch() {
    if (!wx.cloud) {
      wx.showModal({ title: '提示', content: '请升级微信到最新版本后使用', showCancel: false });
      return;
    }
    wx.cloud.init({ env: config.cloudEnv || undefined, traceUser: true });
  },
  globalData: {
    // 首页识别完成后，把结果交给识别结果页
    lastRecognition: null
  }
});
