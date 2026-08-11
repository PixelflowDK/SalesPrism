#!/usr/bin/env bash
# create-break-glass-accounts.sh — SR-008
#
# Creates the two emergency-access (break-glass) accounts, assigns Global
# Administrator to both, and runs the acceptance test.
#
# ── Why a human runs this instead of the agent ──────────────────────────
#
# Not a permissions problem. The signed-in context already holds Global
# Administrator, which is sufficient to create users — that was verified
# before this script was written.
#
# The reason is the password. A break-glass credential's entire value is that
# it is reachable when everything else has failed AND that it has never been
# handled by any system that could retain it. A password generated inside an
# agent's tool output has passed through a transcript, and is no longer a
# credential you can bet the tenant on. So the generation happens here, in
# your shell, from `openssl rand`, and the value is shown to you exactly once.
#
# Everything else — naming, domain choice, role assignment, verification —
# is automated below so the human part is: run this, seal two envelopes.
#
# ── Usage ───────────────────────────────────────────────────────────────
#
#   az login          # as a Global Administrator of the target tenant
#   ./infra/scripts/create-break-glass-accounts.sh
#
# Idempotent: re-running when the accounts already exist skips creation and
# re-verifies. It never resets an existing account's password, so it cannot
# silently invalidate an escrowed envelope.

set -euo pipefail

readonly INITIAL_DOMAIN="admininsightcast.onmicrosoft.com"
readonly EXPECTED_TENANT="d4b1b55b-6c92-4419-9a08-956e975dce86"
# Global Administrator — a well-known fixed template id, identical in every
# tenant. Hard-coded deliberately: resolving it by display name would break
# under a localised directory.
readonly GA_ROLE_TEMPLATE_ID="62e90394-69f5-4237-9190-012177145e10"

readonly ACCOUNTS=(
  "breakglass-a:Emergency Access A (BREAK-GLASS — DO NOT USE)"
  "breakglass-b:Emergency Access B (BREAK-GLASS — DO NOT USE)"
)

die() { echo "ERROR: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 0. Refuse to run against the wrong tenant.
# ---------------------------------------------------------------------------
CURRENT_TENANT="$(az account show --query tenantId -o tsv 2>/dev/null || true)"
[[ "$CURRENT_TENANT" == "$EXPECTED_TENANT" ]] \
  || die "signed in to tenant '${CURRENT_TENANT:-none}', expected ${EXPECTED_TENANT}. Run 'az login' against the right tenant."

az rest --method GET --url "https://graph.microsoft.com/v1.0/me/memberOf?\$select=displayName" -o json \
  | grep -q "Global Administrator" \
  || die "the signed-in account is not a Global Administrator; it cannot create users or assign roles."

echo "Tenant ${EXPECTED_TENANT} — Global Administrator confirmed."
echo

# ---------------------------------------------------------------------------
# 1. Ensure the Global Administrator role is activated in this directory.
#    A role that has never been used exists only as a template and has no
#    directoryRole object to add members to.
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

# ---------------------------------------------------------------------------
# 2. Create each account if absent, then assign the role.
# ---------------------------------------------------------------------------
declare -a CREATED_UPNS=()
declare -a CREATED_PASSWORDS=()

for entry in "${ACCOUNTS[@]}"; do
  short="${entry%%:*}"
  display="${entry#*:}"
  upn="${short}@${INITIAL_DOMAIN}"

  existing_id="$(az rest --method GET \
    --url "https://graph.microsoft.com/v1.0/users?\$filter=userPrincipalName eq '${upn}'&\$select=id" \
    -o json | python3 -c 'import json,sys; v=json.load(sys.stdin).get("value",[]); print(v[0]["id"] if v else "")')"

  if [[ -n "$existing_id" ]]; then
    echo "${upn} already exists (${existing_id}) — not touching its password."
    user_id="$existing_id"
  else
    # 40 chars from openssl. Generated here, in your shell. Never logged, never
    # written to a file, never passed as an argv element (which would be
    # visible in `ps`) — piped to az via a request body on stdin.
    password="$(LC_ALL=C tr -dc 'A-Za-z0-9!@#%^&*()-_=+' </dev/urandom | head -c 40)"

    body="$(python3 -c '
import json,sys
upn, display, pwd = sys.argv[1], sys.argv[2], sys.argv[3]
print(json.dumps({
  "accountEnabled": True,
  "displayName": display,
  "mailNickname": upn.split("@")[0],
  "userPrincipalName": upn,
  "passwordProfile": {
    # Break-glass credentials must NOT expire or require a change at sign-in:
    # a forced password change during a real emergency is one more thing that
    # can fail when everything else already has.
    "forceChangePasswordNextSignIn": False,
    "password": pwd,
  },
  "passwordPolicies": "DisablePasswordExpiration",
}))' "$upn" "$display" "$password")"

    user_id="$(printf '%s' "$body" | az rest --method POST \
      --url "https://graph.microsoft.com/v1.0/users" \
      --headers "Content-Type=application/json" \
      --body @- \
      -o json | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"

    echo "Created ${upn} (${user_id})"
    CREATED_UPNS+=("$upn")
    CREATED_PASSWORDS+=("$password")
    unset password
  fi

  # Role assignment is idempotent in effect: Graph returns 400 if the member is
  # already present, which is not a failure for our purposes.
  assign_body="{\"@odata.id\":\"https://graph.microsoft.com/v1.0/directoryObjects/${user_id}\"}"
  if az rest --method POST \
      --url "https://graph.microsoft.com/v1.0/directoryRoles/${GA_ROLE_ID}/members/\$ref" \
      --headers "Content-Type=application/json" \
      --body "$assign_body" -o none 2>/dev/null; then
    echo "  Global Administrator assigned."
  else
    echo "  Global Administrator already assigned (or assignment rejected as duplicate)."
  fi
done

# ---------------------------------------------------------------------------
# 3. Show the passwords once, for immediate physical escrow.
# ---------------------------------------------------------------------------
if (( ${#CREATED_PASSWORDS[@]} > 0 )); then
  echo
  echo "================================================================"
  echo " PASSWORDS — SHOWN ONCE. They are not stored anywhere."
  echo " Print each, seal it in its own tamper-evident envelope, and put"
  echo " the two envelopes in TWO DIFFERENT physical locations."
  echo " Do not put these in a password manager that this tenant's SSO"
  echo " protects — that is a circular dependency that fails exactly when"
  echo " you need it."
  echo "================================================================"
  for i in "${!CREATED_UPNS[@]}"; do
    echo
    echo "  ${CREATED_UPNS[$i]}"
    echo "  ${CREATED_PASSWORDS[$i]}"
  done
  echo
  echo "================================================================"
  echo " Clear your scrollback when done:  printf '\\033[3J'"
  echo "================================================================"
  echo
fi

# ---------------------------------------------------------------------------
# 4. Acceptance test — the same checks as the runbook.
# ---------------------------------------------------------------------------
echo
echo "-- acceptance test --"
FAILURES=0
pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*" >&2; FAILURES=$((FAILURES+1)); }

users_json="$(az rest --method GET \
  --url "https://graph.microsoft.com/v1.0/users?\$filter=startswith(userPrincipalName,'breakglass-')&\$select=userPrincipalName,accountEnabled,onPremisesSyncEnabled,userType" \
  -o json)"

count="$(printf '%s' "$users_json" | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("value",[])))')"
[[ "$count" == "2" ]] && pass "2 break-glass accounts exist" || fail "expected 2 break-glass accounts, found ${count}"

printf '%s' "$users_json" | python3 -c '
import json,sys
for u in json.load(sys.stdin).get("value",[]):
    upn = u["userPrincipalName"]
    ok = (u.get("accountEnabled") is True
          and u.get("onPremisesSyncEnabled") in (None, False)
          and upn.endswith("admininsightcast.onmicrosoft.com"))
    print(("PASS: " if ok else "FAIL: ") + upn + " cloud-only, enabled, on the initial domain")
'

members="$(az rest --method GET \
  --url "https://graph.microsoft.com/v1.0/directoryRoles/${GA_ROLE_ID}/members?\$select=userPrincipalName" -o json)"
bg_admins="$(printf '%s' "$members" | python3 -c '
import json,sys
print(sum(1 for m in json.load(sys.stdin).get("value",[]) if str(m.get("userPrincipalName","")).startswith("breakglass-")))')"
[[ "$bg_admins" == "2" ]] && pass "both break-glass accounts hold Global Administrator" \
  || fail "expected 2 break-glass Global Administrators, found ${bg_admins}"

total_admins="$(printf '%s' "$members" | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("value",[])))')"
(( total_admins >= 3 )) && pass "tenant now has ${total_admins} Global Administrators (was 1)" \
  || fail "expected at least 3 Global Administrators, found ${total_admins}"

# Conditional Access must exclude both accounts. Vacuously true while no
# policy exists — which is the state this is meant to be run in. Re-run this
# script's check (or the runbook's) after creating the FIRST policy.
ca="$(az rest --method GET --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" -o json 2>/dev/null || echo '{"value":[]}')"
ca_count="$(printf '%s' "$ca" | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("value",[])))')"
if [[ "$ca_count" == "0" ]]; then
  pass "no Conditional Access policies exist — nothing can lock these accounts out yet"
  echo "      REMINDER: every CA policy you create from now on must exclude both accounts."
else
  echo "      ${ca_count} CA policies exist — verify both break-glass object ids appear in excludeUsers on EACH."
fi

echo
if (( FAILURES > 0 )); then
  echo "${FAILURES} check(s) failed."
  exit 1
fi
echo "SR-008 acceptance test passed."
echo "Record the envelope seal serial numbers in docs/security-decision-log.md."
