# 随手拍英语

拍照识别生活物品，告诉你它的英文怎么说、怎么用，并自动收进单词卡包。

- 需求文档：[docs/requirements-v1.0.md](docs/requirements-v1.0.md)
- 技术栈：微信小程序原生 + 微信云开发（云函数、云数据库、云存储）+ OpenAI 兼容接口的多模态大模型（默认通义千问）

## 目录

```
miniprogram/            小程序前端
  pages/index           首页：拍一拍、今日剩余次数、最近学过
  pages/result          识别结果：图上框出物品，点选要学的；不确定时给候选叫法
  pages/word            单词卡：音标、美/英发音、例句、搭配、易混词、英美差异、改分类
  pages/decks           卡包：按物品类别 / 按拍摄地点切换，自定义卡包
  pages/deck            卡包里的单词列表
  pages/review          复习：看图说词、听音选图、看中文选英文
  pages/poster          生成分享图（照片 + 单词 + 例句 + 小程序码），保存或直接分享
  pages/share           好友打开分享链接 / 扫码看到的只读单词卡
  pages/points          点数余额、购买点数、点数记录
cloudfunctions/api      唯一的云函数，按 action 分发
  lib/                  额度、模型调用、提示词、结果清洗
  test/                 单元测试和用内存数据库跑的流程测试
docs/                   需求文档
```

## 本地运行

1. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)，导入本仓库根目录。
   - 还没有 AppID 时可以先用「测试号」，但云开发需要正式 AppID。拿到 AppID 后改 `project.config.json` 里的 `appid`。
2. 在开发者工具里点「云开发」开通环境，把环境 ID 填到 `miniprogram/config.js` 的 `cloudEnv`。
3. 在云开发控制台的数据库里创建集合：`users`、`cards`、`words`、`decks`、`recognitions`、`point_logs`、`orders`。
   权限都设为「仅管理端可读写」，所有读写都通过云函数完成。
   建议给 `cards` 建索引：`openid + wordKey`、`openid + createdAt`、`openid + category`、`openid + place`；给 `words` 建 `wordKey` 唯一索引。
4. 右键 `cloudfunctions/api` →「上传并部署：云端安装依赖」。
5. 在云函数 `api` 的配置里添加环境变量：

   | 变量 | 说明 |
   |---|---|
   | `AI_API_KEY` | 必填。阿里云百炼（通义千问）的 API Key |
   | `AI_BASE_URL` | 选填，默认 `https://dashscope.aliyuncs.com/compatible-mode/v1`。换成豆包等其他 OpenAI 兼容服务时改这里 |
   | `AI_VISION_MODEL` | 选填，识图模型，默认 `qwen-vl-max` |
   | `AI_TEXT_MODEL` | 选填，生成单词详情的模型，默认 `qwen-plus` |
   | `PAYMENT_ENABLED` | 选填，`true` 时显示「购买点数」入口。个人主体阶段保持不填 |
   | `PAY_SUB_MCH_ID` | 开通购买时必填，云开发控制台绑定的微信支付商户号 |
   | `IOS_PAYMENT_ENABLED` | 选填，`true` 时 iOS 也显示购买入口。确认平台规则允许前保持不填 |
   | `QRCODE_ENV_VERSION` | 选填，分享图上小程序码打开的版本：`release`（默认）、`trial` 体验版、`develop` 开发版。没发布前想测扫码可以设成 `trial` |
   | `REMIND_TEMPLATE_ID` | 选填，每日复习提醒的订阅消息模板 ID，见下方「复习提醒」 |

   云函数超时时间建议调到 30 秒（识别需要几秒）。
6. 把发音域名 `https://dict.youdao.com` 加到小程序后台的 request / downloadFile 合法域名（开发阶段可以在开发者工具里勾选「不校验合法域名」）。

## 开通点数购买（迁移到个体工商户 / 企业主体之后）

代码已经写好，默认关闭。个人主体开不了微信支付，所以要等主体迁移完成后再开：

1. 在微信公众平台完成主体迁移，开通微信支付，拿到商户号。
2. 在云开发控制台「设置 → 其他设置 → 微信支付配置」绑定商户号，并在商户平台确认授权。
3. 给云函数 `api` 加环境变量 `PAY_SUB_MCH_ID=商户号`、`PAYMENT_ENABLED=true`，重新部署。不需要重新发版小程序。
4. iOS 上卖虚拟商品有平台限制，`IOS_PAYMENT_ENABLED` 先不要开；iOS 用户会看到「请在安卓上购买，点数通用」。

到账规则：支付回调和小程序端主动确认都会触发加点，但都先向微信支付查询订单确实已支付、金额一致，同一订单只加一次。

## 复习提醒

1. 在小程序后台「订阅消息」里选一个学习提醒类的一次性订阅模板。
2. 把模板 ID 同时填到 `miniprogram/config.js` 的 `reviewTemplateId` 和云函数环境变量 `REMIND_TEMPLATE_ID`。
3. 检查 `cloudfunctions/api/index.js` 里的 `REMIND_FIELDS`，字段名（如 `thing1`、`thing2`）要和所选模板一致。
4. 上传云函数时会按 `cloudfunctions/api/config.json` 创建定时触发器，每天 20:00 给有待复习单词、且订阅过的用户发一条提醒。部署后在云开发控制台确认触发器的时区和时间。

微信一次性订阅消息的规则是用户每同意一次才能发一条，所以复习完成页会再请用户订阅一次。

## 分享

- 单词卡上「转发给好友」：卡片被标记为公开，好友点开看到只读的单词卡（不含复习记录和卡包）
- 「生成分享图」：在手机上用 Canvas 画海报，可以保存到相册或直接调起微信的图片分享
- 海报上的小程序码要小程序发布后才能生成，未发布时海报底部改为提示「在微信里搜索」
- 只有主人分享过的卡片别人才能看到

## 复习规则

- 新词第二天开始复习，间隔 1 → 2 → 4 → 7 → 15 → 30 天
- 记得 / 答对：进入下一轮；模糊：本轮间隔再来；忘了 / 答错：明天再复习，并在本轮末尾再看一遍
- 连续记住 6 轮算「已掌握」
- 题型：看图说词（自评）、听音选图（需要至少 4 张照片）、看中文选英文，随机出

## 测试

```
cd cloudfunctions/api && npm test
```

不需要安装依赖，测试用内存替身代替 `wx-server-sdk`，用假模型代替真实接口。

## 计次规则（需求文档 5.7）

- 每人每天 10 次免费识别，北京时间 0 点重置
- 在用户确认要学、单词成功存入卡包时才扣次数；识别失败、只选了学过的词不扣
- 一张照片选多个物品只扣 1 次
- 免费次数用完后扣点数；每人每天最多调用 40 次识别模型（防刷）
