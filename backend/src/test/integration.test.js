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
    // 6 real trims (3x E5, 3x Starray EM-i) + the "coming soon" Geely E2 placeholder
    // (seedGeelyE2IfMissing in database/init.js).
    assert.equal(vehicles.length, 7);

    const accessoriesRes = await fetch(`${BASE_URL}/api/accessories`, { headers: { Cookie: cookie } });
    const accessories = await accessoriesRes.json();
    // 12 from STANDARD_ACCESSORIES (paint colors + upholstery for both models) + 2
    // mandatory delivery packs (one per model) + 1 towing hook + 2 charging cables + 1
    // free standard white paint color (all models) — all seeded independently of
    // STANDARD_ACCESSORIES, see database/init.js.
    assert.equal(accessories.length, 18);
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

    // The mandatory Delivery Pack (€949 incl. BTW) is injected server-side regardless of
    // what's submitted (see resolveMandatoryAccessories in routes/quotes.js) — so even an
    // empty accessories list still adds it on top of the bare adviesprijs.
    const DELIVERY_PACK_PRICE_INCL_VAT = 949.00;
    assert.equal(quote.totalPrice, e5pro.basePrice + DELIVERY_PACK_PRICE_INCL_VAT, 'incl-VAT total should equal the adviesprijs plus the mandatory delivery pack, with no discount/other accessories');
    assert.ok(quote.subtotal < quote.totalPrice, 'excl-VAT subtotal should be lower than the incl-VAT total');
    assert.equal(Math.round((quote.subtotal + quote.vatAmount) * 100) / 100, quote.totalPrice);
    assert.equal(quote.createdByName, 'Integration Admin');

    // Clean up the quote we just created
    const deleteRes = await fetch(`${BASE_URL}/api/quotes/${quote.id}`, { method: 'DELETE', headers: { Cookie: cookie } });
    assert.equal(deleteRes.status, 204);
  });

  test('a same-named mandatory fee scoped to "all models" does not double up with the model-specific one', async () => {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    const cookie = extractCookie(loginRes);

    // Simulate the drift that caused the recurring "Delivery Pack twice on the Starray"
    // bug: a second mandatory "Delivery Pack" row scoped to every model (empty
    // vehicleModels), alongside the seeded model-specific delivery-pack-emi.
    const accRes = await fetch(`${BASE_URL}/api/accessories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'Delivery Pack', price: 949, category: 'verplicht', vehicleModels: [], mandatory: true, discountable: false }),
    });
    assert.equal(accRes.status, 201);
    const rogueAccessory = await accRes.json();

    const vehiclesRes = await fetch(`${BASE_URL}/api/vehicles`, { headers: { Cookie: cookie } });
    const starray = (await vehiclesRes.json()).find((v) => v.name === 'Starray EM-i');
    assert.ok(starray, 'a Starray EM-i trim should exist in the seed data');

    const quoteRes = await fetch(`${BASE_URL}/api/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        customerName: 'Starray Dup Test',
        selectedVehicleId: starray.id,
        configuration: { vehicleName: starray.name, vehicleModel: starray.model },
        accessories: [],
        discountPercentage: 0,
      }),
    });
    assert.equal(quoteRes.status, 201);
    const quote = await quoteRes.json();

    // Exactly one €949 Delivery Pack, not two.
    const deliveryLines = quote.items.filter((i) => i.name === 'Delivery Pack');
    assert.equal(deliveryLines.length, 1, 'the Delivery Pack must appear exactly once');
    assert.equal(quote.totalPrice, starray.basePrice + 949, 'total should include the delivery pack exactly once');

    await fetch(`${BASE_URL}/api/quotes/${quote.id}`, { method: 'DELETE', headers: { Cookie: cookie } });
    await fetch(`${BASE_URL}/api/accessories/${rogueAccessory.id}`, { method: 'DELETE', headers: { Cookie: cookie } });
  });

  test('an option scoped to specific trims is only accepted on those trims', async () => {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    const cookie = extractCookie(loginRes);

    const vehicles = await (await fetch(`${BASE_URL}/api/vehicles`, { headers: { Cookie: cookie } })).json();
    const maxPlus = vehicles.find((v) => v.name === 'Starray EM-i' && v.model === 'MAX+');
    const pro = vehicles.find((v) => v.name === 'Starray EM-i' && v.model === 'PRO');
    assert.ok(maxPlus && pro, 'Starray EM-i MAX+ and PRO trims should exist');

    // An interior colour offered only on the MAX+ trim.
    const accRes = await fetch(`${BASE_URL}/api/accessories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'Bekleding: Nappa Zwart', price: 1200, category: 'interior', vehicleModels: [], vehicleTrims: [maxPlus.id] }),
    });
    assert.equal(accRes.status, 201);
    const trimOption = await accRes.json();
    assert.deepEqual(trimOption.vehicleTrims, [maxPlus.id], 'the API should echo back vehicleTrims');

    // Rejected on the PRO trim...
    const badQuote = await fetch(`${BASE_URL}/api/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        customerName: 'Trim Scope Test', customerEmail: 'x@y.be', customerPhone: '0470', customerStreet: 'S1', customerPostalCode: '8800', customerCity: 'R',
        selectedVehicleId: pro.id,
        configuration: { vehicleName: pro.name, vehicleModel: pro.model },
        accessories: [{ id: trimOption.id }],
      }),
    });
    assert.equal(badQuote.status, 400, 'a trim-scoped option must be rejected on a trim it is not scoped to');

    // ...accepted on the MAX+ trim, and priced in.
    const goodQuote = await fetch(`${BASE_URL}/api/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        customerName: 'Trim Scope Test', customerEmail: 'x@y.be', customerPhone: '0470', customerStreet: 'S1', customerPostalCode: '8800', customerCity: 'R',
        selectedVehicleId: maxPlus.id,
        configuration: { vehicleName: maxPlus.name, vehicleModel: maxPlus.model },
        accessories: [{ id: trimOption.id }],
      }),
    });
    assert.equal(goodQuote.status, 201);
    const created = await goodQuote.json();
    assert.ok(created.items.some((i) => i.name === 'Bekleding: Nappa Zwart'), 'the trim-scoped option should be on the MAX+ quote');

    await fetch(`${BASE_URL}/api/quotes/${created.id}`, { method: 'DELETE', headers: { Cookie: cookie } });
    await fetch(`${BASE_URL}/api/accessories/${trimOption.id}`, { method: 'DELETE', headers: { Cookie: cookie } });
  });

  test('a showroom offer carries no customer or offer number and is blocked from customer flows', async () => {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    const cookie = extractCookie(loginRes);

    // No customerName sent at all — a normal quote would 400 here.
    const createRes = await fetch(`${BASE_URL}/api/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        isShowroom: true,
        selectedVehicleId: 'geely-e5-pro',
        configuration: { vehicleName: 'Geely E5', vehicleModel: 'PRO' },
        accessories: [],
      }),
    });
    assert.equal(createRes.status, 201);
    const showroom = await createRes.json();
    assert.equal(showroom.isShowroom, 1);
    assert.equal(showroom.sequenceNumber, null, 'a showroom offer gets no offer number');
    assert.equal(showroom.customerEmail, null);

    // It shows in the list (created just now, well within the 2h window)...
    const listRes = await fetch(`${BASE_URL}/api/quotes?limit=100`, { headers: { Cookie: cookie } });
    const list = await listRes.json();
    assert.ok(list.quotes.some((q) => q.id === showroom.id), 'showroom offer should be in the list within 2h');

    // ...but can't be mailed, duplicated, or edited.
    const mailRes = await fetch(`${BASE_URL}/api/quotes/${showroom.id}/send-email`, { method: 'POST', headers: { Cookie: cookie } });
    assert.equal(mailRes.status, 400);
    const dupRes = await fetch(`${BASE_URL}/api/quotes/${showroom.id}/duplicate`, { method: 'POST', headers: { Cookie: cookie } });
    assert.equal(dupRes.status, 400);
    const editRes = await fetch(`${BASE_URL}/api/quotes/${showroom.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ notes: 'x' }),
    });
    assert.equal(editRes.status, 400);

    // It is left out of the CSV export entirely.
    const csvRes = await fetch(`${BASE_URL}/api/quotes/export.csv`, { headers: { Cookie: cookie } });
    const csv = await csvRes.text();
    assert.ok(!csv.includes('Showroom'), 'showroom offer should not appear in the CSV export');

    const deleteRes = await fetch(`${BASE_URL}/api/quotes/${showroom.id}`, { method: 'DELETE', headers: { Cookie: cookie } });
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
      body: JSON.stringify({ name: 'Sales Tester', email: 'sales-tester@geely.local', phone: '0470000000', password: 'SalesTester123!', role: 'sales' }),
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
