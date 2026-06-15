const fetch = require('node-fetch'); // Standard Node.js fetch

// Read environment variables
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const WX_APP_TOKEN = process.env.WX_APP_TOKEN;
const WX_UIDS = process.env.WX_UIDS ? process.env.WX_UIDS.split(',') : [];

if (!DEEPSEEK_API_KEY || !WX_APP_TOKEN || WX_UIDS.length === 0) {
  console.error('❌ Error: Missing environment variables! Please ensure DEEPSEEK_API_KEY, WX_APP_TOKEN, and WX_UIDS are configured.');
  process.exit(1);
}

// Get current date
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const dateStr = `${year}年${month}月`;

// Define System and User Prompts
const systemPrompt = `你是一位高校思政教育专家和青年文化研究专家。
你的任务是为高校辅导员提供最新一期的【周度思政热点雷达】，帮助他们把握青年大学生的最新特征和引导方向。
输出格式要求极其精美，结构化，使用清晰的项目符号和分割线。`;

const userPrompt = `现在是 ${dateStr}，请为我生成最新一期的《辅导员周度思政热点雷达》。
请列出当前最热门的 3 个青年网络文化、社交现象或亚文化，并为每一个热点提供：
1. 【热点透视】：用100字左右剖析这个现象在大学生中的表现与底层社会心理。
2. 【思政切入】：如何将该热点转化为思想政治教育的切入点，实现顺势育人。
3. 【推荐选题】：针对该热点，为辅导员提供 2 个极具创意和文采的选题（如：“一豆一谷”亦有道：...）。

请以易于在手机微信阅读的排版输出。`;

async function main() {
  console.log('🚀 Starting Weekly Push Generation...');
  console.log(`📅 Target Month: ${dateStr}`);

  try {
    // 1. Call DeepSeek API
    console.log('📡 Calling DeepSeek API...');
    const dsResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!dsResponse.ok) {
      const errorText = await dsResponse.text();
      throw new Error(`DeepSeek API failed: ${dsResponse.status} ${errorText}`);
    }

    const dsData = await dsResponse.json();
    const content = dsData.choices[0].message.content;
    console.log('✅ DeepSeek content generated successfully!');

    // 2. Format WeChat Message (HTML or Markdown)
    const pushTitle = `🎯 ${year}年第${getWeekNumber(now)}周 | 辅导员思政热点雷达`;
    const pushSummary = `本周青年热点思政转化灵感已送达，点击查看。`;

    // 3. Send via WxPusher
    console.log('📤 Sending push notification via WxPusher...');
    const pushResponse = await fetch('https://wxpusher.zhimengeng.com/api/send/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        appToken: WX_APP_TOKEN,
        content: content,
        summary: pushSummary,
        contentType: 3, // 3 means Markdown
        uids: WX_UIDS
      })
    });

    const pushResult = await pushResponse.json();
    if (pushResult.code === 1000) {
      console.log('🎉 Push notification sent successfully! Check your WeChat!');
    } else {
      throw new Error(`WxPusher failed: ${pushResult.msg}`);
    }

  } catch (error) {
    console.error('❌ Run failed:', error);
    process.exit(1);
  }
}

// Utility to calculate week number
function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

main();
