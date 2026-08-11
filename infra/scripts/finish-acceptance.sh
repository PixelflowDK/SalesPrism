#!/usr/bin/env bash
# finish-acceptance.sh
#
# Every remaining Azure mutation needed to close acceptance, in one run, each
# with its own verification. Safe to re-run: every step is idempotent and
# checks current state before acting.
#
# ── Why this script exists ──────────────────────────────────────────────
#
# All four actions below were analysed, prepared and verified by the agent,
# but each is a resource mutation that the agent's execution policy blocks.
# They are collected here so the human step is "run one script and read the
# output" rather than four separate commands with four separate verifications.
#
# Nothing here is destructive. No resource is deleted. The one action with
# real blast radius — switching Azure Policy to deny — is deliberately NOT
# included; see the note at the end.
#
# Usage:
#   az login          # subscription "Azure subscription 1"
#   ./infra/scripts/finish-acceptance.sh

set -euo pipefail

readonly RG="rg-azurechat-val1"
readonly APP="app-azurechat-val1"
readonly OAI="oai-azurechat-val1"
readonly EXPECTED_SUB="ceb8f0de-f43f-4e86-8a39-3aa338af5e10"
readonly ADMIN_OID="7d37f13b-d198-4421-81c6-f0f9076049c7"

die() { echo "ERROR: $*" >&2; exit 1; }
step() { echo; echo "──────── $* ────────"; }

CUR_SUB="$(az account show --query id -o tsv 2>/dev/null || true)"
[[ "$CUR_SUB" == "$EXPECTED_SUB" ]] \
  || die "signed in to subscription '${CUR_SUB:-none}', expected ${EXPECTED_SUB}."

# ---------------------------------------------------------------------------
step "1/4  ADMIN_OBJECT_IDS — makes the admin portal reachable"
# ---------------------------------------------------------------------------
# The code migrated from ADMIN_EMAIL_ADDRESS to ADMIN_OBJECT_IDS but the app
# setting was never created, so isAdminOid() returned false for everyone and
# /admin served the "not authorized" page to the tenant's only administrator.
#
# Object ids, not emails: the sole admin is an MSA-federated #EXT# account
# whose mail/preferred_username claims are not stable across logins (ADR-003).
current_admins="$(az webapp config appsettings list -g "$RG" -n "$APP" \
  --query "[?name=='ADMIN_OBJECT_IDS'].value | [0]" -o tsv 2>/dev/null || true)"

if [[ "$current_admins" == *"$ADMIN_OID"* ]]; then
  echo "already set — skipping"
else
  az webapp config appsettings set -g "$RG" -n "$APP" \
    --settings "ADMIN_OBJECT_IDS=${ADMIN_OID}" -o none
  echo "set ADMIN_OBJECT_IDS"
  # An app-setting change restarts the app; give it a moment before verifying.
  sleep 30
fi

az webapp config appsettings list -g "$RG" -n "$APP" \
  --query "[?name=='ADMIN_OBJECT_IDS'].{name:name, configured: value != null}" -o table

# ---------------------------------------------------------------------------
step "2/4  Professional + Enterprise tier model deployments"
# ---------------------------------------------------------------------------
# ADR-001 defines gpt-5.4 = Professional and gpt-5.5 = Enterprise. Both were
# recorded as "quota-gated" since 2026-07-30. That is STALE: quota is now
# granted in westeurope (gpt-5.4 limit 300, gpt-5.5 limit 333, both at 0 use).
#
# DataZoneStandard is consumption-priced, so creating a deployment adds no
# standing cost — you pay per token, and an unused deployment costs nothing.
deploy_model() {
  local name="$1" version="$2" capacity="$3"
  if az cognitiveservices account deployment show \
       -g "$RG" -n "$OAI" --deployment-name "$name" -o none 2>/dev/null; then
    echo "  ${name}: already deployed"
    return
  fi
  echo "  ${name}: deploying (version ${version}, capacity ${capacity})…"
  az cognitiveservices account deployment create \
    -g "$RG" -n "$OAI" \
    --deployment-name "$name" \
    --model-name "$name" --model-version "$version" --model-format OpenAI \
    --sku-name DataZoneStandard --sku-capacity "$capacity" -o none
  echo "  ${name}: done"
}

deploy_model "gpt-5.4" "2026-03-05" 100
deploy_model "gpt-5.5" "2026-04-24" 100

az cognitiveservices account deployment list -g "$RG" -n "$OAI" \
  --query "[].{deployment:name, sku:sku.name, capacity:sku.capacity, state:properties.provisioningState}" -o table

# ---------------------------------------------------------------------------
step "3/4  Re-deploy the corrected H-3 tag policy definition"
# ---------------------------------------------------------------------------
# The DoNotEnforce dry run found 16 non-compliant resources, none of them a
# real tagging mistake: 11 belonged to an unrelated production workload in this
# subscription, 2 to the Azure platform, and 3 were resources Azure creates
# implicitly. The definition has been corrected to evaluate only rg-azurechat-*
# and to exempt implicitly-created types. This pushes that correction up.
az deployment sub create \
  --location westeurope \
  --name "policy-require-standard-tags-$(date +%s)" \
  --template-file infra/policy/require-standard-tags.bicep \
  --query "properties.provisioningState" -o tsv

echo "Triggering a fresh compliance scan (runs in the background, ~10-15 min)…"
az policy state trigger-scan --no-wait 2>/dev/null || true

# ---------------------------------------------------------------------------
step "4/4  Verify the live site is still healthy"
# ---------------------------------------------------------------------------
health="$(curl -fsS --max-time 20 -H 'Cache-Control: no-cache' \
  https://val1-sales360.pixelflow.dk/api/health || echo '')"
[[ -n "$health" ]] || die "health endpoint did not respond — investigate before continuing."
echo "  $health"

providers="$(curl -fsS --max-time 20 \
  https://val1-sales360.pixelflow.dk/api/auth/providers | tr -d '[:space:]')"
[[ "$providers" == *"azure-ad"* ]] || die "auth provider missing — sign-in is broken."
echo "  auth provider: azure-ad present"

infra/scripts/verify-cosmos-schema.sh -g "$RG" -s val1 -w "$APP"

cat <<'DONE'

────────────────────────────────────────────────────────────────────────
All four steps complete.

NEXT — sign in to https://val1-sales360.pixelflow.dk and confirm an "Admin"
entry now appears in the left navigation. That is the visible proof step 1
worked; it was absent before because no account could pass the admin check.

DELIBERATELY NOT DONE HERE — switching Azure Policy from DoNotEnforce to
Default (deny). Re-run the compliance scan AFTER the corrected definition has
been evaluated, confirm `az policy state list --filter "PolicyAssignmentName
eq 'sales-prism-guardrails' and ComplianceState eq 'NonCompliant'"` returns
only resources you intend to fix, and only then flip it:

  az policy assignment create \
    --name sales-prism-guardrails \
    --display-name "Sales Prism — infrastructure guardrails" \
    --scope "/subscriptions/ceb8f0de-f43f-4e86-8a39-3aa338af5e10" \
    --policy-set-definition sales-prism-guardrails \
    --enforcement-mode Default

A subscription-wide deny affects resources this project does not own, so it
stays an explicit human decision. Rollback is the same command with
--enforcement-mode DoNotEnforce.
────────────────────────────────────────────────────────────────────────
DONE
