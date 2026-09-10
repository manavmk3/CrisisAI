import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import config from './config/env.js';
import healthRoutes from './routes/health.routes.js';
import notFound from './middleware/notFound.js';
import errorHandler from './middleware/errorHandler.js';

const app = express();

app.use(morgan(config.isDevelopment ? 'dev' : 'combined'));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to CrisisAI API - Intelligent Disaster Response Platform',
    documentation: '/api/docs',
    healthCheck: '/api/health',
    version: '1.0.0',
  });
});

app.use('/api/health', healthRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
