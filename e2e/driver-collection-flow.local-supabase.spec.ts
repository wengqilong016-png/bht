import path from 'node:path';

import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

const requiredEnv = {
  supabaseUrl: process.env.PW_SUPABASE_URL,
  anonKey: process.env.PW_SUPABASE_ANON_KEY,
  serviceRoleKey: process.env.PW_LOCAL_SUPABASE_SERVICE_ROLE_KEY,
  driverEmail: process.env.PW_LOCAL_DRIVER_EMAIL,
  driverPassword: process.env.PW_LOCAL_DRIVER_PASSWORD,
};

const driverId = process.env.PW_LOCAL_DRIVER_ID ?? 'pw-driver-1';
const locationId = process.env.PW_LOCAL_LOCATION_ID ?? '11111111-1111-4111-8111-111111111111';
const proofImagePath = path.join(process.cwd(), 'public', 'icons', 'icon-512.png');
const profilesTable = 'profiles';

function hasRequiredEnv() {
  return Object.values(requiredEnv).every(Boolean);
}

function createAdminClient() {
  return createClient(
    requiredEnv.supabaseUrl!,
    requiredEnv.serviceRoleKey!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function ensureLocalSupabaseAvailable(url: string, anonKey: string) {
  const response = await fetch(`${url}/auth/v1/health`, {
    headers: { apikey: anonKey },
  });
  if (!response.ok) {
    throw new Error(`Local Supabase health check failed with ${response.status}`);
  }
}

async function ensureDriverFixture() {
  const admin = createAdminClient();

  const usersResult = await admin.auth.admin.listUsers();
  if (usersResult.error) {
    throw new Error(`Failed to list local Supabase users: ${usersResult.error.message}`);
  }

  const existingUser = usersResult.data.users.find((user) => user.email === requiredEnv.driverEmail);
  const authUser = existingUser
    ? await (async () => {
        const updateResult = await admin.auth.admin.updateUserById(existingUser.id, {
          password: requiredEnv.driverPassword!,
          email_confirm: true,
        });
        if (updateResult.error) {
          throw new Error(`Failed to update local driver user: ${updateResult.error.message}`);
        }
        return updateResult.data.user;
      })()
    : await (async () => {
        const createResult = await admin.auth.admin.createUser({
          email: requiredEnv.driverEmail!,
          password: requiredEnv.driverPassword!,
          email_confirm: true,
        });
        if (createResult.error || !createResult.data.user) {
          throw new Error(`Failed to create local driver user: ${createResult.error?.message ?? 'missing user'}`);
        }
        return createResult.data.user;
      })();

  const { error: driverError } = await admin.from('drivers').upsert({
    id: driverId,
    name: 'Playwright Driver',
    username: 'pw-driver',
    phone: '0711000000',
    status: 'active',
    baseSalary: 300000,
    commissionRate: 0.05,
    initialDebt: 0,
    remainingDebt: 0,
    dailyFloatingCoins: 1000,
    vehicleInfo: { model: 'Bajaj', plate: 'PW-001' },
  });
  if (driverError) {
    throw new Error(`Failed to seed local driver row: ${driverError.message}`);
  }

  const { error: profileError } = await admin.from(profilesTable).upsert({
    auth_user_id: authUser.id,
    role: 'driver',
    display_name: 'Playwright Driver',
    driver_id: driverId,
    must_change_password: false,
  });
  if (profileError) {
    throw new Error(`Failed to seed local profile row: ${profileError.message}`);
  }

  const { error: locationError } = await admin.from('locations').upsert({
    id: locationId,
    name: 'Playwright Test Shop',
    area: 'Kariakoo',
    machineId: 'PW-M-100',
    commissionRate: 0.15,
    lastScore: 1000,
    status: 'active',
    coords: { lat: -6.8, lng: 39.2 },
    assignedDriverId: driverId,
    ownerName: 'Owner One',
    shopOwnerPhone: '0711222333',
    initialStartupDebt: 0,
    remainingStartupDebt: 0,
    isNewOffice: false,
    lastRevenueDate: '2026-04-09',
    resetLocked: false,
    dividendBalance: 0,
  });
  if (locationError) {
    throw new Error(`Failed to seed local location row: ${locationError.message}`);
  }
}

async function cleanupDriverCollectionsForToday() {
  const admin = createAdminClient();

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { error } = await admin
    .from('transactions')
    .delete()
    .eq('driverId', driverId)
    .eq('locationId', locationId)
    .eq('type', 'collection')
    .gte('timestamp', todayStart.toISOString());

  if (error) {
    throw new Error(`Failed to clean local driver transactions: ${error.message}`);
  }
}

async function fetchLatestDriverCollection() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('transactions')
    .select('id, locationId, driverId, currentScore, netPayable, approvalStatus, paymentStatus, type, isSynced, timestamp')
    .eq('driverId', driverId)
    .eq('locationId', locationId)
    .eq('type', 'collection')
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch latest driver collection: ${error.message}`);
  }

  if (!data) {
    throw new Error('Expected a saved collection transaction but none was found.');
  }

  return data;
}

async function fetchSeededLocation() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('locations')
    .select('id, lastScore, assignedDriverId')
    .eq('id', locationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch seeded location: ${error.message}`);
  }

  if (!data) {
    throw new Error('Expected the seeded location to exist but it was missing.');
  }

  return data;
}

async function readPendingOfflineCollections(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const DB_NAME = 'bahati_offline_db';
    const STORE_NAME = 'pending_transactions';

    const openDb = () =>
      new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });

    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    const rows = await new Promise<any[]>((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as any[]);
    });

    db.close();
    return rows.filter((row) => row?.isSynced === false && row?.type === 'collection');
  });
}

async function emulateWeakBrowserNetwork(page: import('@playwright/test').Page) {
  const session = await page.context().newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 1800,
    downloadThroughput: 12 * 1024,
    uploadThroughput: 12 * 1024,
    connectionType: 'cellular2g',
  });
  return session;
}

async function clearBrowserNetworkEmulation(
  session: Awaited<ReturnType<import('@playwright/test').BrowserContext['newCDPSession']>>,
) {
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: 10 * 1024 * 1024,
    uploadThroughput: 10 * 1024 * 1024,
    connectionType: 'wifi',
  }).catch(() => {});
  await session.send('Network.disable').catch(() => {});
}

test.describe('Driver collection flow with local Supabase', () => {
  test.describe.configure({ mode: 'serial' });

  test('driver logs in against local Supabase and completes the collection happy path', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-android', 'This validation is scoped to the mobile Android project.');
    test.skip(
      !hasRequiredEnv(),
      'Set PW_SUPABASE_URL, PW_SUPABASE_ANON_KEY, PW_LOCAL_SUPABASE_SERVICE_ROLE_KEY, PW_LOCAL_DRIVER_EMAIL, and PW_LOCAL_DRIVER_PASSWORD to run the local Supabase validation.',
    );

    await ensureLocalSupabaseAvailable(requiredEnv.supabaseUrl!, requiredEnv.anonKey!);
    await ensureDriverFixture();
    await cleanupDriverCollectionsForToday();

    await context.grantPermissions(['geolocation'], { origin: 'http://localhost:3000' });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition(success: PositionCallback) {
            success({
              coords: {
                latitude: -6.8,
                longitude: 39.2,
                accuracy: 20,
                altitude: null,
                altitudeAccuracy: null,
                heading: null,
                speed: null,
                toJSON: () => ({}),
              },
              timestamp: Date.now(),
              toJSON: () => ({}),
            } as GeolocationPosition);
          },
          watchPosition(success: PositionCallback) {
            success({
              coords: {
                latitude: -6.8,
                longitude: 39.2,
                accuracy: 20,
                altitude: null,
                altitudeAccuracy: null,
                heading: null,
                speed: null,
                toJSON: () => ({}),
              },
              timestamp: Date.now(),
              toJSON: () => ({}),
            } as GeolocationPosition);
            return 1;
          },
          clearWatch() {},
        },
      });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#email-input')).toBeVisible();

    await page.locator('#email-input').fill(requiredEnv.driverEmail!);
    await page.locator('#password-input').fill(requiredEnv.driverPassword!);
    await page.locator('button[type="submit"]').click();

    await expect(page.getByTestId('authenticated-app-shell')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('driver-app-shell')).toBeVisible();
    await expect(page.getByTestId(`driver-machine-select-${locationId}`)).toBeVisible({ timeout: 15000 });

    await page.getByTestId(`driver-machine-select-${locationId}`).click();
    await expect(page.getByTestId('driver-flow-step-capture')).toBeVisible();

    await page.getByTestId('driver-current-score-input').fill('1200');
    await page.getByTestId('driver-photo-input').setInputFiles(proofImagePath);
    await page.getByTestId('driver-capture-next').click();

    await expect(page.getByTestId('driver-flow-step-amounts')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('driver-finance-next').click();

    await expect(page.getByTestId('driver-flow-step-confirm')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('driver-submit-button').click();

    const completion = page.getByTestId('driver-submit-complete');
    await expect(completion).toBeVisible({ timeout: 15000 });
    await expect(completion.getByText('Playwright Test Shop', { exact: true })).toBeVisible();
    await expect(page.getByTestId('driver-return-home')).toBeVisible();

    const savedTransaction = await fetchLatestDriverCollection();
    expect(savedTransaction.driverId).toBe(driverId);
    expect(savedTransaction.locationId).toBe(locationId);
    expect(savedTransaction.currentScore).toBe(1200);
    expect(savedTransaction.netPayable).toBeGreaterThan(0);
    expect(savedTransaction.type).toBe('collection');
    expect(savedTransaction.approvalStatus).toBe('approved');
    expect(savedTransaction.paymentStatus).toBe('pending');
    expect(savedTransaction.isSynced).toBe(true);

    const savedLocation = await fetchSeededLocation();
    expect(savedLocation.assignedDriverId).toBe(driverId);
    expect(savedLocation.lastScore).toBe(1200);

    await page.getByTestId('driver-return-home').click();
    await expect(page.getByTestId(`driver-machine-select-${locationId}`)).toBeVisible({ timeout: 15000 });
  });

  test('driver falls back to offline queue when weak network breaks submit_collection_v2', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-android', 'This validation is scoped to the mobile Android project.');
    test.skip(
      !hasRequiredEnv(),
      'Set PW_SUPABASE_URL, PW_SUPABASE_ANON_KEY, PW_LOCAL_SUPABASE_SERVICE_ROLE_KEY, PW_LOCAL_DRIVER_EMAIL, and PW_LOCAL_DRIVER_PASSWORD to run the local Supabase validation.',
    );

    await ensureLocalSupabaseAvailable(requiredEnv.supabaseUrl!, requiredEnv.anonKey!);
    await ensureDriverFixture();
    await cleanupDriverCollectionsForToday();

    await context.grantPermissions(['geolocation'], { origin: 'http://localhost:3000' });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition(success: PositionCallback) {
            success({
              coords: {
                latitude: -6.8,
                longitude: 39.2,
                accuracy: 20,
                altitude: null,
                altitudeAccuracy: null,
                heading: null,
                speed: null,
                toJSON: () => ({}),
              },
              timestamp: Date.now(),
              toJSON: () => ({}),
            } as GeolocationPosition);
          },
          watchPosition(success: PositionCallback) {
            success({
              coords: {
                latitude: -6.8,
                longitude: 39.2,
                accuracy: 20,
                altitude: null,
                altitudeAccuracy: null,
                heading: null,
                speed: null,
                toJSON: () => ({}),
              },
              timestamp: Date.now(),
              toJSON: () => ({}),
            } as GeolocationPosition);
            return 1;
          },
          clearWatch() {},
        },
      });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#email-input')).toBeVisible();

    await page.locator('#email-input').fill(requiredEnv.driverEmail!);
    await page.locator('#password-input').fill(requiredEnv.driverPassword!);
    await page.locator('button[type="submit"]').click();

    await expect(page.getByTestId('authenticated-app-shell')).toBeVisible();
    await expect(page.getByTestId(`driver-machine-select-${locationId}`)).toBeVisible({ timeout: 15000 });

    await context.route(`${requiredEnv.supabaseUrl}/rest/v1/rpc/submit_collection_v2`, async (route) => {
      await route.abort('failed');
    });

    await page.getByTestId(`driver-machine-select-${locationId}`).click();
    await expect(page.getByTestId('driver-flow-step-capture')).toBeVisible();

    await page.getByTestId('driver-current-score-input').fill('1200');
    await page.getByTestId('driver-photo-input').setInputFiles(proofImagePath);
    await page.getByTestId('driver-capture-next').click();

    await expect(page.getByTestId('driver-flow-step-amounts')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('driver-finance-next').click();

    await expect(page.getByTestId('driver-flow-step-confirm')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('driver-submit-button').click();

    const completion = page.getByTestId('driver-submit-complete');
    await expect(completion).toBeVisible({ timeout: 15000 });
    await expect(completion.getByText('Pending sync', { exact: true })).toBeVisible();
    await expect(completion.getByText('Added to the offline sync queue.', { exact: true })).toBeVisible();

    const pendingRows = await readPendingOfflineCollections(page);
    const queuedCollection = pendingRows.find((row) => row.locationId === locationId && row.driverId === driverId);
    expect(queuedCollection).toBeTruthy();
    expect(queuedCollection.currentScore).toBe(1200);
    expect(queuedCollection.isSynced).toBe(false);

    await expect.poll(async () => {
      const rows = await readPendingOfflineCollections(page);
      const queued = rows.find((row) => row.locationId === locationId && row.driverId === driverId);
      if (queued?.lastError) {
        throw new Error(`Queued collection failed after recovery: ${JSON.stringify({
          lastError: queued.lastError,
          lastErrorCategory: queued.lastErrorCategory,
          retryCount: queued.retryCount,
          nextRetryAt: queued.nextRetryAt,
        })}`);
      }

      const admin = createAdminClient();
      const { data, error } = await admin
        .from('transactions')
        .select('id')
        .eq('driverId', driverId)
        .eq('locationId', locationId)
        .eq('type', 'collection')
        .limit(1);

      if (error) {
        throw new Error(`Failed to confirm remote fallback state: ${error.message}`);
      }

      return data?.length ?? 0;
    }).toBe(0);

    const savedLocation = await fetchSeededLocation();
    expect(savedLocation.lastScore).toBe(1000);
  });

  test('driver auto-syncs queued collection after browser network recovers from weak throttling', async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-android', 'This validation is scoped to the mobile Android project.');
    test.skip(
      !hasRequiredEnv(),
      'Set PW_SUPABASE_URL, PW_SUPABASE_ANON_KEY, PW_LOCAL_SUPABASE_SERVICE_ROLE_KEY, PW_LOCAL_DRIVER_EMAIL, and PW_LOCAL_DRIVER_PASSWORD to run the local Supabase validation.',
    );
    test.setTimeout(120_000);

    await ensureLocalSupabaseAvailable(requiredEnv.supabaseUrl!, requiredEnv.anonKey!);
    await ensureDriverFixture();
    await cleanupDriverCollectionsForToday();

    await context.grantPermissions(['geolocation'], { origin: 'http://localhost:3000' });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition(success: PositionCallback) {
            success({
              coords: {
                latitude: -6.8,
                longitude: 39.2,
                accuracy: 20,
                altitude: null,
                altitudeAccuracy: null,
                heading: null,
                speed: null,
                toJSON: () => ({}),
              },
              timestamp: Date.now(),
              toJSON: () => ({}),
            } as GeolocationPosition);
          },
          watchPosition(success: PositionCallback) {
            success({
              coords: {
                latitude: -6.8,
                longitude: 39.2,
                accuracy: 20,
                altitude: null,
                altitudeAccuracy: null,
                heading: null,
                speed: null,
                toJSON: () => ({}),
              },
              timestamp: Date.now(),
              toJSON: () => ({}),
            } as GeolocationPosition);
            return 1;
          },
          clearWatch() {},
        },
      });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#email-input')).toBeVisible();

    await page.locator('#email-input').fill(requiredEnv.driverEmail!);
    await page.locator('#password-input').fill(requiredEnv.driverPassword!);
    await page.locator('button[type="submit"]').click();

    await expect(page.getByTestId('authenticated-app-shell')).toBeVisible();
    await expect(page.getByTestId(`driver-machine-select-${locationId}`)).toBeVisible({ timeout: 15000 });

    await page.getByTestId(`driver-machine-select-${locationId}`).click();
    await expect(page.getByTestId('driver-flow-step-capture')).toBeVisible();

    await page.getByTestId('driver-current-score-input').fill('1200');
    await page.getByTestId('driver-photo-input').setInputFiles(proofImagePath);
    await page.getByTestId('driver-capture-next').click();

    await expect(page.getByTestId('driver-flow-step-amounts')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('driver-finance-next').click();

    await expect(page.getByTestId('driver-flow-step-confirm')).toBeVisible({ timeout: 15000 });

    const weakNetworkSession = await emulateWeakBrowserNetwork(page);
    await page.getByTestId('driver-submit-button').click();
    await page.waitForTimeout(250);
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));

    const completion = page.getByTestId('driver-submit-complete');
    await expect(completion).toBeVisible({ timeout: 15000 });
    await expect(completion.getByText('Pending sync', { exact: true })).toBeVisible();
    await expect(completion.getByText('Added to the offline sync queue.', { exact: true })).toBeVisible();

    const pendingRows = await readPendingOfflineCollections(page);
    const queuedCollection = pendingRows.find((row) => row.locationId === locationId && row.driverId === driverId);
    expect(queuedCollection).toBeTruthy();
    expect(queuedCollection.currentScore).toBe(1200);
    expect(queuedCollection.isSynced).toBe(false);

    await page.waitForTimeout(1000);

    await clearBrowserNetworkEmulation(weakNetworkSession);
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));

    await page.waitForTimeout(5000);
    const browserOnlineAfterRecovery = await page.evaluate(() => navigator.onLine);
    const rowsAfterRecovery = await readPendingOfflineCollections(page);
    const queuedAfterRecovery = rowsAfterRecovery.find((row) => row.locationId === locationId && row.driverId === driverId);
    if (!browserOnlineAfterRecovery) {
      throw new Error(`Browser still reports offline after recovery: ${JSON.stringify({
        queueLength: rowsAfterRecovery.length,
        queued: queuedAfterRecovery
          ? {
              lastError: queuedAfterRecovery.lastError,
              lastErrorCategory: queuedAfterRecovery.lastErrorCategory,
              retryCount: queuedAfterRecovery.retryCount,
              nextRetryAt: queuedAfterRecovery.nextRetryAt,
              isSynced: queuedAfterRecovery.isSynced,
            }
          : null,
      })}`);
    }
    if (queuedAfterRecovery?.lastError) {
      throw new Error(`Queued collection failed after recovery: ${JSON.stringify({
        lastError: queuedAfterRecovery.lastError,
        lastErrorCategory: queuedAfterRecovery.lastErrorCategory,
        retryCount: queuedAfterRecovery.retryCount,
        nextRetryAt: queuedAfterRecovery.nextRetryAt,
      })}`);
    }

    await expect.poll(async () => {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from('transactions')
        .select('id')
        .eq('driverId', driverId)
        .eq('locationId', locationId)
        .eq('type', 'collection')
        .limit(1);

      if (error) {
        throw new Error(`Failed to confirm synced recovery state: ${error.message}`);
      }

      return data?.length ?? 0;
    }, { timeout: 75_000 }).toBe(1);

    await expect.poll(async () => {
      const rows = await readPendingOfflineCollections(page);
      return rows.filter((row) => row.locationId === locationId && row.driverId === driverId).length;
    }, { timeout: 75_000 }).toBe(0);

    const savedTransaction = await fetchLatestDriverCollection();
    expect(savedTransaction.driverId).toBe(driverId);
    expect(savedTransaction.locationId).toBe(locationId);
    expect(savedTransaction.currentScore).toBe(1200);
    expect(savedTransaction.isSynced).toBe(true);

    const savedLocation = await fetchSeededLocation();
    expect(savedLocation.lastScore).toBe(1200);
  });
});
