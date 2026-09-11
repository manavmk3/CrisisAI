import dns from 'dns';
import mongoose from 'mongoose';
import config from './env.js';

if (config.mongoUri && config.mongoUri.startsWith('mongodb+srv://')) {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch (dnsError) {}
}

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongoUri);
    console.log(`🌿 MongoDB Connected: ${conn.connection.host} (${conn.connection.name})`);
    return conn;
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

export const disconnectDB = async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log('🌿 MongoDB connection closed successfully.');
    }
  } catch (error) {
    console.error(`⚠️ Error closing MongoDB connection: ${error.message}`);
  }
};

export default connectDB;
