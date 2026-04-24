# MULTI-TENANT AFFILIATE ADVERTISING & TRACKING PLATFORM
## A Full-Stack SaaS Architecture for Performance Marketing

### CHAPTER 1: INTRODUCTION

#### 1.1 Background and Motivation
The digital advertising industry has undergone a paradigm shift, transitioning from traditional impression-driven media buying to performance-driven outcomes such as clicks, qualified leads, application installs, and revenue-generating conversions. This transformation has given rise to robust performance marketing ecosystems where advertisers seek a measurable Return on Ad Spend (ROAS), affiliates (publishers) seek transparent payout logic, and tracking platforms act as neutral, cryptographic orchestration engines between traffic generation and conversion attribution. In this contemporary context, reliable event attribution, low-latency tracking, fraud resistance, and tenant-level data isolation are no longer optional features; they are foundational systemic requirements.

The project implemented and evaluated in this thesis is a Multi-Tenant Affiliate Advertising & Tracking Platform, developed as a full-stack Software-as-a-Service (SaaS) system. The platform is engineered to support multiple independent business entities (tenants), each operating with strictly isolated offers, publishers, advertisers, traffic logs, conversion records, and performance analytics. The backend infrastructure is powered by Node.js, Fastify, MySQL, and Redis, while the frontend is constructed using React.js, Tailwind CSS, and Vite. The resulting solution is designed for high-ingress tracking traffic, asynchronous worker-based processing, and near real-time business reporting.

#### 1.2 Problem Statement
Performance marketing operations involve multiple, independently managed entities: advertisers who create offers and define economic logic, publishers who route traffic via tracking links, and platform operators who monitor conversion consistency. Without a robust, technically sound platform, core business operations become highly error-prone.

Specific operational problems in legacy systems include:
- **Data Loss During Burst Traffic:** Synchronous database writes for click data often lead to dropped requests during traffic spikes.
- **Race Conditions in Attribution:** Conversion approval and rejection become inconsistent when multiple postbacks are fired for the same click identifier.
- **Data Leakage in Shared Environments:** Weak logical isolation in databases can lead to one tenant viewing another tenant's proprietary campaign data.
- **Analytical Lag:** Reporting algorithms that query massive raw event tables cause dashboards to lag, rendering operational decision-making reactive rather than proactive.

#### 1.3 Project Domain: Performance Marketing in SaaS Form
The system operates within the B2B SaaS domain. A defining characteristic of this model is that the platform serves numerous tenants utilizing a single, unified codebase and infrastructure cluster while preserving impenetrable logical separation at runtime.

#### 1.4 Aim and Objectives
**Aim:** To architect, build, and rigorously evaluate a multi-tenant, full-stack affiliate advertising and tracking system capable of microsecond-latency click ingestion, distributed conversion processing, and strict tenant-specific data isolation.

**Objectives:**
- To engineer a role-aware React-based Single Page Application (SPA) for the management of offers, publishers, advertisers, and complex domain entities.
- To develop a high-performance Fastify backend supporting rapid tracking endpoints (/click, /imp, /postback) and secure administrative APIs.
- To implement a decoupled event-driven architecture using Redis Streams.

### CHAPTER 4: SYSTEM ARCHITECTURE

#### 4.1 Architectural Overview
The implemented platform utilizes a multi-layer, event-assisted architecture designed to decouple user-facing latency from heavy database write workloads.

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
flowchart TD
    A[Tenant Admin / Super Admin] --> B[React Frontend<br/>Vite, Router, Context, Charts]
    C[Merchant / Advertiser System] --> D[Reverse Proxy / Host Routing]
    E[Publisher Traffic Source] --> D
    B --> D
    D --> F[Fastify API Layer<br/>Auth, Admin, Tracking, Reports]
    F --> G[Tenant Resolution Middleware<br/>Subdomain -> tenant_id]
    G --> H[Service Layer<br/>Offers, Assignment, Tracking, Postback]
    F <--> I[(Redis<br/>Hashes + Streams + Counters)]
    H <--> I
    H <--> J[(MySQL<br/>Transactional + Aggregate Tables)]
    K[Click Worker] <--> I
    K <--> J
    L[Conversion Worker] <--> I
    L <--> J
    M[Stats Worker] <--> I
    M <--> J
```
*Figure 4.1: Comprehensive System Architecture bridging Frontend, API, Workers, and Databases.*

#### 4.2 Frontend-Backend Tenant Communication Model
```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
flowchart LR
    A[React SPA on<br/>tenantX.domain.com] --> B[Relative API Call<br/>/api/...]
    B --> C[Host Header<br/>Preserved]
    C --> D[Backend Tenant<br/>Middleware]
    D --> E[JWT + Tenant<br/>Validation]
    E --> F[Tenant-Scoped SQL<br/>WHERE tenant_id=?]
    F --> G[JSON Response]
```
*Figure 4.2: Domain-Driven Request Flow demonstrating host-based context isolation.*

#### 4.3 High-Level Component and Data Flow Diagrams
```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
flowchart TD
    A[External Entity:<br/>Tenant Admin] -->|Admin actions, report requests| C((Affiliate Tracking<br/>SaaS Platform))
    B[External Entity:<br/>Merchant System] -->|Conversion postback| C
    C -->|Approved affiliate callback| D[External Entity:<br/>Publisher Endpoint]
    C <--> E[(Redis)]
    C <--> F[(MySQL)]
```
*Figure 4.3: Level-0 Context DFD illustrating core external interactions.*

```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
flowchart TD
    A[1. UI/API Interaction] --> B[(MySQL)]
    C[2. Click/Impression Intake] --> D[(Redis)]
    E[3. Conversion/Postback Intake] --> D
    F[4. Async Worker Processing] --> D
    F --> B
    G[5. Reporting & Visualization] --> B
```
*Figure 4.4: Level-1 DFD detailing subsystem-level interactions with data layers.*

#### 4.4 Tenant Resolution and Isolation Architecture
```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
flowchart TD
    A[Incoming Request] --> B[Read Host / X-Forwarded-Host]
    B --> C{Subdomain Present?}
    C -->|Y| D{Tenant Found and Active?}
    C -->|N| Err1[Reject/Root Route]
    D -->|Y| E[JWT + Role checks]
    D -->|N| Err2[Unauthorized]
    E --> F[Tenant-scoped service query]
    F --> G[Response]
```
*Figure 4.5: Deterministic Tenant Context Resolution and Authentication Pipeline.*

#### 4.5 End-to-End Conversion Sequence Architecture
```mermaid
sequenceDiagram
    participant PT as Publisher Traffic
    participant FB as Fastify Backend
    participant R as Redis
    participant CW as Click Worker
    participant M as MySQL
    participant MP as Merchant Postback
    participant CoW as Conversion Worker
    participant RD as React Dashboard

    PT->>FB: GET /click?offer_id=X&pub_id=Y
    FB->>FB: Resolve tenant from subdomain
    FB->>R: HSET click payload + XADD stream:clicks
    FB-->>PT: Redirect to destination URL
    
    CW->>R: Consume stream:clicks
    CW->>M: Insert click rows + update daily stats
    
    MP->>FB: GET/POST /postback?click_id=...
    FB->>R: Redis-first click lookup
    FB->>R: SET conversion payload + XADD stream:conversions
    FB-->>MP: Conversion queued/processed response
    
    CoW->>R: Consume stream:conversions
    CoW->>M: Insert conversion + update aggregates
    CoW->>PT: Fire callback URL (only if status=approved)
    
    RD->>FB: /api/admin/reports/dashboard
    FB->>M: Query aggregated + transactional stats
    FB-->>RD: KPI + chart data
```
*Figure 4.6: End-to-End Event Sequence Diagram from initial Click ingestion to Analytical Visualization.*

### CHAPTER 5: DATABASE DESIGN AND SCHEMA ENGINEERING

#### 5.3 ER Diagram (Conceptual-Physical Hybrid)
```mermaid
erDiagram
    TENANTS ||--o{ ADMIN_USERS : has
    TENANTS ||--o{ ADVERTISERS : owns
    TENANTS ||--o{ PUBLISHERS : owns
    TENANTS ||--o{ OFFERS : owns
    TENANTS ||--o{ CLICKS : scopes
    TENANTS ||--o{ CONVERSIONS : scopes
    TENANTS ||--o{ IMPRESSIONS : scopes
    TENANTS ||--o{ SUBSCRIPTION_HISTORY : audits
    TENANTS ||--o{ AFFILIATE_POSTBACK_LOGS : logs

    ADVERTISERS ||--o{ OFFERS : creates
    OFFERS ||--o{ OFFER_PARAMS : config
    OFFERS ||--o{ PUBLISHER_OFFERS : assigned_to
    PUBLISHERS ||--o{ PUBLISHER_OFFERS : receives

    OFFERS ||--o{ CLICKS : generates
    PUBLISHERS ||--o{ CLICKS : generates
    PUBLISHER_OFFERS ||--o{ CLICKS : linked

    OFFERS ||--o{ CONVERSIONS : monetizes
    PUBLISHERS ||--o{ CONVERSIONS : monetizes
    PUBLISHER_OFFERS ||--o{ CONVERSIONS : linked
    CLICKS ||--o| CONVERSIONS : attributed_by_click_uuid

    OFFERS ||--o{ DAILY_OFFER_STATS : aggregates
    TENANTS ||--o{ DAILY_CLICK_STATS : tenant_daily_metrics
```
*Figure 5.1: Entity-Relationship Diagram illustrating core domains and tenant scoping.*

### CHAPTER 6: FRONTEND DEVELOPMENT

#### 6.8 Frontend Flow Diagram
```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
flowchart TD
    L[User Login] --> A[AuthContext Set]
    A --> R{Domain Type}
    R -- Admin --> T[Tenant Management Routes]
    R -- Tenant --> B[Business Routes]
    B --> C[Dashboard / Offers / Reports / Live Logs]
    C --> D[API Service Layer]
    D --> E[Backend Endpoints]
    E --> F[Response Mapping]
    F --> G[Cards / Tables / Charts Render]
```
*Figure 6.1: Frontend Routing and State Flow.*

### CHAPTER 7: BACKEND IMPLEMENTATION

#### 7.5 Tracking Link Logic (/click Flow)
```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
flowchart TD
    Q[Incoming /click query] --> T[Resolve tenant_id]
    T --> O[Resolve offer by public_offer_id]
    O --> P[Resolve publisher by public_publisher_id]
    P --> A[Resolve assignment]
    A --> V[Validate status + targeting + caps]
    V --> G[Generate click_uuid]
    G --> U[Build redirect URL with macros]
    U --> R[Store click hash in Redis]
    R --> S[XADD stream:clicks]
    S --> D[Return redirect]
```
*Figure 7.1: Flowchart detailing the synchronous Click execution path.*

#### 7.6 Postback Engine (/postback Flow)
```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
flowchart TD
    A[Incoming /postback] --> B[Parse payload]
    B --> C{Redis Lookup Match?}
    C -->|Yes| D[Use Redis Context]
    C -->|No| E[Fallback DB Lookup]
    E --> D
    D --> F[Calculate Status & Capping]
    F --> G[XADD stream:conversions]
    G --> H{Status == Approved?}
    H -->|Yes| I[Flag for Affiliate Callback]
    H -->|No| J[Drop Callback]
    I --> K[Return 200 OK to Merchant]
    J --> K
```
*Figure 7.2: Decoupled and Resilient Postback Processing Logic.*

#### 7.7.3 Stats Worker (statsWorker)
```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
flowchart LR
    R[(Redis Streams & Cache)]
    CW[Click Worker]
    CoW[Conversion Worker]
    SW[Stats Worker]
    M[(MySQL Database)]

    R -->|stream:clicks| CW
    R -->|stream:conversions| CoW
    R -->|Redis Counters| SW

    CW -->|Batch Insert| M
    CoW -->|Insert & Update| M
    SW -->|Flush Aggregates| M
```
*Figure 7.3: Stream-based Async Worker Topology for high-throughput persistence.*

### CHAPTER 8: SECURITY AND TESTING

#### 8.2 Security Flow Diagram
```mermaid
%%{init: {'flowchart': {'curve': 'linear'}}}%%
flowchart TD
    A[Request Received] --> B[Tenant Middleware]
    B --> C{Tenant valid?}
    C -- No --> X[Reject]
    C -- Yes --> D[JWT Verify]
    D --> E{Role + Tenant match?}
    E -- No --> X
    E -- Yes --> F[Validation Layer]
    F --> G[Service Logic]
    G --> H[Tenant-scoped Query/Cache]
    H --> I[Secure Response]
```
*Figure 8.1: API Authentication and Security Validation Flow.*

### CHAPTER 9: RESULTS, DISCUSSION, AND CONCLUSION
The platform successfully establishes the intended lifecycle:
**Publisher Click -> Backend Validation -> Redis Buffer/Stream -> Worker Persistence -> Merchant Postback -> Conversion Worker -> Approved Callback -> Dashboard Visualization**.
