import {
  MessageAPIResponseBase,
  MiddlewareConfig,
  WebhookEvent,
  middleware,
} from "@line/bot-sdk";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { mastra } from "./mastra/index.js";
import {
  AppError,
  Result,
  ValidationError,
  err,
  errors,
  isErr,
  ok,
  unwrap,
  unwrapErr,
} from "./utils/result.js";

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

// LINE Bot configuration
const channelSecret = process.env.LINE_CHANNEL_SECRET || "";
console.log("Channel Secret length:", channelSecret.length);
console.log("Channel Secret first 4 chars:", channelSecret.substring(0, 4));

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

// Type for weather request validation
type WeatherRequest = {
  city: string;
};

// Validate weather request
function validateWeatherRequest(
  query: any
): Result<WeatherRequest, ValidationError> {
  if (!query.city || typeof query.city !== "string") {
    return err(errors.validation("City parameter is required", "city"));
  }
  return ok({ city: query.city });
}

// Get weather data using Mastra agent and tools
async function getWeatherData(city: string): Promise<Result<any, AppError>> {
  try {
    console.log("Getting weather for city:", city);

    // Get the weather agent from Mastra
    const agent = mastra.getAgent("weatherAgent");
    if (!agent) {
      return err(errors.infrastructure("Weather agent not found"));
    }

    // The agent already has the weather tool configured, so just use it
    const response = await agent.generate([
      {
        role: "user",
        content: `Get the current weather for ${city} and suggest appropriate activities based on the weather conditions.`,
      },
    ]);

    // Check if we got a response
    if (!response || !response.text) {
      return err(errors.weatherAPI("No weather data received from agent", 500));
    }

    return ok({ activities: response.text });
  } catch (error) {
    console.error("Weather agent error:", error);
    return err(errors.infrastructure("Failed to get weather data", error));
  }
}

// Weather endpoint
app.get("/api/weather", async (req, res) => {
  // Validate request
  const validationResult = validateWeatherRequest(req.query);

  if (isErr(validationResult)) {
    const error = unwrapErr(validationResult);
    res.status(400).json({
      error: error.message,
      field: error.kind === "validation" ? error.field : undefined,
    });
    return;
  }

  // Get weather data
  const weatherResult = await getWeatherData(unwrap(validationResult).city);

  if (isErr(weatherResult)) {
    const error = unwrapErr(weatherResult);
    const status =
      error.kind === "weather-api" && error.statusCode ? error.statusCode : 500;
    res.status(status).json({
      error: error.message,
      type: error.kind,
    });
    return;
  }

  res.json(unwrap(weatherResult));
});

// Type for suggest request
type SuggestRequest = {
  city: string;
};

// Validate suggest request
function validateSuggestRequest(
  body: any
): Result<SuggestRequest, ValidationError> {
  if (!body || typeof body !== "object") {
    return err(errors.validation("Request body is required"));
  }

  if (!body.city || typeof body.city !== "string") {
    return err(errors.validation("City is required", "city"));
  }

  return ok({ city: body.city });
}

// Weather suggest endpoint
app.post("/api/weather/suggest", async (req, res) => {
  // Validate request
  const validationResult = validateSuggestRequest(req.body);

  if (isErr(validationResult)) {
    const error = unwrapErr(validationResult);
    res.status(400).json({
      error: error.message,
      field: error.kind === "validation" ? error.field : undefined,
    });
    return;
  }

  // Get weather with suggestions
  const weatherResult = await getWeatherData(unwrap(validationResult).city);

  if (isErr(weatherResult)) {
    const error = unwrapErr(weatherResult);
    const status =
      error.kind === "weather-api" && error.statusCode ? error.statusCode : 500;
    res.status(status).json({
      error: error.message,
      type: error.kind,
    });
    return;
  }

  res.json({
    ...unwrap(weatherResult),
    timestamp: new Date().toISOString(),
  });
});

// Start server
const server = app.listen(port as number, () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/`);
  console.log(`Weather API: http://localhost:${port}/api/weather?city=Tokyo`);
  console.log(`LINE webhook: http://localhost:${port}/api/line/webhook`);
  console.log(`LINE_CHANNEL_SECRET exists:`, !!process.env.LINE_CHANNEL_SECRET);
  console.log(
    `LINE_CHANNEL_ACCESS_TOKEN exists:`,
    !!process.env.LINE_CHANNEL_ACCESS_TOKEN
  );
});

// Health check for LINE webhook
app.get("/api/line/webhook", (req, res) => {
  res.json({
    status: "ok",
    secretExists: !!process.env.LINE_CHANNEL_SECRET,
    secretLength: (process.env.LINE_CHANNEL_SECRET || "").length,
  });
});

// LINE webhook endpoint - Use middleware correctly
app.post(
  "/api/line/webhook",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    // Convert raw body to string for middleware
    req.body = req.body.toString();
    next();
  },
  middleware(middlewareConfig),
  async (req, res) => {
    try {
      const events: WebhookEvent[] = req.body.events;

      if (!events || events.length === 0) {
        res.status(200).json({ status: "ok" });
        return;
      }

      // Process all events asynchronously
      await Promise.all(events.map(handleEvent));

      res.status(200).json({ status: "ok" });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Parse message for city name
function parseMessageForCity(text: string): Result<string, ValidationError> {
  const normalizedText = text.toLowerCase().trim();

  // Check for weather keywords
  const weatherKeywords = [
    "天気",
    "weather",
    "forecast",
    "気温",
    "temperature",
  ];
  const hasWeatherKeyword = weatherKeywords.some((keyword) =>
    normalizedText.includes(keyword)
  );

  if (!hasWeatherKeyword) {
    return err(
      errors.validation(
        "Please include a weather-related keyword in your message"
      )
    );
  }

  // Extract city name (simple pattern matching)
  const patterns = [
    /(.+?)の天気/,
    /weather in (.+)/i,
    /forecast for (.+)/i,
    /(.+)の気温/,
    /temperature in (.+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return ok(match[1].trim());
    }
  }

  // Default cities if just keywords are mentioned
  if (normalizedText === "天気" || normalizedText === "weather") {
    return ok("Tokyo");
  }

  return err(
    errors.validation(
      "Could not understand the city name. Try '東京の天気' or 'weather in Tokyo'"
    )
  );
}

// Event handler
async function handleEvent(
  event: WebhookEvent
): Promise<MessageAPIResponseBase | undefined> {
  // Handle only text messages
  if (event.type !== "message" || event.message.type !== "text") {
    return;
  }

  const { replyToken } = event;
  const { text } = event.message;

  try {
    // Parse message for city
    const cityResult = parseMessageForCity(text);

    if (isErr(cityResult)) {
      return client.replyMessage(replyToken, {
        type: "text",
        text: unwrapErr(cityResult).message,
      });
    }

    // Get weather data
    const weatherResult = await getWeatherData(unwrap(cityResult));

    if (isErr(weatherResult)) {
      return client.replyMessage(replyToken, {
        type: "text",
        text: `Sorry, I couldn't get weather information: ${unwrapErr(weatherResult).message}`,
      });
    }

    // Format response
    const data = unwrap(weatherResult);
    const weatherData =
      data.activities || "Weather information is currently unavailable.";

    return client.replyMessage(replyToken, {
      type: "text",
      text: weatherData,
    });
  } catch (error) {
    console.error("Error handling event:", error);
    return client.replyMessage(replyToken, {
      type: "text",
      text: "Sorry, an error occurred while processing your request.",
    });
  }
}

// Initialize LINE client
import { Client } from "@line/bot-sdk";

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || "",
  channelSecret: process.env.LINE_CHANNEL_SECRET || "",
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
  });
});
