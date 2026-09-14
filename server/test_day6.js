import dns from 'dns';
import mongoose from 'mongoose';
import config from './src/config/env.js';
import User from './src/models/User.js';

if (config.mongoUri && config.mongoUri.startsWith('mongodb+srv://')) {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  } catch (dnsError) {}
}

const PORT = config.port || 8000;
const BASE_URL = `http://localhost:${PORT}/api`;

async function runDay6Tests() {
  console.log('====================================================');
  console.log('--- STARTING DAY 6 AUTH LOGIN & JWT VERIFICATION ---');
  console.log('====================================================');

  // Connect to DB directly to clean/prepare test records
  await mongoose.connect(config.mongoUri);
  console.log('✅ MongoDB connected for test suite initialization.');

  const testEmail = 'day6_tester@example.com';
  const testPassword = 'SecurePassword123!';

  // Clean up test user if previously created
  await User.deleteOne({ email: testEmail });

  // 1. Health Check
  console.log('\n[TEST 1] Checking API Health endpoint (GET /api/health)...');
  const healthRes = await fetch(`${BASE_URL}/health`);
  const healthData = await healthRes.json();
  console.log('Status:', healthRes.status);
  console.log('Database status:', healthData?.services?.database?.status || healthData?.status);
  if (healthRes.status !== 200) {
    throw new Error(`Health check failed with status ${healthRes.status}`);
  }

  // 2. Register Test User
  console.log('\n[TEST 2] Registering fresh test user (POST /api/auth/register)...');
  const regRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Day6 Verification Citizen',
      email: testEmail,
      password: testPassword,
      role: 'citizen',
    }),
  });
  const regData = await regRes.json();
  console.log('Register Status:', regRes.status);
  if (regRes.status !== 201) {
    throw new Error(`Registration failed: ${regData.message}`);
  }
  console.log('User created safely. Password returned in body?:', 'password' in (regData.data?.user || {}));

  // 3. Login with Valid Credentials
  console.log('\n[TEST 3] Logging in with valid credentials (POST /api/auth/login)...');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
    }),
  });
  const loginData = await loginRes.json();
  console.log('Login Status:', loginRes.status);
  console.log('Success flag:', loginData.success);
  console.log('Token received:', Boolean(loginData.data?.token));
  console.log('User email in response:', loginData.data?.user?.email);
  console.log('Password leaked in login response?:', 'password' in (loginData.data?.user || {}));

  if (loginRes.status !== 200 || !loginData.data?.token) {
    throw new Error('Valid login failed!');
  }
  const validToken = loginData.data.token;

  // 4. Login with Invalid Password
  console.log('\n[TEST 4] Logging in with invalid password...');
  const badPassRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: 'CompletelyWrongPassword!',
    }),
  });
  const badPassData = await badPassRes.json();
  console.log('Status (expect 401):', badPassRes.status);
  console.log('Message:', badPassData.message);
  if (badPassRes.status !== 401 || badPassData.message !== 'Invalid email or password.') {
    throw new Error('Invalid password check failed to return 401 generic message');
  }

  // 5. Login with Nonexistent Email
  console.log('\n[TEST 5] Logging in with nonexistent email...');
  const badEmailRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'nonexistent_user_9999@example.com',
      password: testPassword,
    }),
  });
  const badEmailData = await badEmailRes.json();
  console.log('Status (expect 401):', badEmailRes.status);
  console.log('Message:', badEmailData.message);
  if (badEmailRes.status !== 401 || badEmailData.message !== 'Invalid email or password.') {
    throw new Error('Nonexistent email check failed to return 401 generic message');
  }

  // 6. Login with Missing Fields
  console.log('\n[TEST 6] Logging in with missing password (expect 400)...');
  const missingFieldRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
    }),
  });
  const missingFieldData = await missingFieldRes.json();
  console.log('Status (expect 400):', missingFieldRes.status);
  console.log('Message:', missingFieldData.message);
  if (missingFieldRes.status !== 400) {
    throw new Error('Missing fields check failed to return 400');
  }

  // 7. Protected Route GET /api/auth/me with Valid Token
  console.log('\n[TEST 7] Accessing protected route GET /api/auth/me with valid JWT...');
  const meRes = await fetch(`${BASE_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${validToken}`,
    },
  });
  const meData = await meRes.json();
  console.log('Status (expect 200):', meRes.status);
  console.log('User name:', meData.data?.user?.name);
  console.log('User email:', meData.data?.user?.email);
  console.log('Password leaked in /me response?:', 'password' in (meData.data?.user || {}));
  if (meRes.status !== 200 || !meData.data?.user) {
    throw new Error('Protected /me route failed with valid token');
  }

  // 8. Protected Route GET /api/auth/me without Token
  console.log('\n[TEST 8] Accessing protected route GET /api/auth/me without token (expect 401)...');
  const noTokenRes = await fetch(`${BASE_URL}/auth/me`);
  const noTokenData = await noTokenRes.json();
  console.log('Status (expect 401):', noTokenRes.status);
  console.log('Message:', noTokenData.message);
  if (noTokenRes.status !== 401) {
    throw new Error('Protected /me route failed to block request without token');
  }

  // 9. Protected Route GET /api/auth/me with Invalid Token
  console.log('\n[TEST 9] Accessing protected route GET /api/auth/me with invalid token (expect 401)...');
  const badTokenRes = await fetch(`${BASE_URL}/auth/me`, {
    headers: {
      Authorization: 'Bearer invalid_signature_token_123',
    },
  });
  const badTokenData = await badTokenRes.json();
  console.log('Status (expect 401):', badTokenRes.status);
  console.log('Message:', badTokenData.message);
  if (badTokenRes.status !== 401) {
    throw new Error('Protected /me route failed to block request with invalid token');
  }

  // Clean up
  await User.deleteOne({ email: testEmail });
  await mongoose.connection.close();
  console.log('\n====================================================');
  console.log('🎉 ALL DAY 6 TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('====================================================');
}

runDay6Tests().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
