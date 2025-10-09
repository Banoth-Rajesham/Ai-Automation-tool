// server.js (ES module version)
import express from "express";

const app = express();
app.use(express.json());

app.post("/webhook/calcom", (req, res) => {
  const event = req.body;
  console.log("Received webhook event:", event);
  res.status(200).send("Webhook received");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});