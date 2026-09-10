import app from './src/app.js';
import config from './src/config/env.js';

const PORT = config.port || 5000;

const server = app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 CrisisAI Server running in ${config.nodeEnv.toUpperCase()} mode`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🩺 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`=========================================`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('💥 UNHANDLED REJECTION! Shutting down gracefully...');
  console.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('💥 UNCAUGHT EXCEPTION! Shutting down immediately...');
  console.error(err.name, err.message);
  process.exit(1);
});

// Handle graceful termination
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Gracefully closing HTTP server...`);
  server.close(() => {
    console.log('✅ HTTP server closed. Process exiting.');
    process.exit(0);
  });

  // Force close if graceful shutdown takes longer than 10 seconds
  setTimeout(() => {
    console.error('⚠️ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default server;
