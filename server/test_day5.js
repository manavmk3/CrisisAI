import dns from 'dns';
import mongoose from 'mongoose';
import config from './src/config/env.js';
import User from './src/models/User.js';

if (config.mongoUri && config.mongoUri.startsWith('mongodb+srv://')) {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch (dnsError) {}
}

const BASE_URL = `http://localhost:${config.port || 8000}/api/auth`;

async function runTests() {
  console.log('--- STARTING DAY 5 AUTH REGISTRATION TESTS ---');

  await mongoose.connect(config.mongoUri);
  console.log('Connected to DB for test inspection.');

  const testEmail = 'testcitizen@example.com';
  await User.deleteOne({ email: testEmail });
  await User.deleteOne({ email: 'duplicate@example.com' });

  console.log('\n[TEST 1] Valid Registration:');
  const res1 = await fetch(`${BASE_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Test Citizen',
      email: testEmail,
      password: 'TestPassword123!',
      role: 'citizen',
    }),
  });
  const data1 = await res1.json();
  console.log('Status:', res1.status);
  console.log('Response:', JSON.stringify(data1, null, 2));

  const dbUser = await User.findOne({ email: testEmail }).select('+password');
  if (!dbUser) {
    throw new Error('FAILED: User not found in MongoDB!');
  }
  console.log('DB User Found:', dbUser._id);
  console.log('Stored Password starts with bcrypt prefix?:', dbUser.password.startsWith('$2a$') || dbUser.password.startsWith('$2b$'));
  console.log('Stored Password equals plain text?:', dbUser.password === 'TestPassword123!');
  console.log('Does API response leak password?:', 'password' in (data1.data?.user || {}));

  console.log('\n[TEST 2] Duplicate Email:');
  const res2 = await fetch(`${BASE_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Test Citizen Duplicate',
      email: testEmail,
      password: 'TestPassword123!',
      role: 'citizen',
    }),
  });
  const data2 = await res2.json();
  console.log('Status (expect 409):', res2.status);
  console.log('Response:', JSON.stringify(data2, null, 2));

  console.log('\n[TEST 3] Invalid Email:');
  const res3 = await fetch(`${BASE_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Invalid Email User',
      email: 'not-an-email',
      password: 'TestPassword123!',
      role: 'citizen',
    }),
  });
  const data3 = await res3.json();
  console.log('Status (expect 400):', res3.status);
  console.log('Response message:', data3.message);

  console.log('\n[TEST 4] Missing Required Name:');
  const res4 = await fetch(`${BASE_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'noname@example.com',
      password: 'TestPassword123!',
      role: 'citizen',
    }),
  });
  const data4 = await res4.json();
  console.log('Status (expect 400):', res4.status);
  console.log('Response message:', data4.message);

  console.log('\n[TEST 5] Invalid Role:');
  const res5 = await fetch(`${BASE_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Hacker User',
      email: 'hacker@example.com',
      password: 'TestPassword123!',
      role: 'superadmin',
    }),
  });
  const data5 = await res5.json();
  console.log('Status (expect 400):', res5.status);
  console.log('Response message:', data5.message);

  console.log('\n[TEST 6] Weak/Short Password:');
  const res6 = await fetch(`${BASE_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Short Password User',
      email: 'shortpass@example.com',
      password: '123',
      role: 'citizen',
    }),
  });
  const data6 = await res6.json();
  console.log('Status (expect 400):', res6.status);
  console.log('Response message:', data6.message);

  await mongoose.connection.close();
  console.log('\n--- ALL BACKEND TESTS COMPLETED SUCCESSFULLY ---');
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
