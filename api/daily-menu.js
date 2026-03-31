/**
 * api/daily-menu.js
 * 思考ゼロ献立 - 毎日自動配信
 */

const OPENAI_MODEL = "gpt-4o-mini";

const FALLBACK_MENU = `🍳今日の献立
主菜：鶏もも焼き
副菜：もやしナムル
汁物：味噌汁
💡迷った日は、早い・安い・簡単の定番で。`;

function getJSTInfo() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const month = jst.getUTCMonth() + 1;
  const dow = jst.getUTCDay();
  const dayNames = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"];
  let season;
  if (month >= 3 && month <= 5)       season = "春";
  else if (month >= 6 && month <= 8)  season = "夏";
  else if (month >= 9 && month <= 11) season = "秋";
  else                                season = "冬";
  return { dayName: dayNames[dow], season, isWeekend: dow === 0 || dow === 6 };
}

function buildPrompt(dayName, season, isWeekend) {
  const dayType = isWeekend ? "週末" : "平日";
  return `あなたは「思考ゼロ献立」というサービスのアシスタントです。
今日は${season}の${dayName}（${dayType}）です。
忙しい家庭向けに、今夜の夕飯献立を1セット提案してください。

【ルール】
- スーパーで買える食材のみ
- 時短・節約・簡単を優先
- ${season}らしい旬の食材を少し意識する
- ${dayType}の気分に合った献立にする
- スマホで一瞬で読める短さ
- 説明・レシピは一切不要
- 必ず以下の形式のみで出力すること（他の文言は絶対に入れない）

【出力形式】
🍳今日の献立
主菜：〇〇
副菜：〇〇
汁物：〇〇
💡ひとこと：〇〇（20文字以内）`;
}

function extractTextFromOpenAI(data) {
  if (!data || typeof data !== "object") return null;
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (Array.isArray(item.content)) {
        for (const block of item.content) {
          if (typeof block.text === "string" && block.text.trim()) return block.text.trim();
        }
      }
      if (typeof item.text === "string" && item.text.trim()) return item.text.trim();
    }
  }
  if (Array.isArray(data.choices) && data.choices[0]?.message?.content) {
    return data.choices[0].message.content.trim();
  }
  console.warn("[OpenAI] テキスト抽出失敗:", JSON.stringify(data).slice(0, 300));
  return null;
}

async function fetchDailyMenu() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { console.error("[OpenAI] OPENAI_API_KEY が未設定"); return null; }

  const { dayName, season, isWeekend } = getJSTInfo();
  console.log(`[OpenAI] リクエスト | ${season}の${dayName}（${isWeekend ? "週末" : "平日"}）`);

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: OPENAI_MODEL, input: buildPrompt(dayName, season, isWeekend) }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "(読み取り不可)");
    console.error(`[OpenAI] HTTPエラー ${response.status}:`, body.slice(0, 300));
    return null;
  }

  const data = await response.json();
  console.log("[OpenAI] レスポンス:", JSON.stringify(data).slice(0, 300));
  return extractTextFromOpenAI(data);
}

async function broadcastToLine(text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) { console.error("[LINE] LINE_CHANNEL_ACCESS_TOKEN が未設定"); return false; }

  console.log("[LINE] broadcast 送信:", text.slice(0, 80));

  const response = await fetch("https://api.line.me/v2/bot/message/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messages: [{ type: "text", text }] }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "(読み取り不可)");
    console.error(`[LINE] broadcast 失敗 ${response.status}:`, body.slice(0, 300));
    return false;
  }

  console.log("[LINE] broadcast 成功");
  return true;
}

export default async function handler(req, res) {
  console.log("[DailyMenu] 呼び出し開始");

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers["authorization"] ?? "";
    const querySecret = req.query?.secret ?? "";
    if (authHeader !== `Bearer ${cronSecret}` && querySecret !== cronSecret) {
      console.warn("[DailyMenu] 認証失敗");
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  let menuText = null;
  try {
    menuText = await fetchDailyMenu();
  } catch (err) {
    console.error("[OpenAI] 予期しないエラー:", err.message);
  }

  if (!menuText || menuText.length < 5) {
    console.warn("[DailyMenu] fallback 献立を使用");
    menuText = FALLBACK_MENU;
  }

  let success = false;
  try {
    success = await broadcastToLine(menuText);
  } catch (err) {
    console.error("[LINE] 予期しないエラー:", err.message);
  }

  console.log("[DailyMenu] 完了 | LINE送信:", success ? "成功" : "失敗");
  return res.status(200).json({ ok: true, sent: success, preview: menuText.slice(0, 100) });
}
