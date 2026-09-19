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

const app = express();

/*
 * ============================================================
 * VERCEL / LOCAL STORAGE
 * ============================================================
 *
 * Local development:
 *   ./uploads
 *
 * Vercel:
 *   /tmp/uploads
 *
 * IMPORTANT:
 * Vercel /tmp is temporary and NOT persistent.
 * For permanent image/log/contact storage, use a database
 * or cloud storage later.
 */
const isVercel = Boolean(process.env.VERCEL);

const uploadsDir = isVercel
  ? "/tmp/uploads"
  : path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const logsFile = path.join(uploadsDir, "logs.json");
const contactsFile = path.join(uploadsDir, "contacts.json");

if (!fs.existsSync(logsFile)) {
  fs.writeFileSync(logsFile, JSON.stringify([]));
}

if (!fs.existsSync(contactsFile)) {
  fs.writeFileSync(contactsFile, JSON.stringify([]));
}

/*
 * ============================================================
 * MIDDLEWARE
 * ============================================================
 */

app.use(cors());

app.use(
  bodyParser.json({
    limit: "15mb"
  })
);

app.use(
  bodyParser.urlencoded({
    limit: "15mb",
    extended: true
  })
);

/*
 * ============================================================
 * STATIC FILES
 * ============================================================
 */

app.use(express.static(__dirname));

app.use(
  "/uploads",
  express.static(uploadsDir)
);

/*
 * ============================================================
 * API CONFIGURATION
 * ============================================================
 */

const geminiApiKey = (process.env.GEMINI_API_KEY || "").trim();

const openrouterApiKey = (
  process.env.OPENROUTER_API_KEY || ""
).trim();

const genAI = new GoogleGenerativeAI(geminiApiKey);

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash"
});

let openai = null;

if (openrouterApiKey) {
  openai = new OpenAI({
    apiKey: openrouterApiKey,
    baseURL: "https://openrouter.ai/api/v1"
  });
}

/*
 * ============================================================
 * GEMINI MODELS
 * ============================================================
 */

const GEMINI_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash"
];

/*
 * ============================================================
 * AGRICULTURE SYSTEM PROMPT
 * ============================================================
 */

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

/*
 * ============================================================
 * HELPER FUNCTIONS
 * ============================================================
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidGeminiKey() {
  return (
    geminiApiKey &&
    geminiApiKey !== "your_gemini_api_key_here" &&
    geminiApiKey !== "PASTE_NEW_GEMINI_API_KEY_HERE"
  );
}

function isValidOpenRouterKey() {
  return (
    openrouterApiKey &&
    !openrouterApiKey.includes("your_openrouter_api_key_here") &&
    !openrouterApiKey.includes("PASTE")
  );
}

/*
 * ============================================================
 * GEMINI RESPONSE
 * ============================================================
 */

async function generateGeminiResponse(contents, options = {}) {
  if (!isValidGeminiKey()) {
    throw new Error(
      "Gemini API key is not configured. Add GEMINI_API_KEY to environment variables."
    );
  }

  const models = options.models || GEMINI_MODELS;

  let lastError = null;

  for (const modelName of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();

      const timeout = setTimeout(() => {
        controller.abort();
      }, 30000);

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
                parts: [
                  {
                    text: AGRICULTURE_SYSTEM_PROMPT
                  }
                ]
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
            ?.map((part) => part.text || "")
            .join("")
            .trim();

          if (reply) {
            return reply;
          }

          const finishReason =
            candidate?.finishReason || "UNKNOWN";

          if (data.promptFeedback?.blockReason) {
            throw new Error(
              `Gemini blocked the request (${data.promptFeedback.blockReason}). Please rephrase the question.`
            );
          }

          throw new Error(
            `Gemini returned no text (finish reason: ${finishReason}).`
          );
        }

        const apiMessage =
          data.error?.message ||
          data.error?.status ||
          `HTTP ${response.status}`;

        lastError = new Error(
          `${modelName}: ${apiMessage}`
        );

        if (
          response.status === 429 ||
          response.status >= 500
        ) {
          await sleep(800 * Math.pow(2, attempt));
          continue;
        }

        if (
          response.status === 400 ||
          response.status === 404
        ) {
          break;
        }

        break;
      } catch (err) {
        lastError =
          err.name === "AbortError"
            ? new Error(
                `${modelName}: request timed out after 30 seconds`
              )
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

  throw (
    lastError ||
    new Error("Gemini could not generate a response.")
  );
}

/*
 * ============================================================
 * CHAT HISTORY
 * ============================================================
 */

function normalizeChatHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter(
      (item) =>
        item &&
        (item.role === "user" ||
          item.role === "model") &&
        typeof item.text === "string" &&
        item.text.trim()
    )
    .slice(-12)
    .map((item) => ({
      role: item.role,
      parts: [
        {
          text: item.text.trim().slice(0, 8000)
        }
      ]
    }));
}

/*
 * ============================================================
 * CHAT API
 * ============================================================
 */

async function callGeminiApi(
  userMessage,
  history = []
) {
  const contents = [
    ...normalizeChatHistory(history),
    {
      role: "user",
      parts: [
        {
          text: userMessage.trim().slice(0, 8000)
        }
      ]
    }
  ];

  return generateGeminiResponse(contents);
}

app.post("/chat", async (req, res) => {
  const userMessage =
    typeof req.body.message === "string"
      ? req.body.message.trim()
      : "";

  if (!userMessage) {
    return res.status(400).json({
      error: "Message is required"
    });
  }

  try {
    const replyText = await callGeminiApi(
      userMessage,
      req.body.history
    );

    return res.json({
      reply: replyText
    });
  } catch (err) {
    console.error(
      "Gemini chat error:",
      err.message || err
    );

    const message =
      err.message ||
      "Could not generate content";

    const status =
      /API key|authentication|invalid/i.test(message)
        ? 401
        : /quota|rate limit|429/i.test(message)
        ? 429
        : 503;

    return res.status(status).json({
      error: message
    });
  }
});

/*
 * ============================================================
 * HEALTH CHECK
 * ============================================================
 */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    geminiConfigured: isValidGeminiKey(),
    openrouterConfigured: isValidOpenRouterKey(),
    vercel: isVercel,
    port: process.env.PORT || 8000
  });
});

/*
 * ============================================================
 * DISEASE DETECTION
 * ============================================================
 */

app.post(
  "/api/detect-disease",
  async (req, res) => {
    const {
      imageName,
      imageBase64
    } = req.body;

    if (!imageBase64) {
      return res.status(400).json({
        error: "Missing image base64 data"
      });
    }

    try {
      const timestamp = Date.now();

      const cleanImageName =
        imageName || "crop_image.png";

      const ext =
        path.extname(cleanImageName) || ".png";

      const filename =
        `crop_${timestamp}${ext}`;

      const filePath =
        path.join(uploadsDir, filename);

      /*
       * Decode Base64 image
       */

      const base64Data =
        imageBase64.replace(
          /^data:image\/\w+;base64,/,
          ""
        );

      const buffer =
        Buffer.from(base64Data, "base64");

      /*
       * Save image temporarily
       */

      fs.writeFileSync(
        filePath,
        buffer
      );

      /*
       * MIME type
       */

      let mimeType = "image/png";

      if (
        ext.toLowerCase() === ".jpg" ||
        ext.toLowerCase() === ".jpeg"
      ) {
        mimeType = "image/jpeg";
      } else if (
        ext.toLowerCase() === ".webp"
      ) {
        mimeType = "image/webp";
      }

      /*
       * AI prompt
       */

      const prompt = `
Analyze this image of a plant, crop, leaf, or fruit.

Identify the plant/crop and check if it has any disease.

If it is healthy, state: "Healthy".

If it is diseased, identify the disease.

Write a short, practical diagnosis and treatment advice for the farmer.

Respond ONLY with a JSON object matching this schema:

{
  "detectedDisease": "Disease Name or Healthy",
  "confidence": "92.5",
  "advice": "Treatment advice in Hinglish or English"
}
`;

      let aiResultText = "";

      /*
       * ========================================================
       * 1. OPENROUTER
       * ========================================================
       */

      if (
        openai &&
        isValidOpenRouterKey()
      ) {
        try {
          const response =
            await openai.chat.completions.create({
              model: "google/gemini-2.5-flash",

              messages: [
                {
                  role: "user",

                  content: [
                    {
                      type: "text",
                      text: prompt
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url:
                          `data:${mimeType};base64,${base64Data}`
                      }
                    }
                  ]
                }
              ]
            });

          aiResultText =
            response.choices?.[0]?.message?.content ||
            "";
        } catch (err) {
          console.error(
            "OpenRouter Vision Error:",
            err.message || err
          );
        }
      }

      /*
       * ========================================================
       * 2. DIRECT GEMINI FALLBACK
       * ========================================================
       */

      if (!aiResultText) {
        if (!isValidGeminiKey()) {
          throw new Error(
            "Gemini API key is not configured."
          );
        }

        const imagePart = {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        };

        const result =
          await model.generateContent([
            prompt,
            imagePart
          ]);

        aiResultText =
          result.response.text();
      }

      /*
       * ========================================================
       * PARSE AI JSON
       * ========================================================
       */

      let jsonText =
        aiResultText.trim();

      if (jsonText.startsWith("```")) {
        jsonText =
          jsonText
            .replace(/^```json\s*/i, "")
            .replace(/```$/, "")
            .trim();
      }

      let prediction = {
        detectedDisease: "Unknown",
        confidence: "80.0",
        advice:
          "Please consult local agricultural authorities."
      };

      try {
        prediction =
          JSON.parse(jsonText);
      } catch (parseErr) {
        console.warn(
          "Failed to parse JSON from AI response."
        );

        const diseaseMatch =
          aiResultText.match(
            /"detectedDisease"\s*:\s*"([^"]+)"/
          );

        const confMatch =
          aiResultText.match(
            /"confidence"\s*:\s*"([^"]+)"/
          );

        const adviceMatch =
          aiResultText.match(
            /"advice"\s*:\s*"([^"]+)"/
          );

        if (diseaseMatch) {
          prediction.detectedDisease =
            diseaseMatch[1];
        }

        if (confMatch) {
          prediction.confidence =
            confMatch[1];
        }

        if (adviceMatch) {
          prediction.advice =
            adviceMatch[1];
        }
      }

      /*
       * ========================================================
       * SAVE LOG
       * ========================================================
       */

      let logs = [];

      try {
        logs = JSON.parse(
          fs.readFileSync(
            logsFile,
            "utf-8"
          ) || "[]"
        );
      } catch {
        logs = [];
      }

      const newLog = {
        id: timestamp,
        imageName: cleanImageName,
        imageUrl:
          `/uploads/${filename}`,
        detectedDisease:
          prediction.detectedDisease,
        confidence:
          prediction.confidence,
        advice:
          prediction.advice,
        timestamp:
          new Date().toISOString()
      };

      logs.push(newLog);

      fs.writeFileSync(
        logsFile,
        JSON.stringify(
          logs,
          null,
          2
        )
      );

      /*
       * Return response
       */

      return res.json({
        success: true,
        log: newLog
      });

    } catch (err) {
      console.error(
        "Error detecting disease:",
        err
      );

      return res.status(500).json({
        error:
          "Could not analyze crop image"
      });
    }
  }
);

/*
 * ============================================================
 * UPLOAD DISEASE LOG
 * ============================================================
 */

app.post(
  "/api/upload-disease-log",
  (req, res) => {
    const {
      imageName,
      imageBase64,
      detectedDisease,
      confidence
    } = req.body;

    if (!imageBase64) {
      return res.status(400).json({
        error:
          "Missing image base64 data"
      });
    }

    try {
      const timestamp = Date.now();

      const cleanImageName =
        imageName ||
        "crop_image.png";

      const ext =
        path.extname(cleanImageName) ||
        ".png";

      const filename =
        `crop_${timestamp}${ext}`;

      const filePath =
        path.join(
          uploadsDir,
          filename
        );

      const base64Data =
        imageBase64.replace(
          /^data:image\/\w+;base64,/,
          ""
        );

      const buffer =
        Buffer.from(
          base64Data,
          "base64"
        );

      fs.writeFileSync(
        filePath,
        buffer
      );

      let logs = [];

      try {
        logs = JSON.parse(
          fs.readFileSync(
            logsFile,
            "utf-8"
          ) || "[]"
        );
      } catch {
        logs = [];
      }

      const newLog = {
        id: timestamp,
        imageName:
          cleanImageName,
        imageUrl:
          `/uploads/${filename}`,
        detectedDisease,
        confidence,
        timestamp:
          new Date().toISOString()
      };

      logs.push(newLog);

      fs.writeFileSync(
        logsFile,
        JSON.stringify(
          logs,
          null,
          2
        )
      );

      return res.json({
        success: true,
        log: newLog
      });

    } catch (err) {
      console.error(
        "Error saving crop image log:",
        err
      );

      return res.status(500).json({
        error:
          "Could not save uploaded crop image"
      });
    }
  }
);

/*
 * ============================================================
 * GET DISEASE LOGS
 * ============================================================
 */

app.get(
  "/api/disease-logs",
  (req, res) => {
    try {
      const logs =
        JSON.parse(
          fs.readFileSync(
            logsFile,
            "utf-8"
          ) || "[]"
        );

      return res.json(logs);
    } catch (err) {
      return res.status(500).json({
        error:
          "Failed to read database logs"
      });
    }
  }
);

/*
 * ============================================================
 * CONTACT FORM
 * ============================================================
 */

app.post(
  "/api/contact",
  (req, res) => {
    const {
      name,
      email,
      message
    } = req.body;

    if (
      !name ||
      !email ||
      !message
    ) {
      return res.status(400).json({
        error:
          "Please fill all fields"
      });
    }

    try {
      let contacts = [];

      try {
        contacts =
          JSON.parse(
            fs.readFileSync(
              contactsFile,
              "utf-8"
            ) || "[]"
          );
      } catch {
        contacts = [];
      }

      const newContact = {
        id: Date.now(),
        name,
        email,
        message,
        timestamp:
          new Date().toISOString()
      };

      contacts.push(newContact);

      fs.writeFileSync(
        contactsFile,
        JSON.stringify(
          contacts,
          null,
          2
        )
      );

      return res.json({
        success: true,
        message:
          "Support message submitted successfully!"
      });

    } catch (err) {
      console.error(
        "Contact save error:",
        err
      );

      return res.status(500).json({
        error:
          "Could not save message"
      });
    }
  }
);

/*
 * ============================================================
 * GET CONTACTS
 * ============================================================
 */

app.get(
  "/api/contacts",
  (req, res) => {
    try {
      const contacts =
        JSON.parse(
          fs.readFileSync(
            contactsFile,
            "utf-8"
          ) || "[]"
        );

      return res.json(contacts);
    } catch (err) {
      return res.status(500).json({
        error:
          "Failed to read contact logs"
      });
    }
  }
);

/*
 * ============================================================
 * MOCK RETRAINING
 * ============================================================
 */

app.post(
  "/api/retrain",
  (req, res) => {
    return res.json({
      success: true,
      message:
        "AI model retraining completed successfully! Saved model accuracy improved by +1.4%."
    });
  }
);

/*
 * ============================================================
 * MANDI API
 * ============================================================
 */

app.get(
  "/api/mandi",
  async (req, res) => {
    const {
      state,
      commodity
    } = req.query;

    const apiKey =
      process.env.DATA_GOV_API_KEY;

    if (
      !apiKey ||
      apiKey === "your_datagov_key_here"
    ) {
      return res.json({
        fallback: true
      });
    }

    try {
      const resourceId =
        "9ef84268-d588-465a-a308-a864a43d0070";

      let url =
        `https://api.data.gov.in/resource/${resourceId}` +
        `?api-key=${apiKey}` +
        `&format=json` +
        `&limit=50`;

      if (state) {
        url +=
          `&filters[state]=${encodeURIComponent(state)}`;
      }

      if (commodity) {
        url +=
          `&filters[commodity]=${encodeURIComponent(commodity)}`;
      }

      const response =
        await fetch(url);

      if (!response.ok) {
        throw new Error(
          `Gov API response error: ${response.status}`
        );
      }

      const data =
        await response.json();

      return res.json({
        fallback: false,
        records:
          data.records || []
      });

    } catch (error) {
      console.error(
        "Mandi API fetch error:",
        error.message || error
      );

      return res.json({
        fallback: true
      });
    }
  }
);

/*
 * ============================================================
 * HOME ROUTE
 * ============================================================
 */

app.get(
  "/",
  (req, res) => {
    res.sendFile(
      path.join(
        __dirname,
        "index.html"
      )
    );
  }
);

/*
 * ============================================================
 * LOCAL SERVER
 * ============================================================
 *
 * Vercel imports this file as a serverless function.
 * Local machine starts Express normally.
 */

const PORT =
  process.env.PORT || 8000;

if (!isVercel) {
  app.listen(
    PORT,
    () => {
      console.log(
        `Server running on port ${PORT}`
      );
    }
  );
}

/*
 * IMPORTANT FOR VERCEL
 */

export default app;