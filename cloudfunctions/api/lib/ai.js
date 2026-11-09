// 调用 OpenAI 兼容的 Chat Completions 接口。
// 默认使用阿里云百炼（通义千问）兼容模式，也可以通过环境变量换成豆包等其他兼容服务。
//   AI_API_KEY      必填
//   AI_BASE_URL     默认 https://dashscope.aliyuncs.com/compatible-mode/v1
//   AI_VISION_MODEL 识图模型，默认 qwen-vl-max
//   AI_TEXT_MODEL   生成单词详情的文本模型，默认 qwen-plus
const https = require('https');
const { URL } = require('url');

const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

function config() {
  return {
    apiKey: process.env.AI_API_KEY || '',
    baseUrl: (process.env.AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    visionModel: process.env.AI_VISION_MODEL || 'qwen-vl-max',
    textModel: process.env.AI_TEXT_MODEL || 'qwen-plus'
  };
}

function postJson(urlStr, body, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const data = Buffer.from(JSON.stringify(body));
    const req = https.request({
      method: 'POST',
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': data.length }, headers),
      timeout: timeoutMs
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`AI HTTP ${res.statusCode}: ${text.slice(0, 300)}`));
        }
        try { resolve(JSON.parse(text)); } catch (e) { reject(new Error('AI 返回不是 JSON')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('AI 请求超时')));
    req.on('error', reject);
    req.end(data);
  });
}

// 从模型输出中取出 JSON（兼容 ```json 代码块、前后多余文字）
function extractJson(text) {
  if (typeof text !== 'string') throw new Error('模型输出为空');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型输出中没有 JSON');
  return JSON.parse(body.slice(start, end + 1));
}

async function chatJson({ model, messages, timeoutMs = 20000 }) {
  const cfg = config();
  if (!cfg.apiKey) throw new Error('未配置 AI_API_KEY');
  const res = await postJson(`${cfg.baseUrl}/chat/completions`, {
    model,
    messages,
    temperature: 0.2
  }, { Authorization: `Bearer ${cfg.apiKey}` }, timeoutMs);
  const content = res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content;
  const text = Array.isArray(content) ? content.map((p) => p.text || '').join('') : content;
  return extractJson(text);
}

module.exports = { config, chatJson, extractJson };
