export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const events = req.body.events || [];

  for (const event of events) {
    if (event.type !== "message" || event.message.type !== "text") continue;

    const replyToken = event.replyToken;
    const userMessage = event.message.text;

    let replyText = "";

    try {
      const aiRes = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-5-mini",
          input: `
短く献立を出してください

${userMessage}

形式：
🍳主菜：
🥗副菜：
🍲汁物：
💡理由：
`
        }),
      });

      const data = await aiRes.json();

      // 🔥 全パターン対応
      const textFromOutput =
        data.output_text ||
        data.output?.find(o => o.type === "message")?.content?.find(c => c.type === "output_text")?.text ||
        data.output?.[1]?.content?.[0]?.text;

      if (textFromOutput) {
        replyText = textFromOutput;
      } else {
        // デバッグ用
        replyText = JSON.stringify(data).slice(0, 1000);
      }

    } catch (e) {
      replyText = "エラー: " + e.message;
    }

    // 🔥 fallback（絶対返す）
    if (!replyText || replyText.length < 5) {
      replyText =
        "🍳主菜：鶏もも照り焼き\n🥗副菜：もやしナムル\n🍲汁物：味噌汁\n💡理由：早い・安い・簡単";
    }

    await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer YOUR_LINE_CHANNEL_ACCESS_TOKEN",
      },
      body: JSON.stringify({
        replyToken,
        messages: [
          {
            type: "text",
            text: replyText.slice(0, 1000),
          },
        ],
      }),
    });
  }

  return res.status(200).send("OK");
}
