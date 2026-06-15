const fetch = require('node-fetch'); // Standard Node.js fetch

// Read environment variables
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const WX_APP_TOKEN = process.env.WX_APP_TOKEN;
const WX_UIDS = process.env.WX_UIDS ? process.env.WX_UIDS.split(',') : [];

if (!DEEPSEEK_API_KEY || !WX_APP_TOKEN || WX_UIDS.length === 0) {
  console.error('❌ Error: Missing environment variables! Please ensure DEEPSEEK_API_KEY, WX_APP_TOKEN, and WX_UIDS are configured.');
  process.exit(1);
}

async function main() {
  console.log('🚀 Starting PURE PLAIN TEXT Diagnostic Push...');

  try {
    const pushSummary = `您的思政智能体微信通道测试成功！`;
    const testContent = `🎯【极简测试消息】恭喜！您的思政选题助手微信物理通道已彻底测通！\n\n这是一条由您的 GitHub 自动机器人发出、不带任何 HTML/Markdown 格式的纯文本消息。\n\n如果您在手机微信上看到了这条消息，请回复我「收到」，我们将立刻把正式的长篇大论版微信卡片也修复好！\n\n测试时间：${new Date().toLocaleString()}`;

    // Send via WxPusher (ContentType = 1, Plain Text)
    console.log('📤 Sending PURE TEXT push notification via WxPusher...');
    const pushResponse = await fetch('https://wxpusher.zjiecode.com/api/send/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        appToken: WX_APP_TOKEN,
        content: testContent,
        summary: pushSummary,
        contentType: 1, // 1 means Pure Text (No Markdown, bypasses WeChat XML blocks)
        uids: WX_UIDS
      })
    });

    const pushResult = await pushResponse.json();
    console.log('📬 WxPusher Server Response:', JSON.stringify(pushResult));
    
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

main();
