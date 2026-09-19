import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
console.log("API Key present:", !!apiKey);

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({
  model: "gemini-3.6-flash"
});

try {
  console.log("Testing SDK generateContent...");
  const result = await model.generateContent("fertilizer batao jisse production zyada nikal ske sugarcane crop ka");
  console.log("SDK Output:\n", result.response.text());
} catch (err) {
  console.error("SDK Error:", err.message || err);
}
