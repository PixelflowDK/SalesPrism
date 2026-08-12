#!/usr/bin/env bash
# create-break-glass-accounts.sh — SR-008
#
# Creates the two emergency-access (break-glass) accounts DISABLED and with no
# credential anyone knows, assigns Global Administrator to both, and runs the
# acceptance test.
#
# ── The credential problem, and how this avoids it ──────────────────────
#
# A break-glass password must never pass through a transcript, a log, a shell
# history or a file. But Microsoft Graph requires a `passwordProfile` when
# creating a user, so *some* password value has to exist at creation time.
#
# This script resolves that by making the created password deliberately
# worthless and unknowable:
#
#   * it is generated from /dev/urandom inside this process,
#   * it is piped straight into the Graph request body on stdin — never an
#     argv element (visible in `ps`), never echoed, never written to disk,
#   * it is discarded when the process exits, and
#   * the accounts are created with `accountEnabled: false`, so the value
#     cannot be used to sign in even if it were somehow recovered.
#
# The result is an account that exists, holds its role, and is inert. The human
# then performs exactly one custody action per account — set a password and
# enable it — through the Entra portal, where the value is chosen by a person
# and goes straight into escrow. No automated system ever sees the real secret.
#
# This is why the script prints no password and offers no "escrow file": a
# plaintext credential written somewhere convenient is not escrow, it is a
# second copy of the secret.
#
# ── Usage ───────────────────────────────────────────────────────────────
#
#   az login          # as a Global Administrator of the target tenant
#   ./infra/scripts/create-break-glass-accounts.sh
#
# Idempotent. Never resets an existing account's password, so it cannot
# invalidate a credential already in escrow.

set -euo pipefail

readonly INITIAL_DOMAIN="admininsightcast.onmicrosoft.com"
readonly EXPECTED_TENANT="d4b1b55b-6c92-4419-9a08-956e975dce86"
# Global Administrator — a fixed template id, identical in every tenant.
# Hard-coded deliberately: resolving by display name breaks on a localised
# directory.
readonly GA_ROLE_TEMPLATE_ID="62e90394-69f5-4237-9190-012177145e10"

readonly ACCOUNTS=(
  "breakglass-a:Emergency Access A (BREAK-GLASS — DO NOT USE)"
  "breakglass-b:Emergency Access B (BREAK-GLASS — DO NOT USE)"
)

die() { echo "ERROR: $*" >&2; exit 1; }

CURRENT_TENANT="$(az account show --query tenantId -o tsv 2>/dev/null || true)"
[[ "$CURRENT_TENANT" == "$EXPECTED_TENANT" ]] \
  || die "signed in to tenant '${CURRENT_TENANT:-none}', expected ${EXPECTED_TENANT}."

az rest --method GET --url "https://graph.microsoft.com/v1.0/me/memberOf?\$select=displayName" -o json \
  | grep -q "Global Administrator" \
  || die "the signed-in account is not a Global Administrator."

echo "Tenant ${EXPECTED_TENANT} — Global Administrator confirmed."
echo

# ---------------------------------------------------------------------------
# Activate the Global Administrator role if it has never been used. A role with
# no directoryRole object cannot take members.
# ---------------------------------------------------------------------------
GA_ROLE_ID="$(az rest --method GET \
  --url "https://graph.microsoft.com/v1.0/directoryRoles?\$filter=roleTemplateId eq '${GA_ROLE_TEMPLATE_ID}'" \
  -o json | python3 -c 'import json,sys; v=json.load(sys.stdin).get("value",[]); print(v[0]["id"] if v else "")')"

if [[ -z "$GA_ROLE_ID" ]]; then
  echo "Activating the Global Administrator directory role…"
  GA_ROLE_ID="$(az rest --method POST --url "https://graph.microsoft.com/v1.0/directoryRoles" \
    --headers "Content-Type=application/json" \
    --body "{\"roleTemplateId\":\"${GA_ROLE_TEMPLATE_ID}\"}" \
    -o json | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
fi
echo "Global Administrator role id: ${GA_ROLE_ID}"
echo

CREATED_ANY=0

for entry in "${ACCOUNTS[@]}"; do
  short="${entry%%:*}"
  display="${entry#*:}"
  upn="${short}@${INITIAL_DOMAIN}"

  user_id="$(az rest --method GET \
    --url "https://graph.microsoft.com/v1.0/users?\$filter=userPrincipalName eq '${upn}'&\$select=id" \
    -o json | python3 -c 'import json,sys; v=json.load(sys.stdin).get("value",[]); print(v[0]["id"] if v else "")')"

  if [[ -n "$user_id" ]]; then
    echo "${upn} already exists (${user_id}) — password untouched."
  else
    # Built and piped entirely in-process. The password never becomes an argv
    # element, never reaches stdout, and never touches disk.
    user_id="$(python3 -c '
import json, secrets, string, sys
alphabet = string.ascii_letters + string.digits + "!@#%^&*()-_=+"
throwaway = "".join(secrets.choice(alphabet) for _ in range(64))
upn, display = sys.argv[1], sys.argv[2]
print(json.dumps({
  # Created DISABLED. The throwaway password below is unknown to every human
  # and every system the moment this process exits; disabling the account
  # means it is not even a theoretical sign-in path until a person sets a real
  # credential and enables it.
  "accountEnabled": False,
  "displayName": display,
  "mailNickname": upn.split("@")[0],
  "userPrincipalName": upn,
  "passwordProfile": {
    # Break-glass credentials must not expire or demand a change mid-emergency.
    "forceChangePasswordNextSignIn": False,
    "password": throwaway,
  },
  "passwordPolicies": "DisablePasswordExpiration",
}))' "$upn" "$display" \
      | az rest --method POST \
          --url "https://graph.microsoft.com/v1.0/users" \
          --headers "Content-Type=application/json" \
          --body @- \
          -o json | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"

    echo "Created ${upn} (${user_id}) — DISABLED, credential unknown by design."
    CREATED_ANY=1
  fi

  assign_body="{\"@odata.id\":\"https://graph.microsoft.com/v1.0/directoryObjects/${user_id}\"}"
  if az rest --method POST \
      --url "https://graph.microsoft.com/v1.0/directoryRoles/${GA_ROLE_ID}/members/\$ref" \
      --headers "Content-Type=application/json" \
      --body "$assign_body" -o none 2>/dev/null; then
    echo "  Global Administrator assigned."
  else
    echo "  Global Administrator already assigned."
  fi
done

# ---------------------------------------------------------------------------
# Acceptance test — every property that can be checked without a secret.
# ---------------------------------------------------------------------------
echo
echo "-- acceptance test --"
FAILURES=0
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*" >&2; FAILURES=$((FAILURES+1)); }

users_json="$(az rest --method GET \
  --url "https://graph.microsoft.com/v1.0/users?\$filter=startswith(userPrincipalName,'breakglass-')&\$select=id,userPrincipalName,accountEnabled,onPremisesSyncEnabled,userType" \
  -o json)"

count="$(printf '%s' "$users_json" | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("value",[])))')"
[[ "$count" == "2" ]] && pass "2 break-glass accounts exist" || fail "expected 2, found ${count}"

printf '%s' "$users_json" | python3 -c '
import json,sys
for u in json.load(sys.stdin).get("value",[]):
    upn = u["userPrincipalName"]
    cloud_only = u.get("onPremisesSyncEnabled") in (None, False)
    initial_domain = upn.endswith("admininsightcast.onmicrosoft.com")
    print(("PASS: " if (cloud_only and initial_domain) else "FAIL: ")
          + upn + " cloud-only, on the initial domain")
    state = "ENABLED" if u.get("accountEnabled") else "disabled (awaiting credential custody)"
    print(f"      state: {state}")
'

members="$(az rest --method GET \
  --url "https://graph.microsoft.com/v1.0/directoryRoles/${GA_ROLE_ID}/members?\$select=userPrincipalName" -o json)"
bg_admins="$(printf '%s' "$members" | python3 -c '
import json,sys
print(sum(1 for m in json.load(sys.stdin).get("value",[]) if str(m.get("userPrincipalName","")).startswith("breakglass-")))')"
[[ "$bg_admins" == "2" ]] && pass "both hold Global Administrator" || fail "expected 2 break-glass GAs, found ${bg_admins}"

total_admins="$(printf '%s' "$members" | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("value",[])))')"
(( total_admins >= 3 )) && pass "tenant has ${total_admins} Global Administrators (was 1)" \
  || fail "expected >=3 Global Administrators, found ${total_admins}"

ca="$(az rest --method GET --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" -o json 2>/dev/null || echo '{"value":[]}')"
ca_count="$(printf '%s' "$ca" | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("value",[])))')"
if [[ "$ca_count" == "0" ]]; then
  pass "no Conditional Access policies exist — nothing can lock these accounts out yet"
  echo "      Every CA policy created from now on MUST exclude both object ids."
else
  echo "      ${ca_count} CA policies exist — verify both object ids are in excludeUsers on EACH."
fi

echo
if (( FAILURES > 0 )); then
  echo "${FAILURES} check(s) failed."
  exit 1
fi

if (( CREATED_ANY == 1 )); then
  cat <<'NEXT'

────────────────────────────────────────────────────────────────────────
REMAINING HUMAN STEP — credential custody. Two accounts, one action each.

Entra portal → Users → breakglass-a → Reset password
  - choose a long random password YOURSELF (do not let the portal auto-generate
    into a screenshot you then forget about)
  - clear "User must change password at next sign-in"
  - then Properties → set Account enabled = Yes
  - print it, seal it in a tamper-evident envelope

Repeat for breakglass-b. Store the two envelopes in TWO DIFFERENT physical
locations. Do NOT put them in a password manager that this tenant's SSO
protects — that is a circular dependency that fails exactly when you need it.

Then record the envelope seal serial numbers in docs/security-decision-log.md
and re-run this script; it will report both accounts as ENABLED.
────────────────────────────────────────────────────────────────────────
NEXT
fi

echo "SR-008 automated portion complete."
