// 与云函数 cloudfunctions/api/lib/constants.js 保持一致
const CATEGORIES = [
  '厨具', '餐具', '食材调料', '家电', '清洁用品', '洗护用品',
  '家具', '家居用品', '文具', '衣物配饰', '数码产品', '其他'
];
const PLACES = ['厨房', '餐厅', '客厅', '卧室', '浴室', '超市', '办公室', '户外', '其他'];
// 置信度低于此值时，让用户从候选叫法里选
const LOW_CONFIDENCE = 0.6;

module.exports = { CATEGORIES, PLACES, LOW_CONFIDENCE };
