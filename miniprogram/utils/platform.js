function isIOS() {
  try {
    const info = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync();
    return /ios/i.test(info.platform || info.system || '');
  } catch (e) {
    return false;
  }
}

// 当前设备能不能显示购买入口
function canBuy(quota) {
  if (!quota || !quota.paymentEnabled) return false;
  return !isIOS() || !!quota.iosPaymentEnabled;
}

module.exports = { isIOS, canBuy };
