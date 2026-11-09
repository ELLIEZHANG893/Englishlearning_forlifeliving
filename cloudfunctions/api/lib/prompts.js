const { CATEGORIES, PLACES, MAX_OBJECTS } = require('./constants');

function detectPrompt() {
  return `你是帮中国成年人学习生活英语的助手。请识别照片中最主要的日常物品（最多 ${MAX_OBJECTS} 个，按显眼程度排序）。

要求：
- en：该物品在美式日常口语中最常用的叫法，小写，单数（如 colander, rice cooker, soy sauce）。不要用品牌名。
- zh：常用中文名。
- category：从这些里选一个：${CATEGORIES.join('、')}。
- bbox：物品在图中的位置 [x1, y1, x2, y2]，取值 0 到 1000，表示相对图片宽高的千分比。
- confidence：0 到 1，你对名称的把握。
- alternatives：如果不太确定，给 1～2 个其他可能的叫法 [{"en","zh"}]，确定则给空数组。
- place：根据背景判断照片在哪里拍的，从这些里选一个：${PLACES.join('、')}。
- 忽略人、人脸、文字截图和不可识别的物体。照片里没有可识别物品时 objects 返回空数组。

只输出 JSON，不要其他文字，格式：
{"place":"厨房","objects":[{"en":"colander","zh":"沥水篮","category":"厨具","bbox":[120,300,560,720],"confidence":0.92,"alternatives":[]}]}`;
}

function detailPrompt(en, zh) {
  return `你是帮中国成年人学习生活英语的老师。请为单词 "${en}"（中文：${zh || '未知'}）生成学习卡片内容。

要求：
- phonetic：美式和英式国际音标，带斜杠，如 {"us":"/ˈkɑːlən.dɚ/","uk":"/ˈkʌl.ən.dər/"}。
- zh：常用中文名。
- examples：2～3 句真实生活场景的口语例句（在家、做饭、购物等），简短自然，不要考试腔；每句附中文翻译。
- collocations：2～4 个常用搭配或短语，附中文。
- confusables：如果有容易混淆的相近物品或单词，给出 {"words":[包含本词在内的2～4个词],"explanation":"用中文一两句话说清区别"}；没有则为 null。
- usUk：如果美式和英式的叫法不同，给出 {"us":"美式叫法","uk":"英式叫法","note":"中文简短说明"}；相同则为 null。

只输出 JSON，不要其他文字，格式：
{"en":"${en}","phonetic":{"us":"","uk":""},"zh":"","examples":[{"en":"","zh":""}],"collocations":[{"en":"","zh":""}],"confusables":null,"usUk":null}`;
}

module.exports = { detectPrompt, detailPrompt };
