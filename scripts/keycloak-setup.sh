#!/usr/bin/env bash
set -euo pipefail

KEYCLOAK_URL="${KEYCLOAK_URL:-https://keycloak.local.test}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASS="${ADMIN_PASS:-aaa123123}"
REALM="auditpatchx"
CLIENT_ID="auditpatchx-app"

echo "=== Authenticating to Keycloak admin ==="
ADMIN_TOKEN=$(curl -sk -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -d "grant_type=password&client_id=admin-cli&username=$ADMIN_USER&password=$ADMIN_PASS" \
  | jq -r .access_token)

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
  echo "ERROR: Failed to get admin token. Check Keycloak URL and credentials."
  exit 1
fi

AUTH="Authorization: Bearer $ADMIN_TOKEN"

# ---- Realm ----
echo "=== Creating realm: $REALM ==="
REALM_EXISTS=$(curl -sk -o /dev/null -w "%{http_code}" -H "$AUTH" "$KEYCLOAK_URL/admin/realms/$REALM")
if [ "$REALM_EXISTS" = "200" ]; then
  echo "Realm already exists, updating token lifespan..."
  curl -sk -X PUT "$KEYCLOAK_URL/admin/realms/$REALM" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d '{"accessTokenLifespan":60,"ssoSessionMaxLifespan":1800}'
else
  curl -sk -X POST "$KEYCLOAK_URL/admin/realms" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{
      \"realm\": \"$REALM\",
      \"enabled\": true,
      \"accessTokenLifespan\": 60,
      \"ssoSessionMaxLifespan\": 1800
    }"
  echo "Realm created."
fi

# ---- Client ----
echo "=== Creating client: $CLIENT_ID ==="
CLIENT_EXISTS=$(curl -sk -H "$AUTH" "$KEYCLOAK_URL/admin/realms/$REALM/clients?clientId=$CLIENT_ID" | jq 'length')
if [ "$CLIENT_EXISTS" -gt "0" ]; then
  echo "Client already exists."
else
  curl -sk -X POST "$KEYCLOAK_URL/admin/realms/$REALM/clients" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{
      \"clientId\": \"$CLIENT_ID\",
      \"enabled\": true,
      \"publicClient\": false,
      \"directAccessGrantsEnabled\": true,
      \"standardFlowEnabled\": false,
      \"serviceAccountsEnabled\": false,
      \"redirectUris\": [],
      \"secret\": \"auditpatchx-secret\"
    }"
  echo "Client created."
fi

# ---- Roles ----
echo "=== Creating roles ==="
for ROLE in viewer editor; do
  ROLE_EXISTS=$(curl -sk -o /dev/null -w "%{http_code}" -H "$AUTH" "$KEYCLOAK_URL/admin/realms/$REALM/roles/$ROLE")
  if [ "$ROLE_EXISTS" != "200" ]; then
    curl -sk -X POST "$KEYCLOAK_URL/admin/realms/$REALM/roles" \
      -H "$AUTH" -H "Content-Type: application/json" \
      -d "{\"name\": \"$ROLE\"}"
    echo "Role '$ROLE' created."
  else
    echo "Role '$ROLE' already exists."
  fi
done

# ---- Helper: create user and assign role ----
create_user() {
  local USERNAME=$1
  local PASSWORD=$2
  local ROLE=$3

  USER_EXISTS=$(curl -sk -H "$AUTH" "$KEYCLOAK_URL/admin/realms/$REALM/users?username=$USERNAME" | jq 'length')
  if [ "$USER_EXISTS" -gt "0" ]; then
    echo "User '$USERNAME' already exists."
    USER_UUID=$(curl -sk -H "$AUTH" "$KEYCLOAK_URL/admin/realms/$REALM/users?username=$USERNAME" | jq -r '.[0].id')
  else
    curl -sk -X POST "$KEYCLOAK_URL/admin/realms/$REALM/users" \
      -H "$AUTH" -H "Content-Type: application/json" \
      -d "{
        \"username\": \"$USERNAME\",
        \"enabled\": true,
        \"emailVerified\": true,
        \"email\": \"${USERNAME}@auditpatchx.local\",
        \"firstName\": \"${USERNAME^}\",
        \"lastName\": \"Test\",
        \"credentials\": [{\"type\": \"password\", \"value\": \"$PASSWORD\", \"temporary\": false}]
      }"
    USER_UUID=$(curl -sk -H "$AUTH" "$KEYCLOAK_URL/admin/realms/$REALM/users?username=$USERNAME" | jq -r '.[0].id')
    echo "User '$USERNAME' created."
  fi

  ROLE_ID=$(curl -sk -H "$AUTH" "$KEYCLOAK_URL/admin/realms/$REALM/roles/$ROLE" | jq -r .id)
  curl -sk -X POST "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_UUID/role-mappings/realm" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "[{\"id\": \"$ROLE_ID\", \"name\": \"$ROLE\"}]"
  echo "Role '$ROLE' assigned to '$USERNAME'."
}

echo "=== Creating test users ==="
create_user "alice" "alice" "editor"
create_user "bob"   "bob"   "viewer"

echo ""
echo "=== DONE ==="
echo "Realm:         $REALM"
echo "Client ID:     $CLIENT_ID"
echo "Client Secret: auditpatchx-secret"
echo "Token URL:     $KEYCLOAK_URL/realms/$REALM/protocol/openid-connect/token"
echo ""
echo "Test login:"
echo "  curl -sk -X POST $KEYCLOAK_URL/realms/$REALM/protocol/openid-connect/token \\"
echo "    -d 'grant_type=password&client_id=$CLIENT_ID&client_secret=auditpatchx-secret&username=alice&password=alice' \\"
echo "    | jq -r .access_token"
