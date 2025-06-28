import express from 'express';
import cors from 'cors';
import { mastra } from './mastra/index.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Mastra Weather Agent API' });
});

// Weather endpoint
app.get('/api/weather', async (req, res) => {
  try {
    const { city } = req.query;
    
    if (!city || typeof city !== 'string') {
      res.status(400).json({ 
        error: 'City parameter is required',
        usage: 'GET /api/weather?city=Tokyo'
      });
      return;
    }

    const agent = mastra.getAgent('weatherAgent');
    const result = await agent.generate(`What's the weather like in ${city}?`);
    
    res.json({
      city,
      response: result.text,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating weather response:', error);
    res.status(500).json({ 
      error: 'Failed to generate weather response',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Weather suggestion endpoint
app.post('/api/weather/suggest', async (req, res) => {
  try {
    const { city, activity } = req.body;
    
    if (!city || typeof city !== 'string') {
      res.status(400).json({ 
        error: 'City parameter is required in request body'
      });
      return;
    }

    const agent = mastra.getAgent('weatherAgent');
    const prompt = activity 
      ? `What's the weather like in ${city} and is it suitable for ${activity}?`
      : `What's the weather like in ${city} and what activities would you suggest?`;
    
    const result = await agent.generate(prompt);
    
    res.json({
      city,
      activity,
      response: result.text,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error generating weather suggestion:', error);
    res.status(500).json({ 
      error: 'Failed to generate weather suggestion',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Start server
const server = app.listen(port as number, () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/`);
  console.log(`Weather API: http://localhost:${port}/api/weather?city=Tokyo`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});