// 间隔重复排期。stage 表示连续记住的轮数，达到 REVIEW_INTERVALS.length 视为已掌握
const { REVIEW_INTERVALS } = require('./constants');
const { addDays } = require('./time');

const GRADES = ['again', 'hard', 'good'];
const MASTERED_STAGE = REVIEW_INTERVALS.length;

function intervalFor(stage) {
  return REVIEW_INTERVALS[Math.min(Math.max(stage, 0), REVIEW_INTERVALS.length - 1)];
}

// again：忘了 / 答错 → 回到第 0 轮，明天再复习
// hard：模糊 → 轮数不变，按当前轮的间隔再来
// good：记得 / 答对 → 进入下一轮，间隔拉长
function schedule(review, grade, now = new Date()) {
  if (!GRADES.includes(grade)) throw new Error('invalid grade');
  const r = review || {};
  const stage = r.stage || 0;
  let nextStage = stage;
  let days;
  if (grade === 'again') { nextStage = 0; days = intervalFor(0); }
  else if (grade === 'hard') { days = intervalFor(stage); }
  else { nextStage = Math.min(stage + 1, MASTERED_STAGE); days = intervalFor(nextStage); }
  return {
    stage: nextStage,
    nextReviewAt: addDays(now, days),
    lastReviewedAt: now,
    correct: (r.correct || 0) + (grade === 'again' ? 0 : 1),
    wrong: (r.wrong || 0) + (grade === 'again' ? 1 : 0)
  };
}

// 连续学习天数：今天已学过不变，昨天学过 +1，否则从 1 开始
function nextStreak(user, today, yesterday) {
  const last = user && user.lastStudyDate;
  if (last === today) return { lastStudyDate: today, streak: user.streak || 1 };
  if (last === yesterday) return { lastStudyDate: today, streak: (user.streak || 0) + 1 };
  return { lastStudyDate: today, streak: 1 };
}

// 显示用：昨天之后就没学过，连续天数算 0
function currentStreak(user, today, yesterday) {
  if (!user || !user.lastStudyDate) return 0;
  return user.lastStudyDate === today || user.lastStudyDate === yesterday ? (user.streak || 0) : 0;
}

function shuffle(list, rand = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 常见生活物品，用户自己的词不够做选择题干扰项时用
const FALLBACK_WORDS = [
  { en: 'spoon', zh: '勺子' }, { en: 'fork', zh: '叉子' }, { en: 'bowl', zh: '碗' }, { en: 'plate', zh: '盘子' },
  { en: 'cup', zh: '杯子' }, { en: 'kettle', zh: '水壶' }, { en: 'towel', zh: '毛巾' }, { en: 'pillow', zh: '枕头' },
  { en: 'broom', zh: '扫帚' }, { en: 'scissors', zh: '剪刀' }, { en: 'cutting board', zh: '砧板' }, { en: 'chopsticks', zh: '筷子' }
];

// 给一张卡出题：
//   listen 听音选图：需要至少 3 张其他照片做干扰项
//   zh2en  看中文选英文
//   recall 看图说词：自评
function buildQuestion(card, pool, rand = Math.random) {
  const others = pool.filter((p) => p._id !== card._id && p.wordKey !== card.wordKey);
  const withPhoto = others.filter((p) => p.fileID && p.fileID !== card.fileID);
  const types = ['recall', 'zh2en'];
  if (card.fileID && withPhoto.length >= 3) types.push('listen');
  const type = types[Math.floor(rand() * types.length)];
  const base = { cardId: card._id, en: card.en, zh: card.zh, fileID: card.fileID, phonetic: (card.detail && card.detail.phonetic) || {}, type };

  if (type === 'listen') {
    const options = shuffle([{ cardId: card._id, fileID: card.fileID, en: card.en }]
      .concat(shuffle(withPhoto, rand).slice(0, 3).map((p) => ({ cardId: p._id, fileID: p.fileID, en: p.en }))), rand);
    return Object.assign(base, { options, answer: options.findIndex((o) => o.cardId === card._id) });
  }
  if (type === 'zh2en') {
    const used = new Set([card.wordKey || card.en]);
    const distractors = [];
    for (const w of shuffle(others, rand).concat(shuffle(FALLBACK_WORDS, rand))) {
      const key = w.wordKey || w.en;
      if (used.has(key)) continue;
      used.add(key);
      distractors.push({ en: w.en, zh: w.zh });
      if (distractors.length === 3) break;
    }
    const options = shuffle([{ en: card.en, zh: card.zh }].concat(distractors), rand);
    return Object.assign(base, { options, answer: options.findIndex((o) => o.en === card.en) });
  }
  return base;
}

module.exports = { GRADES, MASTERED_STAGE, schedule, nextStreak, currentStreak, buildQuestion, shuffle, FALLBACK_WORDS };
