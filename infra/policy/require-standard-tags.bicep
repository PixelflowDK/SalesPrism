// require-standard-tags.bicep — H-3 (2026-08-11) subscription-scope Azure Policy definition.
//
// SAD's Azure Tags contract (CLAUDE.md "Required tags on all resources" / SAD naming section)
// requires customer, environment, managed-by, model-tier on every resource — enforced today only
// by convention (main.bicep's `tags` var, applied by every module) with no subscription-level
// backstop. A resource created outside this Bicep flow (portal click, ad-hoc `az` command, a
// module that forgets to pass `tags:`) would silently go untagged with nothing to catch it.
//
// Defines ONLY the policy — zero enforcement effect until assigned. See the trailing comment for
// the assignment command (not run by this agent — operator decision).
targetScope = 'subscription'

resource requireStandardTags 'Microsoft.Authorization/policyDefinitions@2021-06-01' = {
  name: 'sales-prism-require-standard-tags'
  properties: {
    displayName: 'Sales Prism — require customer/environment/managed-by/model-tier tags'
    description: 'Denies creation of any location-scoped resource missing one or more of the four required Sales Prism tags: customer, environment, managed-by, model-tier. Subscription-level backstop for infra/main.bicep\'s tags contract, which only holds by convention today.'
    policyType: 'Custom'
    mode: 'Indexed'
    metadata: {
      category: 'Sales Prism'
      version: '1.0.0'
      source: 'infra/policy/require-standard-tags.bicep — H-3, 2026-08-11'
    }
    // H-3 (revised 2026-08-12 after the DoNotEnforce dry run this file's
    // trailing comment asked for). The dry run found 16 non-compliant
    // resources and NONE of them were a real tagging mistake:
    //
    //   11  rg-insightcast-prod-swc  — an unrelated production workload in the
    //                                 same subscription (VM, VNet, backup
    //                                 vault, NIC, NSG, disks). Nothing to do
    //                                 with Sales Prism.
    //    2  networkwatcherrg         — created and owned by the Azure platform.
    //    3  rg-azurechat-val1        — all implicitly created: the App
    //                                 Service-managed certificate and the
    //                                 Application Insights smart-detection
    //                                 action group / alert rule.
    //
    // Enforcing the previous rule would therefore have denied future writes to
    // the operator's OTHER production environment and to resources Azure
    // creates on its own — a subscription-wide outage risk, not a guardrail.
    //
    // Two conditions fix that at the source, which is better than an
    // ever-growing `notScopes` list on the assignment:
    //
    //   1. Only evaluate resource groups named `rg-azurechat-*`. This is the
    //      platform's own naming convention (CLAUDE.md), so it self-maintains
    //      as customers are added and automatically ignores everything else in
    //      the subscription.
    //   2. Exempt resource types that Azure creates implicitly, which no
    //      template can tag because no template declares them.
    //
    // The other two definitions in this initiative (region, GlobalStandard)
    // had ZERO violations in the same dry run and need no equivalent scoping.
    policyRule: {
      if: {
        allOf: [
          {
            value: '[resourceGroup().name]'
            like: 'rg-azurechat-*'
          }
          {
            not: {
              field: 'type'
              in: [
                // App Service creates the managed TLS certificate itself when a
                // hostname binding is made; it is never declared in Bicep.
                'Microsoft.Web/certificates'
                // Application Insights auto-provisions smart detection on every
                // component, with no way to tag or suppress the pair.
                'microsoft.insights/actionGroups'
                'microsoft.alertsmanagement/smartDetectorAlertRules'
                // Private Endpoints materialise their own NIC as a separate
                // resource; the NIC inherits nothing from the parent.
                'Microsoft.Network/networkInterfaces'
                // Platform-owned, lives in the platform's own resource group.
                'Microsoft.Network/networkWatchers'
              ]
            }
          }
          {
            anyOf: [
              {
                field: 'tags[\'customer\']'
                exists: 'false'
              }
              {
                field: 'tags[\'environment\']'
                exists: 'false'
              }
              {
                field: 'tags[\'managed-by\']'
                exists: 'false'
              }
              {
                field: 'tags[\'model-tier\']'
                exists: 'false'
              }
            ]
          }
        ]
      }
      then: {
        effect: 'deny'
      }
    }
  }
}

output policyDefinitionId string = requireStandardTags.id
output policyDefinitionName string = requireStandardTags.name

// ---------------------------------------------------------------------------
// Assignment command (NOT run by this agent):
//
//   az policy assignment create \
//     --name sales-prism-require-standard-tags \
//     --display-name "Sales Prism — require standard tags" \
//     --scope "/subscriptions/<subscription-id>" \
//     --policy sales-prism-require-standard-tags
//
// NOTE — read before assigning: the customer resource GROUP itself
// (rg-azurechat-{slug}, created by modules/customer-resource-group.bicep) IS
// tagged by this Bicep flow, so this should not block normal provisioning.
// But this policy has 'Indexed' mode, meaning it evaluates every
// tag-and-location-capable resource type, including ones this repo does not
// explicitly tag today if any exist (e.g. auto-created child resources like
// NIC objects for Private Endpoints, which this subscription's own what-if
// output already shows as separate resources) — recommend a DoNotEnforce
// dry run first and reviewing `az policy state list` for false positives on
// resource TYPES that cannot practically carry tags (e.g. some child/NIC
// resources), before switching to Default (enforcing). If that surfaces
// unfixable false positives, scope this policy's `mode` or add resource-type
// exclusions rather than abandoning it.
// ---------------------------------------------------------------------------
