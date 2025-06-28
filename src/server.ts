import express from "express";
import cors from "cors";
import { mastra } from "./mastra/index.js";
import dotenv from "dotenv";
import { middleware, MiddlewareConfig, WebhookEvent, TextMessage, MessageAPIResponseBase, validateSignature } from "@line/bot-sdk";

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

// LINE Bot configuration
const channelSecret = process.env.LINE_CHANNEL_SECRET || '';
console.log('Channel Secret length:', channelSecret.length);
console.log('Channel Secret first 4 chars:', channelSecret.substring(0, 4));

const middlewareConfig: MiddlewareConfig = {
  channelSecret: channelSecret,
};

// Middleware
app.use(cors());

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Mastra Weather Agent API" });
});

// Apply JSON middleware for other routes (not LINE webhook)
app.use(express.json());

// Weather endpoint
app.get("/api/weather", async (req, res) => {
  try {
    const { city } = req.query;

    if (!city || typeof city !== "string") {
      res.status(400).json({
        error: "City parameter is required",
        usage: "GET /api/weather?city=Tokyo",
      });
      return;
    }

    const agent = mastra.getAgent("weatherAgent");
    const result = await agent.generate(`What's the weather like in ${city}?`);

    res.json({
      city,
      response: result.text,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error generating weather response:", error);
    res.status(500).json({
      error: "Failed to generate weather response",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Weather suggestion endpoint
app.post("/api/weather/suggest", async (req, res) => {
  try {
    const { city, activity } = req.body;

    if (!city || typeof city !== "string") {
      res.status(400).json({
        error: "City parameter is required in request body",
      });
      return;
    }

    const agent = mastra.getAgent("weatherAgent");
    const prompt = activity
      ? `What's the weather like in ${city} and is it suitable for ${activity}?`
      : `What's the weather like in ${city} and what activities would you suggest?`;

    const result = await agent.generate(prompt);

    res.json({
      city,
      activity,
      response: result.text,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error generating weather suggestion:", error);
    res.status(500).json({
      error: "Failed to generate weather suggestion",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Start server
const server = app.listen(port as number, () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/`);
  console.log(`Weather API: http://localhost:${port}/api/weather?city=Tokyo`);
  console.log(`LINE webhook: http://localhost:${port}/api/line/webhook`);
  console.log(`LINE_CHANNEL_SECRET exists:`, !!process.env.LINE_CHANNEL_SECRET);
  console.log(`LINE_CHANNEL_ACCESS_TOKEN exists:`, !!process.env.LINE_CHANNEL_ACCESS_TOKEN);
});

// Health check for LINE webhook
app.get('/api/line/webhook', (req, res) => {
  res.json({ 
    status: 'ok', 
    secretExists: !!process.env.LINE_CHANNEL_SECRET,
    secretLength: (process.env.LINE_CHANNEL_SECRET || '').length 
  });
});

// LINE webhook endpoint - Use middleware with proper configuration
app.use('/api/line/webhook', middleware(middlewareConfig));
app.post('/api/line/webhook', async (req, res) => {
    try {
      const events: WebhookEvent[] = req.body.events;
      
      if (!events || events.length === 0) {
        res.status(200).json({ status: 'ok' });
        return;
      }
      
      // Process all events asynchronously
      await Promise.all(events.map(handleEvent));
      
      res.status(200).json({ status: 'ok' });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
});

// Event handler
async function handleEvent(event: WebhookEvent): Promise<MessageAPIResponseBase | undefined> {
  // Handle only text messages
  if (event.type !== 'message' || event.message.type !== 'text') {
    return;
  }

  const userMessage = event.message.text;
  const replyToken = event.replyToken;

  try {
    // Get weather agent
    const agent = mastra.getAgent('weatherAgent');
    
    // Generate response
    const result = await agent.generate(userMessage);
    
    // Create reply message
    const replyMessage: TextMessage = {
      type: 'text',
      text: result.text,
    };

    // Send reply using fetch API
    const response = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [replyMessage],
      }),
    });

    if (!response.ok) {
      console.error('Failed to send LINE reply:', await response.text());
    }

    return response as any;
  } catch (error) {
    console.error('Error handling LINE message:', error);
    
    // Send error message
    const errorMessage: TextMessage = {
      type: 'text',
      text: 'エラーが発生しました。もう一度お試しください。',
    };

    await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [errorMessage],
      }),
    });
  }
}

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
  });
});
