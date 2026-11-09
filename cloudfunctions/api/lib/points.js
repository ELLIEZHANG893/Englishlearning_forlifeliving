// 点数套餐（价格单位：分）
const PACKAGES = [
  { id: 'p30', points: 30, totalFee: 600, title: '30 点', priceText: '¥6' },
  { id: 'p100', points: 100, totalFee: 1800, title: '100 点', priceText: '¥18', tag: '更划算' }
];

function findPackage(id) {
  return PACKAGES.find((p) => p.id === id) || null;
}

// 商户订单号：字母数字，最长 32 位
function newOrderNo(now = Date.now(), rand = Math.random) {
  return `SP${now}${Math.floor(rand() * 1e8).toString().padStart(8, '0')}`;
}

module.exports = { PACKAGES, findPackage, newOrderNo };
