// 发音：MVP 先用有道词典公开发音地址（type=1 英音，type=2 美音）
// 正式上线前建议换成自有或付费 TTS 服务，并把域名加入小程序后台的合法域名
let ctx = null;

function play(text, voice = 'us') {
  if (!text) return;
  if (!ctx) {
    ctx = wx.createInnerAudioContext();
    ctx.onError(() => wx.showToast({ title: '发音加载失败', icon: 'none' }));
  }
  ctx.stop();
  ctx.src = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=${voice === 'uk' ? 1 : 2}`;
  ctx.play();
}

module.exports = { play };
