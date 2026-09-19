import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
  try {
    // We can fetch via direct REST fetch to avoid SDK version constraints
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.error) {
      console.error("API Error listing models:", data.error);
      return;
    }
    
    console.log("Available models for your API key:");
    if (data.models) {
      data.models.forEach(m => {
        console.log(`- ${m.name} (supports: ${m.supportedGenerationMethods.join(", ")})`);
      });
    } else {
      console.log("No models returned. Response:", data);
    }
  } catch (err) {
    console.error("Fetch Error:", err);
  }
}

listModels();
