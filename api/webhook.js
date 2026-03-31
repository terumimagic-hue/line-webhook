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
ユーザーの入力から、今日の夕飯を実用的に提案してください。

【ユーザー入力】
${userMessage}

【ルール】
- 日本のスーパーで手に入りやすい食材を前提にする
- 時短・節約・家族ウケを優先
- 難しい工程にしない
- 出力は短く、LINEで読みやすくする
- 必ず以下の形式で返す

【出力形式】
主菜：
副菜：
汁物：
理由：
`;

    let replyText = "うまく生成できませんでした";

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
          max_output_tokens: 300
        }),
      });

      const aiData = await aiRes.json();

      if (!aiRes.ok) {
        replyText = `OpenAIエラー: ${aiData?.error?.message || "不明なエラー"}`;
      } else {
        replyText =
          aiData.output_text?.trim() ||
          "献立の生成に失敗しました。もう一度試してください。";
      }
    } catch (e) {
      replyText = `接続エラー: ${e.message}`;
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
}
