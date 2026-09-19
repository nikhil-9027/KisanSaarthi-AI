import dotenv from "dotenv";

dotenv.config();

const geminiApiKey = process.env.GEMINI_API_KEY;

try {
  console.log("Testing gemini-3.6-flash connection...");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: "Say hello in one word"
              }
            ]
          }
        ]
      })
    }
  );
  
  console.log("Status code:", response.status);
  const data = await response.json();
  console.log("Response data:", JSON.stringify(data, null, 2));
} catch (error) {
  console.error("Direct fetch error:", error);
}
