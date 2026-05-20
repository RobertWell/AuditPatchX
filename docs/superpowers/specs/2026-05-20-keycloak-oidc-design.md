# Keycloak OIDC Integration Design

**Date:** 2026-05-20
**Branch:** `feat/keycloak-oidc-integration`
**Status:** Approved

## Goals

1. Protect all backend endpoints with Keycloak-issued JWT tokens.
2. Verify that token refresh is handled transparently (backend-side, not frontend-side) with a 60 s access token lifespan.
3. Enable frontend-independent dev mode — `npm run dev` works with no Keycloak running via `AUTH_MODE=mock`.

## Architecture Overview

```
Browser
  │
  ├─ POST /api/auth/login {username, password}
  │      └─ Backend: Keycloak password grant → set httpOnly cookies → return {username, roles}
  │
  ├─ GET/POST /api/* (cookies sent automatically by browser)
  │      └─ TokenRefreshFilter → validate/refresh access_token cookie → inject Bearer
  │             └─ quarkus-oidc validates Bearer → endpoint executes
  │
  └─ POST /api/auth/logout → clear cookies → 200
```

The frontend holds **zero token state**. Cookies are set and refreshed entirely by the backend. The frontend only handles: show login page on 401, show app otherwise.

## Section 1: Keycloak Realm Setup

**Script:** `scripts/keycloak-setup.sh` — idempotent, uses Keycloak Admin REST API against `https://keycloak.local.test`.

| Config | Value |
|---|---|
| Realm | `auditpatchx` |
| Access token lifespan | 60 seconds |
| Refresh token lifespan | 30 minutes |
| Client ID | `auditpatchx-app` |
| Client type | Confidential, Direct Access Grants enabled |
| Roles | `viewer`, `editor` |
| Test user: alice | password `alice`, role `editor` |
| Test user: bob | password `bob`, role `viewer` |

The script outputs the generated client secret. Secret is stored in `.env` — never hardcoded.

## Section 2: Backend

### New dependency

`quarkus-oidc` added to `pom.xml`. No other new dependencies.

### New files

**`src/main/kotlin/com/auditpatchx/auth/AuthResource.kt`**

- `POST /api/auth/login` — accepts `{username, password}` JSON, calls Keycloak password grant, sets `access_token` + `refresh_token` httpOnly cookies, returns `{username, roles}`.
- `GET /api/auth/me` — reads cookie, returns `{username, roles}` for session rehydration on page refresh.
- `POST /api/auth/logout` — clears both cookies, returns 200.

**`src/main/kotlin/com/auditpatchx/auth/TokenRefreshFilter.kt`**

A `@ServerRequestFilter` that runs before every request:

1. Skip `/api/auth/*` paths (login/logout/me are public).
2. Read `access_token` cookie — if missing → 401.
3. Decode JWT expiry locally (no network) — if expired and `refresh_token` cookie present → call Keycloak refresh grant → set new cookies → inject fresh Bearer into request headers.
4. If refresh also fails → clear cookies → 401.
5. `quarkus-oidc` validates the injected Bearer token.

### Existing endpoints

All existing endpoints annotated with `@Authenticated`. No logic changes.

### `application.yml` additions

```yaml
quarkus:
  oidc:
    auth-server-url: ${OIDC_AUTH_SERVER_URL}
    client-id: ${OIDC_CLIENT_ID}
    credentials:
      secret: ${OIDC_CLIENT_SECRET}
    application-type: service
    tls:
      verification: none   # self-signed cert on keycloak.local.test
```

### Mock mode (`AUTH_MODE=mock`)

- `/api/auth/login` returns a pre-built fake JWT cookie (static HMAC-signed, configurable `sub` and `roles`) — no Keycloak call.
- `TokenRefreshFilter` skips all validation and injects a static Bearer so `SecurityIdentity` is populated normally.
- Role checks work identically in mock and real modes.

### Error responses

| Condition | HTTP | Body |
|---|---|---|
| Bad credentials | 401 | `{error: "invalid-credentials"}` |
| Keycloak unreachable | 502 | `{error: "auth-service-unavailable"}` |
| Token expired, refresh failed | 401 | (cookies cleared) |

Raw Keycloak error messages are never forwarded to the client.

## Section 3: Frontend

### New files

- `src/components/LoginPage.tsx` — username + password form. Calls `POST /api/auth/login`. On success sets `isAuthenticated` in auth state.
- `src/hooks/useAuth.ts` — holds `{isAuthenticated, user: {username, roles}}`. On mount calls `GET /api/auth/me` to rehydrate session on page refresh. When `VITE_AUTH_MODE=mock`, skips the network call and sets `isAuthenticated=true` with a hardcoded mock user.

### Changed files

- `src/App.tsx` — wraps content: if not authenticated → `<LoginPage />`, else existing app. No other changes.
- `src/services/api.ts` — adds one Axios response interceptor: on 401, clears auth state and redirects to login. No token refresh logic.

### No new npm dependencies

No `keycloak-js` or JWT library.

## Section 4: Data Flow & Error Handling

### Happy path (60 s token cycle)

```
Login → access_token cookie (60s) + refresh_token cookie (30min)

[0–60s] API call → filter reads valid cookie → injects Bearer → proceeds

[60s+] API call → filter sees expired access_token
              → calls Keycloak refresh grant
              → sets new access_token cookie
              → proceeds (transparent to frontend)

[30min+] API call → refresh also expired → 401
              → frontend interceptor → shows LoginPage
```

### Dev mode switch

```
# Backend .env
AUTH_MODE=mock
OIDC_AUTH_SERVER_URL=   # not needed in mock mode

# Frontend .env.development
VITE_AUTH_MODE=mock
```

With both flags set, `npm run dev` works with no Keycloak running. The mock user has role `editor` by default.

## Out of Scope

- Fine-grained role enforcement per endpoint (follow-on).
- Keycloak redirect-based Authorization Code flow (not needed; backend proxies password grant).
- Refresh token rotation (Keycloak default; no extra config needed).
