// 统一调用云函数 api；失败时 reject 一个 { code, message, quota? } 对象
function call(action, data = {}) {
  return wx.cloud.callFunction({ name: 'api', data: Object.assign({ action }, data) })
    .then((res) => {
      const r = res.result || {};
      if (r.ok) return r.data;
      return Promise.reject({ code: r.code || 'SERVER_ERROR', message: r.message || '出错了', quota: r.quota });
    }, (err) => {
      console.error('callFunction failed', action, err);
      return Promise.reject({ code: 'NETWORK', message: '网络不太好，请稍后再试' });
    });
}

module.exports = { call };
