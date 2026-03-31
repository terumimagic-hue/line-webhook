export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const events = req.body.events || [];

  for (const event of events) {
    if (event.type !== "message" || event.message.type !== "text") {
      continue;
    }

    const replyToken = event.replyToken;
    const userMessage = event.message.text;

    let replyText = "";

    try {
      const prompt = `
あなたは「思考ゼロ献立」のAIです。
忙しい人が、考えずにすぐ夕飯を決められるようにしてください。

【ユーザー入力】
${userMessage}

【ルール】
・日本の家庭向け
・短く、見やすく
・時短、節約、簡単を優先
・スーパーで買える食材だけ
・スマホで一瞬で読める文章にする
・説明は必要最小限

【出力形式】
🍳主菜：
🥗副菜：
🍲汁物：
💡理由：
`;

      const aiRes = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-5-mini",
          input: prompt,
          max_output_tokens: 250,
        }),
      });

      const data = await aiRes.json();

      if (!aiRes.ok) {
        replyText =
          "🍳主菜：鶏もも照り焼き\n🥗副菜：もやしナムル\n🍲汁物：豆腐の味噌汁\n💡理由：すぐ作れて失敗しにくい定番です。";
      } else {
        replyText =
          data.output_text ||
          data.output?.find((o) => o.type === "message")?.content?.find((c) => c.type === "output_text")?.text ||
          "";
      }

      if (!replyText || replyText.trim().length < 5) {
        replyText =
          "🍳主菜：鶏もも照り焼き\n🥗副菜：もやしナムル\n🍲汁物：豆腐の味噌汁\n💡理由：早い・安い・簡単で平日に使いやすいです。";
      }
    } catch (error) {
      replyText =
        "🍳主菜：鶏もも照り焼き\n🥗副菜：もやしナムル\n🍲汁物：豆腐の味噌汁\n💡理由：通信が不安定なため、安定メニューを返しました。";
    }

    await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer YOUR_LINE_CHANNEL_ACCESS_TOKEN",
      },
      body: JSON.stringify({
        replyToken: replyToken,
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
