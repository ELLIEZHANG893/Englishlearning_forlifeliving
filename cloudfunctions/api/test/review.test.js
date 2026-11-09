const test = require('node:test');
const assert = require('node:assert/strict');
const { schedule, nextStreak, currentStreak, buildQuestion, MASTERED_STAGE } = require('../lib/review');

const NOW = new Date('2026-11-09T12:00:00Z');
const daysLater = (d) => Math.round((d - NOW) / 86400000);

test('排期：记得进入下一轮，间隔逐步拉长', () => {
  let r = { stage: 0 };
  const gaps = [];
  for (let i = 0; i < 7; i++) {
    r = schedule(r, 'good', NOW);
    gaps.push(daysLater(r.nextReviewAt));
  }
  assert.deepEqual(gaps, [2, 4, 7, 15, 30, 30, 30]);
  assert.equal(r.stage, MASTERED_STAGE);
  assert.equal(r.correct, 7);
});

test('排期：忘了回到第 0 轮明天再来；模糊保持当前轮', () => {
  const again = schedule({ stage: 4, correct: 4 }, 'again', NOW);
  assert.equal(again.stage, 0);
  assert.equal(daysLater(again.nextReviewAt), 1);
  assert.equal(again.wrong, 1);
  const hard = schedule({ stage: 3 }, 'hard', NOW);
  assert.equal(hard.stage, 3);
  assert.equal(daysLater(hard.nextReviewAt), 7);
  assert.throws(() => schedule({}, 'perfect', NOW));
});

test('连续学习天数', () => {
  assert.deepEqual(nextStreak(null, '2026-11-09', '2026-11-08'), { lastStudyDate: '2026-11-09', streak: 1 });
  assert.equal(nextStreak({ lastStudyDate: '2026-11-08', streak: 4 }, '2026-11-09', '2026-11-08').streak, 5);
  assert.equal(nextStreak({ lastStudyDate: '2026-11-09', streak: 5 }, '2026-11-09', '2026-11-08').streak, 5);
  assert.equal(nextStreak({ lastStudyDate: '2026-11-01', streak: 9 }, '2026-11-09', '2026-11-08').streak, 1);
  assert.equal(currentStreak({ lastStudyDate: '2026-11-01', streak: 9 }, '2026-11-09', '2026-11-08'), 0);
  assert.equal(currentStreak({ lastStudyDate: '2026-11-08', streak: 9 }, '2026-11-09', '2026-11-08'), 9);
});

const mk = (i, extra = {}) => Object.assign({ _id: `c${i}`, en: `word${i}`, zh: `词${i}`, wordKey: `word${i}`, fileID: `cloud://f${i}` }, extra);

test('出题：照片不够时不出听音选图', () => {
  const card = mk(0);
  const pool = [card, mk(1), mk(2)];
  for (let i = 0; i < 30; i++) assert.notEqual(buildQuestion(card, pool).type, 'listen');
});

test('出题：选择题有 4 个不重复选项，答案指向本词', () => {
  const card = mk(0);
  const pool = [card, mk(1), mk(2), mk(3), mk(4)];
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    const q = buildQuestion(card, pool);
    seen.add(q.type);
    if (q.type === 'recall') continue;
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options.map((o) => o.en)).size, 4);
    assert.equal(q.options[q.answer].en, 'word0');
  }
  assert.deepEqual([...seen].sort(), ['listen', 'recall', 'zh2en']);
});

test('出题：用户只有一个词时，看中文选英文用内置常用词做干扰项', () => {
  const card = mk(0);
  const rand = () => 0.99; // 固定选最后一种可用题型 zh2en
  const q = buildQuestion(card, [card], rand);
  assert.equal(q.type, 'zh2en');
  assert.equal(q.options.length, 4);
  assert.equal(q.options[q.answer].en, 'word0');
});
