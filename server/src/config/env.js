import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server root directory (two levels up from src/config)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV !== 'production',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/crisisai',
  jwt: {
    secret: process.env.JWT_SECRET || 'crisisai_dev_fallback_secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  ai: {
    geminiApiKey: process.env.GEMINI_API_KEY || '',
  },
};

export default config;
