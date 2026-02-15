require('dotenv').config(); // Loads your HF_API_TOKEN from .env
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // Ensure you have node-fetch installed

const app = express();

// Enable CORS so your frontend (on port 5173/3000) can talk to this server (on 3001)
app.use(cors());

// Increase the limit because images sent as strings (Base64) are large
app.use(express.json({ limit: '10mb' }));

const MODEL_URL = "https://router.huggingface.co/hf-inference/models/umm-maybe/AI-image-detector";

app.post('/api/check-ai', async (req, res) => {
  try {
    const { imageData } = req.body;

    if (!imageData) {
      return res.status(400).json({ error: "No image data provided" });
    }

    // 1. Convert Base64 string back into binary Buffer for the AI model
    const imageBuffer = Buffer.from(imageData, 'base64');

    console.log("Sending image to Hugging Face for scanning...");

    // 2. Make the request using the SECRET KEY stored in process.env
    const hfResponse = await fetch(MODEL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HF_API_TOKEN}`,
        "Content-Type": "application/octet-stream",
      },
      body: imageBuffer,
    });

    const result = await hfResponse.json();
    
    // 3. Send the AI's answer back to your frontend
    console.log("Scan complete. Sending results back to frontend.");
    res.json(result);

  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend secure bridge running on port ${PORT}`));