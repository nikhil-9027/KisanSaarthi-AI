import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
console.log("Using API Key starting with:", apiKey ? apiKey.substring(0, 15) : "undefined");

const genAI = new GoogleGenerativeAI(apiKey);

async function test() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const response = await model.generateContent("Say hello");
    console.log("Success with gemini-2.5-flash:", response.response.text());
  } catch (err) {
    console.error("Error with gemini-2.5-flash:", err.message || err);
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const response = await model.generateContent("Say hello");
    console.log("Success with gemini-pro:", response.response.text());
  } catch (err) {
    console.error("Error with gemini-pro:", err.message || err);
  }
}

test();
