import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8080';

// These tests run against the backend in auth.mode=mock.
// The real OIDC login flow (redirect to Keycloak) is exercised via Keycloak's own test suite
// and Quarkus OIDC integration tests — not replicable as a plain API call.

test.describe('Auth API – mock mode', () => {

  test('GET /api/auth/me returns mock-alice identity', async ({ request }) => {
    const res = await request.get(`${BASE}/api/auth/me`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.username).toBe('mock-alice');
    expect(body.roles).toContain('editor');
    expect(body.roles).toContain('viewer');
  });

  test('POST /api/auth/logout returns 200', async ({ request }) => {
    const res = await request.post(`${BASE}/api/auth/logout`);
    expect(res.status()).toBe(200);
  });
});
