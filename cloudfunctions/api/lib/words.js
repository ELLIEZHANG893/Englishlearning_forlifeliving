// 单词的统一键：小写、去首尾空格、合并空格，用于去重和全局缓存
function wordKey(en) {
  return String(en || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

module.exports = { wordKey };
