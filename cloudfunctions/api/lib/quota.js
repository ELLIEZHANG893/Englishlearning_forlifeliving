const { FREE_DAILY, DETECT_DAILY_CAP } = require('./constants');

// 跨天时把当日计数视为 0（数据库里的字段在下次写入时重置）
function todayCounters(user, today) {
  if (!user || user.dailyDate !== today) return { dailyUsed: 0, detectCount: 0 };
  return { dailyUsed: user.dailyUsed || 0, detectCount: user.detectCount || 0 };
}

function summarize(user, today, paymentEnabled = false) {
  const { dailyUsed, detectCount } = todayCounters(user, today);
  const freeLeft = Math.max(0, FREE_DAILY - dailyUsed);
  const points = Math.max(0, (user && user.points) || 0);
  return {
    freeDaily: FREE_DAILY,
    freeLeft,
    points,
    // 有免费次数或点数才可以识别
    canRecognize: freeLeft + points > 0,
    detectLimitReached: detectCount >= DETECT_DAILY_CAP,
    paymentEnabled
  };
}

// 本次识别成功后应扣哪一种：优先免费次数，其次点数；都没有返回 null
function chargeSource(user, today) {
  const { dailyUsed } = todayCounters(user, today);
  if (dailyUsed < FREE_DAILY) return 'free';
  if (((user && user.points) || 0) > 0) return 'points';
  return null;
}

module.exports = { todayCounters, summarize, chargeSource };
