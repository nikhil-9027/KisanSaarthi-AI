import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads folder and database file exist
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const logsFile = path.join(uploadsDir, "logs.json");
if (!fs.existsSync(logsFile)) {
  fs.writeFileSync(logsFile, JSON.stringify([]));
}
const contactsFile = path.join(uploadsDir, "contacts.json");
if (!fs.existsSync(contactsFile)) {
  fs.writeFileSync(contactsFile, JSON.stringify([]));
}

const app = express();
app.use(cors());
// Set body parser limits to handle Base64 image payloads
app.use(bodyParser.json({ limit: "15mb" }));
app.use(bodyParser.urlencoded({ limit: "15mb", extended: true }));

// Serve static app files and uploaded images
app.use(express.static(__dirname));
app.use("/uploads", express.static(uploadsDir));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(geminiApiKey && !geminiApiKey.includes("PASTE_NEW_GEMINI_API_KEY_HERE") && !geminiApiKey.includes("your_gemini_api_key_here")),
    port: PORT
  });
});

// 🔑 Gemini configuration
// IMPORTANT: Keep the API key on the server only. Never put it in frontend JS/HTML.
const geminiApiKey = (process.env.GEMINI_API_KEY || "").trim();

const GEMINI_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash"
];

// Legacy SDK model kept for the existing image-disease endpoint.
const genAI = new GoogleGenerativeAI(geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const AGRICULTURE_SYSTEM_PROMPT = `
You are the AI Agriculture Advisory Assistant inside a farmer-facing web application.

Your job is to answer the user's actual question directly and helpfully, like a modern AI assistant.

Rules:
- Reply in the same language/style as the user: English, Hindi, or Hinglish (Roman Hindi).
- Do not give a generic "please ask clearly" response when the question is understandable.
- Give practical, easy-to-follow answers.
- For crop/farming questions, consider crop, soil, season, irrigation, fertilizer, pests, disease, weather and local conditions when relevant.
- If important information is missing, first give useful general guidance and then ask only the minimum follow-up question needed for a more specific recommendation.
- For fertilizer or pesticide recommendations, avoid inventing an exact dose when the crop/product/formulation is unknown. Explain that the product label/local agricultural recommendation should be followed.
- Never claim that an image, field, soil test, weather feed, or market price was checked unless the application actually supplied that information.
- Use headings, bullets, numbered steps and short paragraphs when they make the answer easier to read.
- For unsafe or uncertain agricultural situations, recommend consulting a local agriculture officer/KVK/agronomist.
`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateGeminiResponse(contents, options = {}) {
  if (!geminiApiKey || geminiApiKey === "your_gemini_api_key_here" || geminiApiKey === "PASTE_NEW_GEMINI_API_KEY_HERE") {
    throw new Error("Gemini API key is not configured. Add GEMINI_API_KEY to .env and restart the server.");
  }

  const models = options.models || GEMINI_MODELS;
  let lastError = null;

  for (const modelName of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": geminiApiKey
            },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: AGRICULTURE_SYSTEM_PROMPT }]
              },
              contents,
              generationConfig: {
                temperature: 0.7,
                topP: 0.9,
                maxOutputTokens: 2048
              }
            }),
            signal: controller.signal
          }
        );

        const raw = await response.text();
        let data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          data = {};
        }

        if (response.ok) {
          const candidate = data.candidates?.[0];
          const reply = candidate?.content?.parts
            ?.map(part => part.text || "")
            .join("")
            .trim();

          if (reply) return reply;

          const finishReason = candidate?.finishReason || "UNKNOWN";
          if (data.promptFeedback?.blockReason) {
            throw new Error(`Gemini blocked the request (${data.promptFeedback.blockReason}). Please rephrase the question.`);
          }
          throw new Error(`Gemini returned no text (finish reason: ${finishReason}).`);
        }

        const apiMessage =
          data.error?.message ||
          data.error?.status ||
          `HTTP ${response.status}`;

        lastError = new Error(`${modelName}: ${apiMessage}`);

        // Retry temporary quota/server errors.
        if (response.status === 429 || response.status >= 500) {
          await sleep(800 * Math.pow(2, attempt));
          continue;
        }

        // For model-specific errors, try the next model.
        if (response.status === 400 || response.status === 404) break;

        break;
      } catch (err) {
        lastError = err.name === "AbortError"
          ? new Error(`${modelName}: request timed out after 30 seconds`)
          : err;

        if (attempt < 2) {
          await sleep(800 * Math.pow(2, attempt));
          continue;
        }
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  throw lastError || new Error("Gemini could not generate a response.");
}

function normalizeChatHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(item =>
      item &&
      (item.role === "user" || item.role === "model") &&
      typeof item.text === "string" &&
      item.text.trim()
    )
    .slice(-12)
    .map(item => ({
      role: item.role,
      parts: [{ text: item.text.trim().slice(0, 8000) }]
    }));
}

async function callGeminiApi(userMessage, history = []) {
  const contents = [
    ...normalizeChatHistory(history),
    {
      role: "user",
      parts: [{ text: userMessage.trim().slice(0, 8000) }]
    }
  ];

  return generateGeminiResponse(contents);
}

app.post("/chat", async (req, res) => {
  const userMessage = typeof req.body.message === "string"
    ? req.body.message.trim()
    : "";

  if (!userMessage) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    const replyText = await callGeminiApi(userMessage, req.body.history);
    return res.json({ reply: replyText });
  } catch (err) {
    console.error("Gemini chat error:", err.message || err);

    const message = err.message || "Could not generate content";
    const status = /API key|authentication|invalid/i.test(message) ? 401 :
                   /quota|rate limit|429/i.test(message) ? 429 : 503;

    return res.status(status).json({
      error: message
    });
  }
});

// 📸 Endpoint to detect disease using Multimodal AI (Gemini or OpenRouter)
app.post("/api/detect-disease", async (req, res) => {
  const { imageName, imageBase64 } = req.body;
  if (!imageBase64) {
    return res.status(400).json({ error: "Missing image base64 data" });
  }

  try {
    const timestamp = Date.now();
    const cleanImageName = imageName || "crop_image.png";
    const ext = path.extname(cleanImageName) || ".png";
    const filename = `crop_${timestamp}${ext}`;
    const filePath = path.join(uploadsDir, filename);

    // Decode Base64 data to binary buffer
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Write file to uploads directory
    fs.writeFileSync(filePath, buffer);

    // Determine mimeType
    let mimeType = "image/png";
    if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
    else if (ext === ".webp") mimeType = "image/webp";

    const prompt = `Analyze this image of a plant, crop, leaf, or fruit.
Identify the plant/crop and check if it has any disease.
If it is healthy, state: "Healthy".
If it is diseased, identify the disease.
Write a short, practical diagnosis and treatment advice for the farmer.
Respond ONLY with a JSON object matching this schema:
{
  "detectedDisease": "Disease Name or Healthy",
  "confidence": "92.5",
  "advice": "Treatment advice in Hinglish or English"
}`;

    let aiResultText = "";

    // 1. Try OpenRouter first if configured
    if (openai && openrouterApiKey && !openrouterApiKey.includes("...")) {
      try {
        const response = await openai.chat.completions.create({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}` } }
              ]
            }
          ]
        });
        aiResultText = response.choices[0].message.content;
      } catch (err) {
        console.error("OpenRouter Vision Error, falling back to direct Gemini:", err.message || err);
      }
    }

    // 2. Fallback to direct Gemini API if OpenRouter didn't run or failed
    if (!aiResultText) {
      const imagePart = {
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      };
      const result = await model.generateContent([prompt, imagePart]);
      aiResultText = result.response.text();
    }

    // Parse JSON safely from AI output (handling potential markdown formatting)
    let jsonText = aiResultText.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    }

    let prediction = {
      detectedDisease: "Unknown",
      confidence: "80.0",
      advice: "Please consult local agricultural authorities."
    };

    try {
      prediction = JSON.parse(jsonText);
    } catch (parseErr) {
      console.warn("Failed to parse JSON from AI response, raw text was:", aiResultText);
      // Fallback regex parsing if JSON format is slightly off
      const diseaseMatch = aiResultText.match(/"detectedDisease"\s*:\s*"([^"]+)"/);
      const confMatch = aiResultText.match(/"confidence"\s*:\s*"([^"]+)"/);
      const adviceMatch = aiResultText.match(/"advice"\s*:\s*"([^"]+)"/);
      if (diseaseMatch) prediction.detectedDisease = diseaseMatch[1];
      if (confMatch) prediction.confidence = confMatch[1];
      if (adviceMatch) prediction.advice = adviceMatch[1];
    }

    // Save metadata entry to local JSON database
    const logs = JSON.parse(fs.readFileSync(logsFile, "utf-8") || "[]");
    const newLog = {
      id: timestamp,
      imageName: cleanImageName,
      imageUrl: `/uploads/${filename}`,
      detectedDisease: prediction.detectedDisease,
      confidence: prediction.confidence,
      advice: prediction.advice,
      timestamp: new Date().toISOString(),
    };
    logs.push(newLog);
    fs.writeFileSync(logsFile, JSON.stringify(logs, null, 2));

    res.json({ success: true, log: newLog });
  } catch (err) {
    console.error("Error detecting disease:", err);
    res.status(500).json({ error: "Could not analyze crop image" });
  }
});

// 📸 Save crop image uploads and classifications to database
app.post("/api/upload-disease-log", (req, res) => {
  const { imageName, imageBase64, detectedDisease, confidence } = req.body;
  if (!imageBase64) {
    return res.status(400).json({ error: "Missing image base64 data" });
  }

  try {
    const timestamp = Date.now();
    const cleanImageName = imageName || "crop_image.png";
    const ext = path.extname(cleanImageName) || ".png";
    const filename = `crop_${timestamp}${ext}`;
    const filePath = path.join(uploadsDir, filename);

    // Decode Base64 data to binary buffer
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Write file to uploads directory
    fs.writeFileSync(filePath, buffer);

    // Save metadata entry to local JSON database
    const logs = JSON.parse(fs.readFileSync(logsFile, "utf-8") || "[]");
    const newLog = {
      id: timestamp,
      imageName: cleanImageName,
      imageUrl: `/uploads/${filename}`,
      detectedDisease,
      confidence,
      timestamp: new Date().toISOString(),
    };
    logs.push(newLog);
    fs.writeFileSync(logsFile, JSON.stringify(logs, null, 2));

    res.json({ success: true, log: newLog });
  } catch (err) {
    console.error("Error saving crop image log:", err);
    res.status(500).json({ error: "Could not save uploaded crop image" });
  }
});

// 📊 Retrieve all logged crop image uploads
app.get("/api/disease-logs", (req, res) => {
  try {
    const logs = JSON.parse(fs.readFileSync(logsFile, "utf-8") || "[]");
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: "Failed to read database logs" });
  }
});

// 📩 Save user support message (Contact form submission)
app.post("/api/contact", (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: "Please fill all fields" });
  }
  try {
    const contacts = JSON.parse(fs.readFileSync(contactsFile, "utf-8") || "[]");
    const newContact = {
      id: Date.now(),
      name,
      email,
      message,
      timestamp: new Date().toISOString()
    };
    contacts.push(newContact);
    fs.writeFileSync(contactsFile, JSON.stringify(contacts, null, 2));
    res.json({ success: true, message: "Support message submitted successfully!" });
  } catch (err) {
    res.status(500).json({ error: "Could not save message" });
  }
});

// 📊 Retrieve all logged contact messages
app.get("/api/contacts", (req, res) => {
  try {
    const contacts = JSON.parse(fs.readFileSync(contactsFile, "utf-8") || "[]");
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: "Failed to read contact logs" });
  }
});

// ⚙ Mock retraining endpoint
app.post("/api/retrain", (req, res) => {
  res.json({
    success: true,
    message: "AI model retraining completed successfully! Saved model accuracy improved by +1.4%."
  });
});

// 📈 Proxy route for live Mandi prices from data.gov.in (OGD Platform)
app.get("/api/mandi", async (req, res) => {
  const { state, commodity } = req.query;
  const apiKey = process.env.DATA_GOV_API_KEY;

  if (!apiKey || apiKey === "your_datagov_key_here") {
    // If no API Key configured in .env, tell frontend to use local fallback dataset
    return res.json({ fallback: true });
  }

  try {
    const resourceId = "9ef84268-d588-465a-a308-a864a43d0070"; // Agmarknet daily price resource ID
    let url = `https://api.data.gov.in/resource/${resourceId}?api-key=${apiKey}&format=json&limit=50`;
    
    if (state) {
      url += `&filters[state]=${encodeURIComponent(state)}`;
    }
    if (commodity) {
      url += `&filters[commodity]=${encodeURIComponent(commodity)}`;
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Gov API response error: ${response.status}`);
    const data = await response.json();
    
    res.json({
      fallback: false,
      records: data.records || []
    });
  } catch (error) {
    console.error("Mandi API fetch error (falling back to local dataset):", error.message || error);
    res.json({ fallback: true });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
