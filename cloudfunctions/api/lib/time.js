// 以北京时间（UTC+8）计算日期，返回 YYYY-MM-DD
function beijingDate(now = new Date()) {
  const t = new Date(now.getTime() + 8 * 3600 * 1000);
  return t.toISOString().slice(0, 10);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 3600 * 1000);
}

module.exports = { beijingDate, addDays };
