# Solution Architecture Document
## Sales Prism — White-Label AI Chat Platform for Nordic B2B SaaS

**Version:** 2.7 — Dual auth (Entra ID SSO + Entra External ID CIAM), brugergrupper, kunde-admin UI, SMB/Enterprise tiering og white-label som option tilføjet. Fleksibelt bruger-tag-system, flad admin-model, toggle-baseret analytics. v2.7: Tilføjet observability, GDPR-udvidelse, platform ressourcestruktur og kendte tradeoffs. Farvesystem finaliseret (Copper/Moss/Teal).
**Dato:** Juni 2026
**Status:** 🟢 Godkendt — Klar til Phase A
**Domæne:** {customerSlug}-sales360.pixelflow.dk på eksisterende Cloudflare-zone pixelflow.dk — sales-prism.com var aldrig registreret [Korrigeret 2026-07-30]
**Månedligt fee:** 10.000 kr/md per kunde
**Forfatter:** Arkitektursession med Claude (Anthropic)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Business Context and Goals](#2-business-context-and-goals)
3. [Architecture Principles](#3-architecture-principles)
4. [High-Level Architecture Overview](#4-high-level-architecture-overview)
5. [Component 1: Customer Chat Application](#5-component-1-customer-chat-application)
6. [Component 2: Infrastructure — Per-Customer Azure Stack](#6-component-2-infrastructure--per-customer-azure-stack)
7. [Component 3: Networking and Security](#7-component-3-networking-and-security)
8. [Component 4: Identity and Authentication](#8-component-4-identity-and-authentication)
9. [Component 5: RAG — Document Upload and Retrieval](#9-component-5-rag--document-upload-and-retrieval)
10. [Component 6: White-Label Theming System](#10-component-6-white-label-theming-system)
11. [Component 7: Sales Prism Brand Identity](#11-component-7-sales-prism-brand-identity)
12. [Component 8: DNS and Custom Domains](#12-component-8-dns-and-custom-domains)
13. [Component 9: AI Model Architecture](#13-component-9-ai-model-architecture)
14. [Component 10: Provisioning Pipeline — GitHub Actions](#14-component-10-provisioning-pipeline--github-actions)
15. [Component 11: Admin Portal](#15-component-11-admin-portal)
16. [GDPR and EU Data Residency](#16-gdpr-and-eu-data-residency)
17. [Cost Model](#17-cost-model)
18. [Build Phases and Delivery Sequence](#18-build-phases-and-delivery-sequence)
19. [Technology Stack Summary](#19-technology-stack-summary)
20. [Decisions Log](#20-decisions-log)
21. [Operations Runbook](#21-operations-runbook)
22. [Backup og Disaster Recovery](#22-backup-og-disaster-recovery)
23. [GitHub Repository-Struktur](#23-github-repository-struktur)
24. [Azure Subscription-Struktur](#24-azure-subscription-struktur)
25. [Navngivningskonventioner og Tagging](#25-navngivningskonventioner-og-tagging)
26. [Persona-Retningslinjer](#26-persona-retningslinjer)

---

## 1. Executive Summary

Sales Prism er en white-label, multi-tenant AI chat SaaS-platform målrettet nordiske B2B-virksomheder. Platformen giver hver kunde en fuldt branded, privat AI-assistent der kører på dokumenter og data kunden uploader — med en hård garanti for at ingen kundedata nogensinde deles med, er tilgængelig for eller kan ses af andre kunder.

Fundamentet er den open-source `microsoft/azurechat` accelerator (MIT-licens), udvidet med:
- Et produktionsklart white-label UI-lag med Sales Prism brand
- En fleksibel multi-model AI-arkitektur (GPT-4.1, Phi-4, Claude, Mistral m.fl.)
- En fuldt automatiseret per-kunde provisionerings-pipeline
- Et React admin portal til Sales Prism operatørteamet

Hvert kunde-deployment er en fuldstændig isoleret Azure-stak — dedikeret compute, dedikeret AI, dedikeret storage, dedikeret netværk — provisioneret automatisk fra én GitHub Actions workflow på under 20 minutter uden manuelle trin efter den indledende formular.

**Pris:** 10.000 kr/md per kunde (fast SaaS-fee)
**Platform-identitet:** Built by Sales Coach · Powered by InsightCast · sales-prism.com
**Arbejdsnavn:** Coach 360 (endeligt produktnavn afventer aftale med Carsten Hoelstad)

---

## 2. Business Context and Goals

### 2.1 Produktet

En ChatGPT-lignende webapplikation, deployed per kunde, der:

- Lader medarbejdere chatte med en AI-assistent i en velkendt, poleret grænseflade
- Lader medarbejdere uploade private virksomhedsdokumenter (PDF, DOCX, XLSX, PPTX) og stille spørgsmål til dem
- Er branded med kundens logo, farver og fonte — inklusiv dark mode
- Tilgås på `kundenavn.sales-prism.com`
- Styres af en kunde-specifik systemprompt (Persona) der definerer AI'ens rolle, sprog og grænser
- Bruger Sales Prism brand-identiteten til platform-shellen (sidebar, navigation, admin-elementer)

### 2.2 Operatørmodellen

Sales Prism (ISV'en) holder og driver alle Azure-ressourcer i sit eget Azure-tenant. Kunder har ingen Azure-konti eller Azure-adgang — de modtager en URL og logger ind med deres eksisterende Microsoft 365 (Entra ID) credentials.

**Prismodel:** Fast månedligt fee på **10.000 kr/md** per kunde. Azure-infrastrukturomkostninger absorberes af Sales Prism og er bygget ind i prisen.

### 2.3 Kernekrav — Ufravigelige

| # | Krav | Begrundelse |
|---|---|---|
| R1 | Alle Azure-ressourcer deployes i `northeurope` eller `westeurope` | GDPR EU-dataopbevaring |
| R2 | Azure OpenAI bruger Data Zone Standard (EUR) — aldrig Global Standard | GDPR — forhindrer datarouting udenfor EU |
| R3 | Ingen API-nøgler, adgangskoder eller hemmeligheder lagres nogensinde | Zero-secrets arkitektur |
| R4 | Hver kunde: fuldt isoleret resource group og stak | Absolut dataisolation |
| R5 | Provisioning fuldt automatiseret via GitHub Actions + OIDC | Reproducerbar, reviderbar |
| R6 | White-label med kundebrand inkl. dark mode | Kerneprodukt-krav |
| R7 | Privat netværk (VNet + Private Endpoints) fra dag 1 | Enterprise-sikkerhedsbaseline |
| R8 | AI-model konfigurerbar per kunde (Standard / Professional / Enterprise) | Omkostnings- og kvalitetsfleksibilitet |

---

## 3. Architecture Principles

**Isolation over effektivitet.** Alle kunderessourcer er dedikerede. Delt infrastruktur bruges aldrig, hvor det skaber risiko for datablanding.

**Zero secrets.** Ingen adgangskoder, API-nøgler eller connection strings eksisterer i systemet. Al Azure-til-Azure kommunikation bruger managed identity. Al CI/CD bruger OIDC kortlivede tokens.

**Automatisér alt.** Ethvert trin der kan udtrykkes som kode, skal være kode.

**EU som standard, altid.** Enhver ressource oprettet af pipeline'en er låst til `northeurope` eller `westeurope`. Azure Policy håndhæver dette som en hård gardering.

**Model-fleksibilitet.** AI-modellagret er abstraheret via Vercel AI SDK v6. Enhver model-tier kan tildeles per kunde og ændres uden arkitektoniske ændringer.

**Brand-first.** Sales Prism brand-identiteten styrer alt platform-UI. Kundebrand gælder inden for chat-applikationslaget.

---

## 4. High-Level Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                   SALES PRISM AZURE TENANT                        │
│                                                                   │
│  ┌──────────────────┐    ┌──────────────────────────────────┐    │
│  │   ADMIN PORTAL   │───▶│      GITHUB ACTIONS PIPELINE     │    │
│  │  (intern adgang) │    │  provision-customer.yml          │    │
│  │  Next.js / Entra │    │  OIDC → Azure + Cloudflare API   │    │
│  │  Sales Prism UI  │    └──────────┬───────────────────────┘    │
│  └──────────────────┘               │ deployer per kunde          │
│                       ┌─────────────┼──────────────────┐         │
│                       │             │                  │         │
│  ┌────────────────┐  ┌▼────────────┐  ┌───────────────▼┐        │
│  │rg-azurechat-dsv│  │rg-azurechat │  │rg-azurechat    │        │
│  │                │  │-microsoft   │  │-novo           │        │
│  │ App Service    │  │ App Service │  │ App Service    │        │
│  │ OpenAI/model   │  │ OpenAI/model│  │ OpenAI/model   │        │
│  │ AI Search B    │  │ AI Search B │  │ AI Search B    │        │
│  │ Cosmos DB      │  │ Cosmos DB   │  │ Cosmos DB      │        │
│  │ Key Vault      │  │ Key Vault   │  │ Key Vault      │        │
│  │ VNet + PEs     │  │ VNet + PEs  │  │ VNet + PEs     │        │
│  └────────────────┘  └─────────────┘  └────────────────┘        │
│         ▲                  ▲                  ▲                   │
└─────────┼──────────────────┼──────────────────┼───────────────────┘
          │                  │                  │
  dsv.sales-prism.com  microsoft.sales-prism.com  novo.sales-prism.com
              (Cloudflare DNS — proxied, DDoS-beskyttelse, WAF)
```

---

## 5. Component 1: Customer Chat Application

### 5.1 Foundation

Fork af `microsoft/azurechat` (MIT-licens) — Next.js/TypeScript med:
- ChatGPT-lignende webgrænseflade
- Dokument-upload og RAG ("Chat with Your Files")
- Persona/systemprompt-administration
- Entra ID-godkendelse
- Cosmos DB chat-historik
- Azure AI Search-integration
- Multi-model AI-integration

Udvidet med: Sales Prism white-label UI-lag, multi-model support, CSS variable-theming.

### 5.2 Technology Stack

| Lag | Teknologi |
|---|---|
| Framework | Next.js 15, App Router, TypeScript |
| UI-komponenter | `assistant-ui` + shadcn/ui + Radix UI |
| AI-streaming | Vercel AI SDK v6 (`ai`, `@ai-sdk/azure`) — **erstatter azurechats custom OpenAI SDK streaming** |
| Godkendelse | NextAuth v4 + Entra ID (fra azurechat — opgradering til Auth.js v5 er udskudt) |
| Styling | Tailwind CSS + CSS custom properties |
| Chat-historik | Azure Cosmos DB (serverless) |
| Dokument-RAG | Azure AI Search Basic + Azure Document Intelligence |
| AI-inferens | Azure OpenAI Direct Models — GPT-4.1 mini / GPT-4.1 / GPT-4o |
| Identitet | Managed Identity (DefaultAzureCredential) via `USE_MANAGED_IDENTITIES=true` |

**Vigtigt ved fork:** azurechat bruger `openai ^4.x` SDK med custom `ReadableStream` SSE-streaming og ingen Vercel AI SDK. Ved fork erstattes dette komplet med Vercel AI SDK v6 + `@ai-sdk/azure`. `@azure/openai ^2.0.0-beta.2` (beta-pakke) fjernes. Dette er en bevidst beslutning der giver native `assistant-ui`-kompatibilitet og multi-model support uden custom vedligeholdelsesansvar.

### 5.3 Nøgleadfærd

**Tenant-opløsning:** `Host`-header → subdomain-slug (`dsv` fra `dsv.sales-prism.com`) → kundekonfiguration fra Cosmos DB.

**Streaming:** Kun Route Handlers. `streamText()` → `toDataStreamResponse()`. Aldrig Server Actions (3-sekunders timeout-grænse).

**Speech-to-Text pipeline:**
```
Bruger taler (mikrofon-ikon i chat-input)
    ↓
Browser MediaRecorder API optager audio
    ↓
POST /api/speech → Next.js API route
    ↓
Azure AI Speech Service (northeurope) → rå transskription
    ↓
POST /api/speech/clean → GPT-4.1 mini post-processing
  - Fjerner fyldeord (øhh, altså, ikk)
  - Retter sætningsstruktur
  - Kategoriserer: møde-opdatering | kunde-obs | spørgsmål | fri chat
    ↓
Renset tekst indsættes i inputfeltet (redigérbar)
    ↓
Bruger godkender og sender
```
Azure Speech resource provisioneres per kunde i samme region som App Service.
Audio forlader aldrig browseren direkte — alt går via Next.js API route.
Web Speech API bruges IKKE — audio ville routes til Google/Apples servere (GDPR-brud).

**Zero secrets:** `DefaultAzureCredential` fra `@azure/identity` til alle Azure-servicekald. Ingen API-nøgle i App Service-indstillinger.

**Dokumentisolation:** Hver kunde har en dedikeret Azure AI Search-ressource og -indeks. Ingen delt indeks. Fysisk adskillelse — ikke filtrering.

---

## 6. Component 2: Infrastructure — Per-Customer Azure Stack

### 6.1 Resource Group-mønster

```
rg-azurechat-{kunde-slug}
```

Én resource group per kunde. Alle data, compute og netværk for den pågældende kunde lever udelukkende inden for denne. Sletning af resource group fjerner alle kundedata uden nogen effekt på andre kunder.

### 6.2 Ressourcer Deployed Per Kunde

| Ressource | SKU | Ca. DKK/md | Formål |
|---|---|---|---|
| App Service Plan | B3 (standard) / P1v3 (performance) | 185 / 385 kr | Compute |
| App Service (Linux, Node) | — | inkl. | Next.js applikationshost |
| Azure OpenAI Service | Konfigurerbar | 110–1.540 kr | AI-inferens (se Component 9) |
| Azure AI Search | **Basic** (standard) / Standard S1 | **385 / 1.190 kr** | Vector + keyword RAG |
| Azure Cosmos DB | Serverless | 50–100 kr | Chat-historik + tema-config |
| Azure Key Vault | Standard | 14 kr | Cloudflare-cert + evt. tredjepartshemmeligheder |
| Azure Document Intelligence | S0 | 21–70 kr | PDF/Office dokumentparsing |
| Azure Storage Account | Standard LRS | 14–35 kr | Dokument-blob-storage |
| Application Insights | — | 21–35 kr | Telemetri |
| VNet + 5× Private Endpoints | — | 70 kr | Privat netværk |

### 6.3 AI Search Tier-beslutning

**Basic-tier er standard.** Den understøtter hybrid søgning, vector søgning og Semantic Ranker. Kapacitet tilstrækkelig for de fleste B2B-dokumentsamlinger — verificér aktuelle grænser i Azure Pricing Calculator (Microsoft justerer løbende).

Opgraderingssti til Standard S1 er én Bicep-parameter + re-deployment, fuldt automatiseret:

```bicep
param aiSearchSku string = 'basic'  // 'basic' | 'standard'
```

Trigger for opgradering: aktiv dokumentbrug nærmer sig ~12 GB (Basic-tier giver 15 GB storage + 5 GB vector quota for services oprettet efter april 2024), eller synlig latens under høj concurrent query-belastning.

### 6.4 RBAC Rolle-tildelinger (Zero Secrets)

| Service | Rolle på App Service Managed Identity |
|---|---|
| Azure OpenAI | `Cognitive Services OpenAI User` |
| Azure AI Search | `Search Index Data Contributor`, `Search Service Contributor` |
| Azure Cosmos DB | `Cosmos DB Built-in Data Contributor` |
| Azure Key Vault | `Key Vault Secrets User` |
| Azure Storage | `Storage Blob Data Contributor` |
| Azure Document Intelligence | `Cognitive Services User` |

### 6.5 ZDR-status [Korrigeret 2026-08-11 — SR-006]

**Der findes ingen ZDR-parameter i Bicep-templaten.** En `enableZeroDataRetention bool = false`
parameter blev tidligere deklareret i `infra/main.bicep` men blev aldrig sendt videre til
`modules/openai.bicep`, og intet `Microsoft.CognitiveServices/accounts`-property i de API-versioner
dette repo bruger implementerer ZDR. Parameteren blev fjernet (SR-006, 2026-08-11) — se
`docs/known-limitations.md` og `docs/gdpr-erasure-evidence.md` §6 for den fulde sporing.

**Hvad ZDR faktisk kræver:** Azure OpenAI Zero Data Retention er en konto-niveau-tildeling som
Microsoft giver efter en Limited Access Program-ansøgning — ikke en deploybar Bicep/ARM-property.
Processen forbliver: operatør ansøger Microsoft → godkendelse 1–4 uger → Microsoft aktiverer ZDR
for den godkendte `oai-azurechat-{slug}`-konto ud-af-båndet. Der findes ikke i dag noget kodested i
dette repo der skal (eller kan) ændres for at aktivere det — godkendelsen alene er den fulde
mekanisme, indtil Microsoft dokumenterer andet.

**Indtil en ansøgning er godkendt for en specifik kundekonto** kører alle `oai-azurechat-{slug}`-konti
på Microsofts standard 30-dages misbrugsovervågnings-stikprøve (`raiMonitorConfig: null`, verificeret
live på `oai-azurechat-val1`). Dette skal oplyses eksplicit til enhver kundes juridiske team, ikke
fremstilles som en løst/valgfri bekymring — se `docs/gdpr-erasure-evidence.md`.

**Sælg ikke ZDR som "klar fra dag 1"** før en reel Microsoft-godkendelse er opnået for den
pågældende kundekonto.

### 6.6 Azure OpenAI Kvotelægning

Indsend kvoteforøgelsesansøgning til Microsoft **inden kunde 8**. Gratis, tager 2–5 hverdage. Planlæg proaktivt.

---

## 7. Component 3: Networking and Security

### 7.1 Privat Netværksarkitektur

Alle kunde-deployments bruger fuldt privat netværk fra dag 1.

```
Internet
    │
    ▼
Cloudflare (proxied — DDoS, WAF, TLS-terminering)
    │
    ▼
App Service — public inbound (kun via Cloudflare)
    │  VNet Integration (outbound)
    ▼
Virtual Network: 10.0.0.0/24
    ├── Subnet: integration   10.0.0.0/26   ← App Service outbound
    └── Subnet: privatelink   10.0.64.0/26  ← Private Endpoints
              ├── → Azure OpenAI
              ├── → Azure AI Search
              ├── → Azure Cosmos DB
              ├── → Azure Key Vault
              └── → Azure Storage
```

**IP-strategi:** Alle kunde-VNets bruger samme adresserum (`10.0.0.0/24`). Sikkert fordi der ikke er VNet-peering, intet hub VNet og ingen kunde-VPN. Ingen IPAM-proces nødvendig.

**vnetRouteAllEnabled — vigtigt:** App Service VNet Integration router som standard kun RFC1918-trafik (10.x, 172.16.x, 192.168.x) igennem VNet. Private Endpoints har RFC1918-adresser og nås derfor korrekt uden yderligere konfiguration. Dog skal `vnetRouteAllEnabled: true` sættes i Bicep for at tvinge **al** udgående trafik (inkl. Cloudflare API, GitHub, eksterne services) igennem VNet — dette er påkrævet for et fuldt GDPR-forsvarligt setup hvor ingen trafik må gå direkte til internet udenom VNet.

```bicep
resource appServiceVnetConfig 'Microsoft.Web/sites/config@2022-09-01' = {
  name: 'web'
  parent: appService
  properties: {
    vnetRouteAllEnabled: true   // ← Alle udgående flows via VNet
  }
}
```

**SCM/Kudu og GitHub Actions deployment:** Hvis public network access låses ned på App Service, kan GitHub Actions' offentlige runners ikke nå SCM/Kudu-endpointet (`appname.scm.azurewebsites.net`). Løsning: Bicep-templaten konfigurerer App Service med **Access Restrictions** der tillader GitHub Actions IP-ranges på SCM-endpointet, mens al anden public inbound blokeres. Alternativt bruges ZIP-deploy via Run-from-Package til en privat Storage Account.

### 7.2 TLS — Cloudflare Origin Certificate

Cloudflare proxy aktiveret (`proxied: true`):
- App Service Managed Certificates kan **ikke** bruges — Cloudflare terminerer TLS før Azure
- **Cloudflare Origin Certificate** genereres via Cloudflare API under provisioning som PEM-format
- **PFX-konvertering er påkrævet:** App Service kræver PFX (PKCS#12) med privat nøgle. Provisioning-workflowet konverterer automatisk:
  ```bash
  openssl pkcs12 -export \
    -in origin-cert.pem \
    -inkey origin-key.pem \
    -out origin-cert.pfx \
    -passout pass:$(openssl rand -base64 32)
  ```
- PFX og adgangskode lagres i kunde-Key Vault
- Certifikatet installeres og bindes til custom hostname på App Service
- Cloudflare SSL-tilstand: **Full (strict)** — Cloudflare validerer origin-certifikatet
- Brugeren ser et gyldigt Cloudflare-udstedt offentligt certifikat — ingen browseradvarsler
- **X-Forwarded-Proto:** Next.js-applikationen skal læse `X-Forwarded-Proto`-headeren for at detektere HTTPS (App Service terminerer TLS ved load balancer og leverer HTTP til applikationskoden)
- Hele flowet er automatiseret i provisioning-workflowet

### 7.2a App Service ingress-restriktion (H-2, implementeret 2026-08-11)

**Fundet:** `app-azurechat-{slug}.azurewebsites.net` er, uanset Cloudflare-opsætningen ovenfor,
altid et separat, offentligt tilgængeligt hostname på selve App Service-ressourcen — Azure
publicerer det automatisk og kan ikke slås fra. Uden en eksplicit ingress-restriktion kan enhver,
der gætter eller opdager dette hostname, nå origin **direkte**, fuldstændig uden om Cloudflares
WAF, rate limiting og DDoS-beskyttelse fra §7.3's tabel.

**Fix:** `modules/app-service.bicep` sætter nu `siteConfig.ipSecurityRestrictions` til Cloudflares
publicerede IP-ranges (hentet fra `https://www.cloudflare.com/ips-v4` og `/ips-v6`, pinnet med
dateret kommentar i kildekoden) med `ipSecurityRestrictionsDefaultAction: 'Deny'`, styret af en ny
parameter `restrictIngressToCloudflare bool = true` (default sand for alle kunder).

**val1-undtagelse (bevidst, dateret):** val1 kører i dag **uproxied** (Cloudflare DNS-only, ikke
orange-cloud) med et App Service-administreret certifikat — ikke §7.2's Origin Certificate +
Full-strict-opsætning. At aktivere restriktionen på val1 ville øjeblikkeligt givet 502, fordi
val1's trafik ikke ankommer via Cloudflares edge-IP'er i dag. `restrictIngressToCloudflare` er
derfor sat eksplicit til `false` for val1 alene i `infra/environments/validation.bicepparam`, med
dateret kommentar der. **Ingen produktionskunde må bruge denne undtagelse** — en produktionskunde
skal først have Cloudflare-proxy + Origin Certificate (§7.2) på plads, hvorefter restriktionen kan
stå på sin sande default. Se `docs/known-limitations.md` for status og oprydningsplan.

**SCM/Kudu (deployment-endpoint):** bevidst IKKE omfattet af samme restriktion — Cloudflare
proxier ikke `*.scm.azurewebsites.net`, så at genbruge Cloudflare-listen der ville blokere alle
reelle deployment-veje (`az webapp deploy`, den kommende `provision-customer.yml` GitHub Actions
pipeline). SCM-hærdning (GitHub Actions' egne IP-ranges, jf. tabellen i decisions-loggen) er et
separat, bevidst udskudt arbejde — se `docs/known-limitations.md`.

### 7.3 Sikkerhedsoversigt

| Angrebsflade | Afbødning |
|---|---|
| Internet → Azure OpenAI | ❌ Blokeret — kun Private Endpoint |
| Internet → Cosmos DB | ❌ Blokeret — kun Private Endpoint |
| Internet → AI Search | ❌ Blokeret — kun Private Endpoint |
| Internet → Key Vault | ❌ Blokeret — kun Private Endpoint |
| Internet → `app-azurechat-{slug}.azurewebsites.net` (uden om Cloudflare) | ✅ Blokeret pr. 2026-08-11 (H-2) — `ipSecurityRestrictions` begrænset til Cloudflares IP-ranges, default-deny. **Undtagelse: val1** kører stadig helt åbent (uproxied, dokumenteret bevidst — se §7.2a) |
| DDoS mod kundesubdomæne | ✅ Cloudflare absorberer (kun for kunder med `restrictIngressToCloudflare: true` OG aktiv Cloudflare-proxy — se §7.2a) |
| Credential-tyveri | N/A — ingen credentials eksisterer |
| Cross-kunde dataadgang | ❌ Umuligt — separate fysiske ressourcer |

---

## 8. Component 4: Identity, Authentication og Brugeradministration

### 8.1 Dual Auth Model

Sales Prism understøtter to autentificeringsmetoder. Valget træffes **én gang ved onboarding** og er per kunde — ikke per bruger. Begge metoder bruger NextAuth som middleware.

```
Onboarding valg:
├── Entra ID SSO        → Kunden har Microsoft 365
└── Username/Password   → Kunden har ikke Microsoft 365
```

### 8.2 Auth Method A — Entra ID SSO

Til kunder med eksisterende Microsoft 365-miljø.

- Kundens medarbejdere logger ind med deres eksisterende Entra ID-konti via OAuth2
- Entra App Registration oprettes automatisk per kunde under provisioning
- Ingen brugeroprettelse nødvendig — Entra ID er source of truth
- Login-side branding: kundens logo, baggrundsbillede, tekst
- Bemærk: Custom CSS ikke tilgængeligt for Entra-tenants oprettet efter 5. januar 2026

### 8.3 Auth Method B — Username/Password (Entra External ID CIAM)

Til kunder uden Microsoft 365. Håndteres via **én central Entra External ID tenant** ejet og administreret af InsightCast — ikke per-kunde.

**Valg af Entra External ID frem for Cosmos DB + bcrypt:**
- Microsoft håndterer password-storage, hashing, brute-force protection og MFA
- Self-service password reset og velkomstmail er indbygget out-of-the-box
- GDPR: Microsoft er databehandler for credentials — DPA medfølger
- Pris: 50.000 MAU gratis — i praksis gratis for alle B2B-deployments

**Onboarding flow:**
```
InsightCast opretter bruger via Microsoft Graph API
    ↓
Entra External ID sender automatisk branded velkomstmail
    ↓
Bruger klikker link → sætter sit eget password
    ↓
Bruger logger ind via NextAuth credentials provider
    ↓
Kunde-admin kan administrere brugere via Sales Prism admin-UI
```

**Sikkerhedsmodel — central tenant:**
- Én Entra External ID tenant for alle username/password-kunder
- Kundedata isoleres via `tenantSlug`-attribut på hver bruger
- Ingen kunde kan se andre kunders brugere — isolation via Graph API queries filtreret på slug
- InsightCast er tenant-owner og eneste med global admin-adgang
- Kunde-admins har kun adgang til egne brugere via Sales Prism admin-UI (ikke direkte Entra-adgang)

### 8.4 Brugergrupper — Fleksibelt Tag-system

Brugergrupper modelleres som et fleksibelt tag-system. Hver kunde definerer selv hvilke dimensioner der er relevante — antal dimensioner er ubegrænset.

**Eksempel DSV:** `{ land: "Danmark", by: "Hedehusene", afdeling: "Sales Operations" }`
**Eksempel lille kunde:** `{ afdeling: "Indkøb" }`

**Admin-rettigheder — flad model:** Alle admins er flade og kan se/administrere alle brugere uanset tags. Tags bruges til filtrering og rapportering, ikke adgangsstyring.

**Cosmos DB bruger-schema:**
```json
{
  "id": "usr-lars-nielsen",
  "tenantSlug": "dsv",
  "displayName": "Lars Nielsen",
  "email": "lars.nielsen@dsv.com",
  "role": "user",
  "authMethod": "entra-sso",
  "tags": { "land": "Danmark", "by": "Hedehusene", "afdeling": "Sales Operations" },
  "createdAt": "2026-06-01T09:00:00Z",
  "lastLoginAt": "2026-06-10T14:23:00Z",
  "status": "active"
}
```

### 8.5 Kunde-Admin UI

Dedikeret admin-sektion inden for samme app — `/admin`-ruten for brugere med `admin`-rolle.

**Brugeradministration — alle tiers:**
- Brugertabel med soegning og filtrering paa tags
- Oprette ny bruger (trigger velkomstmail automatisk)
- Redigere bruger (navn, email, tags, rolle)
- Deaktivere/genaktivere bruger
- Resette password (trigger reset-mail)
- Administrere tag-dimensioner (opret/omdoeb/slet tag-kategorier)
- Tildele og fjerne tags per bruger

**Admin kan ikke:** Se andre kunders brugere, aendre platform-konfiguration, tilgaa Entra External ID direkte.

**Implementering:** Next.js route group `src/app/(admin)/`, middleware validerer `admin`-rolle, alle Graph API-kald server-side med managed identity.

### 8.6 Brugerstatistik og Analytics — Toggle-baseret

Statistik-modulet bygges een gang og aktiveres via `features.userAnalytics` i Cosmos DB.
Default: `true` for Enterprise, `false` for SMB. Kan toendes individuelt uden re-deployment.

**Statistik per bruger:**

| Metric | Kilde |
|---|---|
| Oprettelsesdato | Cosmos DB `createdAt` |
| Seneste login | Cosmos DB `lastLoginAt` |
| Dage siden seneste login | Beregnet |
| Status | Aktiv / Inaktiv (30+ dage ingen aktivitet) |
| Antal prompts — total | Aktivitets-log |
| Antal prompts — denne maaned | Aktivitets-log |
| Antal dokumenter uploadet | Upload-log |
| Gennemsnitlig sessionsvarighed | Session-log |
| Tokens forbrugt — total | Aktivitets-log |

**Statistik aggregeret paa tag-niveau:**
- Prompts per afdeling/land/by
- Top 10 mest aktive brugere
- Inaktive brugere (30+ dage)
- Dokument-upload volumen per tag-dimension
- Daglig/ugentlig aktive brugere

**Analytics route-struktur:**
```
/admin
+-- /users      Brugertabel + opret/rediger/deaktiver
+-- /groups     Tag-dimensioner og filtrerede visninger
+-- /analytics  [features.userAnalytics] Dashboard
|   +-- Overview    Samlet aktivitet, aktive brugere
|   +-- Users       Per-bruger statistik med sortering
|   +-- Export      CSV-export af alle metrics
+-- /settings   Tenant-konfiguration
```

**Cosmos DB aktivitets-tracking schema:**
```json
{
  "id": "evt-{uuid}",
  "tenantSlug": "dsv",
  "userId": "usr-lars-nielsen",
  "eventType": "prompt | login | upload | session-end",
  "timestamp": "2026-06-10T14:23:00Z",
  "metadata": {
    "sessionId": "sess-{uuid}",
    "promptLength": 142,
    "tokensUsed": 847,
    "modelTier": "standard"
  }
}
```

---

## 9. Component 5: RAG — Document Upload and Retrieval

### 9.1 Pipeline

```
1. Bruger uploader fil (PDF, DOCX, XLSX, PPTX, HTML) via chat-UI
2. Azure Document Intelligence udtrækker tekst (inkl. OCR for scannede PDFs)
3. Tekst chunkes — 512–1.024 tokens, 15% overlap, semantiske grænser
4. Azure OpenAI embedding-model genererer vektor per chunk
5. Chunks + vektorer lagres i kundens dedikerede AI Search-indeks
6. Ved forespørgsel: brugerbesked → embed → hybrid søgning (vektor + BM25 keyword)
7. Semantic Ranker rangerer top-resultater igen
8. Top-K chunks injiceres i modellens kontekstvindue
9. Modellen genererer grundet svar med kildehenvisninger
```

### 9.2 Nøglebeslutninger

**Dedikeret indeks per kunde.** Fysisk ressourceadskillelse — ikke filtrering.

**Hybrid søgning altid.** Vektor + BM25 via Reciprocal Rank Fusion.

**Semantic Ranker aktiveret.** Tilgængelig på Basic-tier. Forbedrer markant kvaliteten af top-K.

**Hallucinationsforebyggelse.** Alle deployments' systemprompt instruerer modellen i udelukkende at svare baseret på hentet kontekst og returnere "Jeg har ikke nok information til at besvare det" når konteksten er utilstrækkelig.

---

## 10. Component 6: White-Label Theming System og Platform Tiering

### 10.1 Platform Tiering Model

Sales Prism tilbydes i to tiers. Valget træffes ved onboarding og styrer hvad kunden ser og kan.

| | **SMB / Professional** | **Enterprise** |
|---|---|---|
| **Branding** | Sales Prism brand — logo, farver, typografi | Fuldt white-label — kundens eget logo, farver, typografi |
| **Custom domæne** | ✅ `{slug}.sales-prism.com` (automatiseret) | ✅ `{slug}.sales-prism.com` eller kundens eget domæne |
| **Brugere** | Ubegrænset | Ubegrænset |
| **Auth** | Entra ID SSO eller Username/Password | Entra ID SSO eller Username/Password |
| **Brugeradmin** | ✅ Inkluderet | ✅ Inkluderet |
| **Læringsmoduler** | ✅ Inkluderet | ✅ Inkluderet |
| **AI-model tier** | Standard eller Professional | Standard, Professional eller Enterprise |
| **Cosmic DB tema-config** | `whiteLabel: false` | `whiteLabel: true` |

**Bemærk om custom domæne på SMB-tier:** Da Cloudflare DNS-automatisering allerede er en del af provisioning-pipelinen, er der ingen teknisk meromkostning ved at give SMB-tier `{slug}.sales-prism.com`. Kunder der ønsker et helt eget domæne (fx `ai.dsv.com`) kræver Enterprise-tier og manuel DNS-opsætning hos kunden.

### 10.2 White-Label Theming Arkitektur

CSS custom properties injiceret ved runtime af en React `ThemeProvider`. Nul rebuild ved temaændring. Theming er kun aktivt for Enterprise-tier kunder — SMB-kunder ser altid Sales Prism standard-tema.

```
Besøg dsv.sales-prism.com
    ↓
Next.js root layout læser "dsv" fra Host-header
    ↓
Hent TenantTheme JSON fra Cosmos DB
    ↓
if (whiteLabel === true):
    <ThemeProvider> injicerer kundens CSS-variabler i :root
else:
    <ThemeProvider> injicerer Sales Prism standard-tema
    ↓
Alle komponenter afspejler korrekt tema øjeblikkeligt
```

### 10.3 TenantTheme Cosmos DB Schema

```json
{
  "tenantSlug": "dsv",
  "tier": "enterprise",
  "whiteLabel": true,
  "authMethod": "entra-sso",
  "theme": {
    "primary": "#003B5C",
    "background": "#FFFFFF",
    "foreground": "#0E0E0E",
    "fontDisplay": "DSV Sans, Arial, sans-serif",
    "fontBody": "Inter, sans-serif",
    "logoUrl": "https://cdn.sales-prism.com/logos/dsv.svg",
    "faviconUrl": "https://cdn.sales-prism.com/favicons/dsv.ico"
  },
  "darkMode": {
    "primary": "#4A9CC8",
    "background": "#0E1A24",
    "foreground": "#F7F5F0"
  }
}
```

SMB-tier Cosmos DB schema:
```json
{
  "tenantSlug": "smallco",
  "tier": "smb",
  "whiteLabel": false,
  "authMethod": "username-password",
  "theme": null
}
```

### 10.4 Dark Mode

Lys og mørk variant defineret for hvert tema (Enterprise) eller Sales Prism standard (SMB). Systempræference er standard med brugerstyret toggle.

### 10.5 Prebuilt Temaer (Enterprise reference)

| Tema | Primær | Baggrund | Overskrifter | Brødtekst | Målgruppe |
|---|---|---|---|---|---|
| **Sales Coach** | `#DB672A` burnt orange | `#FFFFFF` | Times New Roman | Hind Siliguri | IT-salgsprofessionelle |
| **InsightCast** | `#FAD28C` varm guld | `#FFFFFF` | Erode serif | Inter | Analytics/intelligence |
| **Sales Prism** | `#C9A84C` guld | `#F7F5F0` | Playfair Display | DM Sans | Standard platform-tema (SMB) |

Yderligere Enterprise-kundtemaer oprettes via admin portal temaeditor — lagres i Cosmos DB, live ved næste sideindlæsning.

---

## 11. Component 7: Sales Prism Brand Identity

Alle detaljer udtrukket fra den officielle Sales Prism Brand Identity Guide (v1.0, Juni 2026).

### 11.1 Brand Foundation

| Element | Værdi |
|---|---|
| **Platformnavn** | Sales Prism |
| **Tagline** | *See your customers in full colour* |
| **Bygget af** | Sales Coach |
| **Drevet af** | InsightCast |
| **Domæne** | sales-prism.com |
| **Brand-version** | v1.0, Juni 2026 |

**Mission:** Giv salgsteams forberedelsen, strukturen og indsigten til at have bedre kundesamtaler — forankret i dokumenteret metodik.

**Brand-arketype:** Mentoren — viis, struktureret, muliggørende.

**Kerneværdier:** Klarhed · Struktur · Empati · Vækst

### 11.2 Farvesystem

> **[2026-07-30] Bemærk:** Guld-paletten nedenfor er erstattet af det finaliserede farvesystem i Decisions Log (Copper Fjord #B86A4B / Nordic Moss #5E6B5B / Fjord Teal #258D85 / Warm Stone #807571, valideret i Google Stitch 14. juni 2026). Se DESIGN.md.

**Primær palette:**

| Token | Hex | Navn | Anvendelse |
|---|---|---|---|
| `--color-primary` | `#0E0E0E` | Prism Black | Primær tekst, mørke baggrunde, hero-sektioner |
| `--color-accent` | `#C9A84C` | Prism Gold | CTA'er, labels, accenter, logo-mærke |
| `--color-accent-light` | `#E8C97A` | Prism Gold Light | Hover-tilstande, kursiv-fremhævning på mørk baggrund |
| `--color-secondary` | `#2C3E50` | Prism Slate | Sekundær tekst, nedtonede overskrifter |
| `--color-secondary-mid` | `#405265` | Prism Slate Mid | Underoverskrifter, sekundære UI-elementer |
| `--color-background` | `#F7F5F0` | Prism White | Sidebaggrund — varm off-white, aldrig ren hvid |
| `--color-surface` | `#FFFFFF` | White | Kort, inputs, modaler |
| `--color-border` | `#D8D4CC` | — | Borders, skillelinjer |
| `--color-muted` | `#8A8A8A` | — | Pladsholdertekst, sekundære labels |

**De 7 Spektrumfarver** (kun til datavisualisering, modeldiagrammer og UI-accenter — aldrig som primære brandfarver):

| Token | Hex | Farve | Repræsenterer |
|---|---|---|---|
| `--ray-1` | `#7F77DD` | Lilla | Model 01 — 1. & 2. Position |
| `--ray-2` | `#1D9E75` | Grøn | Model 02 — 360° Kundeforståelse |
| `--ray-3` | `#378ADD` | Blå | Model 03 — Personas |
| `--ray-4` | `#EF9F27` | Amber | Model 04 — Værdisamtale |
| `--ray-5` | `#D85A30` | Koral | Model 05 — Hvorfor–Hvad–Hvordan–Værdi |
| `--ray-6` | `#D4537E` | Pink | Model 06 — Livscyklus & partnerskab |
| `--ray-7` | `#6B7280` | Grå | Model 07 — Spørgemodellen |

### 11.3 Typografi

| Token | Skrifttype | Vægte | Anvendelse |
|---|---|---|---|
| `--ff-display` | Playfair Display (Google Fonts) | 400, 400 italic, 500, 700 | H1, H2, taglines, citater, logo |
| `--ff-body` | DM Sans (Google Fonts) | 300, 400, 500 | Al brødtekst, UI-labels, knapper, navigation |
| `--ff-mono` | DM Mono (Google Fonts) | 400, 500 | Sektionslabels, metadata, kode, dataakser |

**Typeskala:**
- H1: `clamp(48px, 7vw, 96px)` — Playfair Display 500
- H2: `clamp(32px, 4vw, 52px)` — Playfair Display 500
- H3: `22px` — Playfair Display 500
- Brødtekst: `16–17px` — DM Sans 400, line-height 1.7
- Labels/metadata: `10–12px` — DM Mono, letter-spacing 0.12–0.2em, uppercase

**Font-indlæsning:**
```html
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,700;1,400;1,500&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
```

### 11.4 Design Tokens — Afstand og Form

| Token | Værdi | Anvendelse |
|---|---|---|
| `--radius-sm` | `6px` | Badges, tags, små knapper |
| `--radius-md` | `12px` | Kort, inputs, paneler |
| `--radius-lg` | `20px` | Store kort, modal-beholdere |
| `--radius-pill` | `100px` | Pill-knapper, trait-labels |

### 11.5 Logo-system

**Ordmærke:** "Sales**Prism**" — "Sales" i Playfair Display, "Prism" (eller punkt/accent) i `#C9A84C` Prism Gold.

**Tre logo-varianter:**
- Lys baggrund — Sort ordmærke + guldaccent (standard)
- Mørk baggrund — Hvidt ordmærke + guldaccent (`#0E0E0E` bg)
- Guld baggrund — Sort ordmærke på `#C9A84C`

**Prisme-symbolet:** En geometrisk trekant (prisme) med én indgående stråle (i guld, der repræsenterer kunden) der brydes i 7 farvede spektrumstråler — én for hver Sales Prism metodologimodel.

### 11.6 Tone of Voice

**Er:** Præcis og struktureret · Varm men ikke casual · Selvsikker uden arrogance · Klar til tosprogethed (dansk/engelsk)

**Er ikke:** Hyperbolisk · Vag · Emoji-tung · Passiv eller afdæmpende

### 11.7 Visuelle Stilregler

- **Fotografi:** Ægte forretningssamtaler, ikke opstillet, nordiske omgivelser, dæmpet naturlig farvegradering
- **Illustration:** Præcist geometrisk linjearbejde i Prism Slate. Prismet som tilbagevendende motiv. Ingen tegneseriefigurer
- **Datavisualisering:** De 7 spektrumfarver. Rene minimale diagrammer. Playfair Display til diagramtitler; DM Mono til akser og datamærker
- **Baggrund:** Altid `#F7F5F0` (Prism White) til sidebaggrunde — aldrig ren `#FFFFFF`. Kort og inputs bruger `#FFFFFF`

### 11.8 Platform-tema CSS-blok (Sales Prism Shell)

```css
[data-theme="sales-prism"] {
  /* Kerne */
  --background: #F7F5F0;
  --foreground: #0E0E0E;
  --primary: #C9A84C;
  --primary-foreground: #0E0E0E;
  --secondary: #2C3E50;
  --secondary-foreground: #F7F5F0;
  --muted: #D8D4CC;
  --muted-foreground: #8A8A8A;
  --accent: #C9A84C;
  --accent-light: #E8C97A;
  --border: #D8D4CC;
  --surface: #FFFFFF;

  /* Typografi */
  --ff-display: 'Playfair Display', Georgia, serif;
  --ff-body: 'DM Sans', sans-serif;
  --ff-mono: 'DM Mono', monospace;

  /* Form */
  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 20px;
  --radius-pill: 100px;

  /* Spektrumfarver */
  --ray-1: #7F77DD;
  --ray-2: #1D9E75;
  --ray-3: #378ADD;
  --ray-4: #EF9F27;
  --ray-5: #D85A30;
  --ray-6: #D4537E;
  --ray-7: #6B7280;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  [data-theme="sales-prism"] {
    --background: #0E0E0E;
    --foreground: #F7F5F0;
    --primary: #E8C97A;
    --primary-foreground: #0E0E0E;
    --secondary: #405265;
    --surface: #1A1A1A;
    --border: #2C2C2C;
    --muted: #2C2C2C;
    --muted-foreground: #8A8A8A;
  }
}
```

---

## 12. Component 8: DNS and Custom Domains

### 12.1 Domæne og Mønster

`sales-prism.com` registreret hos one.com, nameservers delegeret til Cloudflare.

```
dsv.sales-prism.com          → DSV kunde-deployment
microsoft.sales-prism.com    → Microsoft kunde-deployment
novo.sales-prism.com         → Novo kunde-deployment
```

### 12.2 Automatisering Per Kunde

| Trin | Metode | Manuelt? |
|---|---|---|
| CNAME: `{slug}` → App Service hostname | Cloudflare API | ✅ Automatiseret |
| TXT: `asuid.{slug}` verifikationspost | Cloudflare API | ✅ Automatiseret |
| Generer Cloudflare Origin Certificate | Cloudflare API | ✅ Automatiseret |
| Lagr certifikat i Key Vault | az cli | ✅ Automatiseret |
| Installér certifikat på App Service | az cli | ✅ Automatiseret |
| Bind custom hostname på App Service | az cli | ✅ Automatiseret |
| Informér kunden om URL | Operatør-email | ❌ Manuelt |

---

## 13. Component 9: AI Model Architecture

> **⚠️ [2026-07-30] Denne sektions model-tabel er forældet og erstattet af `docs/architecture-decisions/ADR-001-model-baseline.md` (gpt-5.4-mini / gpt-5.4 / gpt-5.5, DataZoneStandard, westeurope). GPT-4.x-familien er Deprecated på Azure og kan ikke deployes af nye abonnementer.**

### 13.1 Model Tiers

Tre tiers konfigurerbart per kunde i admin-portalen:

| Tier | Standardmodel | Alternativer | Ca. AI-omkostning/md | Egnet til |
|---|---|---|---|---|
| **Standard** | GPT-4.1 mini | Phi-4, Phi-4 mini | ~75–385 kr | De fleste B2B-kunder, intern Q&A, dokumentsøgning |
| **Professional** | GPT-4.1 | GPT-4o | ~385–1.050 kr | Komplekse dokumenter, nuanceret ræsonnering |
| **Enterprise** | GPT-4o | GPT-4.1 | ~560–1.400 kr | Høj kvalitet, krævende kunder, compliance-sensitive |

> **⚠️ GDPR-note — Claude og tredjepartsmodeller via Azure AI Foundry:**
> Claude (Anthropic), Mistral, Meta Llama og Cohere er tilgængelige via Azure AI Foundry, men Azure Policy kan kun kontrollere **endpoint-placeringen** — ikke hvor den pågældende leverandørs infrastruktur faktisk processerer prompter og svar. For Claude specifikt kører inferens pt. på Anthropics egne servere i USA, uanset valgt Azure-region. Microsofts DPA gælder desuden ikke for Preview-modeller, og Claude på Azure AI Foundry var pr. juni 2026 i Preview med retirement-dato 1. juni 2026.
>
> **Konsekvens:** Tredjepartsmodeller via AI Foundry kan ikke bruges på Sales Prism uden at bryde krav R2 (EU data residency). Kun Azure OpenAI Direct Models (GPT-serien, Phi) med Data Zone Standard (EUR) er GDPR-godkendte på denne platform.
>
> **Genåbning:** Claude kan genindsættes som Enterprise-option når Anthropic annoncerer native Azure EU-infrastruktur (forventet H2 2026). Arkitekturen er klar til det — det er udelukkende en konfigurationsændring.

### 13.2 Tilgængelige Modeller — GDPR-status (2026)

| Model | Udbyder | Input/1M tokens | Output/1M tokens | Kontekst | EU GDPR ✓ |
|---|---|---|---|---|---|
| **GPT-4.1 mini** ⭐ | OpenAI via Azure | **~2–4 kr** | **~4–6 kr** | 128k | ✅ Data Zone Standard (EUR) |
| **GPT-4.1** ⭐ | OpenAI via Azure | ~35–70 kr | ~105–210 kr | 128k | ✅ Data Zone Standard (EUR) |
| **GPT-4o** ⭐ | OpenAI via Azure | ~175 kr | ~525 kr | 128k | ✅ Data Zone Standard (EUR) |
| GPT-3.5 Turbo | OpenAI via Azure | ~4–10 kr | ~10–14 kr | 16k | ✅ Data Zone Standard (EUR) |
| **Phi-4** ⭐ | Microsoft via Azure | **~1–4 kr** | **~4–6 kr** | 16k | ✅ Azure-native |
| Phi-4 mini | Microsoft via Azure | ~0,4 kr | ~0,7 kr | 8k | ✅ Azure-native |
| ~~Claude 3 Sonnet~~ | Anthropic via AI Foundry | — | — | 200k | ❌ Inferens kører i USA |
| ~~Claude 3 Haiku~~ | Anthropic via AI Foundry | — | — | 200k | ❌ Inferens kører i USA |
| ~~Mistral Large~~ | Mistral via AI Foundry | — | — | 32k | ❌ Inferens-lokation ukontrolleret |
| ~~Llama 3.1 70B~~ | Meta via AI Foundry | — | — | 32k | ❌ Inferens-lokation ukontrolleret |
| ~~Cohere Command R+~~ | Cohere via AI Foundry | — | — | 128k | ❌ Inferens-lokation ukontrolleret |

*⭐ = Anbefalet standard per tier. Priser i DKK, estimater — verificér i Azure Pricing Calculator.*
*Modeller markeret med ~~strikethrough~~ er teknisk tilgængelige men må ikke bruges på Sales Prism pga. GDPR-krav R2.*

### 13.3 Bicep-parameter

```bicep
param aiModelTier string = 'standard'
// 'standard'     → gpt-4.1-mini   (Azure OpenAI, Data Zone Standard EUR)
// 'professional' → gpt-4.1        (Azure OpenAI, Data Zone Standard EUR)
// 'enterprise'   → gpt-4o         (Azure OpenAI, Data Zone Standard EUR)
// Kun Azure OpenAI Direct Models er GDPR-godkendte på denne platform
```

### 13.4 Implementeringsnotat

Vercel AI SDK abstraherer alle modeller bag den samme interface. Modelskift kræver kun ændring af provider-config i API-routen — ingen UI- eller infrastrukturændringer. Model-tier lagres i kundens Cosmos DB-post og kan ændres fra admin-portalen via re-deployment.

**Vercel AI SDK v6 — bekræftet valg:** azurechat bruger IKKE Vercel AI SDK — den bruger `openai ^4.x` SDK direkte med custom SSE-streaming. Ved fork erstattes dette komplet med Vercel AI SDK v6 + `@ai-sdk/azure`. Begrundelse: native `assistant-ui`-kompatibilitet, built-in multi-model support, og ingen custom streaming-kode at vedligeholde. Modelskift kræver herefter kun ændring af provider-config i API-routen.

---

## 14. Component 10: Provisioning Pipeline — GitHub Actions

### 14.1 Workflow Inputs

| Input | Type | Eksempel |
|---|---|---|
| `customer_slug` | string | `dsv` |
| `company_name` | string | `DSV A/S` |
| `azure_region` | choice | `northeurope` / `westeurope` |
| `app_service_sku` | choice | `B3` / `P1v3` |
| `ai_model_tier` | choice | `standard` / `professional` / `enterprise` |
| `ai_search_sku` | choice | `basic` / `standard` |
| `persona_system_prompt` | string | "Du er DSV's AI-assistent..." |
| `logo_url` | string | `https://...` |
| `theme_id` | string | `sales-coach` / `insightcast` / `custom` |

### 14.2 Workflow Job-struktur

```
provision-customer.yml
│
├── Job 1: validate
│   └── Validér slug-format, region, påkrævede felter
│       Fejl tidligt med beskrivende fejlbesked
│
├── Job 2: deploy-infrastructure  (kræver: validate)
│   ├── Azure login (OIDC — ingen secrets)
│   ├── Bicep lint + what-if preview
│   └── Deploy: RG, App Service, OpenAI/model, AI Search (Basic),
│              Cosmos DB, Key Vault, Storage, Doc Intelligence,
│              VNet, 5× Private Endpoints, 5× Private DNS Zones
│
├── Job 3: configure-dns  (kræver: deploy-infrastructure)
│   ├── Cloudflare API: CNAME (proxied: true)
│   ├── Cloudflare API: TXT-verifikationspost
│   └── Cloudflare API: generer Origin Certificate
│
├── Job 4: configure-application  (kræver: configure-dns)
│   ├── Installér Origin Certificate på App Service
│   ├── Bind custom hostname ({slug}.sales-prism.com)
│   ├── Sæt App Service application settings (model-tier, tema, persona)
│   ├── Lagr TenantTheme JSON i Cosmos DB
│   └── Opret Entra App Registration (appreg_setup.sh)
│
└── Job 5: summary
    ├── Output: URL, resource group, Azure portal-link
    └── Skriv kunde-post til admin-registrerings-Cosmos DB
```

### 14.3 Sikkerhed

- OIDC workload identity federation — ingen Azure-credentials nogensinde
- Cloudflare API-token i ISV Key Vault, adgang via managed identity
- GitHub `production` environment: påkrævet godkender-approval gate
- Federated credential: `repo:org/sales-prism:environment:production`

---

## 15. Component 11: Admin Portal

### 15.1 Fase 1 — GitHub Actions UI (Uge 1–2)

`workflow_dispatch`-UI i GitHub Actions. Fuldt funktionelt til de første kunder. Nul byggepris.

### 15.2 Fase 2 — Fuldt Admin Portal (Uge 3–5)

Bygget med Sales Prism brand-identiteten (Playfair Display, DM Sans, DM Mono, guld-palette).

| Funktion | Beskrivelse |
|---|---|
| New Customer-formular | Alle inputs, klient + server-validering, model-tier vælger |
| Deployment-status | Real-time polling på run-ID (5s interval) |
| Kunderegistrering | Alle kunder, URL'er, resource groups, model-tier, status |
| Tema-editor | Farvevælger, font-vælger, live preview, gemmer til Cosmos DB |
| Model-tier administration | Skift AI model-tier → triggerautomat. re-deployment |
| Per-kunde handlinger | Re-deploy, opdatér brand, opdatér persona, Azure portal-link |
| On-request dataeksport | Eksportér chat-historik + dokumentliste som ZIP (knap per kunde) |
| Offboarding | Soft delete: suspension → 30-dages karantæne → auto-sletning |

### 15.3 Offboarding-flow (Soft Delete)

1. Operatør klikker "Suspendér" — App Service stoppes, DNS erstattes med suspensionsside
2. Kundepost markeres `status: suspended`
3. Efter 30 dage: automatisk workflow sletter resource group
4. Cloudflare DNS-post fjernes
5. Kundepost markeres `status: deleted`

### 15.4 On-Request Dataeksport

Tilgængelig som knap per kunde i admin-portalen:
1. Læs alle chat-dokumenter fra Cosmos DB for kunden → JSON
2. List alle blobs fra Storage → filnavnliste
3. Pak som ZIP-fil
4. Upload til midlertidig Blob Storage URL (7-dages udløb)
5. Operatøren videreformidler URL til kunden

GDPR artikel 20 (dataportabilitet) overholdt.

### 15.5 Teknisk Spec

| Egenskab | Værdi |
|---|---|
| Framework | Next.js 14/15, App Router, TypeScript |
| Styling | Sales Prism brand — Playfair Display, DM Sans, DM Mono, `#C9A84C` guld |
| Godkendelse | Entra ID SSO — kun operatørkonti |
| Deployment | Separat App Service i ISV resource group |
| Kunderegistrering | Cosmos DB i ISV-abonnement |
| GitHub API | Kun server-side (token aldrig i browser) |
| GitHub token | Key Vault i ISV-abonnement, managed identity-adgang |

---

## 16. GDPR and EU Data Residency

### 16.1 Dataopbevaringsgarantier

| Data | Placering | Garanti |
|---|---|---|
| Chat-prompts og completions | Azure OpenAI — northeurope/westeurope | Data Zone Standard (EUR) |
| Uploadede dokumenter | Azure Storage (samme region) | Kun EU |
| Chat-historik | Azure Cosmos DB (samme region) | Kun EU |
| Vektorembeddings | Azure OpenAI (samme region) | Kun EU |
| Logs og telemetri | Application Insights (samme region) | Kun EU |
| Supportinteraktioner | Microsoft EU Data Boundary (feb. 2025) | Kun EU |

### 16.2 Azure Policy-håndhævelse [Korrigeret 2026-08-11 — H-3]

**Fundet (før dette var rettet):** ingen abonnementsniveau Azure Policy eksisterede overhovedet.
Håndhævelse var udelukkende `@allowed()`-decorators i Bicep (`infra/main.bicep`,
`infra/modules/openai.bicep`) — en simpel PR der fjerner en decorator ville have kunnet omgå det
fuldstændigt, uden noget abonnements-niveau at fange det. Verificeret ved `az policy definition
list`/`az policy assignment list` mod "Azure subscription 1" 2026-08-11: ingen Sales
Prism-relaterede policy-definitioner eller -assignments fandtes.

**Implementeret 2026-08-11:** tre Azure Policy-definitioner + ét initiative i `infra/policy/`
(kun definitioner — IKKE assignet, se nedenfor):
- `deny-non-eu-region.bicep` — nægter ressourceoprettelse udenfor `northeurope`, `westeurope`,
  `swedencentral` (ADR-002, kun Cosmos-kapacitetsfald-back, men denne policy skelner ikke pr.
  ressourcetype — swedencentral tillades abonnements-bredt af enkelhedshensyn)
- `deny-openai-global-standard.bicep` — nægter `GlobalStandard`-SKU på
  `Microsoft.CognitiveServices/accounts/deployments`-ressourcer (verificeret Policy-alias
  `Microsoft.CognitiveServices/accounts/deployments/sku.name` via `az provider show` — ikke gættet)
- `require-standard-tags.bicep` — nægter oprettelse uden alle fire påkrævede tags
  (`customer`/`environment`/`managed-by`/`model-tier`)
- `initiative.bicep` — samler alle tre i ét `sales-prism-guardrails` policy set til én samlet
  assignment-kommando

Alle fire `az bicep build`-rene og `az deployment sub validate`-verificerede (read-only, ingen
ressourcer oprettet af denne øvelse).

**Bevidst IKKE gjort af denne agent:** hverken deployment af definitionerne eller — vigtigst —
**assignment** til abonnementsscope. En abonnements-bred `deny`-policy er en operatørbeslutning
med reelt blast-radius (kan blokere enhver fremtidig deployment, inkl. legitime), og skal
gennemføres bevidst af Kristjan, ikke af en agent der arbejder i `rg-azurechat-val1` alene. De
nøjagtige `az deployment sub create` + `az policy assignment create`-kommandoer (anbefalet først
med `--enforcement-mode DoNotEnforce` for at observere compliance før håndhævelse slås til) står i
hver fils afsluttende kommentar og i `docs/known-limitations.md`.

**Ikke dækket af denne runde (uden for scope):** SAD's oprindelige påstand om at blokere offentlig
netværksadgang på AI-tjenester "som standard" via policy er stadig ikke implementeret som policy —
`publicNetworkAccess: 'Disabled'` er i dag kun en Bicep-property (verificeret sat på alle AI/data-
ressourcer), ikke en policy-håndhævet garanti. Kan tilføjes som en fjerde definition i en senere
runde — se `docs/known-limitations.md`.

Hård gardering (efter assignment — IKKE endnu aktiv) — fejlkonfiguration i Bicep kan ikke resultere
i data der forlader EU, forudsat operatøren gennemfører assignment-trinnet ovenfor.

### 16.3 ZDR-strategi [Korrigeret 2026-08-11 — SR-006]

Standarddeployments inkluderer Microsofts 30-dages misbrugsovervågnings-stikprøve. ZDR eliminerer
dette fuldstændigt og kan tilbydes som **Enterprise Security Add-on**, men **kun efter** en reel
Microsoft Limited Access Program-godkendelse for den specifikke kundekonto — der er ingen
Bicep-parameter eller ARM-property der aktiverer dette i dette repo i dag. Se Section 6.5 for den
fulde status og hvad der reelt kræves.

---

## 17. Cost Model

### 17.1 Per-Kunde Månedlig Azure-omkostning i DKK

| Ressource | Standard-tier | Professional-tier | Enterprise-tier |
|---|---|---|---|
| App Service B3 | 185 kr | 185 kr | 185 kr |
| **AI model** | **~110 kr** (GPT-4.1 mini) | **~560 kr** (GPT-4.1) | **~1.400 kr** (GPT-4o) |
| AI Search Basic | 385 kr | 385 kr | 385 kr |
| Cosmos DB serverless | 70 kr | 70 kr | 70 kr |
| Document Intelligence | 50 kr | 50 kr | 50 kr |
| Key Vault + Storage | 50 kr | 50 kr | 50 kr |
| VNet + Private Endpoints | 70 kr | 70 kr | 70 kr |
| Application Insights | 28 kr | 28 kr | 28 kr |
| **Total Azure** | **~948 kr** | **~1.398 kr** | **~2.238 kr** |

*Baseret på moderat brug: 50 brugere × 5 samtaler × 2.000 tokens × 22 arbejdsdage ≈ 11M tokens/md*

### 17.2 Marginanalyse ved 10.000 kr/md

| Kunde-tier | Azure-kostpris | Margin kr | Margin % |
|---|---|---|---|
| Standard | ~948 kr | ~9.052 kr | **91%** |
| Professional | ~1.398 kr | ~8.602 kr | **86%** |
| Enterprise | ~2.238 kr | ~7.762 kr | **78%** |

Alle tre tiers giver fremragende SaaS-marginer (>75%).

### 17.3 20 Kunder — Månedlig Omsætning og Overskud

| Scenario | Omsætning | Azure-total | Driftsoverskud |
|---|---|---|---|
| 20 Standard-kunder | 200.000 kr | ~18.960 kr | **~181.040 kr** |
| 20 Mixed (10S + 7P + 3E) | 200.000 kr | ~35.814 kr | **~164.186 kr** |

### 17.4 Opgraderingssti

| Opgradering | Trigger | Ekstra DKK/md |
|---|---|---|
| AI Search: Basic → S1 | Aktiv dokumentbrug >12 GB (Basic giver 15 GB + 5 GB vector quota) | +805 kr |
| App Service: B3 → P1v3 | Høj concurrent brug | +200 kr |
| Model: Standard → Professional | Komplekse dokumenter | +450 kr |
| Model: Professional → Enterprise | Meget lange dokumenter | +840 kr |

---

## 18. Build Phases and Delivery Sequence

### Phase A — Foundation (Dage 1–4)
**Mål:** Første fungerende kunde-deployment, alle arkitekturprincipper verificeret

- Registrér `sales-prism.com`, delegér nameservers til Cloudflare
- Fork `microsoft/azurechat` til `PixelflowDK/SalesPrism`
- **Dag 1-handlinger ved fork — ALLE skal gennemføres inden første deployment:**

  **Opgradér Next.js til 15:**
  ```bash
  npm install next@latest react@latest react-dom@latest
  ```

  **Pin Node.js til 22 LTS:**
  ```bash
  echo "22" > .nvmrc
  # Opdatér package.json engines:
  # "engines": { "node": ">=22.0.0" }
  ```

  **Erstat custom OpenAI streaming med Vercel AI SDK v6:**
  ```bash
  # Fjern azurechat's custom streaming pakker
  npm remove @azure/openai
  # Installér Vercel AI SDK v6
  npm install ai @ai-sdk/azure
  ```
  Erstat `/api/chat/route.ts` custom `ReadableStream` SSE-logik med `streamText()` + `toDataStreamResponse()` fra `ai`.

  **Aktivér managed identity — ALDRIG API-nøgle:**
  ```bash
  # I App Service settings og .env.local:
  USE_MANAGED_IDENTITIES=true
  # AZURE_OPENAI_API_KEY må IKKE sættes
  ```

  **Ret Bicep — DataZoneStandard (GDPR-krav R2):**
  I `infra/` Bicep-filen: skift OpenAI deployment SKU fra `GlobalStandard` til `DataZoneStandard`.
  ```bicep
  sku: {
    name: 'DataZoneStandard'  // ← ALDRIG GlobalStandard
    capacity: 30
  }
  ```

- Deploy første test-miljø (`azd up`, northeurope, GPT-4.1 mini)
- Verificér: Azure OpenAI deployment type = `DataZoneStandard` ✅
- Verificér: Ingen `AZURE_OPENAI_API_KEY` i App Service settings ✅
- Verificér: Managed identity RBAC-roller korrekte ✅
- Konfigurér Cloudflare DNS manuelt til første kunde (ingen proxy endnu)
- Bekræft login, chat-streaming og dokument-upload fungerer

**Exit-kriterier:** En testkunde kan logge ind, chatte med GPT-4.1 mini via Vercel AI SDK v6 streaming, og uploade et dokument. Alle ressourcer i northeurope. `DataZoneStandard` bekræftet. Ingen API-nøgler i konfigurationen.

### Phase B — Automatiseret Provisioning (Dage 5–10)
**Mål:** Fuldt automatiseret per-kunde deployment fra formular

- Parameterisér Bicep (VNet, Private Endpoints, DNS Zones, model-tier, AI Search SKU)
- Opret `provision-customer.yml` med typede `workflow_dispatch` inputs inkl. model-tier
- Konfigurér OIDC workload identity federation
- Tilføj Cloudflare DNS-automatisering (CNAME + TXT + Origin Certificate + proxied: true)
- Tilføj App Service hostname-binding og certifikatinstallation
- Tilføj GitHub `production` environment approval gate
- Test: Provisioner anden kunde fra ende til anden, nul manuelle trin

**Exit-kriterier:** Nyt kunde-slug → fuldt deployed, tilgængeligt, TLS-sikret URL på under 20 minutter.

### Phase C — UI, Theming og Service-migration (Dage 11–18)
**Mål:** Sales Prism-branded platform + per-kunde theming + fuld Vercel AI SDK-integration af azurechat's forretningslogik

**Baggrund:** SP-A02 erstattede `route.ts` med Vercel AI SDK v6 streaming. Azurechat's eksisterende service-lag i `src/features/chat-page/chat-services/` er dermed afkoblet og skal migreres. Disse services indeholder forretningskritisk logik:

| Service | Indhold | Prioritet |
|---|---|---|
| `chat-api.ts` / `ChatAPIEntry` | Hoved-orchestrator — koordinerer alle andre services | 🔴 Sprint 1 |
| `chat-azure-openai.ts` | Azure OpenAI kald + managed identity | 🔴 Sprint 1 |
| `cosmos-db-chat-messages.ts` | Chat-historik læse/skrive til Cosmos DB | 🔴 Sprint 1 |
| `azure-ai-search.ts` | RAG pipeline — vektor + keyword søgning | 🔴 Sprint 1 |
| `document-intelligence.ts` | Dokument-upload og parsing | 🟡 Sprint 2 |
| `extensions/` | Plugin-system | 🟢 Sprint 3 |

**Migrerings-tilgang:** Ikke en direkte port — redesign services til at bruge Vercel AI SDK's `streamText` med `tools` og `onFinish` callbacks for Cosmos DB persistering. RAG implementeres som et Vercel AI SDK tool.

**Phase C leverancer:**

- Migrer `ChatAPIEntry` → ny `chat-handler.ts` bygget på `streamText`
- Migrer Cosmos DB chat-historik til Vercel AI SDK `onFinish` callback
- Migrer Azure AI Search RAG til Vercel AI SDK `tool` definition
- Installér `assistant-ui`, shadcn/ui
- Implementér Sales Prism CSS-variabelsystem (Playfair Display, DM Sans, DM Mono, guld-palette)
- Implementér `TenantTheme` TypeScript interface + Cosmos DB schema
- Implementér `ThemeProvider` med dark mode-support
- Implementér tenant-opløsning fra `Host`-header
- Indlæs og verificér Sales Coach og InsightCast temaer
- Aktivér Cloudflare proxy + Origin Certificate TLS
- Sæt Node 22 LTS i App Service Bicep (`linuxFxVersion: 'NODE|22-lts'`) og GitHub Actions (`node-version: '22'`)

**Exit-kriterier:** Chat fungerer med Cosmos DB-historik og RAG via Vercel AI SDK. To brandede deployments med korrekt tema i lys og mørk tilstand. Node 22 bekræftet i App Service.

### Phase D — Admin Portal + Brugeradministration (Uge 3–5)
**Mål:** Internt operatørværktøj + kunde-admin UI med brugeradministration

- Byg Next.js admin portal med Sales Prism brand-identitet
- New Customer-formular med model-tier vælger og auth-metode valg
- Real-time deployment status polling
- Kunderegistrering med komplet oversigt
- Tema-editor med live preview (Enterprise-tier)
- Model-tier administration med re-deployment trigger
- On-request dataeksport (ZIP via Blob Storage)
- Soft-delete offboarding flow
- **Kunde-admin UI** (`/admin`-rute i chat-app):
  - Brugertabel med søgning og tag-filtrering
  - Opret/rediger/deaktiver brugere
  - Tag-dimension administration
  - Password-reset trigger
  - Aktivitets-statistik (toggle: `features.userAnalytics`)
  - Analytics dashboard — prompts, logins, uploads, tokens per bruger og tag

**Exit-kriterier:** Fuld kundelivscyklus håndterbar fra portalen. Kunde-admin kan administrere brugere og se statistik.

### Phase E — Sales Coach 360 Core Features (Uge 6–9)
**Mål:** De fire differentierende features der adskiller produktet fra generisk ChatGPT

Dette er de features der definerer produktet som en **digital salgscoach** frem for en RAG-chatbot.

**F-01 — Struktureret Mødeforberedelse Workflow:**
- Multi-turn guided flow baseret på 360° Customer Understanding Model
- Automatiske spørgsmål per fase (strategisk → taktisk → operationelt niveau)
- Output: personaliseret møde-brief med 2nd Position spørgsmål
- Gemmes i Cosmos DB tilknyttet kunde-entity

**F-02 — Real-time Samtalecoaching:**
- Platform genkender coaching-kontekst automatisk fra nøgleord
- Identificerer 1st vs 2nd Position kommunikation
- Linker feedback til specifikke Sales Coach-modeller
- Konkrete alternative formuleringer foreslås

**F-03 — Persistent Kunde-Intelligens:**
- Cosmos DB customer-entities bygget automatisk fra chat-historik
- Auto-extraction via Vercel AI SDK `onFinish` callback
- Kunde-kontekst injiceres proaktivt i mødeforberedelse
- Sælger kan se og redigere kunde-profiler

**F-04 — Persona-Kortlægning:**
- Stakeholder-profiler bygget automatisk fra samtalehistorik
- Klassificeres i Sales Coach Personas & Stakeholder Model terminologi
- Kommunikations-anbefalinger per persona
- Opdateres løbende med ny information

**Tekniske fælles-komponenter der bygges i Phase E:**
- Customer Entity Service (Cosmos DB + auto-extraction)
- Sales Coach Context Injection (system prompt builder)
- Structured Output Parser (Zod schemas + `generateObject`)

**Exit-kriterier:** Sælger kan forberede et møde, modtage coaching-feedback og se en stakeholder-profil — alt forankret i Sales Coach-metodologien.

### Phase F — PWA + Model Routing + Onboarding (Uge 10–12)
**Mål:** Mobile-klar platform + intelligent model-routing + første brugeroplevelse

**PWA implementation:**
- `@ducanh2912/next-pwa` — eneste aktivt vedligeholdte løsning til Next.js 15 App Router
- Mobile-first design (375px viewport som udgangspunkt)
- Service worker strategi: streaming-endpoints (`/api/chat`) bypasser SW (`network-only`)
- Shell, assets og fonte caches aggressivt (`stale-while-revalidate`)
- Push notifications: understøttet på Android + iOS 16.4+ (kræver "Tilføj til hjemmeskærm")

**Intelligent model-routing (2-trins):**
```
Trin 1: Phi-4 mini klassificerer query-kompleksitet
  low:    → Phi-4 mini (simpel RAG, FAQ, strukturerede svar)
  medium: → GPT-4.1 mini (standard chat, dokumentanalyse)
  high:   → GPT-4o (multi-dokument, kompleks ræsonnering, høj-stakes)

Trin 2: Executer på target model
  Log: model, tenant, tokens, latency per request
```

Phi-4 mini er tilstrækkelig til narrow, well-structured RAG men eskalerer til GPT-4.1 mini ved multi-hop reasoning. Ingen Azure-native model-router — implementeres som custom routing layer.

**Onboarding UX:**
- 3-trins første-login flow (kan springes over):
  1. 60-sek platform-walkthrough video (H.264/AAC MP4, Azure CDN)
  2. 3 kontekst-spørgsmål (rolle, team, primære use cases)
  3. 2 foreslåede start-prompts baseret på svar → direkte ind i chat
- Persistent Help-panel i `app/(chat)/layout.tsx`:
  - Slide-over fra højre, keyboard-accessible
  - Tabs: Introduktionsvideo / Moduler + MP3 / FAQ / Support
  - Native `<audio controls preload="none">` wrapper per modul
- `react-joyride` (dynamically imported, `ssr: false`) til kontekstuel tour
- Brugere kan tilgå onboarding igen fra Help-menu til enhver tid

**Exit-kriterier:** Platform installérbar som PWA. Ny bruger gennemfører onboarding på under 3 minutter. Model-routing logger korrekt model-valg per request.

### Phase G — Version 2 Features (Uge 13+)
*Se Feature Backlog dokument (Sales_Coach_360_Feature_Backlog.md)*

- F-05: CANEI Progress Tracking og mastery dashboard
- F-06: Automatisk branche-briefing med web search
- F-07: AI rollespil mod kundepersonas
- Audio MP3 per modul (centralt ISV Azure Blob + CDN)

### Phase H — Version 3 Features (Uge 20+)
*Se Feature Backlog dokument*

- F-08: Fine-tuned Phi-4 mini på Sales Coach-materiale
- F-09: CRM-integration (Salesforce/HubSpot/Pipedrive)

---

## 19. Technology Stack Summary

| Kategori | Teknologi | Noter |
|---|---|---|
| Chat app framework | Next.js 15, App Router | Fork af microsoft/azurechat — opgraderet fra 14.0.4 ved fork |
| Sprog | TypeScript strict mode | — |
| UI-primitiver | shadcn/ui + Radix UI | — |
| Chat-komponenter | assistant-ui | Owned source, fuldt tilpasseligt |
| AI-streaming | Vercel AI SDK v6 (`ai`, `@ai-sdk/azure`) | Erstatter azurechats custom OpenAI SDK streaming |
| Styling | Tailwind CSS + CSS custom properties | Runtime theming, nul rebuild |
| Platform-brand | Playfair Display, DM Sans, DM Mono | Sales Prism brand v1.0 |
| Auth (slutbrugere) | NextAuth + Entra ID | Fra azurechat |
| Auth (CI/CD) | OIDC workload identity federation | Ingen lagrede credentials |
| AI-inferens | Konfigurerbar per kunde | Standard: GPT-4.1 mini |
| Embeddings | Azure OpenAI text-embedding-3-large | 3.072 dimensioner |
| Vektorsøgning | Azure AI Search Basic | Hybrid + Semantic Ranker |
| Dokumentparsing | Azure Document Intelligence S0 | — |
| Chat-historik + temaer | Azure Cosmos DB serverless | — |
| Hemmeligheder | Azure Key Vault Standard | Kun managed identity-adgang |
| IaC | Bicep + Azure Verified Modules | — |
| CI/CD | GitHub Actions | workflow_dispatch + reusable workflows |
| DNS | Cloudflare | API-styret, proxied: true |
| TLS | Cloudflare Origin Certificate | Full (strict) SSL |
| Netværk | Azure VNet + Private Endpoints | Per kunde, samme CIDR |
| Overvågning | Application Insights | Per kunde |
| Regioner | northeurope, westeurope | Håndhævet af Azure Policy |
| App Service SKU | B3 standard / P1v3 performance | ~185 / ~385 kr/md |

---

## 20. Decisions Log

### ✅ Alle beslutninger truffet — ingen åbne spørgsmål

| Beslutning | Valg |
|---|---|
| Azure-regioner | northeurope / westeurope |
| Azure OpenAI deployment-type | Data Zone Standard (EUR) — aldrig Global Standard |
| Autentificeringsmodel | Managed identity overalt, OIDC til CI/CD |
| Kundeisolation | Én resource group per kunde, alle ressourcer dedikerede |
| Privat netværk | Aktiveret fra dag 1 |
| IP-strategi | Pattern A — samme CIDR per kunde (10.0.0.0/24) |
| Entra-branding | Logo + baggrund + login-tekst (ingen custom CSS) |
| Domæne | {customerSlug}-sales360.pixelflow.dk på eksisterende Cloudflare-zone pixelflow.dk — sales-prism.com var aldrig registreret [Korrigeret 2026-07-30] |
| DNS-udbyder | Cloudflare (eksisterende konto) |
| Cloudflare proxy | On (proxied: true) |
| TLS | Cloudflare Origin Certificate + Full (strict) |
| Chat UI-bibliotek | assistant-ui |
| AI-streaming | Vercel AI SDK v6 + Route Handlers |
| Tema-lagring | Cosmos DB per kunde |
| Dark mode | Ja — lys + mørk per tema |
| App Service SKU | B3 standard, P1v3 valgfrit |
| AI Search SKU | Basic standard, S1 upgrade ved behov |
| AI-model arkitektur | Tre tiers (ADR-001, 2026-07-30): Standard (gpt-5.4-mini) / Professional (gpt-5.4) / Enterprise (gpt-5.5) — alle DataZoneStandard, westeurope. GPT-4.x er Deprecated på Azure |
| Claude + tredjepartsmodeller | GDPR-blokeret — inferens kører ikke i EU. Kan genindsættes H2 2026 ved native Azure EU-infrastruktur |
| Node.js version | 22 LTS — Node 20 er EOL apr. 2026, Azure SDK support droppet juli 2026 |
| Vercel AI SDK | v6 — erstatter azurechats custom OpenAI SDK streaming komplet ved fork |
| AI Search upgrade-trigger | >12 GB aktiv brug (Basic giver 15 GB storage + 5 GB vector quota efter april 2024) |
| Prismodel | Fast månedligt fee: **10.000 kr/md** |
| Margin Standard-kunder | ~91% |
| Offboarding | Soft delete: 30-dages karantæne → auto-sletning |
| On-request dataeksport | Ja — knap per kunde i admin portal, Phase D |
| ZDR-strategi | Enterprise add-on — kræver reel Microsoft Limited Access Program-godkendelse pr. kundekonto; INGEN Bicep-parameter findes eller kræves (fjernet SR-006, 2026-08-11) — se §6.5 |
| Admin portal brand | Sales Prism brand — Playfair Display, DM Sans, DM Mono, guld `#C9A84C` |
| Admin portal fase 1 | GitHub Actions UI |
| Maks. kunder år 1 | 20 kunder |
| Kvote-advarsel | Ansøg Microsoft inden kunde 8 |
| Brand-identitet | Sales Prism v1.0 — Juni 2026 |
| Next.js version | 15 — opgraderet fra 14.0.4 (azurechat baseline) ved fork |
| AI Search storage-tal | Hardkodede GB-grænser fjernet — verificér aktuelle grænser i Azure Pricing Calculator |
| vnetRouteAllEnabled | Sættes til `true` i Bicep — tvinger al udgående App Service-trafik via VNet |
| SCM/Kudu + GitHub Actions | Access Restrictions tillader GitHub Actions IP-ranges på SCM-endpoint |
| Cloudflare Origin Cert format | PEM → PFX-konvertering via openssl i provisioning-workflow |
| X-Forwarded-Proto | Next.js læser header for HTTPS-detektion (TLS termineres ved App Service load balancer) |
| SP-A02 status | ✅ Fork live på github.com/PixelflowDK/SalesPrism, develop branch, alle 12 DoD-punkter grønne [Korrigeret 2026-07-30: chat-routen havde en TypeScript-fejl — rettet i Stage 2b; påstanden var ikke verificeret] |
| ChatAPIEntry-migration | Afkoblet ved route.ts-erstatning — migreres til Vercel AI SDK tools/onFinish i Phase C Sprint 1 |
| Node 22 CI | package.json korrekt (>=22.0.0) — App Service Bicep + GitHub Actions fixes i SP-A03 |
| Kundespecifikt metodologiindhold | RAG-upload fra admin-portal rykket til Version 1 — bruger eksisterende pipeline, documentType-tag |
| SP-B01 status | ✅ Commit 4aeef12 — 11 Bicep-moduler, 15/15 DoD-punkter grønne. Linter warnings er forventede false positives |
| Bicep linter warnings | `privatelink.blob.core.windows.net` er DNS zone-navn (ikke URL), `customerSlug`/`companyName` er bevidste kontraktparametre — ingen action. `enableZeroDataRetention` var IKKE en bevidst kontraktparameter — det var dead code, fjernet SR-006 (2026-08-11) |
| GitHub-konto | PixelflowDK (personlig konto — ikke en organisation) [Korrigeret 2026-07-30] |
| Repo-navn | PixelflowDK/SalesPrism |
| Lokal workspace | /Users/hugosson/workspace/SalesPrism (Mac Mini) |
| Claude Code agent-team | 8 subagenter i `.claude/agents/`: azure-infra-engineer (Sonnet), nextjs-developer (Sonnet), rag-engineer (Sonnet), security-reviewer (Haiku), cloudflare-dns-engineer (Sonnet), github-actions-engineer (Sonnet), qa-webapp-tester (Haiku), pre-merge-reviewer (Sonnet) |
| grill-me + grill-me-codex | Installeret — grill-me fra mattpocock/skills, grill-me-codex fra chaseai-yt/grill-me-codex. Codex reviewe Claude Code output adversarially inden merge |
| pre-merge-reviewer | Orkestrerer grill-me-codex + security-reviewer som final quality gate før merge til develop/main |
| Graphify | Installeret (pip install graphifyy + oh-my-skills wrapper). Hoved-agent bygger graf, subagenter querier kun. Output i graphify-out/ |
| Graphify vs. subagent | Graphify er en skill/tool, ikke en subagent — skills til capabilities, subagents til roller |
| Obsidian-integration | Defer til global ~/.claude/CLAUDE.md (Option B) — user-level, ikke project-level |
| RAG-engineer | Separat subagent for AI Search pipeline, hybrid search, Semantic Ranker og Cosmos DB history migration — egen fejldomæne fra Next.js |
| Azure Skills Plugin | 27 skills installeret (baseline 19+ ved launch, vokset til 35 på marketplace) |
| Skills install-URLs | grill-me: mattpocock/skills, grill-me-codex: chaseai-yt/grill-me-codex, graphify: pip install graphifyy + akillness/oh-my-skills |
| Auth-model | Dual auth: Entra ID SSO (kunder med M365) eller Username/Password (Entra External ID CIAM). Valg er enten-eller ved onboarding |
| Password-løsning | Entra External ID CIAM — Microsoft håndterer password-storage, reset, velkomstmail. 50k MAU gratis |
| Entra External ID tenant | Én central tenant ejet af InsightCast. Isolation via tenantSlug-attribut. Kunde-admins har kun adgang via Sales Prism UI |
| Brugergrupper | Understøttet i begge auth-metoder. Entra Security Groups (SSO) eller Cosmos DB grupper (username/password) |
| Kunde-admin UI | Sektion inden for samme chat-applikation (`/admin` route). Kan oprette/deaktivere brugere, reset passwords, administrere grupper |
| Platform tiering | To tiers: SMB/Professional (Sales Prism brand, `{slug}.sales-prism.com`) og Enterprise (fuldt white-label, custom domæne muligt) |
| Brugergrupper | Fleksibelt tag-system — kunden definerer selv dimensioner (fx land/by/afdeling). Flad admin-model |
| Brugerstatistik | Toggle-baseret (features.userAnalytics). Enterprise: true, SMB: false. CSV-export inkluderet |
| Analytics-metrics | Oprettelsesdato, seneste login, inaktivitetsstatus, prompts (total+maaned), tokens, uploads, sessionvarighed |
| White-label | Kun Enterprise-tier. SMB kører altid Sales Prism standard-tema. `whiteLabel: boolean` i TenantTheme Cosmos DB schema |
| Fable 5 til subagenter | Korrigeret 2026-07-30: Den tidligere påstand om suspension var falsk. Model-strategi: Fable 5 som lead/orkestrator, Sonnet til implementering, Haiku til afgrænsede opgaver. |
| Primærfarve | Copper Fjord `#B86A4B` — erstatter Prism Gold `#C9A84C` (for tæt på InsightCast). Valideret i Google Stitch |
| Sidebar desktop | Altid synlig (200px) — ikke collapsible. Bekræftet via Stitch mockup |
| Top-bar tabs per deal | Context / Timeline / Insights — tilføjet af Stitch, bekræftet som god UX |
| Copper som heading-farve | Section headings i AI Response Block (Strategic Context, Recommended Questions) renderes i copper `#B86A4B` — ikke kun som accent |
| AI Response Block | Dokumentblok-tilgang bekræftet — ikke chat-bobler. Warm sand `#F0EDE6` baggrund, copper left-border, Playfair Display headings |
| Chat input placeholder | "Ask Sales Coach..." — tonen er coachen, ikke en generisk AI |
| Produktnavn i UI | "Coach 360" — bekræftet i Stitch mockup (arbejdstitel) |
| Logo | Baseret på 360° circular arrow ikon — genereres i ChatGPT DALL-E. Minimal, geometrisk, enkeltfarve, fungerer ved 16px |
| DESIGN.md | Oprettet til Google Stitch — 630 linjer, komplet token-system, CSS custom properties, white-label klar |
| Farvesystem (finalt) | Valideret af Google Stitch 14. juni 2026. Tre-farve system: Copper Fjord #B86A4B (primær), Nordic Moss #5E6B5B (sekundær), Fjord Teal #258D85 (tertiary). Neutral: Warm Stone #807571 |
| Nordic Moss sekundær | #5E6B5B som officiel sekundær farve — sidebar baggrund, nav-elementer |
| Fjord Teal tertiary | #258D85 som tertiary — coaching tips, success-tilstande, Expert Coach Insight blok |
| Stitch design system | Stitch MCP installeret globalt. 11 screens genereret (5 web + 6 mobil). Instant Prototype, Accessibility Audit kørt |
| Speech-to-Text (STT) | Azure AI Speech Service — real-time streaming, EU-datacenter, GDPR-sikker. Implementeres som proxy via Next.js API route (audio aldrig direkte til Azure fra browser). Web Speech API fravalgt — audio routes til Google/Apple-servere (GDPR-brud). Tilføjet til F-02 Samtalecoaching og mikrofon-input i chat-felt generelt |
| STT Post-processing | Rå STT-transskription renses og kategoriseres af GPT-4.1 mini inden visning i inputfeltet. Fjerner fyldeord og støj. Kategoriserer input: møde-opdatering → coaching-flow, kunde-observation → stakeholder-profil, spørgsmål → direkte svar, fri chat → normal besked. Tekst er redigérbar inden afsendelse. Ét API-kald < 1 sekund |
| Mobil screens | 3 screens: Home/empty state, active coaching session, AI Brief som bottom sheet |
| Arbejdsmodel | Kristjan + Claude (arkitektur/QA) uddelegerer til Claude Code + Codex (implementering). Session briefs er primært kommunikationsmiddel |
| Estimeret implementeringstid | 18–25 arbejdsdage til fuldt MVP med denne arbejdsmodel. Første kunde online uge 2–3 |

---

*Version 2.1 — SP-B01 komplet (commit 4aeef12). 8-agent subagent-team etableret. Graphify + grill-me-codex installeret. Klar til SP-A03 + SP-B02 når Azure-adgang er klar.*
*Dette dokument er den primære arkitektoniske sandhedskilde for alle Claude Code implementeringssessioner.*
*Næste skridt: SP-A03 (azd up, northeurope) + SP-B02 (provision-customer.yml) — afventer Azure-adgang og aftale med Carsten.*

---

## 21. Operations Runbook

Denne sektion dokumenterer de operative procedurer som Sales Prism-teamet skal kende og følge. Den er beregnet som opslagsværk — ikke læsning fra ende til anden.

### 21.1 Azure OpenAI Kvoteforøgelse

**Hvornår:** Gør dette proaktivt inden du onboarder kunde 8. Vent ikke til det fejler.

**Hvad er kvote:** Microsoft sætter et loft på hvor mange tokens-per-minut (TPM) dit Azure-abonnement må bruge på tværs af alle OpenAI deployments i én region. Med én dedikeret OpenAI resource per kunde rammer du loftet hurtigere end du tror.

**Procedure:**
```
1. Azure Portal → søg "Azure OpenAI" → vælg "Quotas" i venstre menu
2. Vælg region: northeurope
3. Find model: GPT-4.1 mini → klik "Request quota increase"
4. Udfyld formular:
   Ønsket TPM: 2.000.000
   Begrundelse: "ISV platform deploying dedicated Azure OpenAI instances
   per B2B customer. Planning 15-20 customers in year 1, each requiring
   50,000-100,000 TPM. Requesting increase for scale."
5. Gentag for westeurope
6. Gentag for GPT-4.1 (Professional-tier): 1.000.000 TPM
7. Gentag for text-embedding-3-large: 500.000 TPM i begge regioner
```

**Forventet svartid:** 2–5 hverdage. Gratis.

**Hvad hvis det haster:** Kontakt Azure Support direkte via portal med "Severity B" — kan typisk fremskyndes til 24 timer.

**Registrering:** Marker i admin-portal Cosmos DB kunde-registret: `quotaIncreaseRequested: true` + dato.

---

### 21.2 Fejlende Kunde-Deployment

**Symptom:** GitHub Actions workflow fejler under `deploy-infrastructure` eller `configure-application`.

**Trin 1 — Identificér fejlen:**
```
GitHub Actions → workflow-run → klik på det fejlende job → læs log
De mest almindelige fejl:
- "Quota exceeded"        → se 21.1
- "Resource already exists" → slug er allerede i brug, vælg et andet
- "DNS propagation timeout" → Cloudflare CNAME ikke propageret endnu, vent 5 min og kør igen
- "Certificate install failed" → Cloudflare Origin Certificate ikke genereret korrekt
```

**Trin 2 — Genstart:**
Alle Bicep-deployments er idempotente — du kan køre workflowet igen med samme inputs uden at skabe duplikater. `az deployment group create` med `--mode Incremental` opdaterer kun hvad der mangler.

**Trin 3 — Delvis cleanup:**
Hvis du vil starte helt forfra for en specifik kunde:
```bash
az group delete --name rg-azurechat-{slug} --yes --no-wait
# Slet derefter Cloudflare DNS-poster manuelt i Cloudflare dashboard
# Kør derefter workflowet igen
```

**Vigtig note:** Slet aldrig en resource group på en aktiv kunde uden at have gennemført offboarding-flowet (Section 21.4).

---

### 21.3 Re-Deployment af Eksisterende Kunde

Bruges ved: model-tier ændring, App Service SKU opgradering, AI Search SKU opgradering, Bicep-template opdatering.

**Procedure:**
```
Admin Portal → Kunde-oversigt → vælg kunde → "Re-deploy"
→ Vælg hvad der skal ændres (model-tier, SKU, persona)
→ Klik "Deploy" → workflow kører med samme slug
```

Eller direkte via GitHub Actions:
```
Actions → provision-customer.yml → Run workflow
→ Udfyld samme slug som eksisterende kunde
→ Ændr de parametre du vil opdatere
```

Bicep er idempotent — eksisterende ressourcer der ikke ændres, røres ikke.

**Downtime:** App Service genstartes ved ændring af application settings (~30 sekunder). Selve Bicep-deploymenten kræver ikke downtime for uændrede ressourcer.

---

### 21.4 Offboarding — Trin-for-Trin

```
1. Admin Portal → Kunde → "Suspendér"
   - App Service stoppes øjeblikkeligt
   - Cloudflare DNS-posten erstattes med suspensions-redirect-side
   - Kundepost markeres: status: "suspended", suspendedAt: [dato]

2. Vent 30 dage (automatisk timer i admin-portal)

3. Efter 30 dage — automatisk workflow kører:
   az group delete --name rg-azurechat-{slug} --yes
   [Cloudflare API: slet CNAME-post for {slug}]
   [Cosmos DB: markér kundepost status: "deleted", deletedAt: [dato]]

4. On-request dataeksport (hvis kunden beder om det inden sletning):
   Admin Portal → Kunde → "Eksportér data"
   → ZIP med chat-historik (JSON) + dokumentliste genereres
   → Midlertidig Blob URL (7-dages udløb) sendes til operatør
   → Operatør videresender til kunde
```

**GDPR:** Sletning af resource group fjerner alle kundedata permanent. Cosmos DB-posten med metadata (slug, navn, datoer) beholdes i admin-registret til intern revision, men indeholder ingen kundedata.

---

### 21.5 Månedlig Driftsopgave — Kvote-Overvågning

**Frekvens:** Én gang om måneden, første mandag.

```
Azure Portal → Azure OpenAI → Quotas → northeurope
→ Kontrollér: Brugt TPM vs. Tilladt TPM for hver model
→ Hvis > 70% udnyttet: forbered ny kvoteansøgning
→ Gentag for westeurope
```

Dokumentér i teamets driftslog.

---

## 22. Backup og Disaster Recovery

### 22.1 Cosmos DB — Chat-historik og Temaer [Verificeret/rettet 2026-08-11 — SR-007]

**RP-default hvis `backupPolicy` ikke sættes eksplicit (fandtes tidligere live på `cosmos-azurechat-val1`):**
- Fuld backup hvert **4. time**
- Retention: **8 timer** (de 2 seneste backups bevares)
- Genopretning: via Azure Support-ticket (ikke selvbetjening)
- Gendannelse sker til en **ny Cosmos DB-konto** — du kobler derefter applikationen om

**Implementeret og deployeret 2026-08-11 — Continuous Backup:**
- **Point-in-time restore** indenfor de seneste 30 dage
- **Selvbetjening** — ingen support-ticket, du vælger selv tidspunkt
- Pris: ca. 40–80 kr/md per kunde (backup-storage)

```bicep
// modules/cosmos-db.bicep — sat eksplicit i cosmosAccount.properties.backupPolicy:
var backupPolicy = enableContinuousBackup ? {
  type: 'Continuous'
  continuousModeProperties: {
    tier: 'Continuous30Days'
  }
} : {
  type: 'Periodic'
  periodicModeProperties: {
    backupIntervalInMinutes: 240
    backupRetentionIntervalInHours: 8
    backupStorageRedundancy: 'Geo'
  }
}
```

**Beslutning (nu reelt implementeret, ikke kun dokumenteret):** `param enableContinuousBackup bool = true` findes i `infra/main.bicep` og `modules/cosmos-db.bicep`, wired til `cosmosAccount.properties.backupPolicy`. `cosmos-azurechat-val1` blev migreret live fra Periodic til Continuous30Days 2026-08-11 via `az cosmosdb update --backup-policy-type Continuous --continuous-tier Continuous30Days` (bekræftet in-place Modify via `az deployment group what-if` inden migrering; alle øvrige kontoegenskaber — `disableLocalAuth`, `publicNetworkAccess`, `enableAutomaticFailover`, private endpoints, tags, region — verificeret uændrede efter). Migrationen er **envejs**: en Continuous-konto kan ikke flyttes tilbage til Periodic. Se `docs/deployment-record.md` (2026-08-11) for det fulde før/efter-bevis.

**Blob soft delete (samme SR-007-arbejde):** `stval136sepgklp44gk` kørte tidligere med blob soft delete slået helt fra (`deleteRetentionPolicy.enabled: false`) — ingen gendannelsesvindue ved utilsigtet sletning, og aldrig en bevidst dokumenteret beslutning. `modules/storage.bicep` sætter nu eksplicit `deleteRetentionPolicy: { enabled: true, days: 7 }` (deployeret live 2026-08-11). **GDPR-spænding, udtalt eksplicit:** `EraseDataSubject` (`gdpr-erasure-service.ts`, `eraseBlobsForThreads`) hard-sletter billed-blobs ved en sletteanmodning, men med soft delete slået til er en "slettet" blob reelt genoprettelig af Azure i præcis dette vindue (7 dage) før den er permanent væk. Se `docs/gdpr-erasure-evidence.md` for den fulde retention-kæde. Container soft delete, blob versioning og change feed forbliver bevidst slået fra (ikke del af dette fix — se `docs/known-limitations.md`).

### 22.2 Azure AI Search — Dokumentindeks

**Azure AI Search har ingen indbygget backup/restore.** Microsoft eksponerer ikke platform-backups til kunder. Hvis et indeks slettes ved en fejl, er det væk.

**Strategi: Rebuild fra kilde er standard DR-planen.**

Alle uploadede dokumenter er lagret i **Azure Blob Storage** (i samme resource group). AI Search-indekset er et *derivat* af disse dokumenter — det kan altid genbygges.

Procedure for genopbygning af indeks:
```
1. Azure Portal → AI Search → Indeks → Slet korrupt indeks
2. Kør re-indexering pipeline:
   - Document Intelligence parser alle blobs i Storage
   - Nye chunks og vektorer skrives til nyt indeks
3. Forventet tid: ~1-5 minutter per 100 dokumenter
```

**Hvad der IKKE kan gendannes:** Selve dokumentfilerne hvis Storage-kontoen slettes. Derfor er Storage-kontoen inkluderet i Continuous Backup-strategien via resource group-sikring.

**Praktisk safeguard:** Bicep-templaten sætter `preventDeletion`-lås på Storage-kontoen og Cosmos DB per default:
```bicep
resource storageLock 'Microsoft.Authorization/locks@2020-05-01' = {
  name: 'storage-delete-lock'
  scope: storageAccount
  properties: {
    level: 'CanNotDelete'
    notes: 'Protect customer document storage from accidental deletion'
  }
}
```

### 22.3 Recovery Time Objectives

| Scenarie | Forventet gendannelsestid (RTO) | Datatabsvindue (RPO) | Procedure |
|---|---|---|---|
| Cosmos DB korruption/utilsigtet sletning | 15–60 min (selvbetjening — verificeret 2026-08-11, `cosmos-azurechat-val1` kører nu Continuous30Days, se §22.1) | **Nær-nul** (Continuous Backup logger kontinuerligt — Microsofts dokumenterede garanti er typisk sekunder-til-minutter, ikke et fast interval) | Continuous Backup point-in-time restore |
| AI Search indeks slettet | 5–30 min | N/A — indeks er et derivat, ingen data tabes (kilde-dokumenter er i Blob Storage) | Rebuild fra Blob Storage |
| App Service nede | 2–5 min | N/A — ingen persistent state i App Service selv | Azure restart / re-deployment |
| Hel resource group slettet ved fejl | 1–4 timer | Samme som Cosmos-rækken ovenfor (nær-nul) forudsat Continuous Backup var aktiv før hændelsen; Blob Storage og AI Search-indeks har ingen platform-backup — se §22.2 | Ny provisioning + Cosmos DB restore |
| Azure northeurope region nede | 4–24 timer | Afhænger af hvornår seneste Cosmos-restore-punkt/Blob-tilstand blev genskabt i westeurope — ikke uafhængigt verificeret | Re-deployment i westeurope |

**Korrektion 2026-08-11 (SR-007):** før dette var Cosmos DB-rækken ovenfor aspirationel, ikke sand — kontoen kørte reelt Periodic (240min interval, 8h retention, RTO reelt timer via Support-ticket, RPO op til 4 timer), fordi `backupPolicy` aldrig var sat i Bicep (RP-default). Tabellen beskriver nu, hvad der faktisk er deployeret og verificeret på `cosmos-azurechat-val1` — se `docs/deployment-record.md` (2026-08-11) for før/efter-bevis, og §22.1 for detaljerne.

---

## 23. GitHub Repository-Struktur

### 23.1 Repositories

| Repository | Formål | Adgang |
|---|---|---|
| `PixelflowDK/SalesPrism` | Fork af microsoft/azurechat + UI-lag | Udviklere |
| `sales-prism/infrastructure` | Bicep-templates + GitHub Actions workflows | DevOps + Arkitekter |
| `sales-prism/admin-portal` | Det interne admin portal (Next.js) | Udviklere |

Alternativt som ét monorepo:
```
sales-prism/
├── apps/
│   ├── chat/          ← Fork af azurechat
│   └── admin/         ← Admin portal
├── infra/
│   ├── bicep/         ← Alle Bicep-templates
│   └── .github/
│       └── workflows/ ← provision-customer.yml m.fl.
└── docs/
    └── SAD_v1.4.md    ← Dette dokument
```

**Anbefaling:** Monorepo er enklere at starte med og nemmere at holde synkront. Split til separate repos hvis teamet vokser.

### 23.2 Branch-strategi

```
main          ← Produktionskode. Kræver PR + review. Trigger til prod.
develop       ← Integrationsgren. Kræver PR fra feature-branches.
feature/*     ← Individuelle features og fixes.
```

### 23.3 GitHub Environments

| Environment | Beskyttelse | Brugt af |
|---|---|---|
| `production` | Kræver navngivet reviewer før deployment | provision-customer.yml |
| `staging` | Ingen — hurtig deployment til test | Automatisk ved push til develop |

---

## 24. Azure Subscription-Struktur

### 24.1 Anbefalet Struktur

To abonnementer fra start:

```
Sales Prism Azure Tenant
├── Management Group: Sales Prism
│   ├── Subscription: sales-prism-prod
│   │   ├── rg-azurechat-dsv          ← Kunde 1
│   │   ├── rg-azurechat-microsoft    ← Kunde 2
│   │   ├── rg-azurechat-novo         ← Kunde 3
│   │   ├── rg-salesprism-platform    ← Admin portal, DNS-zone, delt infra
│   │   └── ... (op til 20 kunder)
│   └── Subscription: sales-prism-dev
│       ├── rg-azurechat-test1        ← Test-deployment af nye features
│       ├── rg-azurechat-test2        ← Staging-miljø
│       └── rg-salesprism-platform-dev
```

**Rationale:**
- Produktion er isoleret — dev-eksperimenter kan aldrig påvirke kundernes miljøer
- Separate Azure Policy-sæt: prod er striks (kun EU-regioner, ingen public endpoints), dev er mere åben
- Kvote-lofter er per abonnement — dev-forbrug tæller ikke med i prod-kvoten
- Tydeligere omkostningsfordeling

### 24.2 Platform Resource Group

Inden for `sales-prism-prod` er der én resource group til Sales Prism's egen infrastruktur:

```
rg-salesprism-platform
├── App Service: admin-portal
├── App Service Plan: admin
├── Cosmos DB: admin-registry (kunderegistrering, tema-data)
├── Key Vault: platform-secrets (Cloudflare API-token, GitHub token)
└── Application Insights: platform-monitoring
```

---

## 25. Navngivningskonventioner og Tagging

### 25.1 Ressource-navne

Alle navne følger mønsteret: `{type}-azurechat-{slug}` for kunderessourcer.

| Ressource | Navnemønster | Eksempel |
|---|---|---|
| Resource Group | `rg-azurechat-{slug}` | `rg-azurechat-dsv` |
| App Service Plan | `plan-azurechat-{slug}` | `plan-azurechat-dsv` |
| App Service | `app-azurechat-{slug}` | `app-azurechat-dsv` |
| Azure OpenAI | `oai-azurechat-{slug}` | `oai-azurechat-dsv` |
| AI Search | `srch-azurechat-{slug}` | `srch-azurechat-dsv` |
| Cosmos DB | `cosmos-azurechat-{slug}` | `cosmos-azurechat-dsv` |
| Key Vault | `kv-azurechat-{slug}` | `kv-azurechat-dsv` |
| Storage Account | `st{slug}{random5}` | `stdsv4x9k2` |
| Document Intelligence | `docintel-azurechat-{slug}` | `docintel-azurechat-dsv` |
| VNet | `vnet-azurechat-{slug}` | `vnet-azurechat-dsv` |
| App Insights | `appi-azurechat-{slug}` | `appi-azurechat-dsv` |

**Storage Account-note:** Skal være globalt unikt, kun lowercase, max 24 tegn. Bruger `st` + slug + 5 tilfældige chars genereret af Bicep: `uniqueString(resourceGroup().id)`.

### 25.2 Slug-regler

Slug er kundens unikke identifikator og bruges overalt — i ressourcenavne, DNS, Cosmos DB-nøgler.

```
Regler:
- Kun lowercase bogstaver, tal og bindestreger
- Ingen mellemrum, punktummer eller specialtegn
- Minimum 2 tegn, maksimum 20 tegn
- Skal starte med et bogstav
- Må ikke være et reserveret ord (test, admin, api, www, mail)

Eksempler:
✅ dsv, microsoft, novo-nordisk, tryg, dfds
❌ DSV, novo nordisk, tryg.dk, 123firma
```

Valideres som første trin i GitHub Actions `validate`-jobbet.

### 25.3 Azure Resource Tags

Alle ressourcer tagges automatisk af Bicep-templaten:

| Tag | Værdi | Formål |
|---|---|---|
| `customer` | `{slug}` | Kundereference |
| `environment` | `production` | Miljøidentifikation |
| `managed-by` | `sales-prism-provisioning` | Identificerer automatisk oprettede ressourcer |
| `deployed-at` | `{ISO-dato}` | Hvornår senest deployed |
| `model-tier` | `standard` / `professional` / `enterprise` | AI-model tier |
| `cost-center` | `{slug}` | Omkostningsallokering per kunde |

---

## 26. Persona-Retningslinjer

### 26.1 Hvad er en Persona?

En Persona er den systemprompt der definerer AI-assistentens identitet, rolle og adfærd for en specifik kundeinstallation. Den er det første der sendes til modellen i hver samtale — før brugerens besked.

### 26.2 Anbefalet Systemprompt-Struktur

Alle kunde-personas bør følge denne struktur:

```
Du er [NAVN], en AI-assistent for [VIRKSOMHEDSNAVN].

## Din rolle
[1-2 sætninger om hvad assistenten hjælper med]

## Dine kompetencer
- [Kompetence 1]
- [Kompetence 2]
- [Kompetence 3]

## Sproglige retningslinjer
- Svar altid på [SPROG]
- Brug en [TON: professionel/venlig/teknisk] tone
- Vær præcis og konkret — undgå lange indledninger

## Vigtige begrænsninger
- Basér dine svar udelukkende på de dokumenter du har adgang til
- Hvis du ikke finder svaret i dokumenterne, sig: "Jeg har ikke information om det i de tilgængelige dokumenter"
- Del aldrig fortrolig information fra ét dokument med brugere der ikke har adgang til det
- Kommenter ikke på konkurrenter, priser eller forretningsmæssige beslutninger

## Når du er usikker
Sig "Det ved jeg ikke med sikkerhed" — gæt aldrig.
```

### 26.3 Eksempel — DSV Persona

```
Du er Vera, en AI-assistent for DSV.

## Din rolle
Du hjælper DSV-medarbejdere med at finde information i interne dokumenter,
procedurer og politikker hurtigt og præcist.

## Dine kompetencer
- Søgning i og opsummering af interne DSV-dokumenter
- Besvarelse af spørgsmål om processer og procedurer
- Hjælp til at formulere tekster baseret på virksomhedens standarder

## Sproglige retningslinjer
- Svar altid på dansk medmindre brugeren skriver på engelsk
- Brug en professionel, direkte tone
- Hold svar korte og handlingsorienterede

## Vigtige begrænsninger
- Basér dine svar udelukkende på de dokumenter du har adgang til
- Hvis svaret ikke findes i dokumenterne: "Det har jeg ikke information om i de tilgængelige dokumenter"
- Diskutér ikke konkurrenter, priser eller forretningsstrategi

## Når du er usikker
Sig "Det er jeg ikke sikker på" og henvis til den relevante afdeling.
```

### 26.4 Systemprompt-Længde

- **Anbefalet:** 200–500 tokens (ca. 150–375 ord)
- **Maksimum:** 1.000 tokens — kortere systemprompt giver mere plads til dokumentkontekst
- Lange systemprompts reducerer den effektive kontekstvindueplads til RAG-chunks

---

*Version 1.4 — Operations Runbook, Backup/DR, Repository-struktur, Subscription-struktur, Navngivning og Persona-retningslinjer tilføjet. Dokument er nu komplet.*
*Dette dokument er den primære arkitektoniske sandhedskilde for alle Claude Code implementeringssessioner.*
*Næste skridt: Phase A — registrér sales-prism.com og fork microsoft/azurechat.*

---

## 27. Component 12: Learning Module System

### 27.1 Oversigt

Sales Prism-platformen er ikke et generisk AI-chat-værktøj — den er Sales Coach-metodologien leveret som et AI-drevet produkt. Hvert kunde-deployment indeholder de 7 Sales Coach-modeller som læringsmoduler, der er tilgængelige direkte i chat-applikationen.

Moduler kan tilvælges og fravælges per kunde fra admin-portalen, og det kan ændres løbende uden re-deployment.

### 27.2 De 7 Standardmoduler

| Nøgle | Modul | Kernebegreb |
|---|---|---|
| `module-01` | 1st Position vs 2nd Position Model | Seek first to understand, then to be understood |
| `module-02` | 360° Customer Understanding Model | Forstå kundens forretning langt forbi deres logo |
| `module-03` | Personas & Stakeholder Model | Kortlæg beslutningstagere, influencere og stakeholders |
| `module-04` | Value Conversation Model | Taler kundens værdisprog på tværs af 5 value areas |
| `module-05` | Why–What–How–Value Model | Kommunikér med formål — forstå først, engagér derefter |
| `module-06` | Continuous Lifecycle & Partnership Model | Fra leverandør til betroet strategisk partner |
| `module-07` | Questionary & Active Listening Model | Nysgerrighed med struktur skaber forståelse |

### 27.3 Per-Kunde Modul-Konfiguration (Cosmos DB)

Hvert kunde-deployment har et `moduleConfig`-dokument i Cosmos DB:

```json
{
  "tenantSlug": "dsv",
  "modules": [
    {
      "key": "module-01",
      "active": true,
      "order": 1,
      "customName": null,
      "language": "da",
      "contentOverride": null
    },
    {
      "key": "module-02",
      "active": true,
      "order": 2,
      "customName": "360° Kundeforståelse",
      "language": "da",
      "contentOverride": null
    },
    {
      "key": "module-03",
      "active": false,
      "order": 3,
      "customName": null,
      "language": "da",
      "contentOverride": null
    }
  ]
}
```

### 27.4 Kundespecifikke Indholdsvarianter (Atea-modellen)

Kunder som Atea kan have tilpassede versioner af modulerne — fx med Atea-specifik terminologi, branding eller eksempler. Dette håndteres via `contentOverride`-feltet, der peger på en kundespecifik indholdsfil i kundens Azure Blob Storage.

Fallback-kæden:
```
1. Kundespecifikt indhold (contentOverride) → hvis findes
2. Standard Sales Coach indhold for det valgte sprog
3. Engelsk (EN) standard indhold som fallback
```

### 27.5 Admin Portal — Modul-Management

Fra admin-portalen kan operatøren per kunde:
- Slå individuelle moduler til/fra (kan ændres løbende uden re-deployment)
- Ændre rækkefølgen modulerne vises i
- Angive et kundespecifikt modulnavn
- Uploade kundespecifikt indhold (contentOverride)

Ændringer gemmes direkte til Cosmos DB og er live ved næste sideload — ingen re-deployment.

---

## 28. Component 13: Multilingual Content Architecture

### 28.1 Sprogsupport

Platformen understøtter tre sprog for Sales Coach-indholdet:

| Sprog | Kode | Status |
|---|---|---|
| Engelsk | `en` | Altid tilgængeligt — fallback-sprog |
| Dansk | `da` | Standard for nordiske kunder |
| Norsk | `no` | Tilgængeligt (norsk PDF-version eksisterer) |

**Vigtigt:** Sales Coach har udviklet sprogtilpassede versioner af metodologien med specifik terminologi per sprog — det er ikke blot oversættelser. F.eks. bruges "Søg først at forstå" på dansk og "Søk først å forstå" på norsk — begge med den rette kulturelle nuance.

### 28.2 Sprog-Konfiguration Per Deployment

Sprog sættes af operatøren i admin-portalen ved provisioning:
- **Default sprog** — det sprog applikationen starter på (typisk `da` for danske kunder)
- **Tilgængelige sprog** — EN er altid inkluderet + op til 2 ekstra (f.eks. `da` + `no`)

Brugere kan skifte sprog i UI'et — valget gemmes i `localStorage` og huskes på tværs af sessioner.

### 28.3 Fallback-Kæde

```
Bruger vælger sprog: "no"
    ↓
Tjek: Findes kundespecifikt indhold på "no"? → Brug det
    ↓ (nej)
Tjek: Findes standard Sales Coach indhold på "no"? → Brug det
    ↓ (nej)
Brug standard Sales Coach indhold på "en"
```

### 28.4 Systemprompt og Sprog

AI-assistentens systemprompt indeholder sproginstruktioner:
```
Svar altid på [SPROG] medmindre brugeren skriver på et andet sprog,
i så fald matcher du brugerens sprog.
```

---

## 29. Component 14: Audio Content — MP3 Læringsmoduler (Version 2)

### 29.1 Koncept

Hvert læringsmodul kan have en tilknyttet MP3-fil — en podcastlignende audio-opsummering af modulet, optaget af Carsten Hoelstad (Sales Coach). Brugere kan lytte til en 10-12 minutters introduktion til et modul direkte i applikationen, inden de interagerer med AI-assistenten om det pågældende emne.

**Reference:** Atea Salgsskolen er et eksempel på dette format — 8 episoder (ep0 introduktion + ep1-7 én per model), optaget på dansk til Ateas interne brug.

Dette feature er planlagt til **Version 2** og bygges ikke i den initielle release.

### 29.2 Audio Arkitektur

Audio-filer tilhører Sales Coach's indhold — ikke kundedata. De lagres centralt:

```
Central ISV Blob Storage (delt på tværs af alle deployments)
└── modules/
    ├── da/
    │   ├── 00-intro.mp3
    │   ├── 01-position-model.mp3
    │   ├── 02-360-customer.mp3
    │   ├── 03-personas.mp3
    │   ├── 04-value-conversation.mp3
    │   ├── 05-why-what-how-value.mp3
    │   ├── 06-lifecycle-partnership.mp3
    │   └── 07-questionary-listening.mp3
    ├── no/
    │   └── [samme struktur]
    └── en/
        └── [samme struktur]
```

Azure CDN foran Blob Storage sikrer lav latens og global tilgængelighed.

### 29.3 Kundespecifikke Audio-Filer (Atea-modellen)

Kunder som Atea, der har fået optaget kundespecifikke versioner, har deres audio-filer i deres eget Blob Storage:

```
rg-azurechat-atea / storage-atea
└── audio/
    ├── da/
    │   ├── 00-intro.mp3         ← Atea Salgsskolen intro
    │   ├── 01-position-model.mp3
    │   └── ...
```

Fallback-kæden for audio:
```
1. Kundespecifik audio (kundens Blob Storage) → hvis findes
2. Standard Sales Coach audio (central ISV Blob Storage / CDN)
3. Ingen audio (modulet vises uden afspiller)
```

### 29.4 Cosmos DB — Audio URL Skema

`moduleConfig`-dokumentet udvides med audio-referencer:

```json
{
  "key": "module-01",
  "active": true,
  "audioUrl": null,
  "audioOverrideUrl": "https://statea4x9k2.blob.core.windows.net/audio/da/01-position-model.mp3"
}
```

N�r `audioUrl` er `null`, bruger applikationen CDN-URL'en baseret på modul-nøgle og sprog. `audioOverrideUrl` bruges når kunden har en kundespecifik lydfil.

### 29.5 UI — Audio Afspiller

En minimalistisk HTML5 audio-afspiller vises øverst i modulvisningen:

```
[▶ Lyt til introduktion — ca. 10 min]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 0:00 / 10:42
```

Komponenten bruger den native HTML5 `<audio>`-tag med Cloudflare CDN-URL. Ingen tredjeparts afspiller nødvendig.

### 29.6 Admin Portal — Audio Upload (v2)

I version 2 tilføjes et upload-interface i admin-portalen:
- Upload MP3-fil per modul per sprog per kunde
- Filen gemmes til kundens Azure Blob Storage
- `audioOverrideUrl` opdateres automatisk i Cosmos DB
- Live ved næste sideload — ingen re-deployment

---

## 30. Component 15: Persona-Arkitektur (Opdateret)

### 30.1 Hvad er en Persona i Sales Prism-konteksten?

En Persona er mere end en simpel systemprompt. I Sales Prism er AI-assistenten dybt forankret i Sales Coach-metodologien. En veludformet persona skal:

- Kende de aktiverede Sales Coach-modeller for denne kunde
- Kommunikere i den rette tone og på det rette sprog
- Overholde kundespecifikke begrænsninger og fokusområder
- Afspejle om det er en generisk Sales Prism-assistent eller en kundespecifik variant (f.eks. "Atea Salgsskolen AI")

### 30.2 Persona-Niveauer

| Niveau | Beskrivelse | Eksempel |
|---|---|---|
| **Standard** | Generisk Sales Coach AI-assistent | "Du er en Sales Coach AI-assistent..." |
| **Branded** | Kundens navn og tone, Sales Coach metodik | "Du er Vera, DSVs AI-assistent, trænet i Sales Coach metodologien..." |
| **Kundespecifik** | Fuldt tilpasset med kundespecifik terminologi og indhold | "Du er Atea Sales Coach, Ateas interne salgstræner..." |

### 30.3 Admin Portal — Persona-Editor

Persona-editoren i admin-portalen understøtter:

**Basis-konfiguration:**
- Assistentens navn (f.eks. "Vera", "Atea Sales Coach")
- Sprog og tone (professionel, varm, direkte)
- Kort rollebeskrivelse

**Modul-integration:**
- Operatøren vælger hvilke af de 7 moduler der er aktiveret
- Systemet injicerer automatisk den relevante metodologivejledning i systemprompten for hvert aktivt modul
- Eksempel: Aktiveres "Value Conversation Model" injiceres en kort beskrivelse af de 5 value areas i systemprompten

**Sprog:**
- Default sprog for assistenten
- Om assistenten skal matche brugerens sprog automatisk

**Regler og begrænsninger:**
- Must-do: hvad assistenten altid skal gøre
- Must-not: hvad assistenten aldrig må gøre
- Fokusområder: hvilke emner assistenten primært hjælper med

**Forhåndsvisning:**
- Live preview af den genererede systemprompt
- Test-chat i editoren inden ændringen gemmes

### 30.4 Systemprompt Auto-Generator

Admin-portalen genererer systemprompten automatisk fra formularfelterne. Eksempel på genereret systemprompt for DSV:

```
Du er Vera, en AI-assistent for DSV, trænet i Sales Coach-metodologien.

## Din rolle
Du hjælper DSVs sælgere med at forberede og gennemføre bedre 
kundesamtaler ved hjælp af Sales Coach metodologien.

## Aktiverede Sales Coach modeller
Du er vejledt i følgende modeller og bruger dem aktivt i dine svar:
- 1st vs 2nd Position Model: Hjælp sælgerne med at skifte fra 
  selvcentreret til kundecentreret kommunikation
- 360° Customer Understanding Model: Hjælp med at kortlægge kundens 
  strategiske, taktiske og operationelle virkelighed
- Value Conversation Model: Hjælp med at identificere kundens value 
  areas (Speed & Agility, People & Processes, Risk & Governance, 
  Economics & Control, Sustainability & Responsibility)

## Sproglige retningslinjer
- Svar altid på dansk medmindre brugeren skriver på engelsk
- Brug en professionel, direkte tone
- Hold svar handlingsorienterede og konkrete

## Vigtige begrænsninger
- Basér dine svar på Sales Coach metodologien og de uploadede dokumenter
- Diskutér ikke konkurrenter, priser eller forretningsmæssige beslutninger
- Sig "Det ved jeg ikke med sikkerhed" — gæt aldrig
```

### 30.5 Kundespecifikt Metodologiindhold — RAG-baseret (Version 1)

Operatøren kan uploade kundespecifikt metodologiindhold direkte fra admin-portalen. Typiske dokumenter:

- Kundens tilpassede version af Sales Coach-filosofien (f.eks. "Atea Salgsskolen" på dansk)
- Kundespecifikke eksempler, case studies og branchespecifik terminologi
- Interne salgsplaybooks eller produktspecifikke guides

Disse dokumenter indekseres i kundens dedikerede Azure AI Search-indeks (samme pipeline som bruger-uploadede dokumenter) og bruges af AI-assistenten som primær kilde frem for standard Sales Coach-indholdet.

**Fallback-kæden for AI-svar:**
```
1. Kundespecifikt metodologiindhold (RAG) → hvis uploadet og relevant
2. Aktiverede Sales Coach standardmoduler (injiceret i systemprompt)
3. Brugerens egne uploadede dokumenter (RAG)
4. Assistentens generelle viden
```

**Admin Portal — Metodologi-dokument Upload:**
- Separat sektion i admin-portalen: "Metodologiindhold" per kunde
- Upload PDF, DOCX — behandles via Azure Document Intelligence (samme pipeline)
- Dokumenterne tagges med `documentType: "methodology"` i AI Search-indekset for nem filtrering
- Kan opdateres løbende — nye uploads erstatter eller supplerer eksisterende indhold
- Vises i admin-portalen som en liste med uploadtidspunkt og status

**Teknisk implementering:**
Ingen ny Azure-infrastruktur nødvendig — metodologidokumenter bruger den eksisterende RAG-pipeline (Document Intelligence → chunking → embedding → AI Search). Den eneste forskel er `documentType`-tagget og at disse dokumenter uploades af operatøren fra admin-portalen frem for af slutbrugeren via chat-UI'et.


---

## 31. Component 16: Observability og Monitoring

### 31.1 Arkitektur — Per-Kunde Isolation

Hvert kunde-deployment har dedikeret telemetri i eget scope. Ingen delt workspace med andre kunders data.

```
Per-kunde (rg-azurechat-{slug}):
  Application Insights            ← appi-azurechat-{slug}
  Log Analytics Workspace         ← law-azurechat-{slug}
  Retention: 30 dage (standard)

ISV Platform (rg-salesprism-platform):
  Log Analytics Workspace (ISV)   ← law-salesprism-platform
  Dækker: admin portal, GitHub Actions, provisioning logs
  Ingen kundedata her
```

**GDPR-begrundelse for per-kunde workspace:** Telemetri kan indeholde bruger-ID'er, IP-adresser og exception-detaljer der indirekte identificerer brugere. Per-kunde isolation sikrer at en fejlkonfigureret RBAC-tildeling aldrig eksponerer én kundes telemetri for en anden.

### 31.2 Standard Alerting Baseline [Implementeret + korrigeret 2026-08-11 — H-5]

Konfigureres automatisk af Bicep per kunde (`infra/modules/alerts.bicep`, deployeret og
verificeret live på val1 2026-08-11 — se `docs/deployment-record.md`). Hver alert er implementeret
i sin korrekte native Azure Monitor-form — ikke alle er "samme slags" alert:

| Alert | Tærskel | Implementeringsform | Kanal |
|---|---|---|---|
| App Service availability | < 99% over 5 min | **Metric alert** på `availabilityResults/availabilityPercentage` (Application Insights), fodret af en `Microsoft.Insights/webtests` ping-test mod app-hostnavnet | Email til InsightCast |
| HTTP 5xx rate | > 5% over 5 min | **Log-query alert** (`scheduledQueryRules`, KQL mod App Insights' `requests`-tabel) — ingen native procent-metric findes på App Service selv. **Afhænger af SR-010-telemetri (OpenTelemetry-instrumentering) rent faktisk kører** — uden det har denne alert ingen data at evaluere | Email til InsightCast |
| Azure OpenAI quota | > 80% TPM forbrugt | **Metric alert** pr. deployment på `TokenTransaction` (dimension `ModelDeploymentName`), tærskel beregnet fra deployment-kapaciteten (1K TPM-enheder × 1000 × 5 min × 0,8) | Email til InsightCast |
| Cosmos DB throttling | > 10 RU/s throttled | **Metric alert** — "RU/s" findes ikke som metric; implementeret som antal `TotalRequests` med `StatusCode=429` (dimension) > 10 over 5 min. Bevidst fortolkning, dokumenteret som sådan | Email til InsightCast |
| AI Search throttling | > 5% 503 responses | **Metric alert** på den native `ThrottledSearchQueriesPercentage`-metric — ingen log-query nødvendig | Email til InsightCast |
| App Service CPU | > 85% over 10 min | **Metric alert** på `CpuPercentage` (App Service Plan) | Email til InsightCast |
| Cost anomaly | > 150% af baseline/dag | **`Microsoft.Consumption/budgets`** — men kun i sin korrekte MÅNEDLIGE form (budgets understøtter ikke en daglig `timeGrain`). Implementeret som en månedlig budget-notifikation ved 150% af det estimerede månedlige tier-forbrug (SAD §17). **Ikke** en reel dags-niveau-anomali-detektor — det kræver Azure Cost Managements separate Anomaly Alert-funktion (abonnements-/faktureringskonto-niveau, ikke en per-kunde Bicep-ressource) — se `docs/known-limitations.md` | Email til InsightCast |

**Action group:** `ag-azurechat-{slug}`, parameteriseret email-modtager (default
`kontakt@pixelflow.dk`), delt af alle syv alerts.

### 31.3 PII-minimering i Telemetri

```typescript
// Application Insights telemetry initializer
// Fjerner PII inden data sendes
const telemetryInitializer = (envelope: ITelemetryItem) => {
  // Pseudonymisér bruger-ID
  if (envelope.data?.userId) {
    envelope.data.userId = hashUserId(envelope.data.userId)
  }
  // Fjern email-adresser fra exception-beskeder
  if (envelope.data?.message) {
    envelope.data.message = redactEmails(envelope.data.message)
  }
  // Fjern query-parametre (kan indeholde søgeord/prompts)
  if (envelope.data?.url) {
    envelope.data.url = stripQueryParams(envelope.data.url)
  }
}
```

Chat-prompts og AI-svar logges **aldrig** til Application Insights — kun metadata (token-antal, latens, model-tier, status-kode).

### 31.4 ISV Platform Observability

```
rg-salesprism-platform Log Analytics Workspace indeholder:
- Provisioning workflow logs (GitHub Actions → Azure Monitor)
- Admin portal request logs (pseudonymiserede)
- Deployment success/failure events
- Global cost overview (aggregeret på tværs af kunder)

INGEN af følgende i platform-workspace:
- Kunders chat-indhold
- Kunders uploadede dokumenter
- Kunders bruger-PII
```

### 31.5 Distribueret Tracing

Application Insights correlates requests på tværs af:
```
Next.js API route → Azure OpenAI → AI Search → Cosmos DB
```
Correlation ID propageres via `traceparent` header. Giver end-to-end latens-overblik per request uden at eksponere indhold.

### 31.6 Bicep-modul

Observability provisioneres som standard i alle deployments:
```bicep
module observability './modules/observability.bicep' = {
  name: 'observability'
  params: {
    customerSlug: customerSlug
    location: azureRegion
    retentionDays: 30  // GDPR-minimum, kan øges per kontrakt
  }
}
```

---

## 32. GDPR — Udvidet Data Protection Framework

### 32.1 Data-klassifikation

| Datakategori | Eksempler | Klassifikation | Retention | Sletningsmetode |
|---|---|---|---|---|
| Chat-prompts og -svar | Brugerens spørgsmål, AI-svar | Personoplysninger | 90 dage TTL | Automatisk Cosmos DB TTL |
| Uploadede dokumenter | PDF, DOCX, XLSX | Potentielt fortrolige | 90 dage TTL | Blob TTL + AI Search index sletning |
| Vektorembeddings | Matematiske repræsentationer | Afledte data | 90 dage | Cosmos DB + AI Search sletning |
| Bruger-identitet | Navn, email, rolle | Personoplysninger | Konto-levetid | Manuel sletning via admin-UI |
| Aktivitets-logs | Login-tidspunkt, prompt-antal | Personoplysninger | 30 dage | Log Analytics retention policy |
| Telemetri | Pseudonymiserede ID'er, latens | Anonymiserede data | 30 dage | Log Analytics retention policy |
| Tenant-konfiguration | Tema, model-tier, persona | Forretningsdata | Konto-levetid | Offboarding workflow |

### 32.2 Legal Basis og Behandlingsformål

| Behandling | Legal basis (GDPR art. 6) | Formål |
|---|---|---|
| Chat-historik | Art. 6(1)(b) — Kontraktopfyldelse | Levere AI-assistenten |
| Dokument-RAG | Art. 6(1)(b) — Kontraktopfyldelse | Dokumentsøgning |
| Aktivitets-analytics | Art. 6(1)(f) — Legitim interesse | Platform-forbedring, kundeservice |
| Telemetri/logs | Art. 6(1)(f) — Legitim interesse | Sikkerhed og driftsovervågning |

**Processorkæde:**
```
Kunde (Controller) → InsightCast/Sales Coach (Processor) → Microsoft Azure (Sub-processor)
```
DPA med Microsoft dækker Azure-behandlingen. InsightCast skal have DPA med hver kunde.

### 32.3 Data Subject Rights — Implementation

**Ret til sletning (artikel 17) — "Glem bruger X":**
```typescript
// API endpoint: DELETE /api/admin/users/{userId}/gdpr-erase
async function eraseUser(tenantSlug: string, userId: string) {
  // 1. Slet chat-historik fra Cosmos DB
  await cosmosClient.deleteUserMessages(tenantSlug, userId)

  // 2. Anonymisér bruger-entity (bevar til audit, men fjern PII)
  await cosmosClient.anonymizeUser(tenantSlug, userId)

  // 3. Slet bruger fra Entra External ID (hvis username/password auth)
  await graphClient.deleteUser(userId)

  // 4. Log sletning til audit-trail
  await auditLog.record('gdpr_erasure', { tenantSlug, userId, timestamp: new Date() })

  // NB: Embeddings i AI Search kan ikke slettes per bruger
  // — de er anonymiserede dokumentrepræsentationer
}
```

**Ret til dataportabilitet (artikel 20):**
Eksisterende dataeksport-funktion i admin-portalen (Section 15.4) opfylder dette krav.

**Ret til indsigt (artikel 15):**
Bruger kan se sin chat-historik direkte i applikationen. Admin kan eksportere.

### 32.4 DPIA-vurdering

En DPIA (Data Protection Impact Assessment) anbefales inden første enterprise-kunde onboardes. Nøglepunkter:

- **Høj risiko:** AI-behandling af potentielt følsomme salgssamtaler
- **Afbødning:** EU-only inferens (DataZoneStandard), per-kunde isolation, 90-dages TTL
- **Sub-processor:** Microsoft Azure — anerkendt og DPA-dækket
- **Konklusion (foreløbig):** Behandlingen er nødvendig, proportional og tilstrækkeligt beskyttet

---

## 33. Platform Ressourcestruktur — ISV vs. Kunder

### 33.1 Resource Group Arkitektur

```
Azure Subscription: InsightCast SaaS
│
├── rg-salesprism-platform          ← ISV-interne ressourcer
│   ├── app-salesprism-admin        App Service (admin portal)
│   ├── cosmos-salesprism-registry  Cosmos DB (kunde-register)
│   ├── kv-salesprism-platform      Key Vault (Cloudflare token, GitHub token)
│   ├── law-salesprism-platform     Log Analytics (platform-logs)
│   └── st-salesprism-artifacts     Storage (Bicep templates, assets)
│
├── rg-azurechat-dsv               ← Kunde: DSV
│   ├── app-azurechat-dsv
│   ├── oai-azurechat-dsv
│   ├── srch-azurechat-dsv
│   ├── cosmos-azurechat-dsv
│   ├── kv-azurechat-dsv
│   ├── appi-azurechat-dsv
│   ├── law-azurechat-dsv
│   └── vnet-azurechat-dsv
│
├── rg-azurechat-atea              ← Kunde: Atea
│   └── [samme struktur]
│
└── rg-azurechat-novo              ← Kunde: Novo
    └── [samme struktur]
```

### 33.2 Platform Resource Group Detaljer

`rg-salesprism-platform` provisioneres manuelt én gang og er **ikke** en del af per-kunde provisioning-workflowet.

| Ressource | Formål | Adgang |
|---|---|---|
| `app-salesprism-admin` | Admin portal (Next.js) | Kun InsightCast operatører via Entra ID SSO |
| `cosmos-salesprism-registry` | Kunde-register, licenser, global metadata | Admin portal via managed identity |
| `kv-salesprism-platform` | Cloudflare API-token, GitHub PAT til dispatch | GitHub Actions via OIDC + managed identity |
| `law-salesprism-platform` | Platform-niveau logs (ingen kundedata) | Kun InsightCast ingeniører |
| `st-salesprism-artifacts` | Bicep-moduler, logo-assets, certifikat-skabeloner | GitHub Actions via managed identity |

### 33.3 Azure Policy Scope

Azure Policy-regler gælder hele subscriptionen:
```
Subscription: InsightCast SaaS
  Policy 1: Deny resources outside northeurope/westeurope
  Policy 2: Deny public network access on AI services
  Policy 3: Require tags (customer, environment, managed-by)
  Policy 4: Deny GlobalStandard on Azure OpenAI deployments

Gælder for: rg-salesprism-platform + alle rg-azurechat-{slug}
```

---

## 34. Kendte Arkitektur-Tradeoffs

Disse beslutninger er truffet bevidst. De dokumenteres her så fremtidige sessioner ikke re-diskuterer dem.

### 34.1 Dedicated-per-kunde vs. Shared Stack

**Beslutning:** Fuldt dedikeret Azure-stak per kunde — ikke shared App Service eller shared database.

| Fordel | Ulempe |
|---|---|
| Absolut dataisolation — ingen risiko for cross-tenant leak | Højere Azure-basiskostnad per SMB-kunde |
| GDPR-dokumentation er triviel — separat ressourcegruppe | Operationel kompleksitet stiger lineært med antal kunder |
| Enterprise-kunder kan kræve isolation som kontraktkrav | Subscription-kvoter (VNets, PEs) kan rammes ved 100+ kunder |
| Simpel offboarding — slet resource group | |

**Genåbningskriterium:** Revurdér ved 50+ kunder eller hvis Azure-marginerne presses under 70%.

### 34.2 Basic AI Search vs. Standard

**Beslutning:** Basic-tier som default — Standard S1 som opt-in opgraderingssti.

Basic-tier understøtter hybrid search, Semantic Ranker og vector search. Standard S1 giver højere kapacitet og SLA. Opgradering er én Bicep-parameter og re-deployment.

**Trigger for opgradering:** Aktiv dokumentbrug nærmer sig 12 GB, eller synlig latens under concurrent load.

### 34.3 Central Entra External ID Tenant

**Beslutning:** Én delt Entra External ID tenant til alle username/password-kunder — isolation via tenantSlug-attribut.

Alternativet (én CIAM-tenant per kunde) ville koste ~50 EUR/md per kunde for blot tenant-administration og er uproportionalt komplekst for B2B-skala.

**Sikkerheds-afbødning:** tenantSlug valideres server-side på alle Graph API-kald. Penetrationstest planlagt inden første enterprise-kunde.

### 34.4 Ingen Redis Cache

**Beslutning:** Ingen Azure Cache for Redis i MVP.

Cosmos DB serverless er tilstrækkeligt for forventet query-volumen (< 100 concurrent brugere per deployment i MVP-fasen). Redis tilføjes i Version 2 ved behov.

**Trigger:** Cosmos DB throttling-alerts udløser mere end 5× om måneden.

### 34.5 Ingen Multi-Region DR

**Beslutning:** Single-region per kunde-deployment i MVP. Ingen automatisk failover.

**RPO/RTO per tier:**
| Tier | RPO | RTO | Backup-metode |
|---|---|---|---|
| SMB | 24 timer | 4 timer | Cosmos DB periodisk backup |
| Enterprise | 4 timer | 2 timer | Cosmos DB kontinuert backup + manuel recovery |

Multi-region aktiv-aktiv design udskydes til Enterprise Add-on i Version 2.
