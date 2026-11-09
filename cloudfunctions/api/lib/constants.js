// 物品类别（按物品类别模式的系统卡包）
const CATEGORIES = [
  '厨具', '餐具', '食材调料', '家电', '清洁用品', '洗护用品',
  '家具', '家居用品', '文具', '衣物配饰', '数码产品', '其他'
];

// 拍摄地点（按拍摄地点模式的系统卡包）
const PLACES = ['厨房', '餐厅', '客厅', '卧室', '浴室', '超市', '办公室', '户外', '其他'];

// 每人每天免费识别次数（北京时间 0 点重置）
const FREE_DAILY = 10;

// 每人每天调用识别模型的上限（含未保存、失败的识别），防止被刷导致成本失控
const DETECT_DAILY_CAP = 40;

// 一张图最多返回的物品数
const MAX_OBJECTS = 5;

// 间隔重复的复习间隔（天）
const REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30];

module.exports = { CATEGORIES, PLACES, FREE_DAILY, DETECT_DAILY_CAP, MAX_OBJECTS, REVIEW_INTERVALS };
