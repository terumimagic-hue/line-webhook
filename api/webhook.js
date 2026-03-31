export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const events = req.body.events || [];

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const replyToken = event.replyToken;
      const userMessage = event.message.text;

      const prompt = `
あなたはプロの料理人です。
ユーザーの入力から、家庭向けの献立を提案してください。

【入力】
${userMessage}

【条件】
・時短・節約・家族向け
・スーパーで買える食材
・簡単に作れる

【形式】
主菜：
副菜：
汁物：
理由：
`;

      let replyText = "少し時間をおいてもう一度送ってください";

      try {
        const aiRes = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + process.env.OPENAI_API_KEY,
          },
          body: JSON.stringify({
            model: "gpt-5-mini",
            input: prompt,
            max_output_tokens: 300
          }),
        });

        const data = await aiRes.json();

        replyText =
          data.output?.[0]?.content?.[0]?.text ||
          "うまく生成できませんでした";
      } catch (e) {
        replyText = "エラーが発生しました";
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
  }

  return res.status(200).send("OK");
}
