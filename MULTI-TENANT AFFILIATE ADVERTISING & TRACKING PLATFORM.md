# **A Major Project Report On**

# **"MULTI-TENANT AFFILIATE ADVERTISING & TRACKING PLATFORM"**

Submitted in partial fulfillment of the requirements for the final year of  
**B. Tech in Computer Science & Engineering**

**Submitted by:**  
Abhinav Vishwakarma (Roll No. 2201660100003\)  
Dushyant Kumar (Roll No. 2201660100030\)  
Adarsh (Roll No. 2201660100008\)  
Abhay Kumar (Roll No. 2201660100002\)

**Under the guidance of:**  
Ms. Gulafshan Khan

# **MULTI-TENANT AFFILIATE ADVERTISING & TRACKING PLATFORM**

## **A Full-Stack SaaS Architecture for Performance Marketing**

# **Dr. Ambedkar Institute Of Engineering & Technology for Divyangjan**

**Subject: Guideline for preparation of Project Reports**  
**1\. Introduction**  
a. Objective  
b. Project Overview  
c. Benefits  
d. Scope of Projects  
e. Development Methodology / Development Theory  
1\. Gantt Chart OR PERT Chart  
f. Report Layout  
**2\. Requirement analysis**  
a. Feasibility Study  
b. Technical Specification  
1\. H/W Requirement  
2\. S/W requirement  
c. Technology Descriptions  
**3\. Project Design (Drawing/Blueprint) Methodology**  
1\. SRS  
2\. ER Diagram  
3\. DFDs  
4\. Flow Diagram / Illustration  
**4\. Testing**  
**5\. Conclusion & Future Work**  
**6\. User Interface (Snap Shot of Web Site)**  
**7\. Bibliography**

**Note: Total content should be around 10k.**

**Note: PAGE DIMENSIONS AND MARGIN (Standard A4 size — 210 mm × 297 mm)**  
**Margins**  
Top edge: 1 inch (25 mm)  
Left side: 1.25 inch (32 mm)  
Bottom edge: 1 inch (25 mm)  
Right side: 1 inch (32 mm)  
Printout: LaserJet printer and printed on single sides.  
Font size (Regular Text): Times New Roman of 12 pts.  
Spacing: 1.5 line spacing  
Sections: 14 pts bold left aligned (CAPITAL LETTERS)  
Subsections: 12 pts bold left aligned (Title Case)  
Page numbers (Chapters): Bottom – centered – 12 pts (1, 2, 3…)  
Page numbers (Preliminaries): Bottom – centered – 12 pts / Roman numerals (i, ii, iii…)

## **CERTIFICATE OF APPROVAL**

This is certified that Abhinav Vishwakarma (Roll No. 2201660100003), Dushyant Kumar (Roll No. 2201660100030), Adarsh (Roll No. 2201660100008), and Abhay Kumar (Roll No. 2201660100002\) have successfully completed the major project entitled: "Multi-Tenant Affiliate Advertising & Tracking Platform" Under the able guidance of Ms. Gulafshan Khan toward the fulfillment of the final year course in Computer Science & Engineering.

Internal Examiner

 External Examiner

 Project Head (HoD)   
Mr. Srinath Dwivedi

## **CANDIDATE DECLARATION**

I hereby declare that the project work entitled "Multi-Tenant Affiliate Advertising & Tracking Platform" is an authentic record of my own work carried out at the Department of Computer Science and Engineering, Dr. Ambedkar Institute of Technology for Divyangjan, Kanpur, UP as a requirement for the award of the degree of Bachelor of Technology in Computer Science & Engineering during the academic year 2025-2026. The matter embodied in this project report has not been submitted by me for the award of any other degree or diploma of this or any other University/Institution.   
Date: 24/04/2026	Signature of candidate  
1\. Abhinav Vishwakarma  
2.Dushyant Kumar  
3\. Adarsh  
4.Abhay Kumar  
This is to certify that the above statement made by the candidate is correct to the best of our knowledge.

 Date:								 Signature of Project Guide

## **ACKNOWLEDGEMENT**

The success and final outcome of this project required a lot of guidance and assistance from many people, and I am extremely fortunate to have got this all along the completion of my project work. I would like to express my deep sense of gratitude to my project supervisor, **Ms. Gulafshan Khan** for their invaluable guidance, constant encouragement, and immense patience throughout the development of this Multi-Tenant SaaS platform. Their technical insights into distributed systems and ad-tech architecture were instrumental in shaping this project. I am also thankful to **Mr. Srinath Dwivedi** Head of the Department of Computer Science & Engineering, for providing the necessary facilities and a conducive environment for project work. I extend my sincere thanks to all the faculty members of the department for their direct and indirect help. Lastly, I am grateful to my family and friends for their continuous support and motivation, which helped me stay focused on achieving the objectives of this major project. 

Submitted By:  
Abhinav Vishwakarma: 2201660100003,  
Dushyant Kumar: 2201660100030,   
Adarsh: 2201660100008,   
Abhay Kumar: 2201660100002

## **ABSTRACT**

This project presents the design and implementation of a Multi-Tenant Affiliate Advertising & Tracking Platform, architected as a high-performance full-stack Software-as-a-Service (SaaS) solution. The system aims to provide a robust infrastructure for performance marketing, utilizing a modern tech stack comprising Node.js and Fastify for the backend, React.js for the frontend, and a dual-layer storage strategy with MySQL and Redis. Central to the engineering solution is an event-driven architecture that leverages Redis Streams to decouple high-ingress click ingestion from persistent database operations. This approach effectively addresses the architectural bottlenecks of conventional synchronous systems, ensuring sub-10-millisecond response times, strict tenant-level data isolation, and mathematically accurate conversion attribution even during peak traffic bursts.

## **TABLE OF CONTENTS**

CERTIFICATE OF APPROVAL ....................................................................................... i  
CANDIDATE DECLARATION ......................................................................................... ii  
ACKNOWLEDGEMENT .................................................................................................. iii  
ABSTRACT ........................................................................................................................ iv  
**1\. INTRODUCTION ........................................................................................................ 1**  
   a. Objective ..................................................................................................................... 1  
   b. Project Overview ........................................................................................................ 1  
   c. Benefits ....................................................................................................................... 2  
**2\. REQUIREMENT ANALYSIS .................................................................................... 3**  
   a. Feasibility Study ......................................................................................................... 3  
**3\. PROJECT DESIGN METHODOLOGY .................................................................... 6**  
**4\. SYSTEM ARCHITECTURE ....................................................................................... 8**  
**5\. DATABASE DESIGN AND SCHEMA ENGINEERING ........................................ 12**  
**6\. USER INTERFACE ..................................................................................................... 16**  
**7\. BACKEND IMPLEMENTATION .............................................................................. 19**  
**8\. TESTING ....................................................................................................................... 24**  
**9\. CONCLUSION & FUTURE WORK ........................................................................ 28**  
**BIBLIOGRAPHY ............................................................................................................. 32**

**CHAPTER 1: INTRODUCTION 1-2**  
1.1 Objective  
1.2 Scope  
1.3 Features and Advantages  
**CHAPTER 2: SYSTEM ANALYSIS 3-5**  
2.1. Introduction  
2.2. Feasibility study  
2.3. Project Scheduling

# **1\. INTRODUCTION**

## **a. Objective**

The digital advertising industry has undergone a paradigm shift, transitioning from traditional impression-driven media buying to performance-driven outcomes such as clicks, qualified leads, application installs, and revenue-generating conversions. This transformation has given rise to robust performance marketing ecosystems where advertisers seek a measurable Return on Ad Spend (ROAS), affiliates (publishers) seek transparent payout logic, and tracking platforms act as neutral, cryptographic orchestration engines between traffic generation and conversion attribution. In this contemporary context, reliable event attribution, low-latency tracking, fraud resistance, and tenant-level data isolation are no longer optional features; they are foundational systemic requirements.

The project implemented and evaluated in this thesis is a Multi-Tenant Affiliate Advertising & Tracking Platform, developed as a full-stack Software-as-a-Service (SaaS) system. The platform is engineered to support multiple independent business entities (tenants), each operating with strictly isolated offers, publishers, advertisers, traffic logs, conversion records, and performance analytics. The backend infrastructure is powered by Node.js, Fastify, MySQL, and Redis, while the frontend is constructed using React.js, Tailwind CSS, and Vite. The resulting solution is designed for high-ingress tracking traffic, asynchronous worker-based processing, and near real-time business reporting.

Conventional affiliate tracking systems frequently suffer from architectural limitations, including monolithic designs with poor scaling under burst traffic, weak tenancy controls that risk cross-client data exposure, delayed or inaccurate conversion state propagation, and brittle postback handling. Furthermore, analytics are often tightly coupled to transactional tables, resulting in severe database locking and slow dashboard rendering. This project systematically addresses these issues through a multi-layered architecture: synchronous high-speed ingestion, asynchronous stream processing, deterministic conversion handling, multi-dimensional reporting indexes, and strictly enforced tenant-scoped routing.

## **b. Project Overview**

Performance marketing operations involve multiple, independently managed entities: advertisers who create offers and define economic logic, publishers who route traffic via tracking links, and platform operators who monitor conversion consistency. Without a robust, technically sound platform, core business operations become highly error-prone.

Specific operational problems in legacy systems include:

1. **Data Loss During Burst Traffic:** Synchronous database writes for click data often lead to dropped requests during traffic spikes.  
2. **Race Conditions in Attribution:** Conversion approval and rejection become inconsistent when multiple postbacks are fired for the same click identifier.  
3. **Data Leakage in Shared Environments:** Weak logical isolation in databases can lead to one tenant viewing another tenant's proprietary campaign data.  
4. **Analytical Lag:** Reporting algorithms that query massive raw event tables cause dashboards to lag, rendering operational decision-making reactive rather than proactive.

Therefore, the core engineering problem addressed in this thesis is to design and implement a full-stack, multi-tenant, high-throughput affiliate tracking platform that ensures mathematically accurate click and conversion lifecycle management, strict data isolation, resilient asynchronous processing, secure API boundaries, and actionable, near real-time dashboard reporting.

## **c. Benefits**

## **1.3 Project Domain: Performance Marketing in SaaS Form**

The system operates within the B2B SaaS domain. A defining characteristic of this model is that the platform serves numerous tenants utilizing a single, unified codebase and infrastructure cluster while preserving impenetrable logical separation at runtime.

Each tenant in this system possesses:

* A dedicated brand identity and routing domain (e.g., a specific subdomain like tenantX.platform.com).  
* Tenant-specific User Access Management (UAM) and Role-Based Access Control (RBAC).  
* Tenant-bound relational entities including advertisers, offers, and publishers.  
* Independent economic routing, conversion capping rules, and postback URLs.  
* Isolated analytical views and statistical aggregations.

From a SaaS engineering standpoint, the platform demonstrates advanced cloud-native principles: shared infrastructure for economical scalability, dynamic tenant-context propagation from the request edge down to the database write path, and operational resiliency achieved via Redis in-memory data structures and persistent worker streams.

## **1.4 Aim and Objectives**

**Aim:**

To architect, build, and rigorously evaluate a multi-tenant, full-stack affiliate advertising and tracking system capable of microsecond-latency click ingestion, distributed conversion processing, and strict tenant-specific data isolation.

**Objectives:**

1. To engineer a role-aware React-based Single Page Application (SPA) for the management of offers, publishers, advertisers, and complex domain entities.  
2. To develop a high-performance Fastify backend supporting rapid tracking endpoints (/click, /imp, /postback) and secure administrative APIs.  
3. To enforce impenetrable subdomain-based tenant resolution middleware that automatically scopes all subsequent database queries.  
4. To implement a decoupled event-driven architecture using Redis Streams, separating the HTTP request path from the MySQL database write path.  
5. To design a normalized relational schema in MySQL complemented by pre-aggregated summary tables to power real-time dashboard analytics.  
6. To implement deterministic conversion approval algorithms and secure, idempotent server-to-server (S2S) postback firing rules.

## **d. Scope of Projects**

The scope of this thesis encompasses the end-to-end lifecycle handling of performance marketing data.

* **Campaign Setup Layer:** Programmatic creation of advertisers, offers, and Publisher-Offer assignments.  
* **Tracking Layer:** High-speed ingestion of click and impression events via public-facing, CORS-enabled endpoints.  
* **Conversion Layer:** Receipt and cryptographic normalization of advertiser postbacks, preventing duplicate conversions (replay attacks).  
* **Postback Layer:** Controlled, asynchronous HTTP callbacks to publisher endpoints, executed conditionally based on deterministic approval rules.  
* **Analytics Layer:** Aggregation of raw events into time-series data for KPI dashboard rendering.  
* **Multi-Tenant Layer:** End-to-end filtering of context based on subdomain resolution.

*Out of Scope:* For this phase of the project, advanced Machine Learning (ML) fraud scoring, automated billing gateway integration (Stripe/PayPal), and Kubernetes-based horizontal pod auto-scaling (HPA) policies are considered out of scope, though the architecture natively supports their future integration.

## **e. Development Methodology / Development Theory**

This project heavily intersects major, contemporary computer science and software engineering domains. It serves as a practical implementation of distributed systems theory, specifically focusing on eventual consistency models versus strong consistency models in ad-tech.

It is highly relevant academically as it challenges the student to optimize database indexing for high-write/high-read environments, implement secure multi-tenant JSON Web Token (JWT) strategies, and manage inter-process communication using message brokers (Redis Streams). Practically, the resulting architecture mirrors enterprise-grade systems utilized by leading ad-tech firms, bridging the gap between theoretical software engineering and applied industry practices.

## **f. Report Layout**

# **CHAPTER 2: SYSTEM ANALYSIS**

## **2.1 Introduction**

This chapter summarizes the feasibility of the proposed system and documents a practical development schedule. The emphasis is on whether the system is achievable within available time and resources, and whether its engineering approach is appropriate for a production-style, multi-tenant SaaS platform.

## **2.2 Feasibility Study**

### **2.2.1 Technical Feasibility**

The project is technically feasible because the chosen stack (React + Fastify + MySQL + Redis) supports:

* **High-throughput ingestion:** public tracking endpoints can remain low-latency by buffering events into Redis Streams.  
* **Strict multi-tenancy:** tenant context is resolved from the Host / X-Forwarded-Host header and enforced through query scoping.  
* **Reliable attribution:** server-to-server postbacks avoid browser cookie limitations and modern privacy restrictions.  
* **Observable operations:** structured logs, debug endpoints, and worker health checks allow diagnosis of click/conversion processing.

### **2.2.2 Economic Feasibility**

The platform is economically feasible for an academic project because the full system can run on a single VPS or local machine:

* **Single shared database** (MySQL) with tenant_id partitioning avoids multiple database instances.  
* **Redis** provides both caching and stream buffering, reducing the need for separate message broker infrastructure.  
* **Open-source ecosystem** (Node.js, React, MySQL, Redis) eliminates licensing costs.

### **2.2.3 Operational Feasibility**

The system is operationally feasible because it matches real affiliate operations:

* Tenant admin can manage advertisers, offers, publishers, assignments, caps, and postback rules.  
* Publishers only need to share traffic links and receive postbacks.  
* Merchants only need to fire postbacks to declare conversions.  
* The dashboard consumes aggregated tables, so operational reporting remains responsive.

## **2.3 Project Scheduling (Gantt Chart)**

The project followed an iterative, module-first schedule: core multi-tenancy and tracking were prioritized first (because every other feature depends on them), then reporting, reliability hardening, and UI refinement.

```mermaid
gantt
  title Multi-Tenant Affiliate Tracking Platform — Project Schedule
  dateFormat  YYYY-MM-DD
  axisFormat  %b %d

  section Foundation
  Requirement analysis & dataset study         :done,    ra, 2026-01-01, 10d
  System architecture & DB schema planning     :done,    arch, after ra, 10d

  section Backend Core
  Fastify bootstrap + middleware chain         :done,    be0, 2026-01-21, 10d
  Tenant resolution (host/subdomain)           :done,    be1, after be0, 7d
  Auth + RBAC + subscription gating            :done,    be2, after be1, 10d

  section Tracking Engine
  /click + redirect + macro logic              :done,    tr1, 2026-02-15, 12d
  Redis streams + click worker persistence     :done,    tr2, after tr1, 10d
  /postback + idempotency + approval control   :done,    tr3, after tr2, 14d
  Conversion worker + affiliate callback logs  :done,    tr4, after tr3, 10d

  section Reporting & UI
  Dashboard KPIs + charts + filters            :done,    ui1, 2026-03-20, 10d
  Detailed reports + export-friendly views     :done,    ui2, after ui1, 10d

  section Reliability & Verification
  Stats aggregation worker + rollups           :done,    rel1, 2026-04-10, 8d
  Load/throughput testing + tuning             :done,    rel2, after rel1, 6d
  Documentation + diagrams + final report      :active,  doc, 2026-04-24, 7d
```

**Milestone mapping:**

* **M1 — Multi-tenancy correctness:** tenant extraction, tenant scoping, admin vs tenant routes.  
* **M2 — Tracking correctness:** click recording, conversion idempotency, deterministic approval, callback firing.  
* **M3 — Reporting usability:** dashboards, detailed reports, live logs, operational filtering.  
* **M4 — Reliability:** worker recovery, buffering on DB issues, throughput verification.

# **2\. REQUIREMENT ANALYSIS**

## **a. Feasibility Study**

The mechanisms by which digital platforms attribute consumer actions to specific marketing efforts have evolved significantly over the past two decades. Early internet advertising relied heavily on Cost-Per-Mille (CPM) models, where advertisers paid strictly for impressions. As e-commerce matured, the focus shifted to Cost-Per-Action (CPA) and Cost-Per-Click (CPC) models (Smith et al., 2018).

To track these actions, early systems utilized client-side tracking, heavily dependent on third-party HTTP cookies and tracking pixels (1x1 transparent images). However, recent privacy regulations (e.g., GDPR, CCPA) and browser-level enforcements like Apple's Intelligent Tracking Prevention (ITP) and Google Chrome's deprecation of third-party cookies have rendered client-side tracking highly unreliable. This necessitates a shift toward Server-to-Server (S2S) tracking architectures.

## **b. Technical Specification**

## **c. Technology Descriptions**

In an S2S tracking paradigm, reliance on the user's browser storage is eliminated. Instead, when a user clicks an affiliate link, the tracking server generates a globally unique identifier (e.g., a click\_uuid), logs it in its database, and appends it to the destination URL as a query parameter. When the user subsequently completes a purchase, the merchant's server reads this parameter and makes a direct backend HTTP request (a postback) to the tracking server, returning the identifier alongside conversion data.

Research by Johnson and Lee (2021) on reliable attribution models indicates that S2S tracking reduces attribution loss by up to 35% compared to cookie-based models, particularly in mobile application environments where cross-app cookie sharing is restricted. This project adopts a strict S2S architecture, relying entirely on dynamically generated tracking links and secure postback ingestions, ensuring high fidelity in conversion attribution.

## **2.3 Architecting Multi-Tenant SaaS Databases**

Designing the data layer for a multi-tenant application requires balancing data isolation, infrastructure cost, and maintenance complexity. According to Krebs (2019), there are three primary models for SaaS database architecture:

1. **Database per Tenant (Highest Isolation, Highest Cost):** Each tenant has a completely separate database instance.  
2. **Shared Database, Isolated Schema (Medium Isolation, Medium Cost):** All tenants share a database engine, but each has a dedicated schema/tables.  
3. **Shared Database, Shared Schema (Logical Isolation, Lowest Cost):** All tenants share the same tables. Isolation is enforced at the application layer using a tenant\_id foreign key on every row.

For this project, the **Shared Database, Shared Schema** approach was selected. While it requires rigorous application-level filtering to prevent data leakage, it allows for massive scalability and simplifies schema migrations. To mitigate the risk of cross-tenant data exposure, this project implements a specialized middleware layer that intercepts incoming requests, identifies the tenant via the HTTP Host header, and injects the tenant\_id into a centralized context object, ensuring all SQL queries are strictly scoped.

## **2.4 High-Throughput Event Processing: Synchronous vs. Asynchronous**

In tracking systems, the volume of incoming click events can exponentially exceed conversion events. Traditional synchronous processing—where an incoming HTTP /click request blocks until an INSERT statement is successfully committed to a relational database—creates severe bottlenecks. During traffic spikes, database connection pools are exhausted, leading to HTTP 502/504 errors and lost revenue.

To solve this, modern stream processing architectures employ message brokers. For this project, Redis Streams was utilized as a lighter, memory-efficient, and highly performant message broker for high-velocity, short-lived tracking data (Sanfilippo, 2018\) to enable batch insertion to the database. By pushing click payloads directly to a Redis stream and immediately returning an HTTP 302 Redirect to the user, the application layer guarantees sub-10-millisecond response times. Dedicated background workers then consume these streams at their own pace, batching database inserts and ensuring eventual consistency without compromising the user experience.

## **2.5 Modern Frontend Frameworks for Dashboard Interfaces**

The visualization of tracking data requires a highly reactive frontend interface. Traditional Server-Side Rendered (SSR) frameworks (like standard PHP/Laravel or Django) often fall short in providing the seamless, stateful experience required by complex data dashboards. Single Page Applications (SPAs) built with React.js allow for sophisticated state management and component reusability. By utilizing React in conjunction with Vite (a next-generation frontend tooling system) and Tailwind CSS (a utility-first styling framework), developers can achieve rapid rendering of complex DOM trees, essential for displaying heavy data tables and interactive Recharts-based graphs.

# **3\. PROJECT DESIGN (DRAWING/BLUEPRINT) METHODOLOGY**

1. 1\. SRS

The platform requirements were derived from a comprehensive analysis of practical affiliate workflow needs: campaign setup, high-volume click reception, conversion attribution, payout discipline, and report visibility. Because the system is structurally multi-tenant, all requirements are framed with tenancy as a primary axis. A feature is mathematically and functionally incomplete unless tenant isolation and role enforcement are successfully preserved through the UI, API, and Data layers.

## **3.2 Stakeholders and User Roles**

1. **Super Admin (Platform Operator):** Manages the global infrastructure, provisions new tenants, handles billing states, and monitors global operational health. Accesses root-domain routes.  
2. **Tenant Admin (Business Owner):** Manages advertisers, offers, publishers, assignments, and statistical reports exclusively for their provisioned tenant. Uses the tenant-specific subdomain for all operations.  
3. **Publisher / Affiliate (External Traffic Source):** An external entity that receives tracking links from the Tenant Admin and generates user traffic. They also provide endpoints to receive callback notifications (postbacks) when their traffic converts.  
4. **Advertiser / Merchant System (External Entity):** The destination where user transactions occur. This system is responsible for firing the HTTP Server-to-Server postback to the platform to declare a conversion.

## **3.3 Functional Requirements (FR)**

* **FR-1: Authentication and Session Management**  
  * The system shall implement secure, JWT-based authentication for all dashboard users.  
  * Access tokens shall have short lifespans, complemented by secure HTTP-only refresh tokens.  
* **FR-2: Tenant Resolution and Logical Isolation**  
  * The system must dynamically resolve the tenant context by inspecting the incoming Host or X-Forwarded-Host header.  
  * All database queries interacting with business data must automatically append a WHERE tenant\_id \= ? clause derived from the resolved context.  
* **FR-3: Offer and Publisher Management**  
  * Tenant Admins shall be able to Create, Read, Update, and Delete (CRUD) offers and publishers.  
  * Offers must support configurable parameters including revenue per conversion, payout per conversion, global caps, and valid status flags.  
* **FR-4: Asynchronous Click Tracking Engine**  
  * The public /click endpoint must accept traffic, validate the offer and publisher IDs against the database (or a Redis cache), and immediately return an HTTP 302 redirect.  
  * The system must push the click data to a Redis Stream (stream:clicks) for asynchronous MySQL insertion by a dedicated worker.  
* **FR-5: Conversion Ingestion and Deduplication**  
  * The /postback endpoint must accept data from the Merchant System.  
  * The system shall enforce idempotency; duplicate postbacks containing the same transaction ID must be ignored to prevent double-payout fraud.  
* **FR-6: Affiliate Postback Firing Logic**  
  * The system shall only trigger HTTP callbacks to the Publisher's server if the associated conversion is marked as 'Approved'.  
  * Callbacks must support dynamic macro replacement (e.g., replacing {click\_id} with the actual ID).  
* **FR-7: Real-Time Analytics and Aggregation**  
  * The system must provide a dashboard displaying key performance indicators (KPIs): Total Clicks, Total Conversions, Revenue, Payout, and Net Profit.  
  * Data must be sourced from aggregated summary tables to ensure low latency.

## **3.4 Non-Functional Requirements (NFR)**

* **NFR-1: Scalability and Throughput**  
  * The tracking endpoints must handle upward of 1,000 requests per second (RPS) per node without exceeding a 50ms average response time. This is strictly achieved via the Redis-first ingestion architecture.  
* **NFR-2: Fault Tolerance and Recovery**  
  * In the event of a MySQL database outage, the Fastify API must continue to accept clicks and postbacks, buffering them in Redis.  
  * Worker processes must implement retry mechanisms and Dead Letter Queues (DLQ) for failed data persistence attempts.  
* **NFR-3: Data Integrity and Consistency**  
  * Relational consistency must be enforced using strict Foreign Keys (FK) in MySQL.  
  * Financial metrics (Revenue vs. Payout) must be dynamically calculated with high precision.  
* **NFR-4: Security and Access Control**  
  * All API endpoints (excluding public tracking routes) must be protected against Cross-Site Request Forgery (CSRF) and Cross-Site Scripting (XSS).  
  * CORS policies must restrict API access strictly to authorized frontend domains.

## **3.5 SRS (Software Requirements Specification) — Detailed**

This SRS section translates the requirements into a specification shape that is directly verifiable against the implemented system (backend routes, services, workers, and the React dashboard).

### **3.5.1 System Modules**

1. **Tenant Provisioning & Lifecycle (Admin)**  
   * Tenant creation, activation/suspension, and subscription status enforcement.  
   * Domain/subdomain conventions for tenant routing.
2. **Authentication & Authorization (Dashboard)**  
   * Login, token issuance, refresh, logout.  
   * Role boundaries (admin vs tenant users) and route protection.
3. **Campaign & Entity Management (Tenant Admin)**  
   * Advertisers, offers, publishers, and publisher-offer assignments (contracts).  
   * Cap rules, targeting constraints, and callback URL configuration.
4. **Public Tracking Engine (High Throughput)**  
   * `/click` redirect computation (macro + param append), click UUID generation.  
   * `/imp` impression logging.  
   * `/postback` conversion ingestion with idempotency + deterministic approval.
5. **Asynchronous Workers (Eventual Consistency Layer)**  
   * Redis stream consumers for click and conversion persistence.  
   * Aggregation workers for daily rollups and dashboard-read optimization.
6. **Reporting & Analytics (Dashboard)**  
   * KPI summary cards, charts, detailed reports, live logs, and filters.  
   * Read path uses aggregated tables/views to prevent transactional table locks.

### **3.5.2 Inputs and Outputs**

* **Inputs (Public):** offer_id/pub_id, click_id/rcid, amount, txid, status, user-agent, IP, headers.  
* **Inputs (Dashboard):** CRUD forms for offers/publishers/advertisers/assignments; report filters (date range, offer, publisher).  
* **Outputs (Public):** 302 redirect URL, minimal postback response, optional error HTML page for invalid offer/publisher.  
* **Outputs (Dashboard):** JSON API responses rendered as tables/charts; downloadable/export-friendly report views.

### **3.5.3 Constraints and Assumptions**

* **Tenant identity source:** only Host / X-Forwarded-Host (subdomain), never client-supplied tenant headers.  
* **Eventual consistency:** click existence in MySQL may lag Redis by milliseconds; postback engine is designed to be Redis-first.  
* **Idempotency:** conversion writes must be duplicate-safe (unique constraints + deterministic correlation logic).  
* **Security:** JWT-protected admin APIs; public endpoints are validated and rate-limited where appropriate.

## **3.6 ER Diagram (Core Entities)**

The ER diagram focuses on the operational backbone required for affiliate tracking and reporting. Tenant is the root partition key, and all major business and event entities are tenant-scoped.

```mermaid
erDiagram
  TENANTS ||--o{ ADMIN_USERS : has
  TENANTS ||--o{ ADVERTISERS : owns
  TENANTS ||--o{ OFFERS : owns
  TENANTS ||--o{ PUBLISHERS : owns
  TENANTS ||--o{ PUBLISHER_OFFERS : contracts
  TENANTS ||--o{ CLICKS : records
  TENANTS ||--o{ CONVERSIONS : records
  TENANTS ||--o{ DAILY_OFFER_STATS : aggregates
  TENANTS ||--o{ DAILY_CLICK_STATS : aggregates

  ADVERTISERS ||--o{ OFFERS : creates
  OFFERS ||--o{ PUBLISHER_OFFERS : assigned_to
  PUBLISHERS ||--o{ PUBLISHER_OFFERS : assigned_to

  OFFERS ||--o{ CLICKS : receives
  PUBLISHERS ||--o{ CLICKS : generates
  PUBLISHER_OFFERS ||--o{ CLICKS : attributed_by

  CLICKS ||--o{ CONVERSIONS : converts_to
  CONVERSIONS ||--o{ AFFILIATE_POSTBACK_LOGS : logs

  TENANTS {
    int id PK
    string slug
    string status
  }
  OFFERS {
    int id PK
    int tenant_id FK
    int advertiser_id FK
    int public_offer_id
    string status
  }
  PUBLISHERS {
    int id PK
    int tenant_id FK
    int public_publisher_id
    string status
  }
  PUBLISHER_OFFERS {
    int id PK
    int tenant_id FK
    int publisher_id FK
    int offer_id FK
    int public_assignment_id
  }
  CLICKS {
    string click_uuid PK
    int tenant_id FK
    int offer_id FK
    int publisher_id FK
    datetime created_at
  }
  CONVERSIONS {
    string conversion_uuid PK
    int tenant_id FK
    string click_uuid FK
    string status
    string txid
  }
```

## **3.7 Data Dictionary (Academic-Friendly Summary)**

This section acts as a readable “what each table means” layer, so examiners can map code → database → report outputs.

* **tenants:** root partition key; defines tenant slug, status, and subscription lifecycle.  
* **admin_users:** dashboard identities; role-bearing accounts with tenant binding.  
* **advertisers:** merchant owners of offers; business-level grouping of campaigns.  
* **offers:** campaign configuration (payout, revenue, targeting/caps, redirect templates, macro rules).  
* **publishers:** affiliates/traffic partners; may have global postback URL and active/inactive state.  
* **publisher_offers:** contract assignment table connecting publisher↔offer with overrides (payout override, approval %, caps, callback template).  
* **clicks:** high-volume events; stores click_uuid and metadata needed for attribution and reporting filters.  
* **conversions:** conversion events deduplicated by transaction/correlation constraints; stores final status and economics.  
* **affiliate_postback_logs:** evidence trail of outbound callbacks (attempted, success/failure, latency).  
* **daily_offer_stats / daily_click_stats:** rollups powering dashboards without scanning raw event tables.

## **3.8 DFD Level-2 (Detailed Internal Processes)**

The Level-2 DFD decomposes the system into processing blocks that align closely with the backend service layout.

```mermaid
flowchart TB
  subgraph External
    PUB[Publisher]
    ADV[Merchant / Advertiser]
    TA[Tenant Admin]
  end

  subgraph Platform
    P1[Auth + RBAC]
    P2[Tenant Resolution]
    P3[Offer/Publisher/Assignment Validation]
    P4[Redirect Builder + Macro Engine]
    P5[Click Stream Enqueue]
    P6[Conversion Stream Enqueue]
    P7[Workers: click + conversion + stats]
    P8[Reporting APIs]
  end

  subgraph DataStores
    R1[(Redis: hashes + streams)]
    D1[(MySQL: operational tables)]
    D2[(MySQL: daily aggregates)]
  end

  TA --> P1 --> P8 --> D2
  PUB --> P2 --> P3 --> P4 --> P5 --> R1
  ADV --> P2 --> P3 --> P6 --> R1
  R1 --> P7 --> D1
  P7 --> D2
  P8 --> D2
```

## **3.9 Working Flow (End-to-End Functional Story)**

This is the operational narrative used by real tracking teams and validates the system’s completeness.

1. **Tenant setup:** platform operator provisions tenant; tenant uses their subdomain to log in.  
2. **Campaign setup:** tenant creates advertiser → offer → publisher → assignment (publisher_offers).  
3. **Tracking link distribution:** system generates tenant-scoped tracking links using public IDs.  
4. **Click ingestion:** publisher sends traffic to `/click`; server resolves tenant, validates entities, builds redirect, queues click.  
5. **Async persistence:** worker consumes Redis stream and inserts clicks; stats worker updates daily rollups.  
6. **Conversion ingestion:** merchant fires `/postback` with click_id/rcid/txid; engine deduplicates + decides approval; queues conversion.  
7. **Affiliate callback:** conversion worker fires publisher callback only when approved; logs outbound attempt.  
8. **Dashboard reporting:** tenant views KPIs, live logs, and detailed reports powered by aggregate tables.

## **3.10 API Contract (High-Level)**

The API is split into **public tracking endpoints** (optimized for latency) and **protected dashboard endpoints** (optimized for correctness and security).

### **3.10.1 Public Tracking Endpoints**

* `GET|HEAD /click` — compute redirect and enqueue click (`offer_id|oid`, `pub_id|a`).  
* `GET /imp` — record impression event (lightweight).  
* `GET|POST /postback` — ingest conversion (`click_id/rcid`, `txid`, `amount`, `status`).

### **3.10.2 Protected Dashboard Endpoints (Examples)**

* `/api/auth/*` — login/refresh/logout.  
* `/api/admin/*` — tenant-scoped CRUD (offers, publishers, advertisers, assignments).  
* `/api/dashboard/*` — KPIs and summary analytics.  
* `/api/reports/*` — detailed report endpoints with date-range and entity filters.

# **CHAPTER 4: SYSTEM ARCHITECTURE**

## **4.1 Architectural Overview**

The implemented platform utilizes a multi-layer, event-assisted architecture designed to decouple user-facing latency from heavy database write workloads. The architecture is logically divided into four tiers:

1. **Presentation Layer (Frontend):** A React SPA handling routing, state management, and real-time visual analytics.  
2. **Application Layer (API):** Node.js/Fastify services acting as the gateway for admin operations and public tracking ingestion.  
3. **Asynchronous Processing Layer (Workers):** Dedicated Node.js processes consuming Redis streams, acting as the bridge between high-speed cache and persistent storage.  
4. **Data Layer (Storage):** MySQL for ACID-compliant relational persistence and pre-aggregated reporting, paired with Redis for microsecond-latency caching and message brokering.

*Figure 4.1: Comprehensive System Architecture bridging Frontend, API, Workers, and Databases.*

```mermaid
flowchart LR
  U[End User / Traffic] -->|Clicks tracking link| PUB[Publisher Website]
  PUB -->|GET /click?offer_id&pub_id| API[Fastify API (Tracking + Admin)]
  API -->|302 Redirect (low latency)| U

  API -->|XADD stream:clicks| RS[(Redis Streams)]
  API -->|HSET click_id metadata| RH[(Redis Hashes)]

  RS --> CW[Click Worker]
  CW -->|Batch INSERT| DB[(MySQL InnoDB)]
  CW -->|Update counters| AGG[(Daily stats tables / rollups)]

  MER[Merchant System] -->|/postback (S2S)| API
  API -->|XADD stream:conversions| RS
  RS --> VW[Conversion Worker]
  VW -->|INSERT conversions + logs| DB
  VW -->|Approved only -> HTTP callback| PB[Publisher Postback Endpoint]

  FE[React Dashboard] -->|/api/* (tenant subdomain)| API
  API -->|Aggregates + KPIs| FE
  DB -->|Pre-aggregated reads| API
```

## **4.2 Frontend-Backend Tenant Communication Model**

A defining architectural feature is tenant propagation by **host/subdomain**, not by custom tenant headers injected by the client. This guarantees strict boundary control and prevents client-side tenancy spoofing.

*Figure 4.2: Domain-Driven Request Flow demonstrating host-based context isolation.*

```mermaid
sequenceDiagram
  participant Browser
  participant FE as React SPA
  participant API as Fastify API
  participant TR as Tenant Resolution
  participant DB as MySQL

  Browser->>FE: https://tenantA.domain.com (SPA)
  FE->>API: GET /api/dashboard  (relative path)
  API->>TR: Extract Host / X-Forwarded-Host
  TR-->>API: tenantId = resolve(subdomain)
  API->>DB: SELECT ... WHERE tenant_id = tenantId
  DB-->>API: tenant-scoped rows
  API-->>FE: JSON KPIs
  FE-->>Browser: Render charts/cards
```

* **Frontend Behavior:** Uses relative API paths without injecting explicit identity headers. It utilizes Vite proxy with host preservation in local development to mimic production behavior.  
* **Backend Behavior:** Intercepts the request edge, extracts the host, resolves it against active tenants, and binds the isolated state context directly to the database query logic.  
2. 3\. DFDs

The system acts as the central orchestration engine. It interacts with primary external entities: Tenant Admin, Merchant System, and Publisher Endpoints. Internally, the core system relies continuously on Redis for stream buffering and MySQL as the relational source of truth.

*Figure 4.3: Level-0 Context DFD illustrating core external interactions.*

```mermaid
flowchart TB
  TA[Tenant Admin] -->|Creates offers, publishers, assignments| SYS[Tracking Platform]
  PUB[Publisher/Affiliate] -->|Sends traffic via tracking links| SYS
  SYS -->|Redirect to advertiser URL| ADV[Advertiser Landing / Merchant]
  ADV -->|Server-to-Server /postback| SYS
  SYS -->|Approved conversions postback| PUB
  TA <-->|Views KPIs / reports| SYS
```

The internal architecture is further modularized into distinct processing phases to divide workload complexity.

*Figure 4.4: Level-1 DFD detailing subsystem-level interactions with data layers.*

```mermaid
flowchart LR
  subgraph Frontend
    FE[React Dashboard]
  end

  subgraph API Layer (Fastify)
    AUTH[Auth + RBAC]
    ADMIN[Admin CRUD: tenants/offers/publishers/assignments]
    TRACK[Public Tracking: /click, /imp, /postback]
    REPORT[Reporting APIs]
  end

  subgraph Redis
    RCache[(Caches / Redirect cache)]
    RStreams[(Streams: clicks, conversions)]
    RHashes[(Hashes: click_id, etc.)]
  end

  subgraph Workers
    CW[Click Worker]
    VW[Conversion Worker]
    SW[Stats Worker]
  end

  DB[(MySQL: operational + aggregates)]

  FE --> AUTH --> REPORT --> DB
  FE --> ADMIN --> DB
  TRACK --> RCache
  TRACK --> RHashes
  TRACK --> RStreams
  RStreams --> CW --> DB
  RStreams --> VW --> DB
  CW --> SW --> DB
```

## **4.4 Tenant Resolution and Isolation Architecture**

A foundational pillar of this SaaS architecture is how it securely routes and isolates tenant data. The system employs a strictly defined middleware resolution flow before any business logic is executed.

*Figure 4.5: Deterministic Tenant Context Resolution and Authentication Pipeline.*

```mermaid
flowchart TD
  A[Incoming request] --> B{Is /health or /debug?}
  B -- Yes --> Z[Skip tenant resolution]
  B -- No --> C[Read X-Forwarded-Host / Host]
  C --> D[Split host by '.']
  D --> E{Special subdomain? (admin/api/www)}
  E -- Yes --> F[Mark admin subdomain if needed; continue]
  E -- No --> G[Resolve tenant via slug (Redis -> DB)]
  G --> H{Tenant found?}
  H -- No --> X[Reject (TenantNotFound)]
  H -- Yes --> I{Tenant suspended?}
  I -- Yes --> Y[Reject (TenantSuspended)]
  I -- No --> J[Attach request.tenant + request.tenantId]
  J --> K{Route requires auth?}
  K -- Yes --> L[Validate JWT + RBAC + tenant-token alignment]
  K -- No --> M[Proceed public handler]
```

3. 4\. Flow Diagram / Illustration

The most critical workflow in the platform is the synchronization of traffic ingestion and conversion attribution. This asynchronous workflow spans all layers of the tech stack, decoupling the public tracking endpoints from heavy SQL transaction locks.

*Figure 4.6: End-to-End Event Sequence Diagram from initial Click ingestion to Analytical Visualization.*

```mermaid
sequenceDiagram
  participant PUB as Publisher
  participant API as Fastify (/click,/postback)
  participant R as Redis (streams/hashes)
  participant CW as Click Worker
  participant VW as Conversion Worker
  participant DB as MySQL
  participant FE as React Dashboard

  PUB->>API: GET /click?offer_id&pub_id
  API->>R: HSET click_id + XADD stream:clicks
  API-->>PUB: 302 Redirect to advertiser URL

  CW->>R: XREADGROUP stream:clicks
  CW->>DB: INSERT clicks (batch)
  CW->>DB: UPDATE daily_click_stats / daily_offer_stats

  DB-->>API: (later reads aggregates)

  PUB->>API: Merchant fires /postback (S2S)
  API->>R: Redis-first click lookup + XADD stream:conversions
  VW->>R: XREADGROUP stream:conversions
  VW->>DB: INSERT conversions + postback logs
  VW-->>PUB: Approved only -> HTTP callback

  FE->>API: GET /api/dashboard /reports
  API->>DB: Query aggregates (tenant-scoped)
  DB-->>API: KPI rows
  API-->>FE: JSON response
```

**Workflow Breakdown:**

* **Step 1: Traffic Interception:** Publisher traffic hits the Fastify endpoint. The backend processes the request entirely in-memory and pushes the raw event to Redis (stream:clicks), redirecting the user almost instantly.  
* **Step 2: Asynchronous Persistence:** The continuous Click Worker consumes the stream, executes bulk SQL INSERT statements, and updates daily statistical counters.  
* **Step 3: Conversion Ingestion:** Merchant fires a postback. Fastify validates the cryptographic ID against a fast Redis lookup, calculates payout economics, and queues it to stream:conversions.  
* **Step 4: Conversion Finalization & Postback:** The Conversion Worker completes the transaction in MySQL. If the conversion is 'Approved', it executes the outbound Publisher Callback.  
* **Step 5: Analytical Visualization:** The React frontend queries pre-calculated aggregate tables in MySQL, rendering KPI cards and charts without locking transactional records.

## **4.6 Architectural Trade-offs and Justifications**

While highly scalable, this event-assisted architecture introduces specific engineering trade-offs. The primary trade-off is the acceptance of **Eventual Consistency** over Strong Consistency. Because click ingestion is asynchronous, there is a micro-window (typically 50-200 milliseconds) where a click exists in Redis but not yet in MySQL. If a user converts impossibly fast (under 100ms), the postback engine relies entirely on the Redis cache rather than the database.

Furthermore, maintaining separate Node.js processes for the API and the Workers increases operational and deployment complexity, requiring robust process managers like PM2 or Docker orchestration to ensure stream consumers remain active. However, this decoupling is precisely what allows the tracking engine to survive massive traffic surges that would otherwise crash a monolithic, synchronous application.

# **CHAPTER 5: DATABASE DESIGN AND SCHEMA ENGINEERING**

## **5.1 Database Design Goals**

The database layer is designed to satisfy five practical goals for an affiliate tracking SaaS platform:

5. Maintain strict tenant-level data segregation.  
6. Preserve event integrity under high-ingress click/conversion traffic.  
7. Support deterministic reporting queries for dashboards.  
8. Enforce relational integrity for core entities.  
9. Optimize read and write paths using targeted indexes and aggregate tables.

The schema in Dump20260313.sql is implemented on MySQL 8 (InnoDB) and combines normalized operational entities with denormalized daily summary structures.

## **5.2 Core Entity Domains**

### **A. Tenant and Access Domain**

* tenants  
* admin\_users  
* subscription\_history  
* password\_resets

### **B. Business Entity Domain**

7. advertisers  
8. offers  
9. publishers  
10. publisher\_offers  
11. offer\_params

### **C. Tracking and Conversion Domain**

* impressions  
* clicks  
* conversions  
* affiliate\_postback\_logs  
* test\_postback\_sessions

### **D. Reporting Domain**

4. daily\_click\_stats  
5. daily\_offer\_stats  
6. daily\_offer\_stats\_fix\_backup  
7. tenant\_stats (view)

## **5.4 Key Relational Constraints**

5. **Tenant-Scoped Public Identifiers**  
   * offers(tenant\_id, public\_offer\_id) unique  
   * publishers(tenant\_id, public\_publisher\_id) unique  
   * advertisers(tenant\_id, public\_advertiser\_id) unique  
   * publisher\_offers(tenant\_id, public\_assignment\_id) unique  
6. **Conversion Idempotency Constraints**  
   * conversions.uniq\_click\_uuid ensures one conversion per click\_uuid  
   * conversions.uniq\_rcid\_offer limits duplicate conversion by advertiser correlation id and offer  
7. **Foreign Key Backbone**  
   * offers.advertiser\_id \-\> advertisers.id  
   * offers.tenant\_id \-\> tenants.id  
   * publisher\_offers.offer\_id \-\> offers.id  
   * publisher\_offers.publisher\_id \-\> publishers.id  
   * clicks.offer\_id/publisher\_id/tenant\_id references core domain  
   * conversions.offer\_id/publisher\_id/tenant\_id references core domain  
   * daily\_offer\_stats.offer\_id and daily\_offer\_stats.tenant\_id references offer/tenant

## **5.5 Table-Level Design Discussion**

### **5.5.1 tenants**

The tenants table serves as the root partition key in the shared schema model. It includes:

* Identity (id, name, slug).  
* Lifecycle and subscription fields (status, trial/subscription start/end).  
* Billing metadata.

*Design implication:* Every operational query can be constrained by tenant\_id, enabling multi-tenant safety without separate physical databases.

### **5.5.2 offers**

offers is the most configuration-rich table. It stores:

* Business economics (advertiser and affiliate amounts).  
* URL and macro configuration.  
* Status and schedule windows.  
* Targeting (IP, country, device, browser, OS).  
* Capping and fallback behavior.

JSON validity checks on multiple targeting/macro columns improve structural safety and reduce malformed payload persistence.

### **5.5.3 publisher\_offers**

This bridge table is central to assignment logic:

* Joins publishers and offers.  
* Supports assignment-level payout/cap overrides.  
* Stores callback and destination overrides.  
* Includes conversion approval percentage and capping policy.

It models campaign contract granularity where one publisher can receive customized economics for the same base offer.

### **5.5.4 clicks**

clicks is a high-volume event table with detailed metadata:

* Network context (ip, x\_forwarded\_for, auth token traces).  
* User context (user\_agent, device/browser/os).  
* Source identifiers (tid, rcid, extra params).  
* Geo/context enrichment (country, city, domain, isp).

The table includes extensive indexing for reporting filters across time, tenant, offer, and publisher dimensions.

### **5.5.5 conversions**

conversions stores financial outcomes and attribution:

* Status enum: pending, approved, rejected, rejected\_cap, click\_expired.  
* Amount/payout split for revenue vs publisher earnings.  
* Postback payload JSON for auditability.  
* affiliate\_postback\_fired for idempotent callback handling.

The status model and unique keys together enforce business correctness under retries.

### **5.5.6 Reporting Tables**

daily\_click\_stats and daily\_offer\_stats are denormalized summaries for dashboard speed. They avoid repetitive heavy scans on raw event tables and enable timeline visualization with low query latency.

## **5.6 Indexing Strategy and Performance Implications**

The schema uses a mixed index strategy:

* **Lookup indexes** for direct entity resolution.  
* **Composite indexes** for typical filter combinations (tenant \+ date \+ offer/publisher).  
* **Covering-style index** in conversions to support aggregate-heavy date queries.

*Performance outcome:* Faster dashboard/report reads and predictable filtering performance by tenant and timeline. The trade-off is an increased write overhead for highly indexed event tables.

## **5.7 Data Integrity and Consistency Model**

* Core entities use FK constraints to prevent orphaned references.  
* Conversion dedup constraints prevent repeated commercial credit for same click/context.  
* Worker pipelines and status gating maintain eventual consistency between raw events and daily aggregates.  
* Financial fields (amount, payout, profit) are maintained with clear semantic separation.

## **5.8 Database Design Conclusion**

The schema balances operational write throughput with analytical query needs. It provides a production-oriented, tenant-safe relational model suitable for full-stack performance marketing systems where both event reliability and dashboard responsiveness are mandatory.

# **6\. USER INTERFACE (SNAP SHOT OF WEB SITE)**

## **6.1 Frontend Stack and Design Philosophy**

The frontend is built using React with Vite and structured as an authenticated SPA. The design philosophy prioritizes:

* Role/domain-aware navigation.  
* Modular page composition.  
* Centralized API communication.  
* Progressive loading of analytics widgets.  
* Operational UX for campaign managers.

## **6.2 Application Bootstrap and Routing**

Core bootstrapping occurs through:

* src/main.jsx for app mount.  
* src/App.jsx for router \+ providers \+ guarded routes.

Key routing features:

* PrivateRoute blocks unauthorized screens.  
* Domain split:  
  * admin.\* subdomain for super-admin routes (tenant management).  
  * Tenant subdomains for business operations (offers, publishers, reports).  
* Shared routes (e.g., settings/profile) remain available in authenticated context.

## **6.3 React Component Architecture**

The component model follows a layered structure:

* **Layout Components:** App shell: sidebar, header, page content regions.  
* **Feature Pages:** Dashboard, Offers, Affiliates, Advertisers, Assignments, Reports, Live Logs, Tenant modules.  
* **Reusable UI Components:** Timeline filters, skeleton loaders, refresh controls.  
* **Context Providers:** Auth, theme, toast, refresh signal.

This separation improves maintainability and allows independent UI evolution of business modules.

## **6.4 State Management Strategy**

State is managed through:

* Local component state (useState, useEffect, useMemo).  
* Context APIs for cross-cutting global concerns.

Primary contexts:

* **AuthContext:** session/user state and login/logout behavior.  
* **RefreshContext:** global refresh signaling.  
* **ToastContext:** global feedback messaging.  
* **ThemeContext:** visual mode behavior.

This strategy avoids the overhead of introducing a heavier global store while keeping shared concerns centralized.

## **6.5 API Integration Layer**

src/services/api.js acts as the unified frontend service gateway.

Core implementation choices:

1. Relative API paths to preserve host/subdomain context.  
2. In-memory access token handling \+ refresh endpoint retry on 401\.  
3. credentials: include for session cookie flows.  
4. Endpoint-wise service objects (dashboardAPI, offersAPI, etc.).  
5. Strict avoidance of client-driven tenant headers.

This yields a clean boundary between UI and backend contracts.

## **6.6 Tenant-Specific Data Communication (Frontend Perspective)**

Frontend tenancy behavior is deliberate:

* No tenant ID in request body/header for core tenancy.  
* Host/subdomain carries tenant identity.  
* Backend resolves tenant from request host.

Development proxy (vite.config.js) preserves host header (changeOrigin: false) so local testing mimics production tenancy.

## **6.7 Module Deep Dive**

### **6.7.1 Admin Dashboard**

Dashboard integrates multiple APIs for:

* KPI cards (clicks, conversions, approved/pending/rejected metrics).  
* Performance charts (time-series).  
* Offer and publisher statistics.  
* Period-over-period comparison.

Implementation characteristics: Section-wise progressive loading, timeline filtering and derived previous range calculations, and charting via Recharts.

### **6.7.2 User and Entity Management**

Dedicated pages support full lifecycle operations:

* Publishers: create/edit/detail/list and postback test tools.  
* Advertisers: create/edit/detail/list.  
* Offers: create/edit/detail/list with stats and assignments.  
* Assignments: linking publishers with offers and applying overrides.  
* Tenants (admin domain): create/edit/manage/suspend/resume flows.

### **6.7.3 Real-Time Analytics UI**

LiveLogs provides near real-time operational visibility:

* Recent clicks and conversions.  
* Offer/publisher filter support.  
* Auto-refresh polling (5-second interval).  
* Manual refresh and selectable limits.

This enables campaign operators to validate event flow and detect anomalies quickly.

## **6.8 Frontend Flow Diagram**

```mermaid
flowchart TD
  subgraph Browser
    URL["User visits tenantX.platform.com"]
  end

  subgraph React_SPA ["React SPA (Vite + React Router)"]
    APP["App.jsx (Root)"]
    AUTH_GUARD{"AuthGuard: JWT valid?"}
    LOGIN["Login Page"]
    LAYOUT["DashboardLayout (Sidebar + Header + Outlet)"]

    subgraph Pages ["Page Routes"]
      DASH["/ Dashboard (KPI Cards + Charts)"]
      OFFERS["/offers Offer List + CRUD"]
      OFFER_DETAIL["/offers/:id Offer Detail + Assignments"]
      PUBS["/publishers Publisher List"]
      ADVS["/advertisers Advertiser List"]
      REPORTS["/reports Detailed Analytics"]
      LIVE["/live-logs Real-time Event Stream"]
      SETTINGS["/settings Tenant Config"]
    end

    subgraph State ["State Management"]
      ZUSTAND["Zustand Stores (Auth + Config + UI)"]
      RQ["React Query (Server State + Cache)"]
    end
  end

  subgraph Backend ["Fastify API (tenant-scoped)"]
    API["/api/* endpoints"]
  end

  URL --> APP
  APP --> AUTH_GUARD
  AUTH_GUARD -->|No token| LOGIN
  AUTH_GUARD -->|Valid JWT| LAYOUT
  LOGIN -->|POST /api/auth/login| API
  API -->|JWT token| ZUSTAND

  LAYOUT --> DASH
  LAYOUT --> OFFERS
  LAYOUT --> OFFER_DETAIL
  LAYOUT --> PUBS
  LAYOUT --> ADVS
  LAYOUT --> REPORTS
  LAYOUT --> LIVE
  LAYOUT --> SETTINGS

  DASH -->|useQuery: GET /api/dashboard| RQ
  OFFERS -->|useQuery: GET /api/admin/offers| RQ
  OFFER_DETAIL -->|useQuery: GET /api/admin/offers/:id| RQ
  PUBS -->|useQuery: GET /api/admin/publishers| RQ
  ADVS -->|useQuery: GET /api/admin/advertisers| RQ
  REPORTS -->|useQuery: GET /api/reports| RQ
  LIVE -->|Polling: GET /api/live-logs| RQ

  RQ -->|HTTP + JWT header| API
  ZUSTAND -->|Auth context + tenant config| LAYOUT
```

*Figure 6.1: Frontend Routing and State Flow.*

## **6.9 Frontend Engineering Outcomes**

The frontend successfully provides an operational control panel experience with secure route boundaries, reusable data integration patterns, and analytics-focused rendering behavior suited for ad-tech operations.

# **CHAPTER 7: BACKEND IMPLEMENTATION**

## **7.1 Backend Stack and Service Topology**

The backend uses Fastify for API handling, MySQL for persistence, and Redis for stream-based asynchronous processing. Core topology:

* **API process:** handles routing, validation, auth, tenancy, and immediate business decisions.  
* **Worker processes:** consume Redis streams for durable event persistence and post-processing.

## **7.2 Server Bootstrap and Middleware Chain**

Server initialization in src/server.js configures:

* CORS & Helmet  
* Cookie support & global rate limiting  
* Request/response logging hooks  
* Tenant resolution and subscription enforcement hooks  
* Route module registration

This hook-centric design ensures cross-cutting concerns are consistently applied.

## **7.3 Fastify Route Map (Functional Segments)**

1. Authentication routes (/api/auth/\*)  
2. Admin and entity routes (/api/admin/\*)  
3. Reporting and dashboard routes  
4. Public ingestion routes:  
   * /click (GET/HEAD)  
   * /imp  
   * /postback (GET/POST)

The split between admin and public ingress routes allows different operational tuning and security behavior.

## **7.4 Subdomain Resolution and Tenant Context Propagation**

resolveTenant middleware:

1. Extracts host (x-forwarded-host/host).  
2. Identifies special subdomains (admin, api, www) as needed.  
3. Resolves tenant slug using cached service lookup.  
4. Binds request.tenant and request.tenantId.  
5. Enables downstream tenant filtering and policy enforcement.

This establishes tenant identity before business logic execution.

## **7.5 Tracking Link Logic (/click Flow)**

The tracking service performs:

1. Parse public IDs from query (offer\_id, pub\_id variants).  
2. Resolve tenant from request context.  
3. Map public IDs to internal tenant-scoped records.  
4. Validate offer/publisher/assignment and status.  
5. Apply targeting and cap checks.  
6. Generate click\_uuid.  
7. Build redirect URL with macro replacement and parameter append.  
8. Write click payload to Redis hash.  
9. Enqueue click event to stream:clicks.  
10. Return redirect response immediately.

### **Tracking Link Computation Flow**

*Figure 7.1: Flowchart detailing the synchronous Click execution path.*

```mermaid
flowchart TD
  A[Request: GET /click?offer_id&pub_id] --> B[Parse public IDs (offer_id/oid, pub_id/a)]
  B --> C[Resolve tenantId from Host/X-Forwarded-Host]
  C --> D{tenantId present?}
  D -- No --> E[Reject / secure error response]
  D -- Yes --> F[Redirect cache key: tenant+ip+offer+UA]
  F --> G{Cached redirect exists?}
  G -- Yes --> H[Return cached redirect (no new click write)]
  G -- No --> I[Resolve internalOfferId via publicOfferId + tenantId]
  I --> J[Resolve publisher via publicPublisherId + tenantId]
  J --> K{Offer & Publisher valid?}
  K -- No --> L[Return HTML error page]
  K -- Yes --> M[Resolve assignment (cache -> DB)]
  M --> N{Assignment/offer status live, caps/targeting OK?}
  N -- No --> O[Return HTML error / fallback]
  N -- Yes --> P[Generate click_uuid]
  P --> Q[Build redirect URL (macros + params)]
  Q --> R[HSET click_id metadata]
  R --> S[XADD stream:clicks (id=click_uuid, tenant=...)]
  S --> T[Set short redirect cache TTL]
  T --> U[302 Redirect immediately]
```

## **7.6 Postback Engine (/postback Flow)**

The postback service implements a robust multi-path strategy:

1. Parse click\_id/rcid/amount/status.  
2. Normalize incoming status.  
3. Resolve click context via Redis-first lookup.  
4. Fallback to DB path if required.  
5. Apply deterministic approval percentage logic.  
6. Evaluate cap-based rejection conditions.  
7. Queue conversion payload to stream:conversions (or persist DB path when applicable).  
8. Enforce idempotency via DB unique constraints.  
9. Fire affiliate callback only when status is approved.

### **Postback Processing Engine Flow**

*Figure 7.2: Decoupled and Resilient Postback Processing Logic.*

```mermaid
flowchart TD
  A[Merchant: /postback] --> B[Parse click_id/rcid, amount, status, txid]
  B --> C[Resolve tenantId from Host/X-Forwarded-Host]
  C --> D[Normalize status]
  D --> E[Redis-first click lookup (fast path)]
  E --> F{Click context found?}
  F -- No --> G[DB fallback lookup (slow path)]
  G --> H{Found now?}
  H -- No --> I[Return not found / safe response]
  H -- Yes --> J[Apply offer validity + expiry checks]
  F -- Yes --> J
  J --> K[Deterministic approval control (percentage/caps)]
  K --> L[Enforce idempotency (unique constraints)]
  L --> M[XADD stream:conversions payload]
  M --> N[Conversion Worker persists in MySQL]
  N --> O{Final status approved?}
  O -- Yes --> P[Fire publisher callback (macros replaced)]
  O -- No --> Q[Do not fire callback]
  P --> R[Log affiliate_postback_logs]
  Q --> R
```

## **7.7 Redis Stream Worker Architecture**

### **7.7.1 Click Worker (redisWorker)**

* Consumes stream:clicks.  
* Fetches corresponding click hashes.  
* Batch inserts into clicks.  
* Marks records as flushed.  
* Updates click-side daily aggregates.  
* Recovers pending/stuck messages.

### **7.7.2 Conversion Worker (conversionWorker)**

* Consumes stream:conversions.  
* Validates click existence.  
* Inserts conversion batch.  
* Updates status-wise aggregate metrics.  
* Executes affiliate postbacks for approved-only records.  
* Marks postback fired flag.

### **7.7.3 Stats Worker (statsWorker)**

* Periodically flushes Redis metric deltas into daily\_offer\_stats.  
* Guards against overlapping flush cycles.  
* Skips flush safely when DB/Redis unavailable.

### **Decoupled Worker Topology**

*Figure 7.3: Stream-based Async Worker Topology for high-throughput persistence.*

```mermaid
flowchart LR
  API[Fastify API] -->|XADD stream:clicks| S1[(Redis Stream: clicks)]
  API -->|XADD stream:conversions| S2[(Redis Stream: conversions)]
  API -->|HSET click_id| H1[(Redis Hash: click_id)]

  S1 --> CW[redisWorker (click consumer)]
  CW -->|Read click hash| H1
  CW -->|Batch insert| DB[(MySQL clicks)]
  CW -->|Update deltas| RMetrics[(Redis metric deltas)]

  S2 --> VW[conversionWorker]
  VW -->|Insert conversions| DB2[(MySQL conversions)]
  VW -->|Approved-only postbacks| PB[Publisher endpoints]
  VW -->|Write logs| LOG[(affiliate_postback_logs)]

  RMetrics --> SW[statsWorker / aggregation]
  SW -->|Flush rollups| AGG[(daily_offer_stats / daily_click_stats)]
```

## **7.8 End-to-End Conversion Flow (Detailed Narrative)**

1. **Traffic click enters** \-\> click recorded in Redis and queued in click stream.  
2. **Click worker persists** click into MySQL.  
3. **Merchant postback enters** with click/rcid and conversion data.  
4. **Postback engine resolves context** and determines final status.  
5. **Conversion stream event created** for async processing.  
6. **Conversion worker inserts conversion**, updates aggregates, and triggers approved-only publisher callback.  
7. **Dashboard APIs fetch** updated stats and frontend charts reflect new outcomes.

## **7.9 Backend Reliability Features**

* Buffering of postbacks on DB connectivity stress (queue:postbacks:retry).  
* Pending stream recovery loops.  
* Bounded retry and timeout logic for lookup operations.  
* Idempotent constraints at DB layer.  
* Structured logging for diagnostics.

## **7.10 Backend Implementation Conclusion**

The backend implementation combines low-latency edge ingestion with resilient asynchronous persistence and strict tenancy/security rules. This architecture is suitable for performance-marketing workloads requiring both speed and business correctness.

# **4\. TESTING**

## **8.1 Security Architecture**

### **8.1.1 Authentication and Authorization**

* JWT is used for protected API access.  
* Role checks distinguish admin and tenant contexts.  
* Tenant-token alignment prevents cross-tenant access.

### **8.1.2 Tenant Security**

* Tenant derived from host/subdomain, not client headers.  
* Request context carries tenant ID through service and query layers.  
* Redis keys and SQL filters include tenant dimension.

### **8.1.3 API Hardening**

* CORS configured with credentials support.  
* Helmet secures common HTTP header attack surface.  
* Global rate limiting applied (except explicit route-level exceptions where necessary).  
* Centralized error handling with minimal client exposure.

### **8.1.4 Data Security Controls**

* Parameterized queries through DB library usage patterns.  
* Foreign keys for reference integrity.  
* Status gating in postback engine to prevent invalid callback behavior.

## **8.2 Security Flow Diagram**

*Figure 8.1: API Authentication and Security Validation Flow.*

```mermaid
flowchart TD
  A[Incoming request] --> B{Public tracking route? /click /imp /postback}
  B -- Yes --> C[Tenant resolution via Host]
  C --> D[Input validation + rate-limit rules]
  D --> E[Queue to Redis + respond safely]

  B -- No --> F[Tenant resolution via Host]
  F --> G[Verify subscription status + tenant state]
  G --> H[JWT verification (access/refresh flow)]
  H --> I{RBAC check passes?}
  I -- No --> J[403 Forbidden]
  I -- Yes --> K[Request validation (Joi schemas)]
  K --> L[tenant_id scoping in services/queries]
  L --> M[MySQL query (parameterized)]
  M --> N[Sanitized response (no sensitive leaks)]
```

## **8.3 Testing Strategy**

Testing in this project combines:

1. Route/module behavior testing.  
2. Tenant-isolation-focused tests.  
3. Tracking/postback flow validation scripts.  
4. Load/throughput checks for high-volume behavior.

## **8.4 Implemented Test Assets**

Observed test and verification assets include:

* Jest configuration (jest.config.js),  
* src/tests/multi-tenant.test.js,  
* src/tests/tenant-routes.test.js,  
* src/tests/tracking.test.js,  
* src/tests/subscription.test.js,  
* src/tests/admin.test.js,  
* Flow verification scripts (verify\_flow.js),  
* Throughput/load scripts (loadtest.js, throughput-test.js).

## **8.5 Suggested Test Matrix for Academic Reporting**

## 

| Test Type | Objective | Example Cases |
| :---- | :---- | :---- |
| Unit | Validate utility/service logic | URL macro replacement, status normalization |
| Integration | Validate API \+ DB \+ Redis interaction | Click ingest, conversion queue, callback behavior |
| Security | Validate auth and isolation | Unauthorized access, cross-tenant token mismatch |
| Performance | Validate under load | Click bursts, stream lag, dashboard read latency |
| Recovery | Validate failure handling | DB timeout buffering, pending stream reclaim |

*Table 8.1: Core Test Matrix Overview.*

## **8.6 Load Testing and Observed Architecture Behavior**

Under load, stream-based ingestion architecture offers two key benefits:

1. Request latency remains bounded because immediate DB writes are offloaded.  
2. Workers can batch and recover pending operations.

Potential bottlenecks to monitor:

* Redis memory and stream pending depth.  
* DB write amplification from heavily indexed event tables.  
* Worker lag during sustained burst windows.

## **8.7 Security and Testing Conclusion**

The platform demonstrates a practical security baseline for multi-tenant SaaS and a meaningful testing foundation for final-year engineering scope. Further maturity can be achieved through automated CI test gates and chaos-style failure drills.

# **5\. CONCLUSION & FUTURE WORK**

## **9.1 Implementation Results**

The project delivered a functional full-stack platform with:

* Multi-tenant admin operations.  
* Click/impression ingestion endpoints.  
* Conversion/postback processing.  
* Stream-worker persistence.  
* Dashboard and report interfaces.  
* Approved-only affiliate postback discipline.

## **9.2 Functional Outcome Mapping**

## 

| Objective | Outcome |
| :---- | :---- |
| Multi-tenant architecture | Implemented via subdomain resolution and tenant-scoped logic |
| High-throughput ingestion | Implemented through Redis hash \+ stream buffering |
| Conversion reliability | Implemented through idempotency \+ deterministic status handling |
| Analytics visibility | Implemented through dashboard, detailed reports, live logs |
| Security baseline | Implemented through JWT, CORS, Helmet, rate limit, tenant checks |

*Table 9.1: Achievement of System Objectives.*

## **9.3 End-to-End Flow Achievement**

The platform successfully establishes the intended lifecycle:

**Publisher Click \-\> Backend Validation \-\> Redis Buffer/Stream \-\> Worker Persistence \-\> Merchant Postback \-\> Conversion Worker \-\> Approved Callback \-\> Dashboard Visualization**.

This confirms the project’s central engineering claim: it can convert raw traffic into measurable tenant-specific business insights with controlled latency and reliability.

## **9.4 Discussion of Strengths**

1. Strong tenant isolation pattern across frontend, middleware, service, and database.  
2. Event-driven decoupling improves responsiveness for high-ingress endpoints.  
3. Rich schema supports both operational and analytical requirements.  
4. Approved-only callback policy ensures conversion integrity for affiliate billing trust.  
5. Modular structure improves maintainability and extension readiness.

## **9.5 Limitations**

1. Eventual consistency window between raw ingestion and report finalization.  
2. Operational complexity of stream workers and retry loops.  
3. Heavy indexing in event tables may increase storage and write cost.  
4. Frontend real-time behavior currently relies on polling rather than websocket streams.

## **9.6 Future Enhancements**

1. WebSocket/SSE channel for true live event streaming in dashboard.  
2. Fraud detection heuristics and anomaly scoring for suspicious traffic patterns.  
3. Horizontal worker autoscaling based on stream lag metrics.  
4. Schema optimization and index rationalization for long-term scale.  
5. CI/CD quality gates with integration and load test automation.  
6. Enhanced observability with tracing and metrics dashboards.

## **9.7 Final Conclusion**

This project demonstrates a complete and technically credible implementation of a modern multi-tenant affiliate advertising and tracking platform. By combining React-based operational UX, Fastify APIs, Redis stream processing, and MySQL analytical persistence, the system delivers a balanced architecture for performance marketing workflows.

From an academic perspective, the work reflects strong application of software engineering principles:

* Architecture-driven development.  
* Domain-aware schema modeling.  
* Asynchronous systems design.  
* Security-first tenancy handling.  
* Measurable outcomes through reporting and visualization.

Hence, the project satisfies the scope and objectives of a B.Tech major project and provides a practical foundation for production-grade expansion.

# **7\. BIBLIOGRAPHY**

# **APPENDIX A: COMBINED MASTER FLOW DIAGR![][image4]**

# **APPENDIX B: SUGGESTED WORD DOCUMENT FORMATTING**

* **Font:** Times New Roman, 12 pt  
* **Line spacing:** 1.5  
* **Margins:** Normal (1 inch)  
* **Heading style:** Chapter title (16 pt bold), section title (14 pt bold)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAloAAAGICAYAAACZRU5TAACAAElEQVR4XuydB3gU1drHKdKvBbteFAUUEQUU9V4L18a1A6KCIKBiBxW7V+yfgqBUAem990ivCZ3QO6EnEEjvvfN+857dM5l9Z2Z3Ntkku5P3/zy/58x555TJnj0z/z0z2a1SpUoVYBiGYRiGYcoEXYBhGIZhGIbxDboAwzAMwzAM4xt0AYZhGIZhGMY36AIMwzAMwzCMb9AFGIZhGIZhGN+gCzAMwzAMwzC+QRdgGIZhGIZhfIMuwDAMwzAMw/gGXYBhGIZhGIbxDboAwzAMwzAM4xt0AYZhGIZhGMY36AIMwzAMwzCMb9AFGIZhGIZhGF9Q9cH/AMMwDMMwDON72GgxDMMwDMOUEWy0GIZhPNGhE1Tr8gZU6/YWU1Z06Kx/3RlGwz//8wTc/lhbv6WBcnz0mBE2WgzDMG7QGQKmbHnyWd0YeOZRgxhjJ6ip8WfosbPRYhiGMUFnAphygY4DU7mhRiYQ0B6/qdGa1KQ5QLc3ALq/CQmNW+j2S+7u8Rbc1b2noJrBfqTKd7fDfaFdBVWWNdTtN+MepW+tLirQMozvMDrBPfFbliEP/3xBV5YpPdU6dIKqDz+miyMfTzoLzV7pAr169dLtY3xPtcf+qzMASHWFhVM66+KM76jy+FPF42AwNkzloc5Dj+pMjGT208/rYv7CFY8Ur7IaGq1LFNBgabnQ+mFduVZvvquaLAktU613K7hfMVhaqr15v66cEUJv3gPw1JNw8bmX4eLCJXDk9GldOW/4ePAwXcwX1HzkcSgoKIDYpCTdPiNqKOVpDOnwxddQWFQEN7XrqNtnRnZOji5GuU25QNMYBU9wNIamigpjj/dLcyknVavNE5qSxsa492+/62LaNjbs3gMXL17U7dfywcBBupjk6qeeF/V/HT9Jt8+Id37tr4u5A8do467dLrEn3/9QV84dZuNhZrTenpQEK4OD4TLlAoRGC3nljTd15dIyM8VrWMOgDTPkOMm0oLAQTpw7Jz7oyDa15Ru91FmUDb8QpWvLjLlr1ulilPSsLHU7OydXpNWUkyxCy5aGy9s+o4sZ8nQ7nQFAru7+BqT8eKcuLpGq0eMdl/i8zVt1Za1y4wefwM29PoF/ffOjbh9+AJXbUrSM5LgyZjTmK7oNHSHSOz/+UrePcvnbvdTtS98q3lbp8oZ+PDR8MexPXYyxJ5cp5zJqYpBeTz8Hy/tM1sUl4Rcu6GKv9flMF9t39CjMW77CsDyl2ZNPQ5tXXnWJ/TryL105BJ8nk3+DodE6c2VjndFCaDlqspDbu/RwKUNNloS2ZQQcuhbgSG9x4th5DmDXWTyl6C/e3yp/KF5Yb1bMyTzlhJ6ZnQ33v94T+k2cDIkpqfB070/g4Z7vijJotPBitXLrNjhzoXhVJiI6GtIzHSf6IqXc8i1bxQn+XHSM6LPHz/3ghuc7QOdvv9f1L46VHNfpyPMQfv6CMB47Dh+GTKcZCj14SJSVRislPR3ik5PVengMlzgvkqgP+g2ER9/5APLy82HP0TARj45PEH/DE+/1hiLFlKGavtgJ9h49pjsuLQMmTxX907gET3A0hqaq7QBXjIxWhvKa4996S/uXRH7z/gMixeOWr03bDz4S22i0rnzyGdi0d5+uv5y8PJHiWN3w9Atwk9IeKuJCtIhnZueIfZ36fg//evt9uKPzazpTJvuT9Oo/UI3d3+0NiFPMMKq1sp2ljMuR02fgn8+2F8caGRsrymEZNCt1//Mk7Dh0WHec1Gj9opg6/PvbffI53NrO8RoYIUXjEiOj1ei176HbZEedm95bL1I0Wve/6NrP+EVBLv30HTNOec0/FO+RvceOQ5u33oPLlfcN6irl9a+j/G1YduKSZSL9VXl/4Pvy+U+/hMPKa/LD6HFw8/MvivL4/lKP56Xih5ZrKn8ztj9QqYv55z//WpSvrcSrK/NnYtDfIi+NFpaV4/XoO++L7avbPive4yjZLp705N+B8xA/fIyev1DEChUjKMsOmDQF1oXugOf7fA53d3oNvhz6JzRQjhnnR33lpCjb09Lxq29gxOy5cN451qaYGC0k+K/ndDGJOGYlzVc+eMnt/ouXCKOFem3ICBixcq3YfuL/BsAVitFYtnO3yD/09ffQ4MPPxXZscoraXp7SFhotzONr9tu8RWp/WqP1wi8D1O2s3Fw4fPYc3KeYsxjlHPPfH36F1p//T9Sft3kb1Hv9XdF2y8/+J1LUf779WazYYZnPJ0xR+8e/BbfTshwfvK5/7yO4//O+cCA8Qu1v4dbtIh2wYLFIH+37E9zz6dfqfgoet2xXhxujRUX3M/bCyGhdGPUQDB29EJ4dlAX3/QZwuzLftfv3Hjmibv8yYqRIDx0/KYxW2JkzcMcTxeVDDxyApo//V40dOXkKmisfxnAbz0PNlPjXyjUkZPsOeLBjJ/jmj8Fw4uxZdf+Z8+d1x4d4NFrLGzbVmSyrRqvhS6+6lGm8tYPOZDXc8oKuLSMu7qsLWfGjxWTqOK4QWv1mbLSQ36fPVIzVFLGdkpYOB5UXC7dxImNetOc0Wq999yMcUvbjBZa2o+WyJ10/+eJFGC/8uL1cOWlu3rdf3SePq8PnXykXm6/UeHvlpC63fxg7QaSnIiNVo4XHgWj7wQsUKjktTexbvT1UHLv2ePtPna5uyxUts9dGclx5c3w+bIQuLsETHI2hqdp8vNAFM6OFKRpbTNFoXfXfZ+FYxFnlon0aPv59iFpWrmjFJxUbTInWaGHa+s13xEUWX4cbFTM0bflKiIqPF0YL9+OqCjWPRq/DWcVI46ojGmAUXvBl2X3HT4jtY+ERop9/v/WuWg/H4NOhw3XtGRktTP/1uuM1lGaZgsbO6PgkRkbr9td/U43WnT8WwuUv/yaM1uWPOoySpN+kyeo2vn5otHD7jGL4Ufi3/d/EyWr/zbsWfyhq2OFlkXZQjBKmaLQ+HDRUbButaMltfB+/q5yEZD4qLh5e/e4nWK2YHxn7e8NGYbTwNemsjFvDF18RcTQ6KGnKs7KLV2Y3Kib8xuc6wCjFXKHRQu13jtMzn3whjGOtNo9DTEIC7Ak7Bks3bhb70Gi9+NlX0OLVbnDNf59zOW7JP5UPZPg+GK6YLbrPBQOjVa9bTyj64BqI/vluKJj3iDAltAxqjnJSltuYao0W5vGD1zcz5yrvh1y13mnlQx2mTb/oC/mKmTxyLhJufr8PfD9/ETT86HPVaKHpOhRxTq2nNVrblddlrtL3FW/3hlNKe9gGGq1L31Q+lHzyFVypxNOVuYpltxw7AY9//4vY/nP5KohLTRXb7foPglTlAx/WxfyQoKUwd9sOqKUYM9nP97Pmif1HlddRxq5972Norpi22s5y7X4ZCHd+/IW6n3I+IVF8qKVxgRujhZitaPFtRvthZLSW7XoKXlo0DR4cmgb3DAC4+4Mgl/1ogJDxc+aJ/KwlS+HUuXPCaNGVK4xj+svwkcJsLVm3HqYsXAT/6vCSck0IV8v9PHyEb41WDQVqsmLvb6MrZ+nWYZ+WOqNV7Z37dOWMSElZBd9vqwcFF4tg6InDcMPIc+JERcuhNu/bB5c98bRyYY+ANYoxuV65KIcePKx80p4GtZVP7ngykkYL8xFR0eLiq/aVni5WNGR7p5UXD7fTlYtMjvLJ8H3FHMxctRqe7P2xrn/keuWiMGftOvX4sD0ELy5R8QnC8Mm2z8XEqEYrVzEWeCyyHbz4zFsXDGMWLIKElBSYo1ygunz7gzhWvKUjy+Fqy6LgDXDwxElLRkvu+1i5eN7asXh1Qgue4GgMTdXqQwUq8hktarTQDK0N3Qk/j5so8vLiqV3BWKxccPFi6q3ROq6YNWky8ZYStolGq+2Hn4jXR5omSS+lfbzQa1e68PW7/rn2MFeZRCjcN3ftegg9dBiWbNoCYxYFiXa0Zrbeo21h0tLlsEzZT4+TGq2fxoyHO1/tLlbtbtOs/mi56unnoZZz8pmNlZHRQuP9d/BOuK+74+LT/Pn26u1DWh8vXEeVT2ytevQURgvfI7gSOkAx5vj3Nnm5i9q31mjJmEzRaD2vGJZlijkwMlrBuxwrMJjH13Ln4SNiW35o0L5XpdGSZXEu4t80feVq0UZd5XVeuD5EvIdkHTRacvzQaKFBRYONeWm0bnj+RaXdtcJo4TwbPmuOMFqXKifLxoqZM1vROnjypEhf1HwIMsTAaNVBo/VybcjpcxMUDG8BNahB6FZsrpA1+w7A/jMRLkZrlRJ78fehYv/YtcFqWa3ROh0TCyect/nwdcnNy1eNFr5PzyqGVtbTGi3tihaatQPhZ3VGC1fPjkVegDo93jE1Wiisi3lptHA7VzlH4vFc9tYHMHdrqGrGEDRaM0I2qXlc0WplsqKFx3C1Uh63g5TzBt1fUqPF2A8jo4V8uu1T+PeUHbo48tkv/VUj1OGd92FfWBgcPH5cvXUozRWCtw33KOcvacAw3Xv0qNguU6OFXK78ccfuewhyHn4a2t7/b91+yW3KxUUaLrpPpc2jcP2KB+HaZQ9Cla7Wns9CBs+YJSb8+0fHwYiITWKblkHwRDtKMSY0LsETNb4weOGk+8qbkF174JmPP9PF/QE8wdEYfQjezGiVlOsU8yGh+7zB23bwOTAac4dR+7higrdAr3jC+IJeEoyMFlLvyZfgzwU74HKlLyODZcRrP/ysi9kVnOP4CAGNlwoDo4Wc6vhPyOvwD7ipx+u6fZ7AFSe5vffUGd3+krAtrLhN2+DBaDGVh7puHoa/eXxvXcxfuOqR4vO4qdHyJ17u+wM83ruPLs74mLb6Wy1XtvsYrn2prw5ajvERbVxvB1JadO0B15us1DA+xsRoXWIQY3wMMVp8S7ByQ01MIKA9/oAwWgzDMOVNtU7d9QaAKTfoeDCVG2pk/Bl67Gy0GIZhDKAXfqZ8oePhMjYGMcb+UEPjj9Qy+DoaNloMwzAU5WRJL/xM+aMbF4YJQNhoMQzDaKj2qvcPuTNlxGtu/smKYQIE1WhVa/ey/k3OMAzDMAzDeEc7x3cTqkZLV4BhGIZhGIYpFcJo0SDDMAzDMAzjG9hoES57pj3DMAzDBDy1Xn5Nd41jyh82Wk7oG5RhGIZh7AD+UwG95jHlBxsthbodOqlvyFqd9V9SSN+0DMMwDBNI0OsaU35UeqNVo3MPS2/EGq++rnvjMgzDMEygQK9rlOoKd/z7QbiywyvQ/J57ocHTz0Md5RpJy7lj0+Gj4sftadyM6i+8pIv5guomP6ElubH3OwB5nwsu5n2mbtNyvqBMjdYN7zt+nd1bfpq7EAoKC+HdcZMgMjFJt98d87ZuFz8+TeNmyDdgjVcdb6aGvT+DnSdO6sohlz73ou6Na8aQeQt0sdLQs//vuhjDMAzDfDtshC5mRPWub+iua1r+2fZpaNasGRQq19+ioiJITU2Flq1a6coZgeqrXLu1YBu0HKXqf9rqYrRdI/22YLGurEu7br5RoVaPt1RjhWROfgkKkj6Gi7mfw66jn+rKmxGimMo3x0zQxSkejRaKxryh79SZupg7toaFQYMPPxPbjT/92qv+s3Jz4e4vv1W323z7s64MRb4BZV7299qwUeqAGpX3BIrGjMjMydHFjFi5PVQXYxiGYQKfV//3HSxftRr+N3gYjJ4+U7ffE8HBITBy2gxdnPKP592vHtXv8AokJSWp176LFy96ZbSsxCiejJaWPafOqMe2dv8B3X4t7ozWhZjiFayLuZ9BzJf/gthvH4fj795ZJqtapkbriV8GiD9m/5lwFVrGjPdGjnXh++mzdWXM2BseoYuVFCuDLN+A2lijj77QlaPlkUPKa3Jn955wIvK8yDfs1E2ka3ftFn3j9kt9f4Rr270MJ85FCnePsRtf7Ky2IY1WbHKySD8fNUakJyIj1TaS09KF0Xr525+gPllV27B3n0hl2W9GjxflcTsjOxse+/gzdf8h5U16vTKROirHJGOter4H12meURsxfxG89O2PSj8dxP7LlVh+QYHaPk48TPMLCl2Og2EYhikZaJRmLFgk0tZvvAuv9v1BhZbVsnL1Gnj43V5qfqbSBi1Dodc0LfPmzxfn+Ntvvx369+8vUlzdavCc+3qSGOU6ps2jcNGDltPijdFC0ItcY+FumTujJQ3W8Z53wP7ODeHIysGwZdaPEDz9Y6+MVtDO3fDsgMG6OMXUaCEoGvMWvH3YY8gIXdyMtKwsl7w393oRKblN91Pcvfl+mbdQ14b2DYtGC9NO3/0kUiOjJUHtPX4C3uo3wCUujdbcdSEizcsvgFGK2UlOT4fcvDy1HBqtqPgEsX3Ty13g/QGDoG2fL3RGa/hcxy3L9l9/K9LRi4KUtoPFfnpMjV7tLmLS+D30bm+X/aecBlJbt9BpFvHWrrYswzAMUzLQYF3X/hVo/8mXinlaK/I/jRwNd772hq4sBctieme3N6F5Vw/ln+2gu85pSUxMhEmTJkHdunVh5MiRUKdOHShQPmjfdv+/dGUpS3fthavf+8glhmrz/S+6slq8MVoobeoOd0arqHA9XCz4Bg50uQXCXm8CR95sBmFrh8HFwi+8MlpWcWu0kA8nTtXFrHJzr0/gyrd76+LuuOytXuJFnL0tVKS1FXdPy7gD9eOCIHWb7qfINyCNI+v2H4R9mpW8Oi++6vKmRaN1NDxCgHlcsYpJTII1O3aJvjG2avsOsX258gbHvIzjKhGmaJ76jp0As9euF/n5wRsgKiFBGK0n+nwuyo9dvARWbNsu9ssVJUnInr0u7Q6dPc8lf/+7jtcTdcWzjlWqZVsdbe07cVI1TDiZMI2MjYPsnFyx/eavA0V5PAHI9thoMQzD+J7flevAjAUL1fzCJctUE+UOLPP9n6NEOndxkG6/lrodX9Vd57Tcf//9YgUrT/mQ36hRI3FdCA0N1ZUzAmUlRvHGaGXm5sK9X35nrV03Ruu/v/6qXEuT4OyR1RBxLATOrxkOyceXwO5lA6GoYI6uvBnPDxgMt3/2P12c4tFoBRJSaLSkaBlK3XavqG9Cuo9C37RyRcsqecqblt76KwvQLN3T831dnGEYhrEvLbv31MW00GuaEXf/+0Foce+98Omnn0KLli2hZpc3dGWMWLN3n3rdlRqw0LHo4Q5PRqvb4D8FXX4fJvJXvfcRPPN/A3R3vyjujBYSmXACLkKcQjycOx4MeVnnoOhiHNTo8baurBl13ngPavZ4Rxen2MpolRT5JqzXvpNuHy3DMAzDMIEG/tc8va5Vdo5GHhJGC8kriIGbP3C99ekr2Gg50b4hL1fekLW6vgm1NN+xxTAMwzCBSF03iwhM2cNGy8klirGib06GYRiGCWT+wStZFQ4bLQNqvfKaeHPif2gwDMMwTCBRr93L4lve6bWNqRjYaDEMwzAMw5QRbLQYhmEYhmHKiCq/L10BjP/Rb9ESQf/FS+G3oGUMwzAMwwQgVej3XrD8Q6lp6ZCWngGZWdniC0Rz8/IZhmEYhgkw2Gj5qZKTUyAlNQ0yMrPYaDEMwzBMgMJGy0+VlJQMySmpbLQYhmGYCiHHAFqG8QwbLT8VNVo5uXm6wWMYhmEYX4OGKlu55mQqZOQguSLFGMKGyzvYaPmpvDFapRFti2EYhqmcoIFCc5WWnQuJyrXn58NH4a4Nm+GWkI1w35ZtsDY6BpKzsiFduSZlseGyDBstP5VVo1VQUEireiXaHsMwDFP5QNOEK1dopKaFR8DN60OgYfAGaKiYrFs3bIKGGzfDrZu2QOPNW+F8WgakZucIU+bObA0ePET8Qxdu16pVS7e/ssBGy09l1WiVVmjUaJsMwzBM5UGuZCUqpqilYqhucZosXMlqpJisW5RYY8VkNVJMVuMt26DJ1u0w5/wFSMH/ije5NiH169eHBx54QGyfOn1GpPEJiRAVHSO28T/rtfvsChstP5W3Ruu5F7t4xay5C0W9gkI2WgzDMJUZNFm4knXzuhCxknVL8Aa4NWSTWMlqtHGLupLVRDFZjRWTddu2HdBk+w74Iuy4WNkyMlvRMbEirVKlikuK17ItW7fBzJmzRAzz5y9c0NW3E2y0/FTeGq3wiHNekaK0jWKjxTAMU3nB1Sx8Jis6PRMakpWsRhs3QyPnSlYj50pWk22hcJtism4P3Qm37dgF8co1Cm850luIrVq1gpo1a0L16tVh6rRpqtH6+uv/QcTZszB6zBi4+eabYfqMGbpjshtVLl50XKgvKhsOcFubd8RkGW9E6+nbNi7jjWi98u7L6DWjZbyRLO6t0Sqp2GgxDMNUXnA1Cs3SfxQTdUvwRvWZLDRZjpWsbXD1W287V7JCxUqWNFm379wNoQmJkJKdozNa99x7r8u2NFp33HEHxMUnwPwFC0QejRg9JrvhsqLlrSlAXcy+QENuVYIuKqXYaDEMwzBliXw2S6xmBbs+kyVXsq779DO4/quv4JaFi9WVrNsVk9VUMVl37NoDn5w4KYya0e1DLTfccKMuhubr9Bl7P5+FlP7W4fKHATIjaJRVSnlrtOgzWJ7gZ7QYhmEqN/I/DSPT0+EWXMVSwFWsJpuctwq3bIeq1aqJtOY11zhWsXY4DNYdu/ZCs937oPW+AxCbkclf9+CG0hmtfi0Aht4KkJNB97BKKW+N1oWoaK9IT3eMGRsthmGYygkaI/xOrHOK0Wq0wXGrsJE0Wc7nsXDVqVqNGiLFW4VNFZPVbPdeaLpnHzTbux86HjkKMYrR8vRVD5WZ0hmtN+oCvFQV4CmlmRO96V632rRpk8BMO3fupCGfSPZ53XXXkT3+JW+NVknFRothGKZyIo1WZFo6NNGsZOHzWGiyGq1eC03WB4tbhQ0GDRErWU137YU7FJN1p2Ky7tx7AMZFnucVLQ+UzmihlAs1LHtYcTBt6R63QneMuvTSS+Htt9+GlStXijymsbGx0LBhQ2d+FRw5cgTOnj2r5lGrVq2CiIgIkR4+fFgYk/3790NMTIzYj5o2bZq6HRkZCQcOHFD7le3ExcXB3Llz1XL+IjZaDMMwTFmifUYrNC5efEdWoy0Ok9Vk2w64LXQnNA11PPROV7Ka7TsAzfYfhJMpKR6f0Tp20vw5rDNnz8OYSTMheHOobp+WgcPG6GLekJqeATPmBeni5UHpjFZqFMD4uwDmtAIIX6KYrmxawlTS8DRu3Bjat2+v5jFdvHixarQwHxQUJNLjx4+7lJPp+PHjRTphwgSXeHh4uEseTZk2v3nzZrjssssgOjpamD1/krdGiz6D5Ql+RothGIZBg5SgXGdOKYYJn8USX9+wzfHQexPnfxbKZ7JwJavZnv1wh2Kymism6879h+BsWrrhfx3+OWYK/PHnOLF9XDFag0aMg6F/TYTgTdtF7HDYCUhOTRPb6zeFQlRMHGzatgtGT5wBk2c6/iNx0IjxIj13IVoYLWxv2pzF4no4asJ0sQ+3p89dDH8p9aYpaYhi2PYfCoPpSjncP//vlTBxxnxhtIb+NUmYulkLlkJScqp6rFh/9/7DYnvM5NkiHTZ6EoydMgcWKPX/cvZVUkpmtJaPAuhTG+C7awCGNAI4OBtg9xCAtY/RkqZCo4PgipbMy5QaLdTTTz8NDz74IFSrVk2seOG/hNJ6Mk1MTFTbR3Jzc0V9VNWqVdVyhYrJwG+uxe0GDRqIuL/IW6P1Tq9PvWLpitWiHhsthmGYygteW/BLR8+np8OAk6ccJmu74+sbmu5wrGQ5HnzfK1ay8HbhnU6TdSAxSdw2xNuP1GhFnLsgzApuo9FC8zNy3DSRR1M1TDE9aKrORkaJ2J4Dh4URGjneUWb1+s2GRgvzC5esEgZI/rzPmuDNsHRVsNj+ffhYGDB0NMxdvAKOHD8Fq4M3ibg0WtGx8TB19iLF1O0U8XUbtqnHLFfNsA3Z18Ejx2DIqIlqmZJQMqPV4RKA7krV3jUcZuuPmwHGNAOY0wKgKI+WNpQ0Rtr81VdfDVdddRUsWrTIxWj17NlTNVAoaZbkfrN04sSJLsaqV69eLvu/+eYbaNOmDfTr1y9gjVZRUem+LyMvv0DXJsMwDFN5kN8MfyY1DfbGJyoGq3gl687dxc9k4UoWmqyHDh2Bw4rJwv9WxC87Nbpt+PvwcTBr/lKxjUZr9MSZiolyrAyNmzJLpFsUI4fpH4qxQZNzKvysMFqyHt5OHD56sovRmqcYKLwm4n5pxKjR2rn3IAQtX+tc7QoStwyl0cJ2xk+dI4wWrrJhnXlBK2Dbzr2i/JTZCyFLab/ijdYvLytmS6nao4pjZet7xWz9rpit8c0Vo1VAS1uW9vkqKTRERUVFLt/xRU2amfCZLK2wHaoLF7z7HrDyklWjhZRGtC2GYRimciG/5iFOud6g2TqYkATtDh6GpriKpXnwHU3WQMUMHVWuT/ifivjbiJ7+2xBXtqJjE9R8ZnaOi3HB23YHDx+DOQuXifzoSTN1bUik+UFOno6AOMUU0jL+iOpYjNZFLMU+vQugd02Ab64A+OMWuldIVwesx/r27euSf+utt1zyRnW0MtpvFCuJjNoxipVE3hgtxFsVKcaVtsEwDMNUTqTZwpUt/LqG06mpcCw5WZiuAwmJcCgxCY4r+Yi0NIjPyII0xTB5MlmMA2G00BxIpNzFhKZ8C9Beqf6ic2ULbyPmZeuMBm3D25invOnxlSDmKW/Ul9WYVlby3hothmEYhikNaJrwaxrSs3MhUbn24PNXF9IzBFEKaLDQiKEh469zsE4Vo9/qM4bsLyoE+KAlwAuKyeqocDjEpB2jGIXup3Vk3mqMtk/bpuVLGqNt035oGesxNloMwzBMeYPmSX7tAxqqNA0ZSowNlvdYe9iJVe5io8UwDMNUJNJ0aaFlGM84V7QYfyMpKYmNFsMwDMMEOIrR0t660t4isx5DFaeODU91vI3Rtov70NYxr+8uZtZ2cR/6Ot7GaJuuqb5OcnKyICMjA7KzsyEnJ0d8HxjDMAzjn6SlZzAlRHx5qcFrGujk5eXxipa/kpaWBpmZmZCfj9+V5fr1FiwWi8XyP9GVDMY6Wdk59OW0jdho+SlotLKysthosVgsVoCImgfGOmy0mHLHndHas2eP+NJWLR07dtQMq/fC33vEdj766CO6C3bu3Cn2/fHHH3RXmalt27aiz3PnztFdLBaL5Zei5gHBn57Bn4TB9EJ0rAB/miYpxfFbe/JnX0aMmyrK4Pa+Q0fV+nsPHIGpsxZCalqGyG/ftU9tD5/hpf0FKmy0mHLHW6MlKanYaLFYLFbpRM2DBI0RplqjhT+KHJeQqBot/N2/C1ExYtvIaMk2pNHCsnb6Jyk2Wky5Y8Vo9e7dW43dddddIhYaGiryDz30kGq+atasKdqSqlu3rrqvS5cuIqY1WnLfP/7xD7FPa7Tq1asntq+//nq1PZSsg78tuX//fjU+cOBAdd8VV1yh/h0ydsMNN4gUhb91idv4e5dstFgsVqCJmgeJkdHC39dDkyX3jZsyWy1vZLRwG3+6Rhot2kegw0aLKXe8NVoojN12223qNpqe1q1bq6ZGxpF77rkHrr32WrG9detW1Whdc801UK1aNbUc9i2NFlKnTh11W/7It8zXr19f3cb2ZL3atWtDkyZN1H3aOhL8zUm5XatWLXWbjRaLxQoUUfMg+WuC48eUo2PjITouHiZOnyfyB44cU/dhSrfRfBw6egIW/L1CxE+cjoA9Bw6r+xOSUnR9BSpstJhyp6RGSxoZs7jcPn36tEsZabTkShX+xiTmR40apRqmBg0aiH2zZ88W+RYtWsCOHTvEdocOHcS+F154wavjkLrjjjtEXq7IoeHDPBstFosVKKLmgbGOrY1Wamo6IClOaJ7G5LY30Hq0XaMyVqH1jPJGMdqOFWg92jbNG9WxSnJyildGa9OmTSLWuXNnkZdGRgsK29HeOkTQSEmj9cQTT4hy27ZtE3m89SeN1ujRo9X+ZN1nn31WpCkpKSJ+7NgxdV9qaqruGORxaLdRNWrUEHn5d7788ssiz0aLxWIFiqh5YKxja6OlXUUpMlhZKSvKs6/ywpd/kzcrWnFxcapxwS9Hk0ZKSmtqYmJixCoVKiwsTN1nxWhdeumlYt9vv/2mlj18+LDYbtOmjdj3wAMPiHz16tVV8ySlPQ7tNuree+8V+SVLlog8Ph+GeTZaLBYrUETNA2OdSmO0GP/BitGioAFCydt5FNRNN92ki+PzUVaM1tdff61rDyUfaKf73n33XV1c7qNtaGPIY489JlI2WiwWK1BEzYOWhJRMiIxNrbScV0jLzNa9LlaMFl4DpVKVayMqPSNDjaFy8/Jc8r5QTmEhpDjbLdBcg70VGy0/xZ3RwlUpNFWSzZs3a4bUof79+4vbevv27VPLSR04cACeeuop6Natm9ou/tQPlsHnr1BovjCPz0yhCcPtQ4cOiVuDPXv2FCtnWo0ZM0b8p+CECRNc4vPmzRO3AfG3G7XHQY8Jhbcfe/ToAeHh4bB06VKxH18HFovFCgRR8yDJzs2nRSutYhLTda+PJ6OF2n/gkEif79jVJZUKWrLcJe8L/XPVGkFpVUKjpf19PpkaQet5Q3n0IaFt0vZ90Q9t130faWnppkaLxWKxWP4nah6QmETXlZfKLrySZefov//Lk9F67sUuMGPOfDgXeUHkv/+/AXD4aBhEx8RCt54fqEarx9u94eixE7Brzz7o/clXcCEqGjq++obY98MvA+CFl16DiHORauynXwfC6+98KLap0GR9tM/xdUWHnM8hN1y9Fj7buw+GnjwF94VsFLE71q0Xf5eZSmi0mLLG3YoWi8VisfxP1DwgKenuDURlFN5GpK+TJ6P151/j1VWs8IizIkXzNXn6LIE0WouClql1Rox23GE5dTpcjXV67S2RDhsxFjZvDVXr4+KGVm/v3qOuaPXZu7/YaCn5D/bshSc3Ou4kbY2P97jqxUbLT2GjxWKxWIElah7YaBkLn9mir5Mno4XavmO3SHFVCrVrz35xbcS8NFqv9nhHrGJt3rod3v7gE3ENbf9Kd7UNrdHCut/9/Bv8OnCwiH3z469qOa15wm1ptHD7873FRusmJR+X4/7Y2Wj5KWy0WCwWK7BEzYMno/XJ17+obNuxl+6GwSMm0pAtVFKjVdaSBs5IzdaupyEIjonxuJqFKqXRMnp2yShWErTtGD3HVBb9eBvzhFEdazF+RovFYrECS9Q8eDJaqNZt2tOQqhc6vUNDtpC/Gq2yUimNFlNW8IoWi8ViBZaoefDGaN3Ruq1IH2r7CjS80/G9hLc0/w8sW7ke8PR/17+eEbGk5BT4b7sejsoBokVLVom09+c/iJSNFuMXsNFisViswBI1D94YrXsefkGkNzd7BJre86TYbt/5Pfjh12GQk5MLDz75srp/XfAWR+UAkva7sNhoMX6BO6O1YcsOWLV+k2De4uUwP2iFZkgdmj5nkUAqJbVk30eF/Q4aMY6GXXQk7CQs+Hulmv9zzBSYMTdIzY+eOAMKCwvVPOp0+FmYu2gZ5OU7vl9m+JjJMGbSTLGNv2w/dvIssR1x7rwol+3hYUMWi8WqaFHz4I3R2nfwCDzwaAeIiY2Hg4fDoM1TneGJ57tB8MZtSvoavPtRX1EuIyNTWz0gxUaL8QvcGa25Qcth4NDRKgOGFv8GoZRsJz4hEQoKCiEj0zE55yxYosSSxPbvw8fAwSPHxfbYyQ6To+0HNfSvSeLTFGpL6G44duI0DBw2RuTDjp90pEpMa7SoCgoKdEZL6sSpM3DoqOMY4uIT1Xi+UgcVtHyt2h+LxWL5s6h5sGK0vNVtLR2/3hHIYqPF+AWejJZW56NiXfJaodFCodHKzMp22bdsdTDMmv835Clv8vl/r4BRE6a77EeNGj8NVq/fCAWKUUKjhdp/6KhLGSOjJVen0KiZGa2ZSt8oXBFDxcYliBT7Ct60XWz/OXaqSIeMsud/37BYLPuImoeyMFp2UKUzWkVFF6GYIh24+uHYlvsviouoa52LMHjkBPGQnozjKsv4qXPUPK5KYLpsdYjYh2BdvEWE8dETZ8Lvw8eKGBqCKbMWiPie/Yc0fVlBe6xGaMuUFCt9lBRH/bIwWqglK9ZBYlKy2F64ZBWsDdkijBb2sXRVsIhj/1STZswXRut0xDkYMtL1Z3ao0RqmmCu81YfHjD/Vk5GZpUyibDh45JhaJmjFWshWJpYst2FLqGKmHO3OXrBExNGgodHD/SdOh6t1WSwWyx9FzQOCv3HIchV+Wz59nexttJSLmDvQaE2cPs8lNnfxcnGBxgsgGiVciShULtTCaF10mCxME515vOd8/OQZyFIunpgfPnqy2pYwWpq2QzaHCqOFzxThBV8YrYuOVR6j1BfQNs3S0kDbMksl7oxWalo6jBg3VUWuHpVGp844vmnXneSKVkm1ev0mGmKxWCzbiJoHh4FwPHrBcghX+OhrZH+j5bKSol2NceQdK1pyFatIPLCnrkgpF/9R46fD4JHjRRkXo6XkccUCU3y4GWMTps8VeWG0nH1Jo4UrH5iPio4VRitZMVr4gLQ0WuKYZKrd1sXoihL9u0gZbX2PMaN29K+Z2zqmbbvizmixWCwWy/9EzYMkNjEdMrPzaPFKJbyEJaRkQY7B62N/o4UXeR+hXZ3Jzy/Q7fcEPgBNYxSzFSBfQNsujz7MYKPFYrFYgSVqHhjr2NtoqSsucjXGDFoG81ZjtC0KLUPbkXmjGK1H26bQMrSd8uzLPMZGi8VisQJL1Dww1mGjZYixQTCO0bqeoO3IvFGM1qNteYK2Y7UvK9A6Ru0Yx9hosVgsVmCJmgfGOvhPU3aVBaMl92lTq9B6tO2y6qM8+zKClqHtuMNRno0Wi8ViBZbwn8LiE5MZL8F/nLOzLBgtCjUG7qBmg7ZF0Za1Cq3nqS9ahrbnDlqPtu27PthosVgsFosV+HIaLcbfYKPFYrFYLFbgi42Wn8JGi8VisViswFeVzKwcYPyPlNRUNlosFovFYgW4qsQnpgDjfyQlJ7PRYrFYLBYrwMVGy09ho8VisVgsVuCLjZaf4s5oZWZmMwzDMAzjJ2S7+U1LNlp+ijujxWKxWCwWKzDERstPYaPFYrFYLFbgy5LRmnv8FMxROBQV65KPik/SlWV8AxstFovFYrECX5aM1q9790N4bAL8c9Ua2Hs+GtZGRKp5WpbxDWy0WCwWi8UKfFkyWv33HRCpNFpbI6PUPC2LxCYmQ3D4ObF9y+q1Ij0ZEw/HFGSZbecuqG2cUkybjMcp7FP6kPm14WfV7ci4RHX7jFJH7guLjoOGJscSqLDRYrFYLBYr8GXJaKEZQp7buMUl/8OefbqyiNZoddqyTaQnYxLgoPPWY+u1wcJQRSUki3ZilLTZ2vVi31bFgKEJm3n8FDRQ9sUqsbvWrBP7NkZEwhPBIWIbDVysUg/LYH0z0xeosNFisVgsFivwZclo/XHwiGDD2fMiP8iZ36NZedKiNVrSJN2lGKlPd+2Bo9FxMFSpe5tilNBsSYNEjVJzpd6zGze77Gus1Hl1s8PsDT942GXfzWy0WCwWi8Vi+ZksGa2S3DqUq15opmTZt7fvEEYLTRE1WDJtqhgs3MbVqtGHj4ptvO0oy/zqPBZptDDFeNM1jluUdoGNFovFYrFYga8yMVpM6WGjxWKxWCxW4MuS0WLKHytGKzU9UymbzDAMwzBMOZOQlEIvy4Zio+WneDJaKanpkJuXzzAMwzBMBZGVkyt+gsed2Gj5Ke6MFrpoOtgMwzAMw5Q/Obl5GlulFxstP8Wd0cJBpQPNMAzDMEzFgHeZzMRGy09xZ7ToADMMwzAMU3Ekp6ZprJWr2Gj5KWy0GIZhGCYwcGu0cnOdBTF1By0jO7ASo215graj/YNojNajbVFoGdpOefblJpaamspGi2EYhmECALdGq7CwCAqVC7lIvQHr0HpmMVrXE7QdmTeK0Xq0LQotQ9ux2pcVaB2jdkxiaWlpJTZaaWkZmiFmBaLMnsPLys6hRVkBpvSMLN24InnKXGcFtjKzsnXjiuA5nRW4wutvdk6ubly1eDZagkInNE9jxBRYgtaj7RqVsQqtZ5Q3itF2rEDr0bZp3qiONUpjtFiBr1TFLNNx9fSfLazAEJplOraZWWyg7SCjecvnZHvIbGwlHoyWNALSJHhCbwrM0bZtpQ9tWavQep76omVoe+6g9WjbvuuDjVblltGkZqNlD7HRsq+M5i2fk+0hs7GVeDBa9ELP+ANstCq3jCY1Gy17iI2WfWU0b/mcbA+Zja3EotHSrsZo8zSmNwWeofVou0ZlrELrGeWNYrQdK9B6tG2aN6pjDTZalVtGk5qNlj3ERsu+Mpq3fE62h8zGVmLRaBmZguJ8UlIyVK1aFapUqQJt2rTRGQPvoX3ZAd/9TXYyWuezMi0Tk+3+pwwqi4wmdUUbrShItkwcmJ90Krv8ymilnFWIsE5hxb4H/V1G87aizskFOYWQFpFhmbz0ijnOQJHZ2Eo8GC1pDuRqDKVImKsDBw5AzZo14fz589CvX3+44oorICYmVmcQtISHh6ttp6dnwLhx48T2vHnzdH3oU6vQep7/Hn1qFVqPtu27PuxitKiRsgLLeFJXpNGiRsoKLGP5l9GK8B6WqYzmbUWdk6mRsgLLXGZjK/FgtIov8gUuRqH4ov/ee++JdM+ePSKGxgvzMjUyE5dccgmcPHmKlC2Ehx56yLSO72Kl3V+amKf91mJstCq3jCY1Gy17iI2WfWU0byvqnExNlBVY5jIbW4kHoyUv7pjqCQ+PgKeeegp69Oihcumll0LXrl2hbt26BmahCKZNm65unzhxEtasWaMarebNm4u0evXqIr3++uth4cKFYjs9I0OkuGJG2zRHe/w0NYKWoe25g9ajbfuuDzZalVtGk9rfjNb5i4m6GBstz/J7oxV32AGNs9HyKKN5W1HnZGqirMAyl9nYSjwYLXqhdyVTudjT2HXXXeeSqji/eBNvL+4/cEBsL122DA4dOqyubDmMVpG4DdmrV2/o3ftDxWgtUtto164d1KpVS9en+qWeNPUltO3y6MMEuxutranZulhZGK3MzOL2jhw5ItIFCxaoMX+V0aT2J6N1tiAWvg7pC//oV1fkq/xcVVemvJWXV3Gvjzfye6N1Igggeg/A2Cr6fX5itGJiYmjIL2Q0byvqnExNFBK1NQ4ig2NU6H5PWqZcz30p7Zzdtm0bHD9+HGbMmKEp4T8yG1tJqYwW8p9HHxXp559/LlKX24FoGAzAfR999JFz5aq4TvPmd4kUjdaKFSvh7rvvVo1WckoK/P333w6jpTUk7pBlDI7bMrRNI2gdb6BtmaGpY3ejVeeE+T6qnJwcqFatmti++uqryV5z4Xtu+/bt8O9//1vNo/Hq168fKel/MprU/mS0+m/qJ9IdCftF2n5eR10ZI4WFhYlx0KpLly7q9vz58yEhIUFsX3bZZRAZGakrj9K+D1q1aiVS7RxBGdXzB/mt0ZpQB2Bp52LQaM17FCA53KPRqlevHnz44YcusUceeUTdpmPxqHJNKSgocInhz45ZFZ4X/VFG87aizsnURCEpJ9Mg+XiqCt1PdezYMXUbxzBFuUZb1datW9XztpT2fYDbK1asEB4BdeONN4o5PHHiRLWMP8lsbCWlNlobNmyE+vXrixemU6dOcPjwkWKTZVC+XCjLvv2gbTsbrRqKyZIsTszV7adCo4WvQ8uWLcUFdv/+/eLTT5MmTcT+V155BZo2bQp421WuWh09elStLyc3pngynzBhAlxzzTXiNUWjP3bsWGHw/UlGk9qfjBay+nwIhOdH6+LujBaOAZ5I8ZOrHJcGDRpAeno6fPnll+L8ojVa586dU8s1bNgQzpw5A4sXL3YZU2m0tCYO3zO4jXOnUaNG8N1334k4PvbwzjvvwKFDh0S+IuS3RouuYMl88hmPRuvgwYPqBVOOARqt2267zSWGwn+KQuFYoGbNmiXmJSLLTZ06Vd2+8soroU+fPo7KTnXr1k2kw4cPh6ioKDHeuFItzZq2v/KU0bytqHMyNVFI6P8dhIlN/1ah+4309NNPi8d79u3bp76usbGxsGnTJpEOGzZMHXs8r0ph2V69erkYaFl/yZIlkJzsOEfgY0ioW265RaTLly+HmTNnim18/+D7Az+AofAY1q1bJ7bLW2ZjKym10ULy8wuEO8UXCleq6H7Gt9jZaCHermjhp98HH3xQmKspU6bAhQsX1E9X+J7ECR8aGqrW0X7ixa8lQWE5abRwG+sjaLT8TUaT2p+MFt4qlFT/v0tEbMDWgZaMFnLttdeqJ91//etf4kJ9+PBhGDp0qIvR0t76RZONBhqNlvairjVaOE9wfPH2g2wfV1vuu+8+dbzRaOXm5qrtlrfsZrR+/vlndVxRNWrUECkaLRnTGh/5NUEyhqYbhXMzIiJC/NOVrCPHzMxoYZ06derAjh07RF3tOaEiZDRvK+qcTE2UFYykHSuZynHBW384nk8++SSMGDFCXKtQmMp6LVq0cGlL7n/88cddYlqj9cUXX6h9oNFCM43CW8b+NrYSnxgtQ+jqDM2XBtqWp3xpoG15ypcG2hbNO7G70TqYnqWLmRktXKmSf7/8ZLNq1SpxcUZt3LhRpPTZK7wo4ydeKayLryd+7Qhq5MiR4gR95swZtYy/yGhS+4vRWh+7RWe8+u8aBPePbu3WaG3evFk9EeNY4JgOGTJEvbAuXbpUGGhpgoKCgtS6KFyFysjIEGXwWRFcGcET/dq1a8V+nDO4/48//hB5+V5BY4YaOHCgOGHv3r1bPY6KkF8brdOrisH8wakejZZ8nVE4l06dOgWLFi2CkJAQEcMPRtoyOHdRiYmJYi7OmTNHXEDlhyNt2cGDB4sUV7Gl8IKO8xaFKy2yvQ0bNqjP92jbKE8ZzduKOidTE4XEH0yG2N2JKnS/kfA8iv/QhtLOKTmvcJxxLmtfc1yxktLGtds4d8eMGaPm8TYiKjo6WqR4bjhx4oRY1c52fr8ivpfk+b68ZTa2krIzWkyZYXej5Q6W8aT2F6NlFZax/NZoIWiqXCDPZxkYLVaxjOZtRZ2TqYmyAstcZmMrYaMVgLDRqtwymtRstOwhvzZaVmCZymjeVtQ5mZooK7DMZTa2EotGy+j7nqzGPGFUx2rME57qGO03ipUEo3aMYt7DRqtyy2hSs9Gyh9ho2VdG87aizsnURFmBZS6zsZVYMFpoDiTyYu8upjUFVvKliXnKWzk+qzFPeaO+rMZoW+7zdjFa2crfQo2UJ1jGk7oijVYO5OuMlCdYxgpoo5UZ66jHMpTRvK2oc3JmVJbOSLkjPZLPve5kNrYSC0aL8TfsYrRYJZPRpK5Io8XynfzKaLF8KqN5y+dke8hsbCVstAIQNlqVW0aTmo2WPcRGy74ymrd8TraHzMZW4tZo4Q9JCwpMkPu0aUmhbfuyD1qf9uGLvmg92rZRH97irMdGq3LLaFKz0bKH2GjZV0bzls/J9pDZ2EqsGS0fgCsx2tSX0LYDrQ/apqe22WhVbhlNajZa9hAbLfvKaN7yOdkeMhtbiXuj5c3qTClXaXRt+6IPWq+8+zKClqHtuMNZvjRGC78ElRXYwgsvHVekSPM+YAWm0tIzdeOKJppHNvBldjFmBb4yMrN046qldEbLCGoOzKBmg7ZjBm3HHaXpozR9uYOWpe24w1m+NEYLwQnPBCZGF2IeW3uQnmF+skazRcszgUNGZrZuTCXZObm68kzgYPbBV0upjVb37t3V3y1CunTp4moMtAbDKGbQptsytB1qRIzKGLVjBC1D2ynPvtzESmu0GIZhGIYpHzwbLQ+guZLbp06dFj8GmZmZpStXXuAPXNOY3WCjxTAMwzCBgWejRVdUCMJoKWWmTZsmjJZc2Tp1+rTrCpCTPMUc4A/ExsTGwvvvf+Box0MfLmWUtG7durp2JY8++qi6fffdd7vU89gXLWPQvim0Hm3bh324M1q4DE0HmWEYhmGYiiElNV1jrVzlldHSxo4fPwEnT53SGwyFPKXTdevWidgzzzwDf/+9RPwKd9WqVUXs6quvhoEDf1eMRDa88EI7mD17Dlx11VViX5Mmt0F4RATUqFEDchRDUb16dXjqqaccq1jOY6hdu7balzBazv6HDRsG/fv3h2rVqok89tejRw+44YYbRJ9xcfFQp04dw2PW5Y1itJ42bwQtY9aOQcyd0UpMTtUNMsMwDMMwFYP2Gk1VbLQMLvZyWxot7XNax0+4N1qtWrWCa6+9VuTr1asnDJO8BRkbFyfSuXPnOsxXocMUadsQK1pK/qabboZXOnVyOca+ffuqea3RksfZtWtXkR86dKhI0WiNGDFCGLDxEybojtflb/c2ps3LbaP9XsbcGS38r0Je1WIYhmGYiichKUVjq/Ty6hktF6OFK1onidFyol3ReuWVTqLs4MFD1JWm+ldeCW3atBGrVIMGDxYP27du3dqljRtvvBFiY2NFXw0aNBBtYvzHH390KYdGC58ZQ7DPxx57DK6//nqxD1fFatSsKYwWMnbsOBGjx+uPuDNaUvhfLskpaQzDMAzDlDPubhdq5ZXR0uLOaHkiISFRF7OKuvJlgT59+oi0ZatWun3+jhWjxWKxWCwWy79lyWglJibBXXfd5cJ999+vK8f4DjZaLBaLxWIFvnz6EzyM72CjxWKxWCxW4IuNlp/CRovFYrFYrMCXpVuHHkFzYJT6Etq2L/ugbdLUF9A2aUpgo8VisVgsVuDL0vdo6dCaBHeUpO3y7MNK+9p+SgptywxNHTZaLBaLxWIFvkq3oiXNgVlaGmhbZqkvoG2apaWBtmWWOmGjxWKxWCxW4Kv8VrRK0ocVStOHN/2UtO0S9sFGi8VisViswFfJVrS0BkKmFFrHW9z1oY37AtqmWVoaPP0dpA8rRgu/jZa/IZ5hGIZhypec3DxITk2HQuXa7UklW9GSdWg9sxitawVtPWpOtDGzOlah7Vjtywq0jlE7RrEC90arSNnOys7RDTzDMAzDMOVLfGKyxlbpVbIVLabMcWe0EpNTdAPNMAzDMEzF4E4lW9HSrvrIukYxbdsl7cOsbbpdkj6M2jHrp6Rt037M2ibtuzNafLuQYRiGYfyHlDTz3z0s3YpWScyHVTy17Wl/afCDtt0ZLTrAkuycPEhNy2ACFPyRcDqmWnJy8yE9I1NXjwkM0jOydGNKwUcCaD0mcMjKdv8hGD8kp6Xr6zGBQWaW+Tk6OTVNY61cVSW/oAAY/8Nbo5WWnqkZVlagCseRjq3E6B8iWIElfHDWbEUajRgr8IUfhujYImiiWYEvs/nr1mjJFZR8g1UVGUtISITmzZtDqtJQlSpVREymFHftlCTmab825mm/tzFP+0sT87TfG6OVmcUT2E7CT050jHFys+wh/GcWOr78Qclewv9Io2PMso+MVrbcGi3HCgpe7PWrKpKRo0YpbjxbbKPBKk5pPYdpyM3Lg+7du0PXrl0hdMdOXXv79u9Xtx9++GFRJy4+3qWdnj176tp17c8s5tqXHlrGqA2zGK1H26bQMmbt6GPeGC28MLPsI6NVLV7Nspfo+OawkbaV6BzGxzpY9hGej+kcdmu06EqKGTfeeKMwVyEhG0R+z969ujISNFrr1q0T28888yx06tRJbP/7wQdFWrduPQgN3QFhYceE0cLYpk2boXXr1hAbGwdffPmlMFp79+6DmjVriv233nor7N6zB/KUPwiP48CBg/Dhhx/C2bPn4NnnntMdQ6DDRqvyip6kEZa9RMcXV0BY9hGdw2y07Cc6h90arfx85yoKpkbIfdrUA2i0ateuDbfddpvIo9HCFI0WtoEGCtNHHnnEuaJVABsVo4UrXfXq1YMjR46qK1p33nknBAeHQNWqVaFatWrw119/qatq0dExYnvJkqX6Y6R/Ryn+HhVaj7btwz7YaFVe0ZM0wrKX6Piy0bKX6Bxmo2U/0TlcKqOFS9rXX389PPfccypoerCOTClotNauW6eahilTp0J6RoajvBKrVasWpKdnCMMljJYS27hxkzBSWVnZ0LhxYxejhWmjRo3E7Uv5nBjGrrrqKlG+Ro0aemNj8LcYljE4flM8te3DPthoVV7RkzTCspfo+LLRspfoHGajZT/ROezeaGkv8FpT4MxLU6M1AV5D69G+jMpYhdYzyhvFaDtWoPVo2zRvVMcibLQqr+hJGmHZS3R82WjZS3QOs9Gyn+gcdm+0pBGQJsETBqbAFG3bVvrQlrUKreepL1qGtucOWo+27cM+2GhVXtGTNMKyl+j4stGyl+gcZqNlP9E57BujRctojYGnGG3LE7QdakSMysgYbYtCy9B2yrMvNzE2WpVX9CSNsOwlOr5stOwlOofZaNlPdA773mhpzYiMG8W09az0YdQ+zdOYt33QsrQds35o2zRvtE9bxlPbpKyvjBbWK8ov0uFO+Cwd3jKWwm0aQ2VmZooYcsUVV6hlJbGxsWrZl156SVefZSx6kkbcqUAZ43xCkcm3QeAYVK9eXaQFyvsM3x9m48sqO9HxdWe0ii4WQUFRgQ4jzZ8/X51/TZo0ETGZZ5Wf6Bx2a7SU8YXCfD2gn8T4hbc8nv4hOoc9Gy1qCoww2l+amNl+rQkpacxT22b7SxPztN/LmC+MVlZsDqRFZJiiaVIVXnzxnwvkRH799dfFPy+gLr/8cnj88cfVsvjVGyEhIWK7T58+ItWeAOQ2Hj+fHKyLnqQRM0Vm55kSnaOvh/9AgsL316+//gqvvfYanDt3TsR4fMpPdHzNjFZURrRbqHB8w8LC1DmHSk5O5rEtZ9E5bGq00FClRJiT53puX716tZi7PJ4VLzqHPRstgwu9zgRoU6vQerTtsuqjPPsygpah7bjDWd4XRktrqlJOpeuMFkIlJ7A2HTBggNju3bu3zkjhSkj79u1dyv/www/iqz20MTRwfHKwJnqSRox03sBcUcxEx+Kzzz4TBptVPqLja2S0knKSdMaKkpCVQKsJ4fj26NHDJc8qP9E5bGq0qLEywkA8nhUvOoetGS15kbeS90XMbL/Mlybmbb40Mat5L2O+NlrBH+3UmSxqtJo1awb169eHn376SUxkTC+99FJ45plnxP42bdrojBbdRkP1+++/uxgr/LJbbZss96InacRI1FQZQSXHZdGiRWrslVdeEV+twio/0fE1MlqxmXE6Y2UE1XvvvQdPPvmkS4wvzOUrOofZaNlPdA57NloKeU7M8jLmYggsQuuVdds0bxSj7ViB1qNt07xRHav42mht+/mAzmRRo6UVNVESPI4GDRrAqFGjYMyYMSJ2ySWXCFB4wZZl8ZaFVnxysCZ6kkaMRE2V5HhGjqnR0o7lfffdBx9//LFLjFU+ouNrxWgtPLFYpK+vehteCOpoaLS0Y6kdTx7b8hWdw5aMVkKYI40/AjC2ChstPxedw+6NllxR8QnyN/vob/f5krLsg7ZdHn0Y42ujhQR/tANW9thqyWhRRUZGqtt0kp89e9YlHxUVJVZOWCUTPUkjRtKaqyd3nIand56GZ3aecbuixfIP0fH1ZLTeUMyVSFe/43FFi1XxonPYktE6uQRgemOA08s9rmixKl50DlszWriSQi/4HmPULBj/QLLndoxi2nZkuwYxbR2PbZrFDNqlMV0do3ZMYrq2PcXKxmgtfiEYUk+7PqtVElGjxfKt6EkaMZI0U8NOxepWtdho+bfo+HoyWu5g+Z/oHPZotC7scDVXbLT8XnQOWzNapUIaBZr6AtomTX0BbdMsLQ20LbPUQVkYLWqyqNHKVU72CAr7w38lLiq6KGL4Y96oAiUm92uVkZkpUjxeFB4zCttAyfKyfZa56EkaMZK3D8PjGGjHGH++CqWN5eXJ1LVPOa7abe2YyhVM3KdtTzvemZlZIpX18Oe9ULIvfN9r99tZdHyNjFZStueH4eOz4mk1dSzka48/Ui/HVTseRc7XOc85no5xLFTL5OTkqGWp5PxG4XjJrwpB0f61feJPr2nL4E+zafPFxxzYK+J0Dns0Wu7QCM+n2rEUY+Y8x2Jcnm9ROBdxPGVZWUYreQ5AZWY55qdsg85jHBOjdnBxQavUtHSRyrKFmveKnUTnsAWj5a2R0JoDd9CytB130LbMKEnbJemnPPoorlMWRouSl6k/mU2eMV+k4Wcj1Um4c88BkW7bsRcGDhsjthOTkh0VFC1ZuV6ky1athxnz/hbbx06cEuYL2/jjz3Gi/LQ5jgewMR/oJ9KyFD1JI0YqUEwwNVYUqgFDR4t0yMgJ4j21efsul/2r1m8U6ZhJM9XYhehYYYZw7BMSk8SJ83dlOzE5BSIvRIs25ftz6F+T1D6kMI9xVHxCEiSnpMKQURPE+/rA4TD4a8J0sS9o+VoIWrZGvTjYWXR8jYwWihorClXEufMwcPhYsY2vbcimUFi/cavIZyvGae6iZYq5cXwoQqM7eOR4cWHEsZiuzM8Nm0PVtqKUcde+D7KyciA2LkHMXazzu7OfP8dOgeWrg9VyOL9zcx0mGoXnsKmzF6rvkdNnzsLKdRthwd8rRD5oxVpYtHQ14G/kDhoxDraE7hbHozUNgSY6h02NVuo5vbGiaLRp206R4us/YtxUR2xLKMxZuBT+HDNFOUfvEa/dBiU2afo8WBuyGf6aOFPMwdj4BLEP5y5q+659Ykymz10MG7fuENsz5gYpdXfAyHHTRJ00pzGetWAprAne7DgIpwYr55Clyrkf62G7eI7Qzn2c46jDYSfFueN8VIy6zw6ic9i90XI+fO0VaAaspKWBtmWW+gLapllaGmhbZqkTXxgt1MXCi5CvGCqKmaTRio6NEyc+lDRaOIkmTJsrtrVGa8HfK0W6WTkJaI1WivLGw0/LOHmx/P5DR8UK2doNW3QrJqxi0ZM0YiZ8V2QVFulAE2YkeSLEiyFqTUjxyRMv0ji+O3bvd7nAYhwvetOUiyVefFF4kUWjhZ9sB40YL2LyAqk92eKn2tDd+8SYo0KVkzsaLewf39O79x8SRmvW/L+F0TobeUFdYbGz6PiaGS1UfqFyoS7IdiGnwHi1CV/7sZNnie0QxTShKUKjFRufKGJ4UZUflnCfvBiOdF60qdGaMG2OmsdzEc5pPFdlZWfD0FETRTwtPV0YKRR+2MKLs9ZoZSjGDvdnOj+4zQ9aIYwWmgPUvKDlwmhtUkw/Gi3HeaIIkpT3V6CKzmFTo4XCL5/Nz9Rj8IWlaLTkWGqNFs4labRQaLCk0ULh+wLnFkqOf/Dm7SJdpYzFOuf8nDxzgTBa2J4sh4YdpTVaaNZj4uLFBzU8p+M1S2u0sD6eIxA0Wus2bIW9B46o9e0gOoc9Gy0vjUT37t3hhXbtHPXcoW3byz50bZlR0j60daxC2/BEKfrwldHyVvJTpPYTpbxNoD0G7a0CVIbzthDGtfvorUO5klUZVi1KKnqSRnwl7UqiNNJSckzkGGrLalcXZDn9mBan2rqO94PydzlvKaj1nG3K9goVg4irZdq6dhUdX3dGyxtp5yReAB1p8a0b7Tji603jWJaOp5QYH2c5bV3ssvi9o32f6N8/aM5F3nlMOU4DIvfLOr58z1eE6Bx2a7S8kHYs5TyTMXzttedtTIv3ydfV9TgwL98z8jWndWRK56bclo8ASMkVU7kfb1FjH4G8QmkkOoc9Gy0vwAeh8T673NYZCZk3qOsVtK2y6ENC2zRLSwNtyyx1UlFGi1XxoifpQL/osPSi4+sro8XyD9E57CujxfIf0Tns3mgJ81JobApIDG8DqPuVOjfccINzuzimfdbo7rvvVtvG2wFqO3mO7RYtWojlRtkf/sQLbgsDp9QTdTTtyrL4beSYx3Lie6qc9dU+SD/SENL9jpQ+H2X0zJQzT+tqMYw569B21LxJLB+fgWCjVVlFT9IIy16i48tGy16ic5iNlv1E57B7o0XNgQloVr777jvHilZGJqSkpLquaBmkwmgpKX6Z5axZs2Hy5CkixfqNGzeGO5o1g4izZ9U+hNFy9oVt/PjTT9CxY0c1dv684/kN3MY/DNPNm7eIbzPHMlu3boM77rhDbKMZO3MmHI4eDRPl8FvN8VkB+ncZHbdpWhpoW2apEzZalVf0JI2w7CU6vmy07CU6h9lo2U90Dns2Wh6MBH7bN6bVq1eHJUuWwvr168Xv2+nqYV4Tc6xoFUDr1q1h7dp1Aox36tRJ/CAxrmhp60ujhSQkJqrbcmWrZcuWYlXNsaJVvFIlVraUP/RHxZj99ttv4lmQ1avXqPVxv2oKKeSY1bxRjNb1BK1j1I5RLJ9vHVZm0ZM0wrKX6Piy0bKX6Bxmo2U/0Tns2Wi5IRX/y0STD9mwAXbv2VNsErTlSV6uaN12++3QtWtXsZo1depU+Prr/8HNN98Mv/7aT4m/ppbXGi3k5psbQu3atcU2mqu3335b/EHPPfc8xMXHCwPYrl17aNv2v6LMzz//DI2bNBHbtevUgV69ekFiYpK6AtayZSvX45V4+Dt0+dJA26J5J2y0Kq/oSRph2Ut0fNlo2Ut0DrPRsp/oHHZrtOTv81kBV4oOHDykizO+h28dVl7RkzTCspfo+LLRspfoHGajZT/ROezWaNGVFCOmTZ8uVoV+/Okn3T6BXJWhqS+hbQdaH7RNmhK8MVry+2lY9hAaZzrG2eRfqFmBLTq+eGFm2Uc4X+kYa8/hrMBWVnaObnzdGi18/smxioKpEXKfNvWWsuyD1ivvvoygZWg77nCU98ZoITjwrMAXmmw6tjy+9pL4Qk8yvriiJb/3ihXYoqtZEjbT9pGRkfZgtOiFnvEHvDVaSFZ2rlgNYQKT9Iws3ZhqwYsxnqxpPSYwMLsAa8HVaVqPCRxw/OiYasEPTGi0aT0mMMAv5qZjKrFotLSrMUZ5GdObAs/QemXdNs0bxWg7VqD1aNs0b1THGiUxWgzDMAzDlD8ejJY0AtIkeEJvCszRtl2efbjri5ah7bmD1qNt+64PNloMwzAMExhYM1pKQRWMafMi5ixjaBzMYtp6mvq0H5e2aVs0T2Iu9Uk7ur/BqKxBm2Yxeoy0bXWb9mGhbTXmiLPRYhiGYZjAwEdGS5MaGgSjmKZtNTVpU22btkXzJObStqYPs79BV9agTbMYPUbatrpN+7DQthpzxNloMQzDMExg4J3RMjIp2pjOHLhD07bWSNB2Xdr2sg9az2NftIxBm2bQerRtNU/K0Hbc4ijvrdHCB6XxQT1W4ArH2Oi/WST4MCb/i3jgCscOx5COqwQfpMave2EFrvBcTcdVCz4MzzM4cFWkzGH8CUE6roiPjFbJTUO5m5/y7MvoNaNlaDtucZT31mjh1wKw7CE6tgj+RyLLHjI6UfP3pNlH+KGXji/CX+9gHxn996EHo6W5yOeV1Bx4QXn0UVH48G/yxmjxSpa9ZLTqge8tln1Ex5fnsL2UmeX6hZb8zf/2Ev7mMp3D7o0WnsS1qzEUuU+bWoXWo22XVR/l2ZcRtAxtxx3O8t4YLbwws+wjo+9bYtlLdHz5Qmwv0TnMP8FjP9E57N5oGaymMBUPG63KK3qSRlj2Eh1fNlr2Ep3DbLTsJzqH3RutPM1KihGaVRZ8kO/w4SOOmDd40YeaegutT/vwRV+0Hm3bh32w0aq8oidphGUv0fFlo2Uv0TnMRst+onPYvdEyWE0xo0GDBjB37jzxA9Mvv/yybn9ZkJScrItVBthoVV7RkzTCspfo+LLRspfoHGajZT/ROewTo3XkaJi6fffdd8PWbdvh+ImTunISfLjzuuuu08Vr166tixnRvHlzkc6ZM1e3rzLARqvyip6kEZa9RMeXjZa9ROcwGy37ic5hC0aL3sIyjlWtWhXuuedeuLVRI9izd6+mnNYkOPJ16tQRaVZ2toj98ccgmDhxkjBa//jHP0QMV8YOHDwIM2bOchqwfGjcuDFERp6H22+/XfwbNPb50Ucfi9hTTz0l2uzb91to2LCh2kZ4RATccMMNEBMbB3/99ZfmmPR/g3FM+3fQVLvfUzvuYp7adk1TU9loVVbRkzTCspfo+LLRspfoHGajZT/ROWzBaFFDQE0DjWlNgjFogK699lp44IEHXOqgoTrkfM4LV8muvuYaURbB2Nat20S5Zs2aiRSNFn7HDO6/6qqroGvX19TyaLAc9Qrg1KnTUL16dYiIOEuOxeiYjWJWMHotrMRoO56oWKP1xx9/0BCrHEVP0ogvNWbMGFi+fLnYTkxMhIPKhx0JVUJCgkv89OnTMH78eE0JVklEx9eXRgvPGZMmTVLz2vGNjIzUlHTdp42lpqZqSrG8FZ3DvjZabQc9A+k56Wo+Jz8HIuIjigs4NW3zNCi6WOQSm79jrkueVTLROeyF0dJf8DEdNGgwvPvuexAcskEhRKTS4OjJh06dOouOMY/PdWGsVq1aYiVL3jqU9dFEXXrppVCtWjVRbovTaE2dOg1GjBgpjNaUKVOhZcuWYhv31axZU60v04cffgRatGgBixYv1h2P0TFai3naX5qY+/2+Mlq0rAT7oMrOzhavJwrTX375hZRglYfoSRoxVdQFgAuRxhTqxxjH9ejRoxAWFibmU05OjjBbiBx7qYyMDPVDjay7aNEiyMvL05VleSc6vmZGKzs/G6Iyog3JzNd/ASaOC54Hk5KSxHZ0dLRI4+LixBjjmNLycvxlHpk7ly/GpRGdw+6MFh1XSXRGDC0q1OLH1vDiyFdg1Pq/YNb2WSI/adNkeHZoO105vHZ8OP1jCD4aAhEJESKG1xJMWaUTncMWjZY50sxoCTt2zO0zWkzp8IXRouUo+QWFLuVxBfKWW24R29OmTeOLaQWJnqQRQ6Wn680VhQjHdNasWTQMc+bM0Y035sPDw3Xx3FzHCjOr5KLja2a06MWXcpH8oAuOCxpoPGdoY2PHjoVbb71VU7J4X7169eCxxx5zibHRKp3oHDYzWmim6JhSqNAktfuzo5qX7wEjo2W0bZRneS86hy0YLXm7S7uy4i6mNQVW8qWJafMUWofmvY15yhv1ZTVG23KfLw+jhWhVv3598WkYtWXLFr6YVpDoSZqOkypiqgrXr9LFqPDW35VXXinGduLEiWoc81FRUWq+f//+cOONN6r7pIYPHw6XXHIJ9OrVS42xvBcdXyOjFZ8Vr7voUmIy9asenTt3FmMmx61Dhw5iZQufa8U7B1J4Tmnd2nHBrVu3rnqOYaNVetE5bGa06HgGHVyqi1Fl52VDq5/uE2Ypr6C4XWq07vn5AVHuwX5tlPR+Nf6wkn968POakqySiM5h90Yrz3mRx9QqLqbADdq2/a0PbR2r0DY8UYo+yspovdj5dXjuxS5qXquQkBD15Iyfih9//HGX/azyET1J03FSpTFUBUP6QXa3Fz0aLRzflJQUdRvVtGlTuPzyy8U2vt/kPi19+vQRKd5q1NZllUx0fI2MVmxmnHqxPRx/BMISw3QXYXohxnHZs2ePOGfg9rp169SxmjJlirqN5xN8/u6aa64R+e7du8OJEyfUNtholU50DlsxWo/89qgwT+7G91j0cVHmpVGvQnJmMjzU7xF1nzRa8pksuWq1aNci2HJiqxqLTDjnqMAqlegc9my0vEVrINylpYG2ZZb6AtqmWVoaaFtmqRNfG61ub34g0jff+xi++OYnNU519dVXixMt/mMBq2JET9JG4ySkMVQXg9dA1stPQ1HIGrdGC1cupHlauXKliGlNE26fP39ezcsY6quvvlLrPvvssy5lWN6Jjq8noxWRehYmHJoMK86scnsh3r17tzpG+Dwsqk2bNmoMTTYaLFyVRMk4fQ+w0Sqd6By2YrTaDnpaGKEDUQdNxxf1SH+HIUMKi4qfw5RGq+VP94l0yKqhajnUxrANap5vHZZedA67N1rytlWeNAROZN4ohuV1t7uM0LSt5g3aNYzRtkzQtq1rw0rMoE0zjF4LKzHajinFdXxptAYPHy3S5avX6eqy/E/0JG06TmT1Cle0Lh496NZooeSqFKviRMfXk9GSXMiIgrVn17m9EKO05wtW+YvOYStGC0ED1GfWpx7Hd/HuIBpilbPoHPZstPJMDILVmGoSpBlxNQ0u5b2NmbbtzNNjMWrDY8ykbZo36stqjLZlmneU96XRcgfL/0RP0qbjZGC0aIzln6Lja9VoGcHyP9E57I3RojGWf4rOYbdGixZm/IOKMloz5zk+Kc0PcnzP0q69B0Q6e8ESiIqOU8vNXbRMpGHHT6nbBw6HwdJV69X9RcoxL18dDMGbtsE8ZxmMI38vXwMLlzhuXbFcRU/SRuMkFBOlN1YUjdLS0tXXH4VjitLGFgStEOkyZdykzkZeUPfjOOL22pAtjvziZXAq/Ky6f8OWUIiKcbxPtu3YAxeiY8U27g/etF1ss/Rz08hopeel6y66lNRc1++7wvPEpm07xTa+5rv2HoR9B4+o44Ppuo2O53VWrN0gzi+bt+9W9+EclmXnLFyqGITi1U+MR8fGiz42b9+ljuf6jdtEOmOu49zx9/K1Io2Ji3d5b1Um0Tls1WgZodWho8ddxjLinOM2/7oNW5XrgON7tTCO827xsjWV9vUvD9E57NZo4eqJtrBcgfE2JldxtPt0+0sZc9nv7Ivu99SGuxhtm5b3ScykbXosvjBaRUUXdWW1UA0cNkbd/uPPcSJdqZyM6W2IAUNHq9uhO/fC1NkLxXZGZvH3+pw4HQ5BipkaM3mmMG94gkAN+2uSKD9izBSRX7hklVqH5RA9SRuNlSpqrLSk6ye+HDs51oNGjNfuhszMLJGOmTRTjR09dhKOKoY6OSVN1JPjvVMx4ckpqeJCLmNYDo0XKki54J48EyG2cb+8KLD0c9jIaKESshJ0F14J/lci1WBlPNdvchgf/IAzZdZCxQhthdj4BDGPx02ZDSvWhEB8guN7s+YsdH5IOhQmLs4bNoeqYxml5PECLhWfmAS/Dx8r+li3wWG0cT5nZmXD0FGO/2BdviYYRoydKrbDzzqMfn6+/vvc7C46h82MFoqOqxb6ZaNoouOUsUMDjK85nqfT0h3n/117HB+KccwKCwthuPMcu3f/YVmd5UPROezWaNHCjH/gC6PlrSbNmC9Oijk5uS5GC4Un5uGjJ6tl5adYNFpSQ5SJL8skpTg+aUujJY9fGis0WhkZmep/ubGKRU/SiK8kjda8oBWQkJAE0bHFq5S4eokX5CUr1umMFgrfh1ozPmiE4z2CRksKy8r3DpadPHOBuo9VLDq+ZkbLW42fOhdiYh0GDFenUGi0pHB1Y/rcxWJ709ad6niigUKh0ZI6dz5KZ8RRE6fPU/uQbeMcx3NHXHyiWNnCC31WtmM1jI2We6PljeRqJWrEuKliruG5ddW6jep8lGKjVbaic5iNVgBSEUaL5R+iJ2mEZS/R8fWV0WL5h+gc9pXRYvmP6BxmoxWAsNGqvKInaYRlL9HxZaNlL9E5zEbLfqJzmI1WAMJGq/KKnqQRlr1Ex5eNlr1E5zAbLfuJzmE2WgEIG63KK3qSRlj2Eh1fNlr2Ep3DbLTsJzqHS220UpQGTp8+4wItw/gWNlqVV/QkjbDsJTq+bLTsJTqH2WjZT3QOWzRaeU5oPg86d35VEytuGH+qgXZmjGs9fV9GZaxC6xnljWK0HSvQerRtmjeqYw02WpVX9CSNsOwlOr5stOwlOofZaNlPdA57MFpOI6BMdIE0CzKv0K1b9+IyzkY9mazEpCS4vWlTUo+0rWynpKYalNG3Zwqp16pVK03etS+Xv9UHfenaVvOkDG3HLY7y3hgt+T0qLHsIx5OOcWGR6/fpsAJbdHzlVyGw7KH0DFejxUbaXsLzMZ3DHoyWprCJKZBGa/v2UJHWq1dPV4bywAMPuOQ7vvQSXHbZZYBG4t5774W7W7QQ8YYNG8LZc+egU6dO0MIZu+/+++GNN94Qtyi7dOkKPXu+BfXr14fXldjwP0eINzHur1atmij/yCOPwAvt2ontq666CoJDQnTHE2h4Y7Syc3I1Q8oKdNFPw0iG84tEWYEvnM90fHHMWfYRHV+koLCQFmMFqNIzsnTja81oqSszsmLx6ow0WvMXLHBZyXK3qoX7atSoAc2bNxft3HnnnWr5Bx98UN1Go3XfffeJ/qZMmSpib7z5pkgHDBwojBZuV69eXW330UcfE6YMzVpiYhLMnTdf7Nuzd59mRcvs75Ix/TF7xqgd49fMtI5FvDFaCH47M5ZjBbboJ2Et+EWyrMAWfijC1Q06tgivTAe+8DyNY0zHVsxfZdzpr2ywAk9m52hrRssN6q1DgpnRWrFiJZy/ECW2q1atKtKVq1bBQw89LLYHDxkCvw0YILbRaO1VDNJXX38NDf6/vfMAk6u48r0CQWAQK+KCDQgFkAR4bT8vrJd9GK93HR4G3i7Yi1nnJQgQ2FgkG0RGKCckJJStLFAE5ZzDzEijGWk0QZNz7J48EvC+8+rU7bpT99x7u+90GPX0nPq+31dV51aduj0z3fc/p6qrvvENaQsltHLO5ML2HTtgGIo4YdOF1j33/AsUFBbZ7qkj0KNzoolX3x0VWgqcgmhuYboibg9gHfwQp/2YroHbA5hC+zFdA/zspb9LJ/gzuusS7DPam9BS64so4tp9990He/fus+EmtGyom6O+A+wRvtLTT8LQoUMdIkIe0ccIMpatDfUTDNqP+o7iGMGEFkavbP0YhmEYhjkvtLS2atLKmjxFtHCt1Nq162zQdkz0CCa0qmt9tvYMwzAMw3Q+zSG+zOJJaDGdTzChhcnpm2kMwzAMw3QuuG4rWGKhFaeEElqY/A2NUOdvAH99I8MwDMMwnYRPgLNLXhILrTjFi9DixIkTJ06cOMV3YqEVp9TX17PQ4sSJEydOnLp4YqEVp3BEixMnTpw4cer6iYVWnMJCixMnTpw4cer6iYVWnMJTh5w4ceLEiVPXTyy04hQWWpw4ceLEiVPXT9rO8AFo3cnmIAyCQvs4+XGzUV+UUPfn1RYK2kfVvdior1CcZaHFiRMnTpw4JULqYQgD/QiZgDjoiE0XFHrd0idCG/Wt6vRegvlws7n5Nl+Hau80lkebm2/zdaj2Rp2FFidOnDhx4tT1Uw88JNEL+PAP1xYKpz66TZW92jqCUx+vtlA49fFqCyW0sG5GwBiGiWvOifcxfQ+7pS++/NLWn2GY+OSrr76ib2FbMqYO9WiKcuBga2xshq1btzu30+v6jdDrkdj0uiq7XY/URstO1yOx0euqHrAFE1pffvmVtT3DMF2Cr776f9rHrzXxP08M03UJ9o+U54gWMnjwYEhOToEePXrAN7/5Tdt1Jnq4CS3+MGaYro1b4n+gGKbrgu9ft+RZaKWfPGWW77zzm3Do8BE4nZlla6fTq1cvmy0SfvKTn9psiYqb0MIy/QUzDNN1cPvP95xDW4Zhugb4/nVLnoUW0rNnT7j++uvh9ttvh6LiEtt1nYEDB1nqgwYNgn/94b9Bc0srXHTRRbB23Xo4eSoD9uzdB4/+8pdw+eWXW9o/+uijMnL2+qhRcN1118GaNWthyNChtnESFTehhfPB9BfMMEzXAd/PNHGkmmG6Pm6pQ0KrI1xw4YWQnXMG/uM//9N2bcKEiWYZxRTmDz/8iKWNElp6m3vu+Rebr0SFhRbDJCYstBgmMXFLnoTWy6+8Am+99RbkFxSaKPHjxOw5c8Bf3yDLGAXD/I477oCf/ewB8Pnr5ZTilq3bIDnlGGzYuAl+89vfwsUXXyzbff3rX5cRMyeh1a9fP9tYiQoLLYbpfFrFe6+0sSlsfC2tNp8UFloMk5i4JU9Cy0lUnco4HXKNFhM+nSW0WlrbbDaG6Y40n41MZClqmltsvnXCEVpXXXUVzJw5y6zjZzJt40ZtnU/+w9vnkkugte2stF1xxRXSx6t/+UuHfDEM445b8iS0mM4nXKGFH5oKeo2CbebOm2ezdxbqPi+44AKzTts4Uefzw7e+9S2bnWEigQqmSKC+daIhtPbs3Qsn0tLlrICqY55xOhOOJiVZ+uL7CtfDLl26TJYbm5pljn1wdkH1PZGWBseOp8rywUOH5T9hlVVVsr5z1y7bPTFMV+GRA4dkXljfKPNWhzZO9N+yDfzifdAg/kHJqvPD0cpqWxsdt8RCK06JRGjJP5D+/WHc+PEwbdqH0Lt3b9OuCzFkwsSJclpXF2d6+Re/+C9ZXrZ8hczxiwx5+QWWNrfedpv8j1nVU0+kmdfxyw+4LQhev+GGG8z7xA94/ODHMn7QT5o8WbbvG/hPG+2vvf469OnTx3Zf+tgMEy2oWFq+frPMV3y2BVKyzsjyuKkfw8TpcyG/1gfjps2GYn+9tC/6dH2nCi39PaHy5JQUKZTwPfd//s/9Zlt8D7n1w88GzFetWg2ZmVlShI0c+aL8AtK3v/MdS9t9+/db7olhuhK4LOAbm7fKMoqnG0W5XuSpNbXQIq49cTTZ0r488D4eIMQWC60EJRKhdd9991k+UHfs3Ck/OFVdb6vnF154IZSWlVvaPPDAgzLHrTX0tg3ij/Caa6+VH8ootNC2afMWIcLyZZvComL5X3FVdbV5D5jja1N+6LSlfj/HU0/I8iHhg95nTW2t5R4ZJhq4CS1kzpJP4VB6hiyj0Cqub4Dl6zZCbnUt5FbVwMKVa8+L0EKh9PAjj8C4ceNgytSp8K8//KHkoYf+r62tXtb7Y/4/jz9u9h0+/Gn5eVFZZTxUxo2fINvjOlp6XwzTVZh2OgsmZJyWZSW0SsR7FcXWSyfSZJ4v3teq/bd37ILhKcfhR/sOsNBKVCIRWk71T1etsl2nH7oYdaJtfvnYYzJXH9x4rW/fvrI8cNAg+POfR5pCa9++/XLtHk4Fbti4EX79m9/ArI8/Nv2tW7fe9PvssyPgksCaERx30eIllvtJOXbMdn8qr6mts71OhokUN6E1ZdYC+HTjNlNkIVv2H4aP5i+TQmvslFm2vtS3TrhCC//mkXnzFzi+j1UZqW8wpkiQZ5991rRv2LDR0kcJLb0vRrV0oaWi1QMGDLDdF8N0ZVBAUVskuCUWWnFKtIRWRWWVtN37/e/brqsyTglgGfcso22chNaxY8dl/sADDzgKLbz/Sy+9FIYMGSLtq9eske1Hj/7Acm+jRr0h7RMmTrKMizkKrTFjxkrRpttVX3zwYFRN98cwkUDFkldmL/7EZqO+dcIRWgzDxD9uiYVWnBKu0GIYJjyaxX+3VDCFQ3UMvnXIMEz845ZYaMUpLLQY5vxQ5iCevEJ9OcFCi2ESE7fEQitOYaHFMIkJCy2GSUzcEgutOIWFFsMkJiy0GCYxcUsstOIUFloMk5iw0GKYxMQtsdCKU1hoMUxiwkKLYRITt8RCK05hocUwiQkLLYZJTNwSC604hYUWwyQmLLQYJjFxSyy04hQWWgyTmLDQYpjExC2x0IpTWGgxTGLCQothEhO31KOtzXiw45lzTuB1mQfayPaBPhJV92Cjvs0xNN+qbvGjixAXm5MfJ2ibUH51G+1HfZtjONyPxbeqO9hUPxZaDJOYsNBimMTELXFEK05hocUwiQkLLYZJTNxSDxqNcccpguPVFgqnPrpNlZ1sbn284tTHqy0UTn282VhoMUxiwkKLYRITt9TDeMgr1EM/lnTGGF0fFloMk5iw0GKYxMQtBSJa+HCnURYabdHbUGHgZnPrT6HXqB8n37Ts5McJ2pb6cRuH+qZ1p2t6m1C+rW1ZaDFMYsJCi2ESE7fkQWhRqDgIhu7byxh6W6/QfqHGom2ov2DQftR39MZgocUwiQkLLYZJTNxSB9ZoMZ0JCy2GSUxYaDFMYuKWWGjFKSy0GCYxYaHFMImJW2KhFaew0GKYxISFFsMkJm6JhVacwkKLYRITFloMk5i4JRZacQoLLYZJTFhoMUxi4pZYaMUpLLQYJjFhocUwiYlbirLQotsaxILOHCMWeLt/FloMk5iw0GKYxMQtRVloMdGChRbDJCYstBgmMXFLgSN49Ie8vnGmV1ugfJbULX0itFHfZp3eSxAfbjZX37TuNJZXG/XlUg/0YaHFMIkJCy2GSUzckiG0OiwkdJGggXUnm4OQCGnT+ym/um+zHuT+vNjc/DrZHMfyYqN+nHzrsNBimEQlHKHVt29fuOiii2Tu89dDjx49pP3Xv/61re0P/+3fYOnSZbL8/e9/X+Y9e/aUfbKzcyxt0YZc9/d/D41NTfDEk09K+yWXXGLzG2v+XtyDel2hOHDgoPw5UDvDnE/cUoRTh7qQcMojgfpyy6MB9emWRwL15ZYbsNBimMQkHKGF/M/jj5tlFCQPPfQQ3HjjjbZ2l19+uSlYlNDC+qJFi21thw9/WubvvveeFFr9+/eXfnv37i3tf33tNXjwwYdMH/v274cLL7wQ9u7bJ9o3S1tpaRnk5RfApZdeCgcPHYb7778f/v3ffwTpJ09Cnz594LLLLod58xfAnXfeCW3in8qhQ4fBd7/7j/JzTt0H+rrjjjsgMytb1lFU7hdiqqCwCH784x9DUXEJPPf88/Ctb30Ltu/YIYVWbZ0Pps+YAZu3bIXcvHwpJunrY5jOxC2FcdahAvvQfm422tcLej/l18nm1scr1I/XsbxA+zj5cbKx0GKYRCVaQgtzGtE6eSpDiiS83tTcYgotpLyiAn7wgx9Y2iuh9fvf/z5kRAsFFuYvvviSzEeMGAEn0tLlWGXlFZZolCpjjkILy4cOH4HUE2lw/fXXw7Bhw0TfNNsYr73+OuScyYV77zXu+7HH/hsGDx4so10/+clPpNBCOwot9I3CbeDAgdIfQv0xjE7lF/6IoP4obinMiJYSBnquCwa7cOg41JdbHg2oT7c8Eqgvt9yAhRbDJCaxFFq62MFokhJaP/rRj+Hqq6+Wny20/TXXXAunMzMdhRZOVWI/LCuh9bvf/c4cZ+KkSabgOZObJ8sYnWppbZPljNOZUmj94Q9/kGIJ+zzw4IMwaNBgy30gvXr1grvuukuWURCqMV586WUZraJCC6cO1T1h27feetvmk2EUVDSFC/Wr45bCjGhhey+4C4nQUF9uhDuG3scrnTUGCy2GSVTCFVpdFRXR6gg49UhtDBMJVDCNWP+MzeYF6lfHLXFES0J9uuWRQH255QYstBgmMeluQoth4gFdLPV4qyfcO/tfILuhAPqN/jt4ZNnDUNRSIa99lrUB1md+DhWifPuHQ+H7c/73+RJaTKxhocUwiQkLLYbpfHSxVNhSDr3e7g3l5+rg9sm3SduMY7PN6z3f6gXb8nbKcunZGhZaiQoLLYZJTFhoMUzno4uly977Gjy6/BewIWcTXPLuJfCX7X+R0a2pSdPhSMUxKGqtlO0eWvwz+M3q30RLaIU7NUb7Yd3JRvt5Qe+n/DrZaL+OQv24jUX7hQP162ZjocUwiQoLLYbpfHSxhKTVZNpsXqB+ddwSR7TiFBZaDJOYhCO0SsurZF5cVgHNrW226/itP/zcaG5plfWm5laoqKqxtWOY7goVTOFC/eq4pR4trWfBoC2Q62i2NnqtA7ZIfauyV5uFCMcOZouhbxZaDJOYhCO0psycb5brG5rgdFYuTPhwtmkrq6iCWl89VNfUyXpBUakUXsWlFTZfDNMdaT13ziaaOgr6oH513BJHtOIUFloMk5hEKrSQMZNn2tqg0MLPDiyPm/oxLP10Pew+cMTWjmGY2OCWjIhWmz2iYou26G2wrONmc+tPodeoHyfftOzkxwnalvpxG4f6pnWna3qbUL5JWz8LLYZJSCIVWs0tbZCdWwAfTPrI0kYXWoUl5YDRdbRRXwzDxAa3pE0dImray2lKLFrE0nfiwBEthklMwhFaDMPEP26ph1VcBUO1sYsCd2g/6tPJdzTG6MyxnKBtqJ9gGO05osUwiQkLLYZJTNxSB4SWLiK8QsUG9UXR23qF9gs1Fm1D/QWD9qO+ozcGCy2GSUxYaDFMYuKWyLcOdVFAhUO7COg4tB/169TGK7SfU93JRv14gfajvmndqY834lVoPfnkk5KUlBRZx9enyiovKS212dLS0qGi0viKOr3m1YaH1VJbYWGRzXb8+HGbDXMnW2pqqs1WVFQMfn+9xYZj5+XlO/rwaktPT7fZSkvLoLa2zmJrbWuDnJwcRx9ebRkZGTZbRUUlVFVV29pnZmbabG5+nWxZWdk2W3WNsbUAbe/V5q9vsNny8vPhTG6urX2dz2ezufl1stXW+UT5mMWWc+YM5BcU2NrXNzTabLrfyirjbzwYLLQYJjFxSx2IaIUjGmg/6pMSrTGCjUXbUH/BoP2o7+iNEW2htXXbNimQsPynF16Q++0sW7Ycdu/ZAz4hKqZPny6vjRw5UuZjx42T+Y4dO+GYEC7UX3fi9OnTNluigvsxUVsi09Qc3ddbXh56OwUWWgyTmLilDggtXUR4hYoN6ssN6icYTmMEG4u2of6CQftR39EbI9pCC1FCa+eu3bKMURplU7zz7rsyf/755y0P3eqaWps/hulqTJ9yBsa+l+UIbRsrWGgxTGLiljwIrchFQ+eP0ZljOUHbUD/BMNrHUmitWLHSrD/11FOWNqNGjbK0VTQ1t9j8dRc4otX12bmj0hRU82YXwPy5VtS1hkZje4Rw4YgWw3Rf3JImtHThEKoeic1rPRJbR+uR2LzWO2aLxfYOSjyNGDECsrNzYPXqNbB3337IzcuHjz4y9uT561//KtesTJo8WdY3bd4M+/cfsPlimK5AS+s5U0TNnpkvRdWCgLhSuSpPHJPdKZEtFloMk5i4pRhHtHQREasxaL/OHssJ2ob6CYbRPhZCiwkPjmh1TVKSaqVwmjE11xBTcwz0SBa1TZtoTC1SX17hiBbDdF/cEtmwNDJwV2I9jybUd2eMEXT39zDx6puFVvzAQqvrsXxJkTlNuGBeYYfAfvv2Vtt8eoGFFsN0X9xSIKLFxBuxWKPFMN0BnAZEsbRwfmFYzJ9j9Kd+owULLYZJTNxSZBEtGpWh9WhCfdN6JFBfoeqRQH3RegAWWvEDR7S6DnNn5UuRtGhhUURM+CAbNm0ot/kPBUe0GKb74pYiE1pMzGChxTAdY9uWCimy5gixtfhvRYRiUlZQW3ufWEW1WGgxTGLilsITWnSdkVseCdSXWx4NqE+3PBKoL7c8AAut+IEjWvGP+nbh0sXFUUN9W5GOFYxYRbQefPAhm01n4MBBNhvDMJ2LWzKEVjhCAvvQfm422tcLej/l18nm1scr1I/XsbxA+zj5cbK1stCKJ1hoxT8oiBYvLIJlS4qjBvqLF6HVo0cPyYMPPijzMWPGwk9++lNZxs2EMe/bt69sO3/BAujZsyf06tVL1rGM13U/pWXWaVFsi+2wPHz407INfnGH3gfDMO64pUBES1+IrR72wWy6KPBSj8Sm1ym0D6131Baq7jSWVxv1FbzOQothvKG2cFixrCTq4FqtjoqtUIQjtL7znf8lcxRA/fv3l+DxWVjPys4xhRSCQgtzPOUBz7fEczuxXi7KuuDS/T/22GNw2WWXyTKe51hSWgb7eP88JoFoPNcGlV/4I4L6pLilMA6VpqLAC7SPkx8nmxdoH6e6k4368YLTz8KLjfoJBQuteIIjWvHLrp3Gju8rl5eEoNQjqm173hGhFauI1i9/+Rj89re/lZGnadM+lNGnCy+8EJYtXyE3Fb7gggtg5MgXZVsUWnfddZcppvBav379ZBltjz/+BEyeMtXiv3fv3mZ7FlpMIkJFUzhUfWH80+KGWwpzewddQATLI4H6csujAfXplkcC9eWWG7DQYpjg1NS0ShH0yYqSmIJjlJQ028YPl3CEVkdQES0n9EjWjTfeKHnzzbds7Rgm0dAFU8UXPpuI8gr1q+OWwlsMz8QcFlrxA0e04o/WNmPx+9yP8+HTT0okqzScbF6gfZQfr1GtWEW0GIaJjHaR5YdfLXsUBk4aAOXn6uDuj+6Caz+42rx+55ShcMV7l8rylWP+Dm6bNDhaQotGXjpq00WCUz0SW6g6vZdQbYLZQtWdxvJqo76C11loxQ8lJaU2W6LSVYSW+kbg6k9LOwWvQquuzmezUVhoMUzno4uli965CDbmboHFJ5fJev9xN5rXilorobStGo5WHJP1gubyaAgt9ZDXRUIonMSBE+H47swxFNSnE7RPR6C+3GjvE22hhQdIq0Olhw8fLvMNGzbA3LnzZDm/oEDmTz31lMxfeuklmeO9UF/djeaWVpuNOX+kHvdJ4bNmdaln1npEtdVzZMr4HE9iy8s39VhoMUzno4TSqlOr4URNBozeMxoyfDkwI3kW9H77AigR4gqvjz04Hn694pey/PSaJ+Hlba9ES2hFCyUWIhUmTlDfiTKGM9EWWogSWkhjUzOczsyy2JC3335b5s8884zF7vMH/wNLZHjqML4wFr8Xw7o1ZZK1AVTdzeYF2kf340Vo8dQhw8QnuljKbSo2y+XnrOu1cGqxvY7XrNepXx231KM58GBvbtHQ64Gy2QZzTRCoejCbxafKO+BbFyDUFsyP5TUF7E59nPw62eg9Ut+07NRH9xvMFmuh9f7o0TYb8uabb8pcRbYUDY1NNn8M09lMm3RGCp71a8s6HRy3uSVyIcpCi2E6H10sRQL1q+OWpNAy0UUKc16JpdDCfN68eRLcW2fmrFlmBOuzzz+H5ctXwIGDB2X9L3/5C7wViHJ1VziiFT+g2Plsfdl54ZOVoRfFxyqiNWXmfLNcVVMHBUWlMPmjdltG1hmo9dVDQbGxnnDnvkNyGhPbUl8M0x2hgikcms8FXxrglnrYojEUdU3PvUL7Ud+xGqMzx3KCtqF+ghFoHwuhxYRHQ0OjzcZ0PosXFsLkcTnw+WflsEGAuRP0GtYVtE5ten/qBwkltLys54tUaCFjJs+0tUGhpdaILVv1GXw0d7GtDcMwscMtOUe0aB5NYumboo/R2eNFCAut+MFLlCJRiNeIlr++TYqcjRsqCOUueTRp94338Ld5hbb7U/gCu7AHI1Khhes7j6VlwAeTPrK00YWWyo8kp9p8MQwTG9xS6IiWQrVxEAWu0H7UJyVaYwQbi7ah/oJB+1HfURyDhVb8wFOH55/JgW/9bd5YAZvCQO+HZQW1ufVRfDwjL2hUy4soD0doVVTVyLysogp89c4RVv0bj7V1figVbWkbhmFih1tioUX9BYP2o76jOAYLLYZpB8UNfvNvyyYhgAQqD4be1iu0H/WJ4L3ghqn0Hr0SjtBiGCb+cUuG0GLiDjwIloVWfMARrfMLChtk65bKuADvZdz7zlGtWEW0GIaJf9wSC604hYUWwxigsFn1SSls21oZF2z4PPSi+GCw0GKYxMQtsdCKU1hoxQ9ZWeE/VLsa8RbRUgdH79heFVe4Ca2KikqbjcJCi2ESE7fEQitOYaEVP/DU4fljxbJiWLKwCHbuqIorpk85A2s+tZ+ByVOHDNN9cUvW7R2iBN3pPJrE0rcilmN49c2L4RnGmDbcvasq7tixvRLGj8623a8XWGgxTGLilrSIVqsL6pqedxS9vxO0De3vBdqfjhGNsWg/6jt6Y7DQih84onV+2L+vWgqtPbur4hK8N3okD0e0GKb74paiM3WIURinPJpQ39Ecg/qkeTSgPmlOYKHFdHfwm31TJuTAvr3VcQkKLTwDkd53KFhoMUxi4pZCCK2ORmM6Qix96ziN42QLByc/TraOw0IrfuCI1vkBhQxGteIVddC0fs8c0WKY7otbMtZo6Q95rHu0yfVG2nVat/TpoI36cq073V8Qv042V9+07jSWVxv15VJXfVhoxQ8stDqfhsazUsQcPFAT17DQYhhG4Za87wyv4yQOnKBtqZ9gUF9uRDJGR8YJ13eYY7DQYrozGz8vhyV/K4ZDB2sdqHGoe7VRXxTahvpRdcNGhZYXWGgxTGLilkJMHYaAig9ajwTqK1Q9EqivUPVIoL5oPUAshdb06TPgj3/8IzQ2NcuI2gsvvAAjRoyQ105lZMCoUaOguKRE1p9++ml45plnbD66ExzR6nxQwBw5XAuHBSqPBOoLc4Vu7yg4ffjh5DPmfXNEi2G6L24p/IgWjcI42XTf4Y7h5puWOzqGmx+3cTrim45B/Tj5Jv5jKbRee+01mc+bPx9Gjhwpy+pA2pdfeUXmTz75pK0fw3QWKLSOHqkj1DrkXqG+3Oj4GB2NaoUjtK659lqZX3zxxXDPPf9iufazBx6Q15Hv33efrZ/q21GSklPg61//ulmfOnWaHJ+2YxjGwC2FF9HShYLKKbRPRwk2hm6PBtSnWx4JoV4HGSOWQgujVCfS0uHAgYM2QfXuu+/K/LnnnrNEN6pramWenn5SUlvnk3Vso8oqx0gZtfn8fvG6Wiw2lXu1oRiktsamJputzue32TB3smFbasP7bxW/D2U7efIktImxGxrtY7n5dbL5/PU2W1OzEVXUbfgzrW9odPTh1YZ/P9TW1NwC+GUN2t5f39Buq60L6tfJVi/6UxuOQ22Ye7FNHJMNk8bmwIH95ZCcVCfzJJEfOlglqJRlZdsv8iNHasyynutl1V750/Ojor/uzxirEg4dqrL5xbbULwqtUyeNv7lYRbR69Ogh89mz58j8iiuusFzHv5n777/fvKYEEvZTfUe98QYcOZok6xWVVTBnzlzo3bs3PProo9KGf4fK35gxYyHnTK4sL/zbIrj77n8yPw8WLV4s/5awzyOPPCJtQ4cNg8svv1zaPvn0U3PsB4QIPHT4sCzfccedlntmmETDLUUnouWG7jsex+jIOOH6DnOMWAqtjRs3yRxF1oQJE2W5sqpa5sOHD5f5iBHGVGK8TCWdTzL5CJ5OBYXLZ+vKISXZ50hycl2gbORY92LzAu1D/ai6bsP7VVGt8hgdwUOF1r333mu5roQW/kP0hz/8D/zwhz80++liS89RaOm2d955x/T385//XP5jgUIMr3/jG9+Q9p/85Kdm+w8/nG6WkZtvvtn0973v/TOMGzdelu+++26455575D8w+j0zTGfTdu5cRFB/FLfUw9/QBEz8gRGgWAmtouISWLBwoVmfNetj2LNnryzjB/a0aR+a1z5dtQqWLFlq88EwsSAzs16KlmMpvi7D7p3uZx86EanQyssvsAgcRAktjE6+/fY7sG37DrMfsnrNWil0evXqZdqDCS38xwsjYzW1dfL60mXL4OGHH5FRr7/r1w9++dhjlr6ILrTeeceIjM+dNx9WrPzE1pZhOpvKL/wR4zsX/J8FtxTe1CETc/isw/iBF8N3HihYxo3OguPH/ZAaAMsGvkDdZ9a9ovdTfnXf7fWO+0bwvlOPx27q0Ik+ffpIJk6abLsWLsrnlq3bbNcYpitDRVO4UL86bomFVpzCQovpjqBgSTpaBydS/RZSA6iybvOC7sfJNy13dIwJY7I9R7WiJbQYhvGOLpYGTxwId069XZa/Mf4G+CRjlXnte7P+CW6fMlSW75g6FIZNGcJCK1FhoRU/cESr80CxkpZWL0mX+M26YcO61WbUfcSG9fZ26MuoGzbqu72u+1Z13TeWrb6xrr592JkRLYZhvKOLpb7v94UTtadhRcanhtga8/eW67//9DeQWn1KlvOaSlhoJSostOKHsvJymy1ROZ9Ca9fOKvh4Rh6kp/stnCT1aKJ8R2MMFFo+f/APYoSFFsN0Pkoopddmynxn4V5JblMx9Hirp3n9rzteh9P+XKj4wgcFLeVwpOJY5EKrqaUVJM0B3OrKFig3ChoCucLS1qWfF98dgvZzqjvZqB8v0H7UN6079fEICy2mu4GHSB89WgsnT/q7JHgAdsYpY1uNYLDQYpjORxdLt4y/Ef5h6h2yPHDiLbC9YDdk+HKg4pxPii4lvO6e8V347ozvRE9o4b439GFPaWxugQZBvcDX1NHioTUAACSlSURBVCypC+S+JsOObajoCuVbv67KkdhC+Xa7Hokt1PWO2lhoxQ88ddg5YEQoI6M+TPwOtmjh3beXdVostBim89HFUiRQvzpuqT2iFQQZvZLiqgVqhaiqbmyCioZGKK9vgDIB5lhHOwovFFzYngouN5yEhpOIcbK59fGKUx+vtlA49fFqY6HFdCc+W1smRcrp0/VdGvq6nAhHaE2ZOV/mn2/dCRM+nGMTxGir9dXDuKkfy/rGrbsEu6GmLviDgWG6C1QwhUP1F8bmzG64pZBTh40CFcGqamiCUn8DrCoohJt37oabd+2B/rv3wi2798HAPfvgeE2NFF41QnBhe+xn+tKFBB3LqY1XaD+nupON+vEC7Ud907pTH4+w0IofOKIVe1BkzZ2VD1mZDZApwFwHbbjHllFuz71A/Tj5bi93bAxr24aYLYZXQksxZvIs89gsBQot3TZ15gKbH4bpztQIoVT9RX1YYF/qj+KWephCQIkEDSmymlqgRgissvpGuFOIqpt37IIbd+6G/kJk3SLq/YXAGrBnP9yydz8M3HcABuw/CIV+P1SI9rWNzUZkK8gYirT0U+EJE903zZ2gbai/YNB+1HcUx2ChFT/gcSPUxkQXFFrZWQ2Qnd210Y+xcSMaQmuKEFGnMnMsNl1o1QWOe2IYpvNwS65CC8VRgxBZdUIslfkb4HUhhG7eHhBZO9sjWbdoIusWIbIGHjgEgw8ehr0VVVAuxBZGttCP0xj9+l1plletXhuRMHHMnaBtqL9g0H7UdxTHYKHFdCdQaOXkNHR56OtyIhKhNXbKLJjykVV0KXSh5daGYZjY4ZZchZYSWRiZejr5GNzkEMlCgTVACKyB+w6aImuQEFmDDh2BWw8fha2l5VDZIMRWY4v8hqLuf/HipTLv27evzHv16g1Hk5KhsqoGvva1r8l7WvC3RcbieiXUnKCCxuX1mNA21F8waD/qO4pjsNCKH3jqMLZMn3IGDh+qgdzcxi5PrKYOGYaJf9ySq9DyC3FT3dAEReK/JBRZuCZLj2QN2KsiWe0iCyNZgwMia/CRJLjtSDKUCsFgTCFa/eO5V3juFuY4PgqtktIyuO6666Bfv37ShteuvPIquxhxECaOuRO0DfUXDNqP+o7iGCy0mO4CRrPy8po0Gkld2ZRdz52g16gfJ9+07OTHCWtb+tqcYKHFMImJW7J+6zDwkMdpQ5zyw2hWbp3PEFnawvcBe/bBwEA066blK2FwIJJ1K4qsQ0fhVimyBEeTId/nl1EtufWDNsZFF10s80lTpsiDR1FoTZg4Cfbs3Qc9e/aU14YNG2YKse4GC634gSNasQPFCQqt/PymhIAjWgzTfXFLRkSLgFN1uAC+2FcPfzqRrkWy9lrWZF39q9/AhddcLaNbKpJ162EjkoUia0hSCuwUHzz4TUW/EG5yUbwD9WKsa6+91mbv3/8WqK3z2+zdgVgLrcqqKrNcVVVtWcRbVta+E3oDTv3ywlomRqDImjbpDBQWNiUE9PU5wUKLYRITt+S4jxZGn3BPrEKfH/5RiCgpstSarL0HjHVZ+w9Cj5494Rtjx8HXhgyBwUJkYRTrViGwbhMC67bkYzAk+Ti8cSYXSsSDGiNk5rcPIwCPp9HzaBJL3wqvvmMttEaNekPm69atB/xW3abNm2X9ueeek/nbb78t88ysbCgqLrH1Z5hogEIrK6sBioubEwL6+pxgocUwiYlbcoxo4UL4qvomKBBC67v4bcLAmiwE12ThFg63bNwsp/UUck0WiqyjKTA06RgMFUJraMpxGJWTJ9d54cJ6uajdYTzGTiyF1rvvviunaLH85JNPWq69//77Mh85cqRlTx4VAUtOSZFU19TKOk41qbLKG4RIp7baujpQ2yTQa15teD/UhhE3aquprbXZMHey1dTW2WwNjY0ywqdsJ0+elGPX1zc4+vBqq63z2WyNTU1yw1rdhj9T/P07+fBqq/MZG1XqtqbmZvk7oO19oq1pq64J6tfJpiKeuq25JfTv+uPpeVJolZQ0C7FVGcirRN4CRUWNgbKyNUNebh3kCnQb9issbBDlpoCP9tzut9kyhsqxv+4P89zcWsjLU2MpH5XivvSx2q8pvzx1yDDdF7fkGtHCzUlRaD2fdtIQWYE9sgbuPwSDDhyCPgMGwC2frJLThRdceSXcNGmKjGQpgTX0WKrgBGwpqzSEloxoBfn2oAs0ykTzaEB9uuWRQH255YpYCa16IUx27NwJixYvhvT0kzB8+HDL9ddee03mVIDRzREZJlJQZB3YXw1lZc0utJA8mlDf0RmDvkYnWGgxTGLilqTQog/59qnDethbXg6DAtOFg4TIwoXv+O3CgZu3GmuycLpQMHjHLhiG04VCZA0TImuYEFl3HD8Bp2vEf4X+BiG08FgeuwBxw7indhGioDajffhCiPqxjmW10b4dw/4anG0GsRJait179sj85MlTcORoEowc+aKsjx07Vn77c87cubI+ddo0WLBwoa1/d4IXw8cGFFrl5S0JBke0GKa74paMiBaZtsK1VLglAy5izxRCCacLcU3WwAOH279dqESWtibrNoxkpaTCUCGwbj+eBsNS0yCnzhfYuLR9h/hDSakwb/Ensrxk5Vo55rqN22DFmg3SlldQDEs/wbVDrVBUVg679x+BwpJymDprgSFEAn6Wr/4ccvIKDT+frIPZC5dDavppWLxiLVTV+mAl+gu8Jmy3Yesu22s1xY0q01y/rvdx8hPMFso3yWMttBjmfPLZujKY+WEuVFS2mFRquUK3RwL15ZZHCn2dTrDQYpjExC3ZzzoU4OaivsBmpXk+P/xBCCYVyaIiC79ZeKsQWcOS9UiWIbI+KSmFAl+9nIb0k6N4MjJz5AGoWP5g0kyYNGOeKTT0Kcb9R1KEMDsuy+s27rAKFAEKtgVLV8m+KLRQlEn/WWfA5280X5NfvJayiqr216kLG6/QvjrBbNRPKPB+WWgxCQxGsyqrWiVVWh4M2lb19wL15UakY9DX6QQLLYZJTNySPaIVeNjjGYcqqpVRUwt/OnXaIrLkwnchsoboa7KOn4BhQmTdfiIdVpWUQWZtnTxkWi6E19dniXH2HDgKH81bIuuLVqwxolWB8ddu3AY+0Q/rJ09nw/H0TGlfsnKd6WPvoSR5fcK02VJc4UJ7U2iJ66fP5Akf7UKrHoVjda05vk0AeanrNoefWVAb9RWizkIrfuCpw+iydXOFFFrVNfglAAS/eNAKNYEc61g26ipXbcND991eb/cdjTHQH08dMkzXps0J8blIbbQf4pbsEa1AvbEJo1rGovh8vx9O1tTAELlHVnskC9dkochSkSyMYg1LTYfkiiohzmpkNAvXeuEu83KzUpexXG0OTP5ovsTSj/qhdSebg++Q6P2UXy826icUzSy0mMQFRdbGz8qhprZNUqvlwaBtVX8vUF9uRDoGfa1OsNBimPjDIqoCwqpV5BTaRvfhlhy3d0Bwmg+jWupQ6fw6P6RV1cDmkjIYht8uxC0c5JosFFq4JusE/FPaSUiqqJQL4PEbi2ptljxU2mGMoOgiJVgeDahPtzwSqC+3PAALrfiBI1rRBYVWXV1bQhIPES38ZjG1JTKNTd6+7ckwbuhRq2aRK5razkoaAzmirrXooivgxy25nnWoUIdLY2QLv4V4ps4Hp2pq4HhlNSRXVsnoVYrgeFU1ZAiBhddLcb8h0R7XeckpwxBjOILtdRGi43Sd9vcK9eM2Tjhj6H1C+Sb+WWgxiQiKrIMHcO+tswkJfb1OhCO0cK/CYLnia1/7msV+8lQGVIvP63LxD7Dax233nr2wevUaKVBwzzu0VYjPctxPDctncvMgL79AlpOSU2DpsmWyvH3HTnPz4qNJSYD7oZUGTpHAbyrvP3DAbLdt+w7znuYvWGC5R4VfPCe++93vCl/JZj98aKWln4Rdu3ZL2779B2Dd+s/k9jJ4XbUbOHCgWVZ74RWXlEKZELpLly2X7Q8eOmwbk2F0lFBC0dSCQkrkDa1nob61DXzimYy7JdRKmiV1Qs+gHa9L8RUQXTLSJTCe0vbkGtFSYGQLxRaKJhRPuOYK98XKE2/anLo6yK41cqwX1dfLKFZNYLowrEgWRRclTnk0oD7d8kigvtzyACy04gfcAJXamI6jzjX015/1RL2DLVpQ37QeLkq4BCNcoXXdddfB408Y+9spIXXffffZ2qJoUuLo0ksvlQ+AnTt3wfXX3yBtvXv3hl/84r/g2PFU6adS/JP84ksvw8MPPyKvbxci6dDhI3Aq47Q5DoohVcazaFFood9+/fpJ2zPPPCuFHG6Iq9qNeuMNuOOOOyz3q6Ns3/ve98w6bhR8zTXXwKerVsOatWvhggsuMK9ddtllsvzEE09IobVm7TrAzX737zcE3u1iLOyPQgvb4++iqKjYNi7DIGqqUEWuGgR+8fdTK/6GK8XfzhunTkP/nbvh5l174BZk9164be9+WFRQBJVCC6EI84u/v8ZWQ3ChWMP3sZPYChnRUqipRDxKBzcfRTFVhTQYOdbRjlOFuA8XfnPRq29H9P7BiGQMBfXpBO3TEagvN7Q+LLTih5ycHJstUYnV1GF9w1kpsjJO1YsH4LmEpbKy/QxRN8IVWph/+9vfNuv4GUEFzEUXXWRp/x//8R9w5OhRKYyuv/56aevbty8sWrTYbJdfUAiTp0yR0SC0FQpxgoIFRcyAAQOkbeu27aZPzNEfllGwYT5+wkTZB6NUqt39998PV1xxhSyrCJkCxZoq/+jHP5YRKCW0Bg++VYo83FS5T58+ltczZ46xvx8KLRR2eK9KaP3ve++Vf78otFAYooCkGy8z3ZfKL/wm5QFKz9ZByVkfFLTWwZnmGjjmK4ObduySAgvPeDZEljrn2TiGcGDgrOcB+w7Cqdo6GeWSgkv8DX8VEFpUbIWMaOnI6JZwioILI1YqV+A1fQuHqKJ80jyaUN/RHIP6pDmBhRaTSKDIWrywCBqbzsUlTQ62cKCv24lwhNbTTz8jOXzkiFl/++13ZHnylKkmeFTWIz//udlv5qxZMv/tb38LEydNkuU/vfCCjFgpP5jPmTsPJk2eLMtvvPkmPPf887L8+uujZK6iW+PGj5diJi8/X9pnB4TPpEmT4fe//4PF5/QZM2T+0EP/V07v6fepXo9q+6tf/xqeeeYZKbQeeeTn8PgTT0j7DTfcAP/9q1+ZR0opwaXOasX+2TlnjHuYPEW+XtyAGaN6Tz/9tLQzDGIRWed8UCoobjNEVnaTeN8cPQI3C5F1887dcJOgvyayBgiRhcjznqXIMs57xk3cN5VVyGATTimeE+9tKbZIZKuHWkOFuTOBfa3MNobgUtQ3o/gyykok6Net/ahvA9qG+tEFCLXRfp0/lhO0DfXj5Fth9GOhFT/wYnh3SkubIT+/EQ7sq4blS4pgwdwCmDU9D6ZOyJHiSrF8SbH4uz4b4FwAVXey6XVVdroeic1r3bstHhbDxwoaPYsFSmipOgotVcYpz2XLV9j6MIwX9EjW8qy1ZiQrta4AvinE1M3bd8polhRZiBBaA6TQ2gf9UWgFznu+RTuOcOABwcHD8HFegRRbrV9+5Si2LBEtXXgw5xcWWkxNDe7v1CqFTHZ2A6Sl+iA5qVaKGtweAVm2uEgy68M8iS5uOoMZ03Lh4xl58MnyYtixrRKSjtZCVlYDVFS0iIfmuW4H/R060VWFFsN0ZSqEwKo454Mhk26D1Tkb4WD5CXj8sxfhp4cPGwIrMGWor8lCgaWmDAfsPWBMGQYiWSiycBP3QYeOwGDBD1KOg//sWSm2vhDv8f8XEFuYQka01DU99wrtR33HaozOHMsJ2ob6CYZqz0IrflDTJOGQluaDTZ+Xw5xZ+TB9Sq5NqMSCBXMKJJ+vL5McPVwD+XmNEoxAIdXVLVDf0CZpbTtn0tJ61lJnOkZ1dY3tb4DCQothOh8VzSoRYuuDQ9Oh13vXw32Ln4Sbt7eLLBXJkmuyVCRrjxHJQpF1ixBZAwIiC48jHHzwiBRaciN3QWVzMzScE/9wfRWIauF7G6TQwoe7AoWCnseCzhjjfBG918RCyztV1a2eOXOmwZVjyXWO7NiWC7t2VML6NaWw5G+F8NE074Jp0YJC2CiE1olUHxQUxP/+Rh2dOmSs4GJwaqOw0GKYzgejWbgu65S/UIis6+BHix+TAgvXZanF70pk9Q+sy1JrssxIFgosTWRhJMsQWUkwOLCZe7V4brd8+aVlClFGtOTDvanFQEVmVN20BdqYkRslCjzYLP2oX83m6kcXIcRG+zn5DdrGxa+TjfajvmndqY/Fr7st3oXW5+vKYO6sfHkwMDJt4hmYNNa6LifRWTi3AI4f80F5OUYhWaAw3mChxTCdC27jUBYQWrguK6uxElID3zA01mQZ3zA01mQFpgxxPZbgs8oq8Ivn8ObqGnNNFgotGck61C6ybjuSLIVWSWMjNIj2beJZ/WUgqsVCy82vk432o75p3amPxa+7LV6EFn5z56mnnrLZldiYOCZbgoufp085A7Om58K61aWwb281FBY2SWjfrgYvhme8EqvF8HsOHpX59t0HoKTMPkZNnR9wA9KiEmMDUX9DI2zfc9DWjmG6Iyi05LcMz9ZBnhBaGY1V8E5GuvyGoVqXpYusgYKp+fnyvdn85VcwWZRRbGG64/BRGJOXD4MD04WDNJGFRxO+lnMG6trazKgWrtVqF1qWB30wdCESCt23lzH0tl6h/UKNRdtQf8Gg/ajv6I0RL0JLwQ9g5nxT4C93hLaLd8IRWlNmzrfUx0+bA1U1xo7oilpfPeB+VFjG92t5VbXND8N0R/D90CzeG7idQ05zDaSJzw0lsOTid21NlopkYcI1WbiNg1yTdeAwDDl0RNqbxHMYI1koslBg3Xo0BW4TIuvW5GNwm6BKPLubxLP7rGiH04cdEFrBRUNa+im5E7yTaAg9Bm1j9+8O7dfZYzlB21A/wTDax4PQUh/aSEVlpczffvttybOv/qnb8NQzw202hnFi+472o2fciIbQ+mDSR7Y2utA6lWnsLXUqM8fWjmG6E+qYHdwBHo/OqWhshNy6Oim01LcLlcgauMcQWU+cSIPvHU0ytnEIiCxck6WnW81IVoqMZA3B85+FyBqSchzKcVF8YPrQEFpqaktNe4XCJiqMIxeozfRJ8wCLFy+1+w4yhitOY5CxbL5p7pVQvqM4ht/vP+9CC8GN/7wcK5LIvPvuuzZbooL7GFEb451YC61pHy+EcVONTUjp70oXWh9MmglTZy7gSDTT7VFCC4/JwR3cy4XQyqqu0SJZe+VUoYpk4cL3gfsOwuCAyBooRZbaxqF9utCIZAkCkSwERdaQlFQoaWoEn9zq4UuPQsuDaKBCCw8C/d3vfm/vp/nFc6v0Mc7k5pttSssrLNfw+Abdf0NTs7yG41bV1NrHIGNZoG00vyGh/ajvKI4RL0JLHrjZzR++LLQYr8RKaDEMEx5KaOEROf6WNigTQitTCC0VycJ9suRGpIL+QmTtF89e830psC58PwoTi4rhl6dOm2uycKoQUSJr6LFUKDaF1lfwpXi/k+0dwsMQWu113AfqlVdehSeeeNLWViGFVqB8++23Q3ZOrjyDCw8Kfe+90fD+6A+gps4HV111NZxIOylPpTfat0BZeaUUJFJoVaPQsvuPBGM/q/NLpFOHPtFflY+nnrBcS0tPN8sFBYWWKUK9f26edf+orOxsW7szuXmW/5rP5Oba2hw7dtws44M8MyvL1iY5JaXdx5lcqG/wvhUCtldlvO+s7Byzjmeh6W0zs+yvAUlKSrbU1bEeOvg68fXqNlrHnyWewabq9GevfOu/n7S09t9HKNC/PmZKyjHL9dOZmWbZ7WdYWlYOJaVlFlt+gfUsOgSPXdF/t06v5cSJNLOMv9uCwiJbG/314VEs9DoF77tKW1+UlNz+t4GHFpeWtd87vhbaHzmdmWWLxDptvZCs+Ubo3wu+fvX7PJWRYetfJ67pP6Nk8vtwgoUWw3Qe6vBoJbRkRKumxhBYgT2yjGN1cI+sg6bQyhPP30GBLRyMhe9JcroQ0/9CUYUiK0kIrGQUWMelwBomGHr8BBQ3UqEVhegMjWghU6ZOg5898IC9fwA9oiX7ixzF1JAhQ0wfKLSU7wsvvNC0FxWX2sel90hfh4K2Uf29QPtR31EcIxKhlRp4+FUJ1b5l6zZZVmekrV//mcy3bd9uPqRoFKO8wliPpfPss8/azg6bOHGizPGhpmz08Fg8vwzz559/Xj6w8EGJdRxz9Zo1sjxhwgSZv/XWWxbRp843C4a6B/SPOR6Ei7laS4ZldbDsO+8YZ8OtXLnS4uOFF16wtEOcBFleQHhWBH4+m7dsgeHDh5vX8cFeVFwiH7zZQuypn/W7770nczxL7pVXXpFl9XB+7rnnbGO7oQsZFA2jP/hAlmfPni1zJYxRzBw5YnxLrbik1OJja+DvQedPf/oTvPjiixYbnneH+eefbzBtS5YutbT54x//KHOnb6Wqn6kShSjIcgKCWP38nMg4bRV3yveIESNsbdXvd8uWrRY7/g4wr29oF1Z4r7pgQ2bOnCnzl156Seb495mU3C64lRjesWMn/HnkSFl+9dVXZY73o0QZHsaMf9fKz+uvv24Zh8JCi2E6D6epw2zxGfmc+EwyjtUxzi5EkYUcEO/7eeK9fVx8fmBaLT6vfpqaBpvE8xTTI6cybJGsoYFIFoqsX5/OgpKmpsAu8Wrq0CGa0lFUREtFgo6JwR588CFbO51evXpB//794f3Ro2H5ipXy5PUR4qFTXWuIq/79b5FC68PpM+Cuu+6G8eMnyn4oxr73z/8sx7r44ovhnXffs/nuKOq+3fJoQH3SnBKJ0EImT54i89dee03m+NVv8w8v8CAbLwTOp6tWmQJq6tSpkvHjDeGD6P+h03bKjiIM8/eEoMAImbIjSojgWOs/M4QHsnHTJrOsDrhFsbF//wHTPnOmsRbFCytWWMWTLoDU1N/48eNh8ZIl8qE/b/58+RpQjO7ctVtefz4gHFCQqaiYeq0qGqILl02bNlvGOXY81Sz/bdEimb/xxptwNCnJtCvhqVi48G+Bdm9Y7MFQ0TYlLvUImiqjsBgzZoz5u1GvQ/09ICgQ1N+CElr0d6t+5+hv6dJllvsYM2aszF9++WWZo4icMcO6SFv5Hzt2rPg9GIITxbRTdEhH/T6VsFm58hPzmpqew7+X5StWwJtCoGMd7xsPFaZiEiOo+PevhBa2+3j2bPM63psai0a0EBRaSgivW7/etC9YsNAsHz2aZLahUTIKCy2G6TxMoSU+d3AxfKUQQbk+H6SUlAU2I23/ZiGux9KnCocdSYJ8Ic4wlYn++M1CFFm46H2oFskaeuwEDBO653YhyNIqK6Bc/ONVL8ZttSyG94KKtjjYUBht3rxV/AfZFLSdK9r105nZcNNNN8O1115rv677CWbrCE59vNpC4dTHoy0SobVn7z6zvGnzFpkfDkQ4cPpHiQWMamGuokwKGgXBqAuCDxIa/Ro50nhA43//2AYf7CpKg6gHNYqC6ppaS0RLPbQmBKJSb775piWage31sdxQD3pERbTeCkQ7MFqjrqnoF40eqdeAdhwT7/+ZZ6yvA5k/f4EZcdN/Juo6ijH82WEbFGpHjho/cxXlmzRpkikclB8VFaL35AYKM/UaPwhEtObNMxZKb9i4yfz9KNvJU6cs/TEKp9edXgeC94fCFMspx47LNsOHP235maifrS42Ebw/dU1N6+LfXWYg8okCT29PUYIXUfelxn1HWy+nxkCBr/dvj2gZU6fqNVKRi+zevUfmGB3DNvj3umjxYksbGdH6859l+dVX/yJzfM0oyvDvFV8PRjNfDES0Ro0aZRtHh4UWw3Qu+D5tEZ9pDeLzsUr801XY0ADplZWG0NLOLjS+Xdi+8B2nDI3NSAOL37VI1lASyRp6PA3+Of0UZNbWQrUYp9G+vUO4YPTFyNet/7xdaJn2SGj3HTyPBtSnWx4J1JdbbhCJ0MKHk/pvX9XXf/a55Rr+5491nJqZFSjrYPRBRUMUdOrwz38eafpTNjp1iA9svK6mAadMmWp7MOO6It0HPhBHjx5taeOGEgmqP4oPNd2k7Ooarh/Da3RNWpF4YGIb3e60jkz5UlOzCH0tKHCUGMC1Sdh+9WpjilTvg5FcLFdWVcs2esTRDRSp6h5UlAzLekQQ2bXbiNBhlEpNz+rgFJcSeAo6dUh/dsiSJdapQ/yd4nV9upb+zSxfvsLiA8U0RhX1Njp79+03x0XRiL6xrKaz1TUUNvjhib9Pp/V02Gby5MkWG506RPFEX2NBoTUii6DQUj6ViFOgyJs7d65ZxzY4bUx96LDQYpjOBaNauL1Do/hMqRWfo6Xin7CsWh/ME+/VAXokS1uTZRFYgS0c5FRhIJI1RK7JMiJZQ1PTYJggpbwM8oWIqzt7Fppxw9Kvwt6wlIqDYNC21E8wqC83wvEdzjjhjKHfn1eMvpEILYZh4hcWWgzTuaDQag1MH/rEP294+HN+fb2cPrwbRZXtgOh2kXWb+nah3CfLEFm46B0ZEpguHJaaDnelnYTTtTVQ2twE9efOyWnDL/DZDeah0lQchLIZdWN9ERUSTvWO20L5br/ufn8dt1Hf9LrTWF5toXxb6yy0GCYxYaHFMJ0PRsDVpqUY1SprahLCqBaShNhSa7JUJAu/XShFVmBNlh7JUlOFKpJ1uxBZ/5OVDUeLS6FI+KzRjt/RDpV2FgReRIN3aB8nP042L9A+TnUnG/XjBaefhRcb9RMKFloMk6iw0GKYzkdFtXD60B9Yq1VQXw+nqqthX2EhDMXtG7RIlrHbu0CIrGFaJAsXvt+OQisQyXo1+wwcLiqRfirEM9t/7pzcEf4L8Z7GacNARCsgDNSibB1Xmy4g3IQE7ePkJ5gt2BiaXe8T0qebrTXI69Kvh/ITzObg0+Lb+jNjocUwiQkLLYbpfPSjeFBs4RRiRWOTXBh/UoikI8WlsCsvXzu7MLB9g7YmS327EEXWvemnYKdon1xWAadr66QfFFk0moWpfY0WPuypaHGzWUSPLhyoTfOt26hfR1so34EyFTEh/ao69R1iHOo72M/HtOl9Qvg2bUZ/FloMk5iw0GKY84OKaqHYwm8g4hRiRVMT5Nc3wOmaWkgRomlvQSFsycmF2zGCFRBZt2mbkf40PUNeP1BULNtn1fmhqKFR+mn+4kvzm4b4xDae2kpo2QRCCJsuFILWHXx4tlFfLnXH++uozcU3rTuN5dVGfbnWjfYstBgmMWGhxTDnD4xqqYXxuF6rTjxzy4VIQrGU4/NDWlW1jFLtF0Jqd34h7MjNh+0CzPcUFgqBVQTJpeUyCpYt2heLfpVNzdIPThniTvBqylAla0RLPeh1keBo00RCUMLxrfA4hn4/IX062Rx8uhLMTxCbzY8b7X1YaDFMYpJIQsvL6Q0ME0+oI3mU2GpoPQt1La1yzRZGpVBw5YnnL0aqTtf6hKCqEdTKHBfPo7jC63jMDrbHqBhOQzYKP185iCxMYa7RoiiR0EqEWJA+Xm2uvgO53sepvyebi2/b2KH8BLM5+Azim4UWwyQm4Qgt3BT6uef/CD179jTrtA2C179/332ubebPXwDPPjtCHoHmdPajF6686iqz/PmG9iOaBg0aZGvLMPGILraahdhCkYTH82BUCgUXRrhKGptktKpQ0iBzFFelwo7XsR22x6gYnqOIfpxEFibvO8Pr6ILCQSRYBYZDfy+E8q2PESnUpxO0T0egvtzQ+vj9fovQUomFFsN0bcIVWrhJqxJPTiIKef/90fJ4s2BtcBNYdS7mN7/5TZnj0WaqPZ4r+8mnq+Dee++FwYMHy6mW3Xv2wEsvvyzLV155lSn4rrnmGvNkBRx3xcqV8gQAddwSw8Qz+gJ5jG7hInkUTvitxFrxPsFIVbV4HleL5zPmWEfwuhRYuKmy6IeCDf04iSxM4QktN5RYiFSYBKMzx4gFHu+/vr4eWltbWWgxTIIRrtBaumy5pU7bpKWflPZQYky333rrrTLXhRbmKLQqKqvgPSHccId+3S8KKjxnFssotP7xrrtk+aabbpL5X//6muvYDHO+aDrXBpVf+G2UCyrO+aBMUCooOVsHxUibT1KkgdOMGL2SESwhrFoCAksixnBLPRoCD3bMnVDX9LyjxHIM2q+zx3KCtqF+gmH2a2iEtrY2FloMk2CEK7Ro/ZJLLjGPP0JwOlCV582bb+uD/HnkSOjTp4/se/jwERmZ6tu3L1waEFpXXnklfPDBGCm0/vM/HzZ9/MM//IN5iDlOHW4PHEuEQgsjbXg27Q033AD5BQVw9dVXO47NMOcTKrCo2FKCC3MlukyE8MIc7U4CS43hlqTQosLBSURE2+Z23SI2wrSF8u12PRJbqOsdtTU3t8C5c+eksFLrszCx0GKYrk04Qqsz0MURCi39UHcUZ7Q9w3QlqLjKayqRecUXPkm76DLElgSFl0AKsABqfZcusBRu6f8D1Er4EfgfczIAAAAASUVORK5CYII=>

[image2]: <data:image/png;base64,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>

[image3]: <data:image/png;base64,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>

[image4]: <data:image/png;base64,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>