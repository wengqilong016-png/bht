import path from 'node:path';

import { type Page, expect, test } from '@playwright/test';

const proofImagePath = path.join(process.cwd(), 'public', 'icons', 'icon-512.png');

async function acceptEstimatedGpsPromptIfPresent(page: Page) {
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible({ timeout: 15000 }).catch(() => false)) {
    const continueButton = dialog.getByRole('button', { name: /Continue|继续/ });
    await continueButton.evaluate((button: HTMLButtonElement) => button.click());
  }
}

test.describe('Driver collection flow', () => {
  test('driver completes the mobile collection happy path with proof upload', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-android', 'Driver real-usage flow is scoped to the mobile Android project.');

    const authUser = {
      id: 'auth-driver-1',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'driver@example.com',
      email_confirmed_at: '2026-04-09T00:00:00.000Z',
      phone: '',
      confirmation_sent_at: '2026-04-09T00:00:00.000Z',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      identities: [],
      created_at: '2026-04-09T00:00:00.000Z',
      updated_at: '2026-04-09T00:00:00.000Z',
      is_anonymous: false,
    };

    const driverRow = {
      id: 'auth-driver-1',
      name: 'Driver One',
      username: 'driver',
      phone: '0711000000',
      initialDebt: 0,
      remainingDebt: 0,
      dailyFloatingCoins: 1000,
      vehicleInfo: { model: 'Bajaj', plate: 'T123' },
      currentGps: null,
      lastActive: '2026-04-10T07:30:00.000Z',
      status: 'active',
      baseSalary: 300000,
      commissionRate: 0.05,
    };

    const locationRow = {
      id: 'loc-1',
      name: 'Bahati Shop',
      machineId: 'M-100',
      lastScore: 1000,
      area: 'Kariakoo',
      assignedDriverId: 'auth-driver-1',
      ownerName: 'Owner One',
      shopOwnerPhone: '0711222333',
      ownerPhotoUrl: null,
      machinePhotoUrl: null,
      initialStartupDebt: 0,
      remainingStartupDebt: 0,
      isNewOffice: false,
      coords: { lat: -6.8, lng: 39.2 },
      status: 'active',
      lastRevenueDate: '2026-04-09',
      commissionRate: 0.15,
      resetLocked: false,
      dividendBalance: 0,
      createdAt: '2026-04-09T00:00:00.000Z',
      last_relocated_at: null,
    };

    const transactionRow = {
      id: 'tx-driver-1',
      timestamp: '2026-04-10T10:15:00.000Z',
      uploadTimestamp: '2026-04-10T10:15:00.000Z',
      locationId: 'loc-1',
      locationName: 'Bahati Shop',
      driverId: 'auth-driver-1',
      driverName: 'Driver One',
      previousScore: 1000,
      currentScore: 1200,
      revenue: 40000,
      commission: 6000,
      ownerRetention: 6000,
      debtDeduction: 0,
      startupDebtDeduction: 0,
      expenses: 0,
      coinExchange: 0,
      extraIncome: 0,
      netPayable: 34000,
      gps: { lat: -6.8, lng: 39.2 },
      gpsDeviation: null,
      photoUrl: 'https://example.test/evidence/tx-driver-1.jpg',
      dataUsageKB: 128,
      aiScore: null,
      isAnomaly: false,
      notes: null,
      isClearance: false,
      isSynced: true,
      reportedStatus: 'active',
      paymentStatus: 'pending',
      type: 'collection',
      approvalStatus: 'approved',
      expenseType: 'public',
      expenseCategory: 'tip',
      expenseStatus: null,
      expenseDescription: null,
      payoutAmount: null,
    };

    await page.addInitScript(() => {
      const seedKeyval = (key: string, value: unknown) =>
        new Promise<void>((resolve, reject) => {
          const openRequest = indexedDB.open('keyval-store');
          openRequest.onupgradeneeded = () => {
            if (!openRequest.result.objectStoreNames.contains('keyval')) {
              openRequest.result.createObjectStore('keyval');
            }
          };
          openRequest.onerror = () => reject(openRequest.error);
          openRequest.onsuccess = () => {
            const db = openRequest.result;
            const tx = db.transaction('keyval', 'readwrite');
            tx.objectStore('keyval').put(value, key);
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
          };
        });

      void Promise.all([
        seedKeyval('kiosk_drivers_data_v3', [
          {
            id: 'auth-driver-1',
            name: 'Driver One',
            username: 'driver',
            phone: '0711000000',
            initialDebt: 0,
            remainingDebt: 0,
            dailyFloatingCoins: 1000,
            vehicleInfo: { model: 'Bajaj', plate: 'T123' },
            currentGps: null,
            lastActive: '2026-04-10T07:30:00.000Z',
            status: 'active',
            baseSalary: 300000,
            commissionRate: 0.05,
          },
        ]),
        seedKeyval('kiosk_locations_data', [
          {
            id: 'loc-1',
            name: 'Bahati Shop',
            machineId: 'M-100',
            lastScore: 1000,
            area: 'Kariakoo',
            assignedDriverId: 'auth-driver-1',
            ownerName: 'Owner One',
            shopOwnerPhone: '0711222333',
            ownerPhotoUrl: null,
            machinePhotoUrl: null,
            initialStartupDebt: 0,
            remainingStartupDebt: 0,
            isNewOffice: false,
            coords: { lat: -6.8, lng: 39.2 },
            status: 'active',
            lastRevenueDate: '2026-04-09',
            commissionRate: 0.15,
            resetLocked: false,
            dividendBalance: 0,
            createdAt: '2026-04-09T00:00:00.000Z',
            last_relocated_at: null,
          },
        ]),
      ]).catch((error) => console.error('IndexedDB seed failed', error));

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

    const corsHeaders = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': '*',
      'access-control-expose-headers': 'content-range',
    };

    await page.context().route('**', async (route) => {
      const request = route.request();
      const url = request.url();
      const method = request.method().toUpperCase();

      if (!url.startsWith('http://localhost:54321/')) {
        await route.continue();
        return;
      }

      if (method === 'OPTIONS') {
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          body: '',
        });
        return;
      }

      if (url.includes('/auth/v1/health')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: corsHeaders,
          body: JSON.stringify({ healthy: true }),
        });
        return;
      }

      if (url.includes('/auth/v1/token')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: corsHeaders,
          body: JSON.stringify({
            access_token: 'mock-access-token',
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: 1_900_000_000,
            refresh_token: 'mock-refresh-token',
            user: authUser,
          }),
        });
        return;
      }

      if (url.includes('/auth/v1/user')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: corsHeaders,
          body: JSON.stringify(authUser),
        });
        return;
      }

      if (url.includes('/rest/v1/profiles')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { ...corsHeaders, 'content-range': '0-0/1' },
          body: JSON.stringify({
            role: 'driver',
            display_name: 'Driver One',
            driver_id: 'auth-driver-1',
            must_change_password: false,
          }),
        });
        return;
      }

      if (url.includes('/rest/v1/drivers')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { ...corsHeaders, 'content-range': '0-0/1' },
          body: JSON.stringify([driverRow]),
        });
        return;
      }

      if (url.includes('/rest/v1/locations')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { ...corsHeaders, 'content-range': '0-0/1' },
          body: JSON.stringify([locationRow]),
        });
        return;
      }

      if (url.includes('/rest/v1/transactions')) {
        if (method === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: { ...corsHeaders, 'content-range': '0-0/0' },
            body: JSON.stringify([]),
          });
          return;
        }

        await route.fulfill({ status: 200, contentType: 'application/json', headers: corsHeaders, body: '' });
        return;
      }

      if (url.includes('/rest/v1/daily_settlements')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { ...corsHeaders, 'content-range': '0-0/0' },
          body: JSON.stringify([]),
        });
        return;
      }

      if (url.includes('/storage/v1/object/')) {
        if (method === 'POST') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: corsHeaders,
            body: JSON.stringify({ Key: 'collection/tx-driver-1.jpg' }),
          });
          return;
        }

        if (method === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: corsHeaders,
            body: JSON.stringify({ publicUrl: 'https://example.test/evidence/tx-driver-1.jpg' }),
          });
          return;
        }
      }

      if (url.includes('/rest/v1/rpc/submit_collection_v2')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: corsHeaders,
          body: JSON.stringify(transactionRow),
        });
        return;
      }
    });

    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#email-input')).toBeVisible();

    await page.locator('#email-input').fill('driver@example.com');
    await page.locator('#password-input').fill('correct-password');
    await page.locator('button[type="submit"]').click();

    await expect(page.getByTestId('authenticated-app-shell')).toBeVisible();
    await expect(page.getByTestId('driver-app-shell')).toBeVisible();
    await expect(page.getByTestId('driver-machine-select-loc-1')).toBeVisible({ timeout: 15000 });

    await page.getByTestId('driver-machine-select-loc-1').click();
    await expect(page.getByTestId('driver-flow-step-capture')).toBeVisible();

    await page.getByTestId('driver-current-score-input').fill('1200');
    await page.getByTestId('driver-photo-input').setInputFiles(proofImagePath);
    await page.getByTestId('driver-capture-next').click();

    await expect(page.getByTestId('driver-flow-step-amounts')).toBeVisible();
    await page.getByTestId('driver-finance-next').click();

    await expect(page.getByTestId('driver-flow-step-confirm')).toBeVisible();
    await page.getByTestId('driver-submit-button').click();
    await acceptEstimatedGpsPromptIfPresent(page);

    const completion = page.getByTestId('driver-submit-complete');
    await expect(completion).toBeVisible({ timeout: 15000 });
    await expect(completion.getByText('Bahati Shop', { exact: true })).toBeVisible();
    await expect(completion.getByText('Saved online', { exact: true })).toBeVisible();

    await page.getByTestId('driver-return-home').click();
    await expect(page.getByTestId('driver-machine-select-loc-1')).toBeVisible({ timeout: 15000 });

    const criticalErrors = consoleErrors.filter(
      (entry) => !entry.includes('Failed to fetch') && !entry.includes('ERR_CONNECTION_REFUSED'),
    );
    expect(criticalErrors).toEqual([]);
  });
});
