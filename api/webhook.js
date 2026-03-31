/**
 * api/webhook.js
 * LINE Messaging API × OpenAI Responses API
 * サービス名：思考ゼロ献立
 */

const OPENAI_MODEL = "gpt-4o-mini";
const LINE_MAX_CHARS = 4500;
const FALLBACK_MENU =
  "🍳主菜：鶏もも照り焼き\n🥗副菜：もやしナムル\n🍲汁物：味噌汁\n💡理由：早い・安い・簡単";

function buildPrompt(userMessage) {
  return `あなたは「思考ゼロ献立」というサービスのアシスタントです。
忙しい人が「今夜何を作ればいいか」を一瞬で決められるよう、
シンプルで実用的な献立を提案してください。

【ルール】
- 日本の家庭向け・スーパーで買える食材のみ
- 時短・節約・簡単を優先
- スマホで一瞬で読める短さ（各行15文字以内）
- 説明・レシピ・補足は一切不要
- 必ず以下の形式のみで出力すること（他の文言は絶対に入れない）

【出力形式】
🍳主菜：〇〇
🥗副菜：〇〇
🍲汁物：〇〇
💡理由：〇〇（15文字以内で一言）

ユーザー入力：${userMessage}`;
}

function extractTextFromOpenAI(data) {
  if (!data || typeof data !== "object") return null;

  if (typeof data.output_text === "string" && data.output_text.trim()) {
    console.log("[OpenAI] テキスト抽出: output_text");
    return data.output_text.trim();
  }

  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (Array.isArray(item.content)) {
        for (const block of item.content) {
          if (block.type === "output_text" && typeof block.text === "string" && block.text.trim()) {
            console.log("[OpenAI] テキスト抽出: output[].content[].text (output_text)");
            return block.text.trim();
          }
        }
        for (const block of item.content) {
          if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
            console.log("[OpenAI] テキスト抽出: output[].content[].text (text)");
            return block.text.trim();
          }
        }
      }
      if (typeof item.text === "string" && item.text.trim()) {
        console.log("[OpenAI] テキスト抽出: output[].text");
        return item.text.trim();
      }
    }
  }

  if (Array.isArray(data.choices) && data.choices[0]?.message?.content) {
    console.log("[OpenAI] テキスト抽出: choices[0].message.content");
    return data.choices[0].message.content.trim();
  }

  console.warn("[OpenAI] テキスト抽出失敗:", JSON.stringify(data).slice(0, 300));
  return null;
}

async function fetchMenuFromOpenAI(userMessage) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[OpenAI] OPENAI_API_KEY が設定されていません");
    return null;
  }

  console.log("[OpenAI] リクエスト送信:", OPENAI_MODEL, "/ 入力:", userMessage.slice(0, 50));

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: buildPrompt(userMessage),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "(読み取り不可)");
    console.error(`[OpenAI] HTTPエラー ${response.status}:`, errorBody.slice(0, 300));
    return null;
  }

  const data = await response.json();
  console.log("[OpenAI] レスポンス受信:", JSON.stringify(data).slice(0, 300));
  return extractTextFromOpenAI(data);
}

async function replyToLine(replyToken, text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.error("[LINE] LINE_CHANNEL_ACCESS_TOKEN が設定されていません");
    return;
  }

  const safeText = text.length > LINE_MAX_CHARS ? text.slice(0, LINE_MAX_CHARS) + "\n…" : text;
  console.log("[LINE] 返信送信:", safeText.slice(0, 100));

  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text: safeText }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "(読み取り不可)");
    console.error(`[LINE] 返信失敗 ${response.status}:`, errorBody.slice(0, 300));
  } else {
    console.log("[LINE] 返信成功");
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  console.log("[Webhook] リクエスト受信");
  const events = req.body?.events ?? [];
  console.log(`[Webhook] イベント数: ${events.length}`);

  for (const event of events) {
    if (event.type !== "message" || event.message?.type !== "text") {
      console.log("[Webhook] スキップ: type =", event.type);
      continue;
    }

    const replyToken = event.replyToken;
    const userMessage = event.message.text?.trim() ?? "";
    console.log("[Webhook] ユーザーメッセージ:", userMessage.slice(0, 80));

    if (!userMessage) continue;

    let replyText = null;

    try {
      replyText = await fetchMenuFromOpenAI(userMessage);
    } catch (err) {
      console.error("[OpenAI] 予期しないエラー:", err.message);
    }

    if (!replyText || replyText.length < 5) {
      console.warn("[Webhook] fallback 献立を使用");
      replyText = FALLBACK_MENU;
    }

    try {
      await replyToLine(replyToken, replyText);
    } catch (err) {
      console.error("[LINE] 返信エラー:", err.message);
    }
  }

  return res.status(200).send("OK");
}

