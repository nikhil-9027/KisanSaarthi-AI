KisanSaarthi AI 🌾


KisanSaarthi AI is an AI-powered agriculture advisory web application built to help farmers make more informed day-to-day farming decisions. The platform brings crop guidance, weather information, AI-based farmer assistance, crop/leaf disease analysis, and mandi price information together in one web application.

Project type: Full-stack web application
Frontend: HTML, CSS, JavaScript, TensorFlow.js
Backend: Node.js + Express
AI: Google Gemini API
Data: Government of India data.gov.in mandi data + weather APIs

✨ What KisanSaarthi AI Provides

🌦 Weather Information

Get weather information through the application's weather integration. Weather data can be used alongside crop and farming guidance to make more practical decisions.

🌱 Crop Recommendation

The application provides crop suggestions using soil and climate-related conditions. The recommendation flow is designed to give farmers an easy starting point when selecting suitable crops.

🤖 Bilingual AI Farm Assistant

The AI assistant supports English, Hindi, and Hinglish conversations.

It can help with questions related to:

Crops and cultivation

Soil and irrigation

Fertilizer and farming practices

Pests and crop diseases

Weather-related farming decisions

General agricultural guidance

The Gemini API is called from the Node.js server, so the API key is not exposed to frontend JavaScript.

🍃 Crop Disease Analysis

Farmers can upload a crop, leaf, or fruit image for AI-assisted disease analysis.

The application:

Accepts the uploaded image.

Sends the image for AI analysis.

Attempts to identify the crop/plant condition.

Returns a disease/health status, confidence value, and practical advice.

Stores an analysis log for the admin panel.

The frontend also includes TensorFlow.js-based image-processing support and browser-side fallback logic used by the existing application.

Important: AI image analysis is an advisory feature and should not replace laboratory testing or advice from a qualified agricultural professional.

📈 Mandi Market Prices

The market section can retrieve commodity price information through the official Government of India data.gov.in API when the required API key is configured.

🛡️ Admin Dashboard

The admin area provides project-management features such as:

Viewing disease-analysis logs

Reviewing farmer support/contact messages

Downloading collected data

Triggering the project's retraining endpoint

Monitoring application data stored by the server

🧰 Technology Stack

Layer

Technology

Frontend

HTML5, CSS3, JavaScript

UI

Custom CSS + responsive web layouts

Backend

Node.js, Express.js

AI Assistant

Google Gemini API

Image Analysis

Gemini multimodal API + TensorFlow.js/browser processing

Weather

Weather API integration

Market Data

Government of India data.gov.in

Local Data

JSON files + browser localStorage

Development

Nodemon

API Configuration

dotenv

📁 Main Project Structure

KisanSaarthi-AI/
├── index.html              # Main application
├── first.html              # Project/about landing page
├── login.html              # Login and registration
├── dashboard.html          # Farmer/admin dashboard
├── chat.html               # AI farming assistant
├── market.html             # Mandi market prices
├── script.js               # Frontend JavaScript
├── server.js               # Express backend and API routes
├── modern-ui.css           # Modern UI styles
├── style.css               # Application styles
├── image/                  # Crop and UI images
├── uploads/                # Uploaded images and local JSON logs
├── .env.example            # Environment-variable template
├── package.json            # Node.js dependencies/scripts
└── README.md               # Project documentation

🚀 How to Run Locally

1. Prerequisites

Install:

Node.js 18 or later

npm (included with Node.js)

A modern browser such as Chrome, Edge, or Firefox

You can get Node.js https://nodejs.org/

2. Extract the project

Extract the project folder and open a terminal inside the project directory.

cd KisanSaarthi-AI

3. Install dependencies

npm install

4. Configure environment variables

Create a .env file from .env.example:

# Windows
copy .env.example .env

# macOS / Linux
cp .env.example .env

Then add your own API credentials.

Example:

GEMINI_API_KEY=YOUR_GEMINI_API_KEY
DATA_GOV_API_KEY=YOUR_DATA_GOV_API_KEY

Never commit a real API key to GitHub or place it inside frontend HTML/JavaScript files.

5. Start the application

npm start

For development with automatic server restart:

npm run dev

6. Open the application

Open:

http://localhost:8000

The AI assistant can also be accessed directly at:

http://localhost:8000/chat.html

🔐 Demo Login

The application includes demo credentials for local testing:

Farmer

Username: farmer
Password: farmer123

Admin

Username: admin
Password: admin123

Users can also register accounts through the application's registration interface. Browser-side account data is stored using localStorage.

For a production deployment, replace the demo/local authentication with secure server-side authentication, password hashing, sessions/JWT, authorization controls, and a proper database.

🧠 AI Advisory Architecture

The AI assistant follows a server-side flow:

Farmer
  │
  ▼
KisanSaarthi AI Web Interface
  │
  ▼
Node.js / Express Server
  │
  ▼
Gemini API
  │
  ▼
Agriculture-focused AI Response
  │
  ▼
Farmer

The server keeps the Gemini API key in the environment configuration and sends the user's conversation history to the AI service when appropriate.

The current backend includes:

Agriculture-focused system instructions

English/Hindi/Hinglish responses

Conversation history

Request timeout handling

Retries for temporary API failures

Multiple Gemini model attempts

Server-side API-key protection

🍃 Disease Detection Flow

Crop / Leaf Image
       │
       ▼
Image Upload
       │
       ▼
Express API
       │
       ▼
AI Image Analysis
       │
       ▼
Disease / Healthy Status
       │
       ▼
Confidence + Advisory
       │
       ▼
Analysis Log

The system stores uploaded image metadata and analysis results in the local uploads directory for use by the dashboard.

📊 Mandi Price Flow

KisanSaarthi AI
       │
       ▼
Express API Proxy
       │
       ▼
data.gov.in
       │
       ▼
Commodity / State Price Data
       │
       ▼
Market Price Interface

The backend uses the Government of India Agmarknet daily-price resource when DATA_GOV_API_KEY is configured.

🔑 Environment Variables

Variable

Purpose

GEMINI_API_KEY

Gemini AI assistant and image-analysis access

DATA_GOV_API_KEY

Government mandi-price API access

Keep .env local and add it to .gitignore.

If an API key has ever been exposed publicly, revoke it and create a new key before continuing development.

🧪 Available npm Commands

npm install

Install project dependencies.

npm start

Start the Express server.

npm run dev

Start the server using Nodemon for development.

⚠️ Important Notes

AI-generated agricultural guidance should be treated as decision support, not as a guaranteed diagnosis or prescription.

Crop disease results can be affected by image quality, lighting, crop variety, growth stage, and symptoms that are visually similar.

Fertilizer and pesticide decisions should follow the product label and local agricultural recommendations.

For serious or uncertain crop problems, consult a local agriculture officer, KVK, agronomist, or other qualified professional.

Live weather and mandi information depends on the availability and configuration of the corresponding APIs.

The local JSON files in uploads/ are suitable for development/demo use; production systems should use a proper database and secure storage.

🔒 Security Recommendations for Production

Before deploying KisanSaarthi AI publicly:

Remove all real API keys from the repository.

Store secrets in deployment environment variables or a secret manager.

Add proper authentication and role-based authorization.

Hash passwords using a secure password-hashing algorithm.

Validate and limit uploaded image types and sizes.

Add rate limiting to public API endpoints.

Restrict CORS to trusted origins.

Replace local JSON storage with a production database.

Add HTTPS.

Avoid exposing uploaded files or sensitive farmer information publicly.

🌾 Project Vision

KisanSaarthi AI aims to make useful agricultural information easier to access by combining AI assistance, crop guidance, image-based disease analysis, weather information, and market data in a single farmer-friendly platform.

The goal is simple:

Better information → better farming decisions → smarter agriculture.

👨‍💻 Development

This project is intended for educational, demonstration, and prototype purposes. Contributions and improvements can focus on model accuracy, regional crop knowledge, multilingual support, secure authentication, better weather integration, and reliable agricultural datasets.