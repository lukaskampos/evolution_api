const express = require("express");
const OpenAI = require("openai");
const axios = require("axios");

const app = express();
app.use(express.json());

const openai = new OpenAI();

const EVOLUTION_URL = process.env.EVOLUTION_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const INSTANCE_NAME = process.env.INSTANCE_NAME;
const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || "Você é um assistente prestativo. Responda de forma clara e objetiva.";
const PORT = process.env.PORT || 3000;

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "WhatsApp AI Bot rodando!" });
});

// Validação do webhook pela Evolution
app.get("/webhook", (req, res) => {
  res.sendStatus(200);
});

// Webhook principal
app.post("/webhook", async (req, res) => {
  try {
    console.log(`[PAYLOAD BRUTO] ${JSON.stringify(req.body)}`);

    const event = req.body;

    if (event.event !== "messages.upsert") {
      console.log(`[EVENTO IGNORADO] ${event.event}`);
      return res.sendStatus(200);
    }

    // key e message ficam diretamente em event.data
    const data = event.data;
    if (!data) {
      console.log("[SEM DATA] event.data vazio");
      return res.sendStatus(200);
    }

    if (data.key?.fromMe) return res.sendStatus(200);

    if (data.key?.remoteJid?.includes("@g.us")) return res.sendStatus(200);

    const texto =
      data.message?.conversation ||
      data.message?.extendedTextMessage?.text ||
      null;

    if (!texto) {
      console.log("[SEM TEXTO] Tipo de mensagem não suportado");
      return res.sendStatus(200);
    }

    // O remetente real da mensagem está sempre em data.key.remoteJid (quando fromMe=false).
    // NUNCA usar event.sender — esse é o dono da instância.
    // Extrai só os dígitos antes de @s.whatsapp.net / @lid.
    const remoteJid = data.key?.remoteJid || "";
    const numero = remoteJid.split("@")[0];

    if (!numero) {
      console.log("[SEM NÚMERO] não foi possível extrair o remoteJid");
      return res.sendStatus(200);
    }

    console.log(`[${new Date().toISOString()}] Mensagem de ${numero}: ${texto}`);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: texto },
      ],
    });

    const resposta = completion.choices[0].message.content;

    console.log(`[${new Date().toISOString()}] Resposta para ${numero}: ${resposta}`);
    console.log(`[ENVIANDO] number=${numero} url=${EVOLUTION_URL}/message/sendText/${INSTANCE_NAME}`);

    await axios.post(
      `${EVOLUTION_URL}/message/sendText/${INSTANCE_NAME}`,
      {
        number: numero,
        text: resposta,
      },
      {
        headers: {
          apikey: EVOLUTION_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    res.sendStatus(200);
  } catch (error) {
    console.error("Erro no webhook:", JSON.stringify(error?.response?.data) || error.message);
    console.error(" status:", error?.response?.status);
    console.error(" error:", error?.response?.data?.error);
    console.error(" response:", JSON.stringify(error?.response?.data?.message));
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log(`✅ Bot rodando na porta ${PORT}`);
});
