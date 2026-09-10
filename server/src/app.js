import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import config from './config/env.js';
import healthRoutes from './routes/health.routes.js';
import notFound from './middleware/notFound.js';
import errorHandler from './middleware/errorHandler.js';

const app = express();

// ==========================================
// Middleware Configuration
// ==========================================

// HTTP Request Logger
app.use(morgan(config.isDevelopment ? 'dev' : 'combined'));

// Cross-Origin Resource Sharing (CORS)
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or Postman)
      if (!origin) return callback(null, true);
      // In development allow any localhost origin or configured CLIENT_URL
      if (config.isDevelopment || origin === config.clientUrl) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ==========================================
// API Routes
// ==========================================

// Root API Endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to CrisisAI API - Intelligent Disaster Response Platform',
    documentation: '/api/docs',
    healthCheck: '/api/health',
    version: '1.0.0',
  });
});

// Health Check Route
app.use('/api/health', healthRoutes);

// ==========================================
// Error Handling Middleware
// ==========================================

// 404 Not Found Handler
app.use(notFound);

// Centralized Error Handler
app.use(errorHandler);

export default app;
