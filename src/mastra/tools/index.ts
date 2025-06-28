import { createTool } from "@mastra/core/tools";
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

// Type declarations instead of interfaces
type GeocodingResponse = {
  results: {
    latitude: number;
    longitude: number;
    name: string;
  }[];
};

type WeatherResponse = {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    wind_gusts_10m: number;
    weather_code: number;
  };
};

type WeatherData = {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windGust: number;
  conditions: string;
  location: string;
};

export const weatherTool = createTool({
  id: "get-weather",
  description: "Get current weather for a location",
  inputSchema: z.object({
    location: z.string().describe("City name"),
  }),
  outputSchema: z.object({
    temperature: z.number(),
    feelsLike: z.number(),
    humidity: z.number(),
    windSpeed: z.number(),
    windGust: z.number(),
    conditions: z.string(),
    location: z.string(),
  }),
  execute: async ({ context }) => {
    const result = await getWeather(context.location);

    // Handle Result type for Mastra tool
    if (isErr(result)) {
      // Mastra expects thrown errors, so we need to throw here at the boundary
      const error = unwrapErr(result);
      throw new Error(error.message);
    }

    return unwrap(result);
  },
});

const getWeather = async (
  location: string
): Promise<Result<WeatherData, AppError>> => {
  // Fetch geocoding data
  const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`;

  const geocodingResult = await fromPromise<GeocodingResponse, AppError>(
    fetch(geocodingUrl).then((res) => res.json() as Promise<GeocodingResponse>),
    (error): AppError =>
      errors.infrastructure("Failed to fetch geocoding data", error)
  );

  if (isErr(geocodingResult)) {
    return err(unwrapErr(geocodingResult));
  }

  const geocodingData = unwrap(geocodingResult);

  // Validate location exists
  if (!geocodingData.results?.[0]) {
    return err(errors.notFound("location", location));
  }

  const { latitude, longitude, name } = geocodingData.results[0];

  // Fetch weather data
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_gusts_10m,weather_code`;

  const weatherResult = await fromPromise<WeatherResponse, AppError>(
    fetch(weatherUrl).then((res) => res.json() as Promise<WeatherResponse>),
    (error): AppError =>
      errors.infrastructure("Failed to fetch weather data", error)
  );

  if (isErr(weatherResult)) {
    return err(unwrapErr(weatherResult));
  }

  const data = unwrap(weatherResult);

  // Transform to weather data
  return ok({
    temperature: data.current.temperature_2m,
    feelsLike: data.current.apparent_temperature,
    humidity: data.current.relative_humidity_2m,
    windSpeed: data.current.wind_speed_10m,
    windGust: data.current.wind_gusts_10m,
    conditions: getWeatherCondition(data.current.weather_code),
    location: name,
  });
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
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
  };
  return conditions[code] || "Unknown";
}
