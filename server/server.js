import app from './src/app.js';
import config from './src/config/env.js';
import { connectDB, disconnectDB } from './src/config/db.js';

const PORT = config.port || 5000;
let server;

const startServer = async () => {
  try {
    await connectDB();

    server = app.listen(PORT, () => {
      console.log(`=========================================`);
      console.log(`🚀 CrisisAI Server running in ${config.nodeEnv.toUpperCase()} mode`);
      console.log(`📡 URL: http://localhost:${PORT}`);
      console.log(`🩺 Health Check: http://localhost:${PORT}/api/health`);
      console.log(`=========================================`);
    });
  } catch (error) {
    console.error('💥 Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();

const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}. Gracefully shutting down...`);

  const forceExitTimeout = setTimeout(() => {
    console.error('⚠️ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);

  try {
    if (server) {
      await new Promise((resolve) => {
        server.close(() => {
          console.log('✅ HTTP server closed.');
          resolve();
        });
      });
    }

    await disconnectDB();
    clearTimeout(forceExitTimeout);
    console.log('✅ Graceful shutdown completed. Process exiting cleanly.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error.message);
    clearTimeout(forceExitTimeout);
    process.exit(1);
  }
};

process.on('unhandledRejection', (err) => {
  console.error('💥 UNHANDLED REJECTION! Shutting down gracefully...');
  console.error(err?.name || 'Error', err?.message || err);
  gracefulShutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  console.error('💥 UNCAUGHT EXCEPTION! Shutting down immediately...');
  console.error(err?.name || 'Error', err?.message || err);
  process.exit(1);
});

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default server;

