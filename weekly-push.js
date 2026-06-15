#!/usr/bin/env node
/**
 * weekly-push.js
 * ──────────────────────────────────────────────────────────────
 * 每周自动生成「辅导员周度思政热点雷达」并通过 WxPusher 推送到微信。
 * 由 GitHub Actions 每周一上午 8:00（北京时间）自动运行。
 *
 * 环境变量（在 GitHub Secrets 中配置）：
 *   DEEPSEEK_API_KEY  - DeepSeek API Key
 *   SERPER_API_KEY    - Serper API Key（可选，用于真实联网搜索）
 *   WXPUSHER_TOKEN    - WxPusher AppToken
 *   WXPUSHER_UID      - WxPusher 用户 UID（逗号分隔，支持多人）
 */

'use strict';

const https = require('https');

// ─── Config ───────────────────────────────────────────────────
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY;
const SERPER_KEY   = process.env.SERPER_API_KEY;
const WX_TOKEN     = process.env.WXPUSHER_TOKEN;
const WX_UIDS      = (process.env.WXPUSHER_UID || '').split(',').map(s => s.trim()).filter(Boolean);

if (!DEEPSEEK_KEY) { console.error('❌ 缺少 DEEPSEEK_API_KEY'); process.exit(1); }
if (!WX_TOKEN)     { console.error('❌ 缺少 WXPUSHER_TOKEN');  process.exit(1); }
if (!WX_UIDS.length){ console.error('❌ 缺少 WXPUSHER_UID');   process.exit(1); }

// ─── HTTP helpers ─────────────────────────────────────────────
function httpPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data   = JSON.stringify(body);
    const req = https.request({
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers }
    }, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ─── Serper Search ────────────────────────────────────────────
async function serperSearch(query) {
  if (!SERPER_KEY) return [];
  try {
    const r = await httpPost(
      'https://google.serper.dev/search',
      { 'X-API-KEY': SERPER_KEY },
      { q: query, num: 8, gl: 'cn', hl: 'zh-cn' }
    );
    if (r.status !== 200) return [];
    return (r.body.organic || []).map(item => ({
      title:   item.title   || '',
      snippet: item.snippet || ''
    }));
  } catch (e) {
    console.warn('Serper 搜索失败：', e.message);
    return [];
  }
}

// ─── DeepSeek API ─────────────────────────────────────────────
async function callDeepSeek(messages, maxTokens) {
  const r = await httpPost(
    'https://api.deepseek.com/v1/chat/completions',
    { 'Authorization': 'Bearer ' + DEEPSEEK_KEY },
    { model: 'deepseek-chat', messages, temperature: 0.7, max_tokens: maxTokens || 3000 }
  );
  if (r.status !== 200) throw new Error(`DeepSeek API 错误 (${r.status}): ${JSON.stringify(r.body)}`);
  return r.body.choices?.[0]?.message?.content || '';
}

// ─── Generate Hot Topics ──────────────────────────────────────
async function getHotTopics() {
  const now = new Date();
  const dateStr = `${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日`;

  // Step 1: Optionally search for real-time trends
  let searchContext = '';
  if (SERPER_KEY) {
    console.log('🌐 正在通过 Serper 搜索当前青年热点…');
    const queries = ['大学生热门话题本周', '青年亚文化趋势', '高校思政教育热点'];
    const allResults = [];
    for (const q of queries) {
      const results = await serperSearch(q);
      allResults.push(...results.slice(0, 3));
    }
    if (allResults.length) {
      searchContext = '\n\n【网络搜索参考】\n';
      allResults.forEach((r, i) => {
        searchContext += `${i+1}. ${r.title}\n${r.snippet}\n`;
      });
      console.log(`✅ 搜索完成，获取到 ${allResults.length} 条参考信息`);
    }
  }

  // Step 2: Generate weekly radar
  const prompt = `今天是${dateStr}，你是高校辅导员的AI助理。请生成一份「辅导员周度思政热点雷达」推文，帮助辅导员快速掌握本周青年群体最热门的5个文化现象，并给出每个现象的思政教育切入点。
${searchContext}

请按以下格式输出（适合微信阅读，使用emoji增加可读性）：

🔭 辅导员周度思政热点雷达
📅 ${dateStr} · 第${getWeekNumber(now)}周

━━━━━━━━━━━━━━━━━━━━

📌 本周5大青年热点

🔥 1. 【热点名称】
- 现象描述：（50字以内，接地气）
- 思政切入：（30字以内，直接可用）
- 推荐场景：演讲/班会/宣讲

🔥 2. 【热点名称】
…（依次列出5个）

━━━━━━━━━━━━━━━━━━━━

💡 本周精选选题推荐
（给出1个最值得做的完整选题方向，含标题、切入角度和框架要点）

━━━━━━━━━━━━━━━━━━━━

📖 理论武装
（推荐1-2个与本周热点相关的重要讲话或政策文件）

━━━━━━━━━━━━━━━━━━━━
🤖 由思政热点选题助手·智能体版自动生成
💻 https://github.com/your-repo/sizheng-agent`;

  console.log('🤖 正在调用 DeepSeek 生成周报内容…');
  const content = await callDeepSeek([{ role: 'user', content: prompt }], 2500);
  console.log('✅ 内容生成完成');
  return content;
}

// ─── Week Number Helper ───────────────────────────────────────
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// ─── WxPusher Send ────────────────────────────────────────────
async function sendWxPush(content, summary) {
  console.log(`📤 正在推送至 ${WX_UIDS.length} 个用户…`);

  // Convert plain text to basic HTML for better rendering
  const htmlContent = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/━+/g, '<hr style="border:none;border-top:1px solid #e2e8f0;margin:12px 0">')
    .replace(/^(🔭.+)$/gm, '<h2 style="color:#2c5f8a;margin:0 0 8px">$1</h2>')
    .replace(/^(📅.+)$/gm, '<p style="color:#94a3b8;font-size:13px;margin:0 0 12px">$1</p>')
    .replace(/^(🔥 \d+\. \【.+\】)$/gm, '<h3 style="color:#d4af37;margin:12px 0 6px">$1</h3>')
    .replace(/^- (.+)$/gm, '<p style="margin:3px 0;padding-left:12px">• $1</p>')
    .replace(/^(💡.+)$/gm, '<h3 style="color:#2c5f8a;margin:12px 0 6px">$1</h3>')
    .replace(/^(📖.+)$/gm, '<h3 style="color:#2c5f8a;margin:12px 0 6px">$1</h3>')
    .replace(/^(📌.+)$/gm, '<h3 style="color:#2c5f8a;margin:12px 0 6px">$1</h3>')
    .replace(/\n/g, '<br>');

  const payload = {
    appToken:    WX_TOKEN,
    uids:        WX_UIDS,
    summary:     summary || '🔭 辅导员周度思政热点雷达',
    content:     `<div style="font-family:'Microsoft YaHei',sans-serif;line-height:1.8;padding:8px;max-width:600px">${htmlContent}</div>`,
    contentType: 2  // 2 = HTML
  };

  const r = await httpPost('https://wxpusher.zhimengeng.com/api/v1/send', {}, payload);
  if (r.status !== 200 || r.body.code !== 1000) {
    throw new Error(`WxPusher 推送失败 (${r.status}): ${JSON.stringify(r.body)}`);
  }

  console.log('✅ WxPusher 推送成功！');
  console.log('推送状态:', JSON.stringify(r.body.data, null, 2));
  return r.body;
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   辅导员周度思政热点雷达 · 自动推送脚本         ║');
  console.log(`║   运行时间: ${new Date().toLocaleString('zh-CN')}          ║`);
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  try {
    // Generate content
    const content = await getHotTopics();

    if (!content || content.trim().length < 50) {
      throw new Error('生成内容为空或过短，请检查 API Key 配置');
    }

    // Push to WeChat
    const now = new Date();
    const summary = `🔭 周度思政热点雷达 · ${now.getMonth()+1}月${now.getDate()}日`;
    await sendWxPush(content, summary);

    console.log('');
    console.log('🎉 任务完成！周报已成功推送到微信。');
    console.log('');
    process.exit(0);
  } catch (e) {
    console.error('');
    console.error('❌ 任务失败：', e.message);
    console.error(e.stack);
    process.exit(1);
  }
}

main();
