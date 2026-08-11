#!/usr/bin/env bash
# verify-cosmos-schema.sh — SR-009 deployment-health guard.
#
# Asserts that a customer's Cosmos DB account actually has the SQL database
# and containers the application code requires (src/features/common/services
# /cosmos.ts, cosmos-retention.ts) — with the correct partition key path and
# defaultTtl — not just that the ACCOUNT resource exists.
#
# Root cause this guards against (SR-009): infra/modules/cosmos-db.bicep
# used to provision only the Cosmos ACCOUNT. The `chat` database and
# `history`/`config` containers were never ported from the upstream
# azurechat template, so `az cosmosdb sql database list` returned `[]` and
# every page load logged `theme.get-failed` — a resource can exist and the
# app can still be completely broken. This script makes that condition a
# hard, scriptable FAIL instead of something only a human reading logs
# would notice.
#
# Scope / limitations (read before wiring into CI):
#   - This script only calls the Azure Resource Manager control plane
#     (`az cosmosdb sql database/container show`), which is reachable from
#     anywhere with an authenticated `az` session and RBAC — including a
#     GitHub Actions runner with NO network path into the customer's VNet
#     (see tenant-theme.ts's module doc: "the running app seeds its own
#     config on first request" because provisioning cannot reach the
#     private endpoint). It does NOT (and, from outside the VNet, cannot)
#     perform an actual Cosmos SQL data-plane read/write through the App
#     Service's managed identity.
#   - The managed-identity data-plane smoke test is exercised indirectly,
#     optionally, by hitting the deployed app's own public root URL (which
#     runs `EnsureTenantTheme` unauthenticated on every request — see
#     src/app/layout.tsx) and confirming no error was logged for it. This
#     is a real, if indirect, proof that DefaultAzureCredential + RBAC +
#     private endpoint + database/containers all actually work end-to-end.
#     It is skipped by default; pass -w/--webapp to enable it.
#
# Usage:
#   infra/scripts/verify-cosmos-schema.sh -g <resource-group> -s <customer-slug> [-w <webapp-name>]
#
# Exit code is non-zero on ANY mismatch — this is a hard gate, not a report.

set -euo pipefail

RESOURCE_GROUP=""
CUSTOMER_SLUG=""
WEBAPP_NAME=""

DB_NAME="${COSMOS_DB_NAME:-chat}"
HISTORY_CONTAINER_NAME="${COSMOS_HISTORY_CONTAINER_NAME:-history}"
CONFIG_CONTAINER_NAME="${COSMOS_CONFIG_CONTAINER_NAME:-config}"

# Must match src/features/common/services/cosmos-retention.ts exactly.
readonly EXPECTED_PARTITION_PATH="/userId"
readonly EXPECTED_HISTORY_TTL=7776000   # CHAT_HISTORY_TTL_SECONDS (90d)
readonly EXPECTED_CONFIG_TTL=-1         # CONFIG_CONTAINER_DEFAULT_TTL (never expires by default)

usage() {
  echo "Usage: $0 -g <resource-group> -s <customer-slug> [-w <webapp-name>]" >&2
  echo "  -g  Resource group, e.g. rg-azurechat-val1" >&2
  echo "  -s  Customer slug, e.g. val1 (used to derive cosmos-azurechat-<slug>)" >&2
  echo "  -w  Optional: App Service name — if given, also curls the site's public" >&2
  echo "      root URL and tails recent logs for the managed-identity smoke check" >&2
  exit 1
}

while getopts "g:s:w:h" opt; do
  case "$opt" in
    g) RESOURCE_GROUP="$OPTARG" ;;
    s) CUSTOMER_SLUG="$OPTARG" ;;
    w) WEBAPP_NAME="$OPTARG" ;;
    h) usage ;;
    *) usage ;;
  esac
done

[[ -z "$RESOURCE_GROUP" || -z "$CUSTOMER_SLUG" ]] && usage

command -v az >/dev/null 2>&1 || { echo "FAIL: az CLI is required" >&2; exit 2; }
command -v jq >/dev/null 2>&1 || { echo "FAIL: jq is required" >&2; exit 2; }

ACCOUNT_NAME="cosmos-azurechat-${CUSTOMER_SLUG}"
FAILURES=0

pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1" >&2; FAILURES=$((FAILURES + 1)); }

echo "== SR-009 Cosmos schema guard =="
echo "Resource group : $RESOURCE_GROUP"
echo "Account        : $ACCOUNT_NAME"
echo "Database       : $DB_NAME"
echo

# 1. Account must exist and be serverless (containers below assume no throughput).
account_json=$(az cosmosdb show -g "$RESOURCE_GROUP" -n "$ACCOUNT_NAME" -o json 2>/dev/null) || {
  fail "Cosmos account '$ACCOUNT_NAME' not found in '$RESOURCE_GROUP'"
  echo
  echo "$FAILURES check(s) failed."
  exit 1
}

if [[ "$(echo "$account_json" | jq -r '.disableLocalAuth')" != "true" ]]; then
  fail "disableLocalAuth is not true on $ACCOUNT_NAME (zero-secrets requirement)"
else
  pass "disableLocalAuth=true"
fi

if [[ "$(echo "$account_json" | jq -r '.enableAutomaticFailover')" != "true" ]]; then
  fail "enableAutomaticFailover is not true on $ACCOUNT_NAME"
else
  pass "enableAutomaticFailover=true"
fi

# 2. Database must exist.
db_json=$(az cosmosdb sql database show -g "$RESOURCE_GROUP" -a "$ACCOUNT_NAME" -n "$DB_NAME" -o json 2>/dev/null) || {
  fail "Database '$DB_NAME' does not exist on $ACCOUNT_NAME — cosmos.ts's DB_NAME will 404 on every request"
  echo
  echo "$FAILURES check(s) failed."
  exit 1
}
pass "database '$DB_NAME' exists"

# 3. Container assertion helper.
check_container() {
  local container_name="$1"
  local expected_ttl="$2"

  local container_json
  container_json=$(az cosmosdb sql container show -g "$RESOURCE_GROUP" -a "$ACCOUNT_NAME" -d "$DB_NAME" -n "$container_name" -o json 2>/dev/null) || {
    fail "Container '$container_name' does not exist in database '$DB_NAME'"
    return
  }
  pass "container '$container_name' exists"

  local actual_path
  actual_path=$(echo "$container_json" | jq -r '.resource.partitionKey.paths[0]')
  if [[ "$actual_path" != "$EXPECTED_PARTITION_PATH" ]]; then
    fail "container '$container_name' partition key path is '$actual_path', expected '$EXPECTED_PARTITION_PATH'"
  else
    pass "container '$container_name' partition key path = $EXPECTED_PARTITION_PATH"
  fi

  local actual_ttl
  actual_ttl=$(echo "$container_json" | jq -r '.resource.defaultTtl // "null"')
  if [[ "$actual_ttl" != "$expected_ttl" ]]; then
    fail "container '$container_name' defaultTtl is '$actual_ttl', expected '$expected_ttl' — see cosmos-retention.ts"
  else
    pass "container '$container_name' defaultTtl = $expected_ttl"
  fi

  # Serverless accounts must not have container-level throughput/autoscale.
  local throughput
  throughput=$(echo "$container_json" | jq -r '.options.throughput // "null"')
  local autoscale
  autoscale=$(echo "$container_json" | jq -r '.options.autoscaleSettings // "null"')
  if [[ "$throughput" != "null" || "$autoscale" != "null" ]]; then
    fail "container '$container_name' has provisioned throughput/autoscale set — invalid on a serverless account"
  else
    pass "container '$container_name' has no provisioned throughput (serverless-correct)"
  fi
}

check_container "$HISTORY_CONTAINER_NAME" "$EXPECTED_HISTORY_TTL"
check_container "$CONFIG_CONTAINER_NAME" "$EXPECTED_CONFIG_TTL"

# 4. Delete lock must still be present (data-protection requirement).
lock_count=$(az lock list -g "$RESOURCE_GROUP" --resource-name "$ACCOUNT_NAME" \
  --resource-type Microsoft.DocumentDB/databaseAccounts -o json 2>/dev/null | jq 'map(select(.level=="CanNotDelete")) | length')
if [[ "$lock_count" -lt 1 ]]; then
  fail "no CanNotDelete lock found on $ACCOUNT_NAME"
else
  pass "CanNotDelete lock present on $ACCOUNT_NAME"
fi

# 5. Optional: indirect managed-identity data-plane smoke test via the live app.
if [[ -n "$WEBAPP_NAME" ]]; then
  echo
  echo "-- optional: managed-identity smoke test via $WEBAPP_NAME --"
  hostname=$(az webapp show -g "$RESOURCE_GROUP" -n "$WEBAPP_NAME" --query defaultHostName -o tsv 2>/dev/null) || true
  if [[ -z "$hostname" ]]; then
    fail "could not resolve hostname for webapp '$WEBAPP_NAME' — skipping smoke test"
  else
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "https://${hostname}/?verify=$(date +%s)" || echo "000")
    if [[ "$http_code" != "200" ]]; then
      fail "GET https://${hostname}/ returned HTTP $http_code (expected 200) — EnsureTenantTheme could not be exercised"
    else
      pass "GET https://${hostname}/ returned HTTP 200 (EnsureTenantTheme executed)"

      # HTTP 200 alone is NOT proof the Cosmos write succeeded. During SR-009
      # this endpoint returned 200 for weeks with no database at all: the theme
      # lookup fails, `EnsureTenantTheme` logs `theme.get-failed`, and the page
      # still renders with defaults. Asserting on the status code alone would
      # therefore reproduce exactly the false-confidence that let SR-009 sit
      # undetected. The only honest signal is the app's own structured error
      # code, which SR-010 now ships to Application Insights.
      #
      # App Insights ingestion is not instant (typically 30-90s), so poll
      # rather than sampling once — and treat "the query never returned data"
      # as INCONCLUSIVE, never as a pass.
      ai_name="appi-azurechat-${CUSTOMER_SLUG}"
      app_id=$(az monitor app-insights component show -g "$RESOURCE_GROUP" -a "$ai_name" --query appId -o tsv 2>/dev/null) || true

      if [[ -z "$app_id" ]]; then
        echo "INCONCLUSIVE: no Application Insights component '${ai_name}' — cannot assert on theme errors."
        echo "              Falling back to manual check:"
        echo "              az webapp log download -g $RESOURCE_GROUP -n $WEBAPP_NAME --log-file <file>.zip"
      else
        # NEVER use `-o tsv` with `az monitor app-insights query`. It does not
        # print the result row — for a `| count` query it prints the literal
        # `1` (the number of result TABLES) no matter what the count is. An
        # earlier revision of this block used it and reported
        # "1 theme.get-failed event" against a val1 environment whose true
        # count was 0, i.e. it would have hard-failed every provisioning run
        # with a false "data plane is broken" verdict. Parse the JSON.
        kql_scalar() {
          az monitor app-insights query --app "$app_id" --analytics-query "$1" -o json 2>/dev/null \
            | jq -r '.tables[0].rows[0][0] // empty'
        }

        theme_errors=""
        confirmed_ingest=""
        for _ in 1 2 3 4 5 6; do
          sleep 20
          # Any trace at all in the window proves the pipeline is delivering, so
          # an empty theme-error result is meaningful rather than just silence.
          confirmed_ingest=$(kql_scalar "traces | where timestamp > ago(10m) | count") || true
          theme_errors=$(kql_scalar "traces | where timestamp > ago(10m) | where message has 'theme.get-failed' or message has 'theme.seed-failed' | count") || true
          [[ -n "$confirmed_ingest" && "$confirmed_ingest" != "0" ]] && break
        done

        if [[ -z "$confirmed_ingest" || "$confirmed_ingest" == "0" ]]; then
          echo "INCONCLUSIVE: no traces reached Application Insights within 2 minutes."
          echo "              Cannot distinguish 'no theme errors' from 'telemetry not flowing'."
          echo "              This is itself worth investigating (see SR-010)."
        elif [[ "${theme_errors:-0}" != "0" ]]; then
          fail "app logged ${theme_errors} theme.get-failed/theme.seed-failed event(s) — the managed identity cannot reach the Cosmos data plane through the private endpoint, even though the schema is correct"
        else
          pass "no theme.get-failed/theme.seed-failed in App Insights — managed identity reached the Cosmos data plane"
        fi
      fi
    fi
  fi
fi

echo
if [[ "$FAILURES" -gt 0 ]]; then
  echo "$FAILURES check(s) failed."
  exit 1
fi
echo "All checks passed."
