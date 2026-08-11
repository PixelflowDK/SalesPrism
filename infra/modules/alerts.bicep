// alerts.bicep — H-5 (2026-08-11) SAD §31.2 alert rules for Sales Prism customer stack.
//
// Implements the seven alerts SAD §31.2 specifies, each in its verified-correct native Azure
// Monitor form (metric alert vs. log-query alert vs. Microsoft.Consumption/budgets) rather than
// forcing all seven into one mechanism. Metric names/dimensions used below were looked up live
// against oai-azurechat-val1/cosmos-azurechat-val1/srch-azurechat-val1/app-azurechat-val1 via
// `az monitor metrics list-definitions` on 2026-08-11 — not assumed. See
// docs/deployment-record.md (2026-08-11, H-5) for that verification trail.
//
// IMPORTANT — telemetry dependency: alert #2 (HTTP 5xx %) is a log-query alert against
// Application Insights' `requests` table. It has NO data to evaluate until SR-010's
// src/instrumentation.ts (Azure Monitor OpenTelemetry Distro) is actually deployed and running —
// as of this file's authoring, that file exists in the working tree but is UNCOMMITTED (verified
// via `git status`), so this dependency is NOT yet satisfied for val1. The other six alerts read
// native Azure Monitor platform metrics or Cost Management data directly and do NOT depend on
// SR-010.
targetScope = 'resourceGroup'

param customerSlug string
param location string
param tags object

@description('Action group email receiver. Default matches CLAUDE.md/task default.')
param alertEmailAddress string = 'kontakt@pixelflow.dk'

@description('Microsoft.Web/sites resource id (app-azurechat-{slug}) — used for the availability webtest target URL.')
param appServiceHostname string

@description('Microsoft.Web/serverfarms resource id (plan-azurechat-{slug}) — CPU alert scope.')
param appServicePlanId string

@description('Microsoft.Insights/components resource id (appi-azurechat-{slug}) — availability + HTTP 5xx log-query alert scope.')
param appInsightsId string

@description('Microsoft.CognitiveServices/accounts resource id (oai-azurechat-{slug}).')
param openAiId string

param chatDeploymentName string
@description('Chat model deployment capacity, 1K TPM units (modules/openai.bicep output).')
param chatModelCapacity int

param embeddingDeploymentName string
@description('Embedding model deployment capacity, 1K TPM units.')
param embeddingModelCapacity int

@description('Microsoft.DocumentDB/databaseAccounts resource id (cosmos-azurechat-{slug}).')
param cosmosId string

@description('Microsoft.Search/searchServices resource id (srch-azurechat-{slug}).')
param aiSearchId string

@description('SAD §17 monthly Azure cost estimate for this customer tier, in the subscription billing currency — used as the Microsoft.Consumption/budgets baseline. NOT a literal daily figure; see the budget resource comment below for why "150% of daily baseline" cannot be expressed natively as a per-resource-group ARM resource.')
param monthlyBudgetAmount int = 1000

@description('First day of the current month (yyyy-MM-01) — Microsoft.Consumption/budgets requires an explicit timePeriod.startDate and rejects inline utcNow() outside a parameter default.')
param budgetStartDate string = utcNow('yyyy-MM-01')

var actionGroupName = 'ag-azurechat-${customerSlug}'

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: actionGroupName
  location: 'global'
  tags: tags
  properties: {
    groupShortName: 'SalesPrism'
    enabled: true
    emailReceivers: [
      {
        name: 'operator'
        emailAddress: alertEmailAddress
        useCommonAlertSchema: true
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// 1. App Service availability < 99% / 5min — METRIC ALERT.
// Requires a synthetic ping test (Microsoft.Insights/webtests) to generate
// the underlying availabilityResults data; the alert itself is a plain
// metric alert on the resulting availabilityResults/availabilityPercentage
// metric (namespace Microsoft.Insights/components, verified live against
// appi-azurechat-val1 — not the more complex WebtestLocationAvailabilityCriteria
// special-case schema, which this deliberately avoids in favor of a literal,
// simpler percentage-over-window match to the SAD wording).
//
// Webtest locations: 'emea-nl-ams-azr' (West Europe/Amsterdam) and
// 'emea-gb-db3-azr' (North Europe/Dublin) — Azure's well-known Application
// Insights availability-test location IDs matching Sales Prism's own two
// primary regions. These IDs could NOT be enumerated via any Azure CLI/REST
// metadata endpoint in this session (checked; no such enumeration endpoint
// was found) — verify via `az deployment group what-if`/`validate` before
// applying (an invalid ID is rejected by ARM validation, not silently
// accepted) — see docs/deployment-record.md for that verification result.
// ---------------------------------------------------------------------------
resource availabilityWebTest 'Microsoft.Insights/webtests@2022-06-15' = {
  name: 'webtest-availability-${customerSlug}'
  location: location
  tags: union(tags, {
    'hidden-link:${appInsightsId}': 'Resource'
  })
  properties: {
    SyntheticMonitorId: 'webtest-availability-${customerSlug}'
    Name: 'webtest-availability-${customerSlug}'
    Enabled: true
    Frequency: 300
    Timeout: 30
    Kind: 'ping'
    RetryEnabled: true
    Locations: [
      { Id: 'emea-nl-ams-azr' }
      { Id: 'emea-gb-db3-azr' }
    ]
    Configuration: {
      WebTest: '<WebTest Name="webtest-availability-${customerSlug}" Enabled="True" CssProjectStructure="" CssIteration="" Timeout="30" WorkItemIds="" xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010" Description="" CredentialUserName="" CredentialPassword="" PreAuthenticate="True" Proxy="default" StopOnError="False" RecordedResultFile="" ResultsLocale=""><Items><Request Method="GET" Version="1.1" Url="https://${appServiceHostname}/" ThinkTime="0" Timeout="30" ParseDependentRequests="False" FollowRedirects="True" RecordResult="True" Cache="False" ResponseTimeGoal="0" Encoding="utf-8" ExpectedHttpStatusCode="200" ExpectedResponseUrl="" ReportingName="" IgnoreHttpStatusCode="False" /></Items></WebTest>'
    }
  }
}

resource availabilityAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-availability-${customerSlug}'
  location: 'global'
  tags: tags
  properties: {
    description: 'SAD §31.2 — App Service availability < 99% over 5 minutes (via Application Insights availability test).'
    severity: 1
    enabled: true
    scopes: [appInsightsId]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    targetResourceType: 'Microsoft.Insights/components'
    targetResourceRegion: location
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          name: 'AvailabilityBelow99'
          metricNamespace: 'Microsoft.Insights/components'
          metricName: 'availabilityResults/availabilityPercentage'
          operator: 'LessThan'
          threshold: 99
          timeAggregation: 'Average'
        }
      ]
    }
    actions: [
      { actionGroupId: actionGroup.id }
    ]
  }
  dependsOn: [availabilityWebTest]
}

// ---------------------------------------------------------------------------
// 2. HTTP 5xx > 5% / 5min — LOG-QUERY ALERT (scheduledQueryRules).
// No native App Service or App Insights metric expresses a 5xx PERCENTAGE
// (Http5xx/Requests on Microsoft.Web/sites are raw counts, not ratios) — the
// correct-form implementation is a KQL query against Application Insights'
// `requests` table. DEPENDS ON SR-010 (src/instrumentation.ts) actually
// running in the deployed app — see this file's header comment for the
// verified-uncommitted status of that dependency as of 2026-08-11.
// ---------------------------------------------------------------------------
resource http5xxAlert 'Microsoft.Insights/scheduledQueryRules@2022-06-15' = {
  name: 'alert-http5xx-${customerSlug}'
  location: location
  tags: tags
  properties: {
    description: 'SAD §31.2 — HTTP 5xx rate > 5% over 5 minutes. Requires SR-010 telemetry (Application Insights requests table) to be flowing.'
    severity: 1
    enabled: true
    scopes: [appInsightsId]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      allOf: [
        {
          query: 'requests | summarize total = count(), errors = countif(toint(resultCode) >= 500) | extend pct = iff(total == 0, 0.0, 100.0 * todouble(errors) / todouble(total)) | project pct'
          timeAggregation: 'Average'
          metricMeasureColumn: 'pct'
          operator: 'GreaterThan'
          threshold: 5
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    actions: {
      actionGroups: [actionGroup.id]
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Azure OpenAI quota > 80% TPM — METRIC ALERT (per deployment).
// TokenTransaction (verified live, dimension ModelDeploymentName exists) is a
// genuine Azure Monitor platform metric — no Log Analytics routing/telemetry
// dependency at all. Threshold = 80% of the deployment's provisioned TPM
// capacity, converted to a token COUNT over the PT5M window:
//   capacity (1K TPM units) * 1000 tokens/min * 5 min * 0.8
// ---------------------------------------------------------------------------
resource chatQuotaAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-openai-quota-chat-${customerSlug}'
  location: 'global'
  tags: tags
  properties: {
    description: 'SAD §31.2 — Azure OpenAI chat deployment (${chatDeploymentName}) token usage > 80% of provisioned TPM over 5 minutes.'
    severity: 2
    enabled: true
    scopes: [openAiId]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          name: 'ChatTokenQuota80Pct'
          metricNamespace: 'Microsoft.CognitiveServices/accounts'
          metricName: 'TokenTransaction'
          dimensions: [
            { name: 'ModelDeploymentName', operator: 'Include', values: [chatDeploymentName] }
          ]
          operator: 'GreaterThan'
          threshold: chatModelCapacity * 4000
          timeAggregation: 'Total'
        }
      ]
    }
    actions: [
      { actionGroupId: actionGroup.id }
    ]
  }
}

resource embeddingQuotaAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-openai-quota-embedding-${customerSlug}'
  location: 'global'
  tags: tags
  properties: {
    description: 'SAD §31.2 — Azure OpenAI embedding deployment (${embeddingDeploymentName}) token usage > 80% of provisioned TPM over 5 minutes.'
    severity: 2
    enabled: true
    scopes: [openAiId]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          name: 'EmbeddingTokenQuota80Pct'
          metricNamespace: 'Microsoft.CognitiveServices/accounts'
          metricName: 'TokenTransaction'
          dimensions: [
            { name: 'ModelDeploymentName', operator: 'Include', values: [embeddingDeploymentName] }
          ]
          operator: 'GreaterThan'
          threshold: embeddingModelCapacity * 4000
          timeAggregation: 'Total'
        }
      ]
    }
    actions: [
      { actionGroupId: actionGroup.id }
    ]
  }
}

// ---------------------------------------------------------------------------
// 4. Cosmos throttling > 10 RU/s — METRIC ALERT.
// "RU/s" is not itself an exposed Azure Monitor metric on
// Microsoft.DocumentDB/databaseAccounts (verified live — no such metric name
// exists). The practical, native equivalent — and what RU exhaustion actually
// manifests as — is a count of HTTP 429 (TooManyRequests) responses. This
// alert therefore fires on TotalRequests filtered to StatusCode=429 > 10 over
// 5 minutes (dimension existence verified live against cosmos-azurechat-val1
// via `az monitor metrics list-definitions`). Documented explicitly as an
// interpretation, not a literal RU/s reading.
// ---------------------------------------------------------------------------
resource cosmosThrottleAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-cosmos-throttling-${customerSlug}'
  location: 'global'
  tags: tags
  properties: {
    description: 'SAD §31.2 — Cosmos DB throttling: > 10 requests with StatusCode 429 (TooManyRequests) over 5 minutes. Interpretation of "RU/s" — see module comment.'
    severity: 2
    enabled: true
    scopes: [cosmosId]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          name: 'CosmosThrottledRequests'
          metricNamespace: 'Microsoft.DocumentDB/databaseAccounts'
          metricName: 'TotalRequests'
          dimensions: [
            { name: 'StatusCode', operator: 'Include', values: ['429'] }
          ]
          operator: 'GreaterThan'
          threshold: 10
          // NOTE: TotalRequests' only supported timeAggregation is 'Count'
          // (verified live via actual deployment 2026-08-11 — a first attempt
          // with 'Total' was rejected by the RP with "Time aggregation must
          // be one of [Count]"; what-if/validate did not catch this, only the
          // real PUT did). 'Count' here counts the number of 429-tagged data
          // points in the window, which for this Count-type/Count-only metric
          // is the correct way to get "how many 429 responses occurred".
          timeAggregation: 'Count'
        }
      ]
    }
    actions: [
      { actionGroupId: actionGroup.id }
    ]
  }
}

// ---------------------------------------------------------------------------
// 5. AI Search 503 > 5% — METRIC ALERT.
// Azure AI Search exposes ThrottledSearchQueriesPercentage natively (verified
// live against srch-azurechat-val1) — a genuine platform percentage metric
// requiring no telemetry routing. 503 is the HTTP status AI Search returns
// when throttling; this metric is the documented native equivalent.
// ---------------------------------------------------------------------------
resource aiSearchThrottleAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-aisearch-throttling-${customerSlug}'
  location: 'global'
  tags: tags
  properties: {
    description: 'SAD §31.2 — AI Search throttled (503) query percentage > 5% over 5 minutes.'
    severity: 2
    enabled: true
    scopes: [aiSearchId]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT5M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          name: 'ThrottledSearchQueriesAbove5Pct'
          metricNamespace: 'Microsoft.Search/searchServices'
          metricName: 'ThrottledSearchQueriesPercentage'
          operator: 'GreaterThan'
          threshold: 5
          timeAggregation: 'Average'
        }
      ]
    }
    actions: [
      { actionGroupId: actionGroup.id }
    ]
  }
}

// ---------------------------------------------------------------------------
// 6. App Service CPU > 85% / 10min — METRIC ALERT.
// ---------------------------------------------------------------------------
resource cpuAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-cpu-${customerSlug}'
  location: 'global'
  tags: tags
  properties: {
    description: 'SAD §31.2 — App Service Plan CPU > 85% over 10 minutes.'
    severity: 2
    enabled: true
    scopes: [appServicePlanId]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT10M'
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          criterionType: 'StaticThresholdCriterion'
          name: 'CpuAbove85Pct'
          metricNamespace: 'Microsoft.Web/serverfarms'
          metricName: 'CpuPercentage'
          operator: 'GreaterThan'
          threshold: 85
          timeAggregation: 'Average'
        }
      ]
    }
    actions: [
      { actionGroupId: actionGroup.id }
    ]
  }
}

// ---------------------------------------------------------------------------
// 7. Cost anomaly > 150% of daily baseline — Microsoft.Consumption/budgets,
// IMPLEMENTED IN ITS CORRECT (MONTHLY) FORM, NOT A LITERAL DAILY ANOMALY
// DETECTOR. Microsoft.Consumption/budgets only supports Monthly/Quarterly/
// Annually/BillingMonth/BillingQuarter/BillingAnnual time grains — there is
// no "Daily" grain, so a true day-level "150% of daily baseline" anomaly
// cannot be expressed as a per-resource-group ARM resource of this type.
// Real day-level cost anomaly detection is a separate Azure Cost Management
// "Anomaly alert" feature, configured at billing-account/subscription scope
// via the Cost Management portal/API — not a Bicep-deployable per-customer
// resource, and out of this task's per-resource-group scope. This resource
// is the closest correct-form deployable primitive: a monthly budget with a
// notification at 150% of the estimated monthly baseline (SAD §17 cost
// model), which is honestly a monthly-threshold alert, not a daily-anomaly
// alert. See docs/known-limitations.md for the gap this leaves.
// ---------------------------------------------------------------------------
resource costBudget 'Microsoft.Consumption/budgets@2023-05-01' = {
  name: 'budget-azurechat-${customerSlug}'
  properties: {
    category: 'Cost'
    amount: monthlyBudgetAmount
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: budgetStartDate
    }
    notifications: {
      actual_GreaterThan_150Pct: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 150
        thresholdType: 'Actual'
        contactEmails: [alertEmailAddress]
      }
    }
  }
}

output actionGroupId string = actionGroup.id
output availabilityWebTestId string = availabilityWebTest.id
