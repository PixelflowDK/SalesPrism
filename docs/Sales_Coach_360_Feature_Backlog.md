# Sales Coach 360 — Product Feature Backlog
## Living document — opdateres løbende

**Version:** 1.0 — Juni 2026
**Produkt:** Sales Coach 360 (arbejdstitel — tidligere Sales Prism)
**Ejer:** InsightCast ApS (Kristjan Hugosson)
**Produkt-ejer:** Sales Coach (Carsten Hoelstad)
**Sidst opdateret:** Juni 2026

---

## Produkt-vision

Sales Coach 360 er ikke "ChatGPT med Sales Coach-dokumenter".
Det er en **digital salgscoach** der kender Sales Coach-metodologien,
husker alle kundeinteraktioner, tracker sælgerens progression og
guider automatisk gennem alle 7 Sales Coach-modeller.

Differentiering fra ChatGPT:
- Applicerer metodologien automatisk — brugeren behøver ikke kende den
- Husker kunder, stakeholders og historik på tværs af sessioner
- Måler og tracker mastery-progression over tid
- Guider struktureret — ikke fri chat

---

## Version Roadmap

```
Version 1 (MVP)    ← Første kunder
  Core platform + de 4 høj-differentierende features

Version 2          ← 3-6 måneder efter launch
  Avancerede coaching-features + progression-tracking

Version 3          ← 6-12 måneder efter launch
  Fine-tuned model + enterprise-features
```

---

## VERSION 1 — MVP Features

### F-01: Struktureret Mødeforberedelse Workflow
**Prioritet:** 🔴 Kritisk — højeste differentiering  
**Version:** 1  
**Status:** Ikke startet

**Beskrivelse:**
Platformen guider sælgeren gennem en struktureret mødeforberedelse
baseret på Sales Coach-metodologien. I stedet for fri chat stiller
platformen automatisk de rigtige spørgsmål og genererer et
personaliseret møde-brief.

**User Story:**
> Som sælger vil jeg hurtigt kunne forberede mig til et kundemøde
> ved hjælp af Sales Coach-metodologien, uden at skulle huske
> hvilke spørgsmål jeg skal stille mig selv.

**Flow:**
```
Sælger: "Forbered mig til møde med [kunde] om [emne]"
    ↓
Platform: Stiller automatisk spørgsmål baseret på 360° model:
  1. "Hvad ved du om kundens vision og strategi?"
  2. "Hvem deltager i mødet? Hvad er deres rolle?"
  3. "Hvad er deres primære udfordringer lige nu?"
  4. "Hvilke value areas er mest relevante?"
    ↓
Output: Personaliseret møde-brief med:
  - 2nd Position åbningsspørgsmål
  - Relevante value conversation temaer
  - Foreslåede discovery-spørgsmål per persona
  - "Burning platform" eller "burning ambition" framing
```

**Teknisk implementation:**
- Vercel AI SDK `streamText` med struktureret multi-turn flow
- System prompt injicerer aktive Sales Coach-moduler
- Output formateres som et struktureret brief-dokument
- Gemmes i Cosmos DB tilknyttet kunde-entity

**Acceptance Criteria:**
- [ ] Brugeren kan starte mødeforberedelse med én prompt
- [ ] Platformen stiller mindst 4 guidende spørgsmål
- [ ] Output indeholder konkrete 2nd Position spørgsmål
- [ ] Brief kan gemmes og genåbnes
- [ ] Fungerer på mobil (PWA)

---

### F-02: Real-time Samtalecoaching
**Prioritet:** 🔴 Kritisk  
**Version:** 1  
**Status:** Ikke startet

**Beskrivelse:**
Sælgeren skriver hvad der skete i et møde eller en samtale.
Platformen analyserer mod Sales Coach-metodologien og giver
konkret, handlingsrettet feedback.

**User Story:**
> Som sælger vil jeg have konkret feedback på mine kundesamtaler
> baseret på Sales Coach-metodologien, så jeg kan forbedre mig
> løbende uden at vente på en coaching-session.

**Eksempel-interaktion:**
```
Sælger: "Jeg startede mødet med at præsentere vores nye produkt.
         Kunden virkede ikke interesseret og kiggede på telefonen."

Platform:
"Det lyder som om du kommunikerede fra 1st Position —
 du fokuserede på hvad I tilbyder fremfor kundens situation.

 Hvad vidste du om kundens nuværende udfordringer inden mødet?

 Prøv denne åbning næste gang:
 'Jeg har set at I [observation fra årsrapport/LinkedIn].
  Hvordan påvirker det jeres [relevant område]?'

 Dette er 2nd Position — du starter med deres verden."
```

**Teknisk implementation:**
- Standard chat-interface med Sales Coach system prompt
- **Azure AI Speech Service (STT)** — mikrofon-input i chat-felt og i post-møde input
  - Tryk og hold mikrofon-ikon → real-time streaming transskription
  - Audio sendes via Next.js API route til Azure Speech (aldrig direkte fra browser)
  - Azure Speech resource i northeurope — GDPR-sikker, EU-only
  - Sprog: dansk, norsk, svensk, engelsk, tysk understøttet
- **STT Post-processing (AI-rensning og kategorisering)**
  - Rå transskription sendes til GPT-4.1 mini inden visning
  - Fjerner fyldeord (øhh, altså, ikk), retter sætningsstruktur, bevarer mening
  - Kategoriserer automatisk hvad sælgeren har delt:
    - Møde-opdatering → starter coaching-flow automatisk
    - Kunde-observation → foreslår at gemme til stakeholder-profil
    - Spørgsmål → besvares direkte
    - Fri chat → behandles som normal besked
  - Renset tekst vises i inputfeltet — redigérbar inden afsendelse
  - Ét API-kald, under ét sekund forsinkelse
- Platform genkender automatisk coaching-kontekst fra nøgleord
- Linker feedback til specifikke Sales Coach-modeller
- Foreslår konkrete alternative formuleringer

**Acceptance Criteria:**
- [ ] Platform identificerer 1st vs 2nd Position kommunikation
- [ ] Feedback er specifik og handlingsrettet
- [ ] Konkrete alternative formuleringer foreslås
- [ ] Kobles til relevant Sales Coach-model

---

### F-03: Kunde-Intelligens — Persistent Hukommelse
**Prioritet:** 🔴 Kritisk  
**Version:** 1  
**Status:** Ikke startet

**Beskrivelse:**
Platformen bygger automatisk et vidensbibliotek om sælgerens kunder
baseret på alt hvad sælgeren har delt. Hver gang en kunde nævnes
trækker platformen på denne viden automatisk.

**User Story:**
> Som sælger vil jeg at platformen husker alt jeg har fortalt om
> mine kunder, så jeg ikke skal gentage kontekst ved hvert møde.

**Datamodel — Kunde-entity i Cosmos DB:**
```json
{
  "id": "customer-dsv-lars-nielsen",
  "tenantSlug": "dsv-salesteam",
  "userId": "usr-peter-hansen",
  "customerName": "DSV Logistics",
  "contacts": [
    {
      "name": "Lars Nielsen",
      "title": "IT-direktør",
      "personaType": "tactical-translator",
      "primaryValueArea": "risk-governance",
      "knownTriggers": ["NIS2", "compliance", "downtime"],
      "notes": "Meget optaget af budget, skeptisk over for nye løsninger"
    }
  ],
  "knownChallenges": ["downtime i produktionsfaciliteter", "NIS2-compliance"],
  "lastInteraction": "2026-06-10",
  "meetingHistory": ["møde-brief-id-1", "møde-brief-id-2"],
  "valueAreas": ["risk-governance", "speed-agility"]
}
```

**Teknisk implementation:**
- Platform genkender kundenavne fra brugerens historik
- Ny information om kunder extraheres automatisk via `onFinish`
- Cosmos DB customer-entities opdateres løbende
- Ved mødeforberedelse hentes relevant kunde-kontekst automatisk

**Acceptance Criteria:**
- [ ] Platform husker kunder på tværs af sessioner
- [ ] Ny information om kunder gemmes automatisk
- [ ] Kunde-kontekst bruges proaktivt i mødeforberedelse
- [ ] Sælger kan se og redigere kundens profil

---

### F-04: Persona-Kortlægning — Levende Stakeholder-profiler
**Prioritet:** 🟡 Høj  
**Version:** 1  
**Status:** Ikke startet

**Beskrivelse:**
Platformen bygger automatisk stakeholder-profiler baseret på
Sales Coach's Personas & Stakeholder Model. Hver gang en person
nævnes opdateres profilen.

**User Story:**
> Som sælger vil jeg have en levende profil på mine vigtigste
> stakeholders, så jeg kan kommunikere præcist til deres
> interesser og value areas.

**Auto-genereret persona-profil:**
```
Lars Nielsen — IT-direktør, DSV Logistics
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Persona-type:    Tactical — The Translator
Org-niveau:      Taktisk
Primary value:   Risk & Governance
Secondary value: Speed & Agility

Kendte triggers:
• NIS2 og compliance-krav
• Downtime i produktionsmiljø
• Budgetpres fra CFO

Kommunikations-tips:
• Tal om "initiativer" og "KPIs" — ikke features
• Nævn referencer fra lignende virksomheder
• Fokus på risiko-reduktion fremfor muligheder

Næste møde — foreslåede spørgsmål:
• "I jeres Zero Trust-initiativ, hvordan balancerer I..."
• "Hvad er de primære årsager til jeres downtime i dag?"
```

**Acceptance Criteria:**
- [ ] Persona-profiler oprettes automatisk fra samtalehistorik
- [ ] Personas klassificeres i Sales Coach-terminologi
- [ ] Konkrete kommunikations-anbefalinger genereres
- [ ] Profiler opdateres løbende med ny information

---

## VERSION 2 Features

### F-05: CANEI Progress Tracking — Mastery Dashboard
**Prioritet:** 🟡 Høj  
**Version:** 2  
**Status:** Idé

**Beskrivelse:**
Platformen måler automatisk sælgerens mastery-niveau per
Sales Coach-model baseret på adfærd i systemet.
Leverer progression-dashboard til sælger og salgschef.

**CANEI Mastery Framework (fra Sales Coach):**
```
0-3:  Forstår konceptet men reflekterer det ikke i adfærd
4-7:  Applicerer og kan forklare til andre
8-10: Inspirerer og udfordrer andre — role model
```

**Platform-målinger:**
- Bruger sælgeren spontant 2nd Position sprog?
- Refererer de korrekt til value areas?
- Stiller de de rigtige spørgsmålstyper (Questionary Model)?
- Bruger de 360° Customer Understanding Framework?

**Dashboard — sælger:**
```
Din Sales Coach 360 Mastery — Juni 2026

Samlet niveau: 5.8 / 10

Per model:
1st/2nd Position        ████████░░ 7.8
360° Customer           ██████░░░░ 6.2
Personas & Stakeholder  █████░░░░░ 5.4
Value Conversation      ██████░░░░ 6.0
Why-What-How-Value      ████░░░░░░ 4.8 ← Fokusér her
Lifecycle & Partnership ███░░░░░░░ 3.5 ← Fokusér her
Questionary & Listening ██████░░░░ 6.3

Anbefaling: Start med Lifecycle & Partnership
→ [Lyt til introduktion] [Øv med AI-kunde]
```

**Dashboard — salgschef:**
```
Team Mastery Overview — Juni 2026

Team gennemsnit: 5.2 / 10
Svageste modul: Why-What-How-Value (4.1)
Anbefaling: Kør fælles session om dette modul

Top performer: [Navn] — 7.3
Mest forbedret: [Navn] — +2.1 siden marts
```

---

### F-06: Automatisk Branche-Briefing
**Prioritet:** 🟢 Medium  
**Version:** 2  
**Status:** Idé

**Beskrivelse:**
Inden et møde kombinerer platformen Sales Coach-metodologi,
aktuelle branche-nyheder og kendt kunde-historik til en
automatisk briefing.

**Teknisk implementation:**
- Vercel AI SDK web search tool
- Kombineres med kunde-entity fra Cosmos DB
- Sales Coach 360° Customer Understanding Model som struktur

---

### F-07: AI Rollespil — Øv Kundemøder
**Prioritet:** 🟢 Medium  
**Version:** 2  
**Status:** Idé

**Beskrivelse:**
Sælgeren øver kundemøder mod en AI der spiller en specifik
kundepersona. Platformen giver feedback efter øvelsen baseret
på Sales Coach-metodologien.

**Flow:**
```
"Øv mig mod en skeptisk CFO der fokuserer på ROI"
    ↓
AI spiller CFO'en i karakter
    ↓
Sælgeren gennemfører mødet
    ↓
Platform analyserer:
- Hvornår skiftede sælgeren til 1st Position?
- Hvilke value areas adresserede de?
- Hvad fungerede godt?
- Konkrete forbedringer til næste gang
```

---

## VERSION 3 Features

### F-08: Fine-tuned Sales Coach Phi-4 mini Model
**Prioritet:** 🔵 Strategisk  
**Version:** 3  
**Status:** Idé

**Beskrivelse:**
En Phi-4 mini model fine-tunet specifikt på Sales Coach-materiale.
Modellen tænker naturligt i Sales Coach-terminologi og behøver
ikke RAG-kontekst for grundlæggende metodologi-spørgsmål.

**Differentiering:**
- Konkurrenter bruger generiske modeller
- Sales Coach 360 har en model der taler metodologien nativt
- Billigere og hurtigere end GPT-4.1 mini til Sales Coach-queries
- 100% EU-baseret via Azure AI Foundry

**Krav til træningsdata:**
- 5.000-10.000 Q&A-par fra Sales Coach-materiale
- 1st vs 2nd Position eksempler (1.000+ par)
- Value Conversation eksempler per persona-type
- Feedback-eksempler fra samtalecoaching

**Teknisk:** Azure AI Foundry fine-tuning pipeline

---

### F-09: CRM-Integration
**Prioritet:** 🔵 Strategisk  
**Version:** 3  
**Status:** Idé

**Beskrivelse:**
Integration med Salesforce/HubSpot/Pipedrive.
Kunde-intelligens synkroniseres bi-directionelt.
Møde-briefs og coaching-noter kan gemmes direkte i CRM.

---

## Feature Prioriterings-Matrix

| Feature | Differentiering | Kompleksitet | ROI | Version |
|---|---|---|---|---|
| F-01 Mødeforberedelse | ⭐⭐⭐⭐⭐ | Lav | Høj | 1 |
| F-02 Samtalecoaching | ⭐⭐⭐⭐⭐ | Lav | Høj | 1 |
| F-03 Kunde-intelligens | ⭐⭐⭐⭐ | Medium | Høj | 1 |
| F-04 Persona-kortlægning | ⭐⭐⭐⭐ | Lav | Høj | 1 |
| F-05 CANEI Progress | ⭐⭐⭐⭐⭐ | Medium | Medium | 2 |
| F-06 Branche-briefing | ⭐⭐⭐ | Medium | Medium | 2 |
| F-07 AI Rollespil | ⭐⭐⭐⭐ | Medium | Medium | 2 |
| F-08 Fine-tuned model | ⭐⭐⭐ | Høj | Medium | 3 |
| F-09 CRM-integration | ⭐⭐⭐ | Høj | Medium | 3 |

---

## Tekniske Fælles-komponenter

Disse komponenter bruges af flere features og skal bygges én gang:

### Customer Entity Service
Bruges af: F-01, F-02, F-03, F-04
- Cosmos DB customer-entiteter
- Auto-extraction fra chat via `onFinish`
- CRUD API i Next.js

### Sales Coach Context Injection
Bruges af: F-01, F-02, F-04, F-07
- System prompt builder der injicerer aktive moduler
- Value area mapper
- Persona classifier

### Structured Output Parser
Bruges af: F-01, F-04, F-05
- Zod schemas for strukturerede AI-outputs
- Vercel AI SDK `generateObject` for non-streaming outputs

---

*Feature Backlog v1.0 — Sales Coach 360 — InsightCast ApS — Juni 2026*
*Dette dokument er det primære produkt-backlog og opdateres løbende.*
*Teknisk implementation-detaljer skrives i SAD når en feature planlægges til aktiv sprint.*
