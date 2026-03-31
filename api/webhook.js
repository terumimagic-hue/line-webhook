export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const events = req.body.events || [];

  for (const event of events) {
    if (event.type !== "message" || event.message.type !== "text") continue;

    const replyToken = event.replyToken;
    const userMessage = event.message.text;

    const prompt = `
あなたは日本の家庭向け献立コンシェルジュです。

【入力】
${userMessage}

【条件】
・時短
・節約
・簡単

【形式】
主菜：
副菜：
汁物：
理由：
`;

    let replyText = "生成できませんでした";

    try {
      const aiRes = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-5-mini",
          input: prompt,
        }),
      });

      const data = await aiRes.json();

      // 🔥ここが最重要修正
      if (data.output_text) {
        replyText = data.output_text;
      } else {
        replyText = JSON.stringify(data); // デバッグ
      }

    } catch (e) {
      replyText = "エラー: " + e.message;
    }

    await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer dz3XnwGO6z1w+clFLB1A0LMM2vJtdRJQX2t72VhlOzo990gpxK7ru+zfWlYwqd6HD5SzHnrLSBBUw9f+3CYejB5emX1ScY/OLf8T+83tLf/g5/Ccj7HuJHrOrEyfi62JCrOldfhwLObJtOEF9JCTKQdB04t89/1O/w1cDnyilFU=",
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
