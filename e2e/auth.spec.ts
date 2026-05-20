import { test, expect, APIRequestContext } from '@playwright/test';

const BASE = 'http://localhost:8080';

test.describe('Auth API – mock mode', () => {

  test('POST /api/auth/login returns 200, sets httpOnly cookies, returns mock-alice', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/login`, {
      data: { username: 'alice', password: 'alice' },
    });

    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.username).toBe('mock-alice');
    expect(body.roles).toContain('editor');
    expect(body.roles).toContain('viewer');

    // httpOnly cookies are visible in API context headers
    const setCookie = res.headers()['set-cookie'] ?? '';
    expect(setCookie).toContain('access_token=');
    expect(setCookie).toContain('refresh_token=');
    expect(setCookie).toMatch(/HTTPOnly/i);
  });

  test('POST /api/auth/login accepts any credentials in mock mode', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/login`, {
      data: { username: 'nobody', password: 'wrong' },
    });
    expect(res.status()).toBe(200);
  });

  test('GET /api/auth/me returns 200 as mock-alice even without cookies', async ({ request }) => {
    // In mock mode MockAuthMechanism always injects mock-alice — no cookie required.
    const res = await request.get(`${BASE}/api/auth/me`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.username).toBe('mock-alice');
  });

  test('full session: login → me → logout clears cookies', async ({ request }) => {
    // Login sets cookies and returns mock identity
    const loginRes = await request.post(`${BASE}/api/auth/login`, {
      data: { username: 'alice', password: 'alice' },
    });
    expect(loginRes.status()).toBe(200);

    // me returns mock-alice identity
    const meRes = await request.get(`${BASE}/api/auth/me`);
    expect(meRes.status()).toBe(200);
    const me = await meRes.json();
    expect(me.username).toBe('mock-alice');
    expect(me.roles).toContain('editor');

    // Logout zeros out the cookies (Max-Age=0)
    const logoutRes = await request.post(`${BASE}/api/auth/logout`);
    expect(logoutRes.status()).toBe(200);
    const logoutCookies = logoutRes.headers()['set-cookie'] ?? '';
    expect(logoutCookies).toContain('Max-Age=0');
  });

  test('POST /api/auth/logout returns 200 even without login', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/logout`);
    expect(res.status()).toBe(200);
  });
});

test.describe('Cookie security attributes', () => {
  test('access_token cookie is HttpOnly, Path=/api, SameSite=Lax', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/login`, {
      data: { username: 'alice', password: 'alice' },
    });

    const raw = res.headers()['set-cookie'] ?? '';
    // Playwright returns multiple set-cookie as newline-joined string
    const cookies = raw.split('\n').filter(c => c.includes('access_token='));
    expect(cookies.length).toBeGreaterThan(0);

    const at = cookies[0];
    expect(at).toMatch(/HTTPOnly/i);
    expect(at).toContain('Path=/api');
    expect(at).toMatch(/SameSite=Lax/i);
  });
});
