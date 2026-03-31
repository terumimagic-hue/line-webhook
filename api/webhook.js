export default async function handler(req, res) {
  if (req.method === "POST") {
    return res.status(200).send("OK");
  } else {
    return res.status(405).send("Method Not Allowed");
  }
}
