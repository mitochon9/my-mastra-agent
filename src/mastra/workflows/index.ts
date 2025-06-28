import { google } from "@ai-sdk/google";
import { Agent } from "@mastra/core/agent";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import {
  AppError,
  Result,
  err,
  errors,
  fromPromise,
  isErr,
  ok,
  unwrap,
  unwrapErr,
} from "../../utils/result.js";

const llm = google(process.env.MODEL ?? "gemini-2.5-pro");

const agent = new Agent({
  name: "Weather Agent",
  model: llm,
  instructions: `
        You are a local activities and travel expert who excels at weather-based planning. Analyze the weather data and provide practical activity recommendations.

        For each day in the forecast, structure your response exactly as follows:

        📅 [Day, Month Date, Year]
        ═══════════════════════════

        🌡️ WEATHER SUMMARY
        • Conditions: [brief description]
        • Temperature: [X°C/Y°F to A°C/B°F]
        • Precipitation: [X% chance]

        🌅 MORNING ACTIVITIES
        Outdoor:
        • [Activity Name] - [Brief description including specific location/route]
          Best timing: [specific time range]
          Note: [relevant weather consideration]

        🌞 AFTERNOON ACTIVITIES
        Outdoor:
        • [Activity Name] - [Brief description including specific location/route]
          Best timing: [specific time range]
          Note: [relevant weather consideration]

        🏠 INDOOR ALTERNATIVES
        • [Activity Name] - [Brief description including specific venue]
          Ideal for: [weather condition that would trigger this alternative]

        ⚠️ SPECIAL CONSIDERATIONS
        • [Any relevant weather warnings, UV index, wind conditions, etc.]

        Guidelines:
        - Suggest 2-3 time-specific outdoor activities per day
        - Include 1-2 indoor backup options
        - For precipitation >50%, lead with indoor activities
        - All activities must be specific to the location
        - Include specific venues, trails, or locations
        - Consider activity intensity based on temperature
        - Keep descriptions concise but informative

        Maintain this exact formatting for consistency, using the emoji and section headers as shown.
      `,
});

const forecastSchema = z.object({
  date: z.string(),
  maxTemp: z.number(),
  minTemp: z.number(),
  precipitationChance: z.number(),
  condition: z.string(),
  location: z.string(),
});

type ForecastData = z.infer<typeof forecastSchema>;

// Type declaration for API responses
type GeocodingResponse = {
  results: { latitude: number; longitude: number; name: string }[];
};

type WeatherApiResponse = {
  current: {
    time: string;
    precipitation: number;
    weathercode: number;
  };
  hourly: {
    precipitation_probability: number[];
    temperature_2m: number[];
  };
};

function getWeatherCondition(code: number): string {
  const conditions: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    95: "Thunderstorm",
  };
  return conditions[code] || "Unknown";
}

// Helper function to fetch weather data with Result type
async function fetchWeatherData(
  city: string
): Promise<Result<ForecastData, AppError>> {
  // Geocoding step
  const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;

  const geocodingResult = await fromPromise<GeocodingResponse, AppError>(
    fetch(geocodingUrl).then((res) => res.json() as Promise<GeocodingResponse>),
    (error): AppError =>
      errors.infrastructure("Failed to fetch geocoding data", error)
  );

  if (isErr(geocodingResult)) {
    return err(unwrapErr(geocodingResult));
  }

  const geocodingData = unwrap(geocodingResult);

  if (!geocodingData.results?.[0]) {
    return err(errors.notFound("location", city));
  }

  const { latitude, longitude, name } = geocodingData.results[0];

  // Weather data step
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=precipitation,weathercode&timezone=auto,&hourly=precipitation_probability,temperature_2m`;

  const weatherResult = await fromPromise<WeatherApiResponse, AppError>(
    fetch(weatherUrl).then((res) => res.json() as Promise<WeatherApiResponse>),
    (error): AppError =>
      errors.infrastructure("Failed to fetch weather data", error)
  );

  if (isErr(weatherResult)) {
    return err(unwrapErr(weatherResult));
  }

  const data = unwrap(weatherResult);

  const forecast: ForecastData = {
    date: new Date().toISOString(),
    maxTemp: Math.max(...data.hourly.temperature_2m),
    minTemp: Math.min(...data.hourly.temperature_2m),
    condition: getWeatherCondition(data.current.weathercode),
    precipitationChance: data.hourly.precipitation_probability.reduce(
      (acc: number, curr: number) => Math.max(acc, curr),
      0
    ),
    location: city,
  };

  return ok(forecast);
}

// Mastra steps still need to throw errors at boundaries
const fetchWeather = createStep({
  id: "fetch-weather",
  description: "Fetches weather forecast for a given city",
  inputSchema: z.object({
    city: z.string().describe("The city to get the weather for"),
  }),
  outputSchema: forecastSchema,
  execute: async ({ inputData }) => {
    if (!inputData) {
      // Mastra expects thrown errors
      throw new Error("Input data not found");
    }

    const result = await fetchWeatherData(inputData.city);

    if (isErr(result)) {
      // Convert Result error to thrown error for Mastra
      const error = unwrapErr(result);
      throw new Error(`${error.kind}: ${error.message}`);
    }

    return unwrap(result);
  },
});

const planActivities = createStep({
  id: "plan-activities",
  description: "Suggests activities based on weather conditions",
  inputSchema: forecastSchema,
  outputSchema: z.object({
    activities: z.string(),
  }),
  execute: async ({ inputData }) => {
    const forecast = inputData;

    if (!forecast) {
      // Mastra expects thrown errors
      throw new Error("Forecast data not found");
    }

    const prompt = `Based on the following weather forecast for ${forecast.location}, suggest appropriate activities:
      ${JSON.stringify(forecast, null, 2)}
      `;

    const response = await agent.stream([
      {
        role: "user",
        content: prompt,
      },
    ]);

    let activitiesText = "";

    for await (const chunk of response.textStream) {
      process.stdout.write(chunk);
      activitiesText += chunk;
    }

    return {
      activities: activitiesText,
    };
  },
});

const weatherWorkflow = createWorkflow({
  id: "weather-workflow",
  inputSchema: z.object({
    city: z.string().describe("The city to get the weather for"),
  }),
  outputSchema: z.object({
    activities: z.string(),
  }),
})
  .then(fetchWeather)
  .then(planActivities);

weatherWorkflow.commit();

export { fetchWeatherData, weatherWorkflow };
