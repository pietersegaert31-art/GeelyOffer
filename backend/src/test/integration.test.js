import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.join(__dirname, '../server.js');
const PORT = 5099;
const BASE_URL = `http://localhost:${PORT}`;
const ADMIN_EMAIL = 'integration-admin@geely.local';
const ADMIN_PASSWORD = 'IntegrationTest123!';

let serverProcess;
let tempDbPath;

async function waitForServer(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Server did not become healthy in time');
}

before(async () => {
  tempDbPath = path.join(os.tmpdir(), `geely-test-${Date.now()}.db`);
  serverProcess = spawn(process.execPath, [SERVER_ENTRY], {
    env: {
      ...process.env,
      PORT: String(PORT),
      DATABASE_PATH: tempDbPath,
      JWT_SECRET: 'integration-test-secret',
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      ADMIN_NAME: 'Integration Admin',
      NODE_ENV: 'development', // avoids the production JWT_SECRET fail-fast/static-file serving paths
    },
    stdio: 'ignore',
  });
  await waitForServer();
});

after(async () => {
  if (serverProcess) {
    const exited = new Promise((resolve) => serverProcess.once('exit', resolve));
    serverProcess.kill();
    // Wait for the process to actually exit before touching its DB file — on Windows,
    // killing a process doesn't synchronously release its open file handles, so deleting
    // too early silently fails to remove the file.
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
  }
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    try { fs.unlinkSync(tempDbPath + suffix); } catch { /* fine if it never existed */ }
  }
});

function extractCookie(response) {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) return null;
  return setCookie.split(';')[0];
}

describe('server integration', () => {
  test('health check responds without auth', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    assert.equal(res.status, 200);
  });

  test('protected routes reject unauthenticated requests', async () => {
    const res = await fetch(`${BASE_URL}/api/quotes`);
    assert.equal(res.status, 401);
  });

  test('login with wrong password is rejected', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: 'not-the-password' }),
    });
    assert.equal(res.status, 401);
  });

  test('bootstrap admin can log in and reach protected routes', async () => {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    assert.equal(loginRes.status, 200);
    const cookie = extractCookie(loginRes);
    assert.ok(cookie, 'login should set a session cookie');

    const meRes = await fetch(`${BASE_URL}/api/auth/me`, { headers: { Cookie: cookie } });
    assert.equal(meRes.status, 200);
    const { user } = await meRes.json();
    assert.equal(user.email, ADMIN_EMAIL);
    assert.equal(user.role, 'admin');
  });

  test('vehicles and accessories were seeded on first boot', async () => {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    const cookie = extractCookie(loginRes);

    const vehiclesRes = await fetch(`${BASE_URL}/api/vehicles`, { headers: { Cookie: cookie } });
    const vehicles = await vehiclesRes.json();
    assert.equal(vehicles.length, 6);

    const accessoriesRes = await fetch(`${BASE_URL}/api/accessories`, { headers: { Cookie: cookie } });
    const accessories = await accessoriesRes.json();
    assert.equal(accessories.length, 12);
  });

  test('creating a quote produces correct VAT-inclusive/exclusive totals end-to-end', async () => {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    const cookie = extractCookie(loginRes);

    const vehiclesRes = await fetch(`${BASE_URL}/api/vehicles`, { headers: { Cookie: cookie } });
    const vehicles = await vehiclesRes.json();
    const e5pro = vehicles.find((v) => v.id === 'geely-e5-pro');
    assert.ok(e5pro, 'geely-e5-pro should exist in the seed data');

    const quoteRes = await fetch(`${BASE_URL}/api/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        customerName: 'Integration Test Klant',
        selectedVehicleId: 'geely-e5-pro',
        configuration: { vehicleName: e5pro.name, vehicleModel: e5pro.model },
        accessories: [],
        discountPercentage: 0,
      }),
    });
    assert.equal(quoteRes.status, 201);
    const quote = await quoteRes.json();

    assert.equal(quote.totalPrice, e5pro.basePrice, 'incl-VAT total should equal the adviesprijs with no discount/accessories');
    assert.ok(quote.subtotal < quote.totalPrice, 'excl-VAT subtotal should be lower than the incl-VAT total');
    assert.equal(Math.round((quote.subtotal + quote.vatAmount) * 100) / 100, quote.totalPrice);
    assert.equal(quote.createdByName, 'Integration Admin');

    // Clean up the quote we just created
    const deleteRes = await fetch(`${BASE_URL}/api/quotes/${quote.id}`, { method: 'DELETE', headers: { Cookie: cookie } });
    assert.equal(deleteRes.status, 204);
  });

  test('a sales-role user is blocked from admin-only routes', async () => {
    const adminLogin = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    const adminCookie = extractCookie(adminLogin);

    const createRes = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ name: 'Sales Tester', email: 'sales-tester@geely.local', password: 'SalesTester123!', role: 'sales' }),
    });
    assert.equal(createRes.status, 201);

    const salesLogin = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'sales-tester@geely.local', password: 'SalesTester123!' }),
    });
    const salesCookie = extractCookie(salesLogin);

    const blockedRes = await fetch(`${BASE_URL}/api/users`, { headers: { Cookie: salesCookie } });
    assert.equal(blockedRes.status, 403);
  });
});
