# System Architecture - Crove Sign (Crove OS)

This document describes the technical architecture, data flows, network infrastructure, database schema isolation, and Identity & Organization Synchronization mechanisms of **Crove Sign** within the **Crove OS / DOS.Me** ecosystem.

---

## 1. System Overview

**Crove Sign** is the electronic signature engine of the Crove ecosystem, built on top of the Documenso v2.17.0 core (React Router v7 / Remix + Hono + Prisma + PDF Signing Engine).

```
                        ┌────────────────────────────────────────┐
                        │         End Users / Browser            │
                        └───────────────────┬────────────────────┘
                                            │ HTTPS (sign.crove.com)
                                            ▼
                        ┌────────────────────────────────────────┐
                        │     Cloudflare Edge (Zero Trust)       │
                        │        Tunnel: Crove-GCP               │
                        └───────────────────┬────────────────────┘
                                            │ QUIC / HTTP2
                                            ▼
 ┌──────────────────────────────────────────────────────────────────────────────────┐
 │ GCP Compute Engine: crove-server (Project: crove-os | Zone: asia-southeast1-b)    │
 │                                                                                  │
 │   ┌───────────────────────┐         Docker Network: crove_postiz-network         │
 │   │   crove-cloudflared   ├────────────────────────────┐                         │
 │   │ (Cloudflare Connector)│                            │                         │
 │   └───────────────────────┘                            ▼                         │
 │                                             ┌─────────────────────┐              │
 │                                             │     crove-sign      │              │
 │                                             │ (Documenso v2.17.0) │              │
 │                                             │  Port: 3000 (4008)  │              │
 │                                             └──────────┬──────────┘              │
 └────────────────────────────────────────────────────────┼─────────────────────────┘
                                                          │
                    ┌─────────────────────────────────────┴─────────────────────────┐
                    │                                                               │
                    ▼ (OIDC Discovery / Token / UserInfo)                           ▼ (Postgres Session Pooler)
┌────────────────────────────────────────┐                     ┌────────────────────────────────────────┐
│         DOS ID / Supabase Auth         │                     │       Supabase Managed Postgres        │
│          (Auth & Single Sign-On)       │                     │         (Schema: sign - 163 tables)    │
│  https://id.dos.me / auth/v1           │                     │  aws-1-ap-southeast-1.pooler...:5432   │
└────────────────────────────────────────┘                     └────────────────────────────────────────┘
```

---

## 2. Infrastructure & Network

### 2.1. Cloud Compute Instance (VM)
- **GCP Project**: `crove-os` (Project Number: `352034351652`, Organization: Tingee).
- **Instance**: `crove-server` (`asia-southeast1-b`).
- **Configuration**: `e2-standard-2` (2 vCPU, 8GB RAM), 50GB Boot Disk.
- **Docker Compose Stack**: Located at `/opt/crove/sign/docker-compose.yml`, exposing local port `127.0.0.1:4008:3000`.

### 2.2. Routing & Domain (Cloudflare Zero Trust)
- **Public Domain**: `https://sign.crove.com`.
- **Cloudflare Tunnel**: `Crove-GCP` (Tunnel ID: `41d183ca-1507-4092-a2e5-a5bd988282ee`).
- **Ingress Configuration**:
  ```yaml
  - hostname: sign.crove.com
    service: http://crove-sign:3000
    originRequest:
      httpHostHeader: sign.crove.com
  ```
- **Docker Network**: Container `crove-sign` attaches to `crove_postiz-network` so `crove-cloudflared` resolves internal DNS directly via service name `crove-sign`.

---

## 3. Database Architecture

Crove Sign shares the Supabase managed PostgreSQL instance (`gulptwduchsjcsbndmua`) with full **Schema-level Isolation (Multi-Tenancy)**:

| Parameter | Value |
| :--- | :--- |
| **Schema Name** | `sign` (Isolated from `public`, `cal`, `post`, `crm`, `dosai`, `dosafe`) |
| **Prisma Migrations** | 163 migrations applied cleanly in schema `sign` |
| **Connection Endpoint** | `aws-1-ap-southeast-1.pooler.supabase.com` (Port 6543 for Runtime App / Port 5432 for Migrations) |
| **Runtime Connection String (Transaction Pooler)** | `postgresql://postgres.gulptwduchsjcsbndmua:<DB_PASSWORD>@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?schema=sign&sslmode=no-verify&pgbouncer=true&connection_limit=5` |
| **Direct Connection String (Session Pooler)** | `postgresql://postgres.gulptwduchsjcsbndmua:<DB_PASSWORD>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?schema=sign&sslmode=no-verify` |
| **ID Generator Extension** | Functions `sign.nanoid()` and `sign.nanoid_optimized()` using `extensions.pgcrypto` |

### 3.1. Core Database Entities
- `sign.User`: User identities (mapped via `email` or `sub` from DOS ID).
- `sign.Account`: OAuth/OIDC accounts (`provider = 'oidc'`, `providerAccountId = sub`).
- `sign.Organisation` & `sign.OrganisationMember`: Organizations, role memberships, branding, seat limits.
- `sign.Team` & `sign.TeamMember`: Workspaces within organizations.
- `sign.Envelope` & `sign.EnvelopeItem`: Document envelopes (PDF), completion statuses, audit trails.
- `sign.Recipient` & `sign.Field` & `sign.Signature`: Signers, form fields, coordinates, and digital signatures.

---

## 4. Authentication & Single Sign-On (SSO)

Crove Sign operates in **SSO-First** mode authenticated via **DOS.Me ID** using standard **OpenID Connect (OIDC)**:

### 4.1. OIDC Configuration Parameters
- **Provider**: DOS.Me ID (Supabase Auth OpenID Connect Provider).
- **Well-Known Discovery**: `https://gulptwduchsjcsbndmua.supabase.co/auth/v1/.well-known/openid-configuration`.
- **Client ID**: `18790ccb-4d71-48cd-ad24-aee5f3ced3da` (OAuth Client `Crove`).
- **Token Endpoint Auth Method**: `client_secret_basic` (Authorization Basic header).
- **Scopes**: `openid profile email offline_access`.
- **Redirect / Callback URI**: `https://sign.crove.com/api/auth/callback/oidc`.
- **Prompt**: `consent`.

### 4.2. Authorization Flow (OIDC Authorization Code with PKCE)

```
User -> Browser               Crove Sign (App)             DOS.Me ID (Supabase Auth)
     │                               │                                     │
     ├──── Click "DOS.Me ID" ───────>│                                     │
     │                               ├─ Generate state & PKCE verifier ───>│
     │                               ├─ Redirect to /oauth/authorize ──────┤
     │<── Redirect 302 ──────────────┤                                     │
     │                                                                     │
     ├──── Login & Authorize on id.dos.me ────────────────────────────────>│
     │                                                                     │
     │<── Callback 302 to /api/auth/callback/oidc?code=...&state=... ──────┤
     │                                                                     │
     ├──── Send code & state ───────>│                                     │
     │                               ├─ Exchange code for tokens ─────────>│
     │                               │<─ Return access_token, id_token ────┤
     │                               │                                     │
     │                               ├─ Fetch claims via /userinfo ───────>│
     │                               │<─ Return UserInfo Claims ───────────┤
     │                               │                                     │
     │                               ├─ JIT Sync Profile, Avatar, Orgs ────┤
     │                               ├─ Establish session cookie ──────────┤
     │<── Redirect to /inbox ────────┤                                     │
```

---

## 5. Crove OS 2-Tier Hybrid Architecture & Data Sync

To balance instant UI performance (0ms local query latency) and relational integrity with AI Agent capabilities, Crove OS adopts a **2-Tier Hybrid Architecture**:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           CROVE OS 2-TIER HYBRID ARCHITECTURE                           │
├──────────────────────────────────────────┬──────────────────────────────────────────────┤
│ TẦNG 1: Đồng bộ Dữ liệu Danh tính        │ TẦNG 2: Deep Agentic Business Actions        │
│ (Companies, Customers, Organizations)    │ (Tạo Deal, Gia hạn, Giao Task, Tra cứu HĐ)  │
├──────────────────────────────────────────┼──────────────────────────────────────────────┤
│        DATABASE SYNCHRONIZATION          │                 MCP PROTOCOL                 │
│    (PostgreSQL Mirror nội bộ < 5ms)      │      (Model Context Protocol Tool Calling)   │
│                   │                      │                      │                       │
│  • Twenty CRM / DOS-Me: Master SSOT      │  • twenty_crm.create_opportunity(...)        │
│  • Crove Desk: desk.t_company / customer │  • twenty_crm.get_subscription_status(...)   │
│  • Crove Sign: sign.Organisation         │  • twenty_crm.create_task(...)               │
│  • Bi-directional Webhook Dispatch       │  • crove_sign.get_contracts(...)             │
│  • JIT (Just-In-Time) Onboarding         │  • Thực thi logic nghiệp vụ sâu & validation │
└──────────────────────────────────────────┴──────────────────────────────────────────────┘
```

### 5.1. Tier 1: Single Source of Truth (SSOT) & Inbound JIT Provisioning
- **Central Storage**: `public.organizations` and `public.org_members` on Supabase / DOS.Me.
- **Inbound JIT Sync**: During OIDC login at `/api/auth/callback/oidc`:
  1. Extracts `name`, `picture` (avatar), and `organizations` array from OIDC ID Token & `/auth/v1/oauth/userinfo`.
  2. Auto-downloads and optimizes avatar into `sign.AvatarImage`.
  3. Upserts `sign.Organisation`, default `sign.Team`, and assigns `sign.OrganisationMember` roles without manual user onboarding.

### 5.2. Tier 1: Outbound Organization Creation API (No Popup / No Redirect)
When a user clicks **"+ Create Organisation"** in Crove Sign:
1. Crove Sign retrieves the user's OIDC `access_token`.
2. Sends: `POST https://api.dos.me/organizations` with `{ name, slug }`.
3. `api.dos.me` validates quotas $\rightarrow$ writes to `public.organizations` $\rightarrow$ returns official UUID.
4. Crove Sign uses the returned `id` as the primary key in `sign.Organisation` to guarantee global ID consistency.

### 5.3. Tier 1: Real-Time Webhook Lifecycle (`/api/webhooks/dos-org-sync`)
- **Webhook Ingress**: `POST /api/webhooks/dos-org-sync`.
- **HMAC-SHA256 Verification**: Header `X-DOS-Signature: sha256=<hex_digest>` verified against `CROVE_DOS_WEBHOOK_SECRET`.
- **Supported Lifecycle Events**:
  - `organization.created` / `org.created`: Auto-provisions organization and team.
  - `organization.updated` / `org.updated`: Syncs name and slug.
  - `organization.deleted` / `org.deleted`: Cascades cleanup and archive.
  - `organization.member_added` / `org.member_added`: Adds member and maps roles (`ADMIN`, `MANAGER`, `MEMBER`).
  - `organization.member_removed` / `org.member_removed`: Removes membership.
  - `user.updated`: Syncs user display name and avatar.
- **Persistent Queue & Exponential Retry (BullMQ)**:
  - Job definition `internal.process-dos-webhook` configured with **5 retries** and exponential backoff ($2s \rightarrow 4s \rightarrow 8s \rightarrow 16s \rightarrow 32s$).
  - 10-minute in-memory idempotency cache preventing duplicate event execution on network retries.

### 5.4. Tier 2: Deep Agentic Business Actions via MCP Protocol
When AI Agents (e.g. Crove Desk AI, DOSClaw) require contextual information or stateful side-effects, they invoke Model Context Protocol (MCP) tools:

| MCP Tool Name | Target System | Input Params | Purpose |
| :--- | :--- | :--- | :--- |
| `crove_sign.get_contracts` | Crove Sign | `{ customer_email, company_id }` | Real-time lookup of signed, pending, and expired electronic contracts |
| `twenty_crm.get_subscription_status` | Twenty CRM | `{ company_id }` | Query subscription tiers, seats, and quotas |
| `twenty_crm.create_opportunity` | Twenty CRM | `{ company_id, name, amount, stage }` | Create sales deal / upgrade request |
| `twenty_crm.create_task` | Twenty CRM | `{ title, due_date, assignee_id, contact_id }` | Schedule follow-up sales consultation task |

---

## 6. Blockchain Integrity Receipt Architecture (EAS on DOS Chain & Multi-Chain EVM)

### 6.1. Legal & Functional Positioning
- **Not a Legal Electronic Signature / Timestamp**: In compliance with the Law on Electronic Transactions (20/2023/QH15) and Decree 23/2025/ND-CP, timestamping is a conditionally licensed trust service. Blockchain anchors do not claim legal equivalence to qualified timestamp providers (TSP).
- **Core Positioning**: A **Tamper-Evident Blockchain Integrity Receipt** providing decentralized mathematical proof that an exact file existed in an immutable state no later than a specific block height. Legal signatures remain handled by PAdES/TSP X.509 certificates (`finalize-tsp-completion.ts`).

### 6.2. Existing DOS Chain Infrastructure (EVM Standard)
Crove Sign utilizes the official Ethereum Attestation Service (EAS) contracts already deployed on DOS Chain:
- **EAS Core**: `0x79799066b2b5072E4B154Bedde14Dbc22caa0EA5`
- **SchemaRegistry**: `0x7979E91c465d3dde4faA7a6601b5b2c1C66c9999`
- **EIP712Proxy & Indexer**: Pre-deployed and verified.

### 6.3. Privacy-Preserving Multi-PDF Schema Specification
To eliminate privacy leakage (avoiding public titles, names, signer counts, internal IDs) and natively support multi-PDF Envelopes (`EnvelopeItem[]`), the attestation schema registers per-document hashes using canonical SHA-256:

```solidity
bytes32 anchorId,
bytes32 documentHash,
bytes32 auditRoot,
uint16 itemIndex,
uint16 itemCount,
uint16 formatVersion
```

- `anchorId`: Random UUID/bytes32 generated prior to job execution (decoupled from internal `envelopeId`).
- `documentHash`: Standard SHA-256 hash of the sealed PDF file (supported natively by Web Crypto in all modern browsers).
- `auditRoot`: SHA-256 hash of the canonical JSON audit trail serialized via **RFC 8785 (JCS)**.
- `itemIndex` & `itemCount`: Indexing for multi-item document bundles in a single `multiAttest` transaction.

### 6.4. Elimination of Self-Referencing QR Loop
- Sealed PDFs embed a **Stable Verification URL** (`https://sign.crove.com/verify/:qrToken`) generated before document decoration.
- The sealed PDF is finalized and hashed once. After the asynchronous anchor job completes, navigating to the verification URL queries the attestation record, block height, and transaction hash dynamically without modifying the immutable sealed PDF.

### 6.5. Reverse Lookup & Dedicated Crove Resolver
Because EAS Core queries strictly by `UID`, a dedicated `CroveAttestationResolver.sol` on DOS Chain maintains an on-chain reverse mapping:
```solidity
mapping(bytes32 => bytes32[]) public documentHashToUIDs;
```
This enables zero-login, browser-based drag & drop document verification by querying the smart contract directly via RPC.

### 6.6. Transactional Outbox Pattern & Worker Reliability
- Outbox entries are committed atomically in PostgreSQL (`sign.BlockchainAnchor`) alongside document completion.
- A background BullMQ queue processes records: `PENDING -> SUBMITTED -> CONFIRMED`.
- A dedicated **Crove Signer Wallet** (isolated with gas limits and periodic key rotation) manages nonces via an in-memory coordinator to prevent transaction replacement errors.

### 6.7. Multi-Chain Portability & Migration (Base, Arbitrum, Optimism, Sign Protocol)
Because the architecture strictly implements standard EAS (EIP-712 and EVM bytecode):
- **Zero Lock-in**: Crove Sign can simultaneously attest or migrate to Ethereum L2s (Base, Arbitrum, Optimism, Polygon) by adjusting the RPC URL and contract addresses in configuration.
- **Cross-Chain Attestation**: Compatible with Sign Protocol & Arweave storage layers if global decentralized replication is required.

---

## 7. Multi-Language Localization (i18n & Vietnamese Support)

Crove Sign supports internationalization via LinguiJS:
- **Supported Languages**: English (`en`), German (`de`), French (`fr`), Spanish (`es`), Italian (`it`), Dutch (`nl`), Polish (`pl`), Portuguese (`pt-BR`), Japanese (`ja`), Korean (`ko`), Chinese (`zh`), and **Vietnamese (`vi`)**.
- **Vietnamese Catalog (`packages/lib/translations/vi/web.po`)**:
  - Full translations for Document Signing, Envelope Editor, Recipients, Settings, Teams, and Organisations.
  - Formatted and compiled with Lingui CLI.
  - Submitted upstream to Documenso via [PR #3307](https://github.com/documenso/documenso/pull/3307).

---

## 7. Branding & White-Label Architecture

Crove Sign employs an **Automated Script & Lingui Patching Pattern** (`yarn patch:branding` / `npm run patch:branding`) via `scripts/patch-crove-branding.mjs` to ensure zero core conflict with upstream Documenso:

1. **Lingui Translation Catalog Automation (`packages/lib/translations/*/web.po`)**:
   - Patches target `msgstr` lines (`Documenso` $\rightarrow$ `Crove Sign`, `Documenso, Inc.` $\rightarrow$ `Crove, Inc.`).
   - Keeps `msgid` source keys completely identical to upstream Documenso so upstream components render `"Welcome to Crove Sign"` automatically at runtime.
2. **PWA Manifests & Favicons**:
   - Automatically maintains `apps/remix/public/site.webmanifest`, `packages/assets/site.webmanifest`, and `apps/remix/public/favicon.svg`.
3. **SVG Branding Assets**:
   - Manages standalone vector logos (`apps/remix/app/components/general/branding-logo.tsx` and `branding-logo-icon.tsx`).
4. **Zero-Conflict Upstream Sync Workflow**:
   - **Local One-Command Sync**:
     ```bash
     # Tự động fetch tag mới từ upstream, merge và patch branding
     npm run sync:upstream
     # hoặc chỉ định tag cụ thể:
     node scripts/sync-upstream.mjs --tag=v2.18.0
     ```
   - **Automated GitHub Actions Pipeline (`.github/workflows/sync-upstream.yml`)**:
     - Định kỳ 12 tiếng tự động kiểm tra releases mới từ `documenso/documenso`.
     - Khi có release mới (ví dụ `v2.18.0`), tự động merge vào `main`, chạy `patch:branding`, tạo GitHub Release tương ứng trong `DOS/Crove-Sign` và push tag `v2.18.0`.
     - Tag push tự động kích hoạt workflow `.github/workflows/build-docker.yml` để build và push image `ghcr.io/dos/crove-sign:v2.18.0` và `:latest` lên GitHub Container Registry (không tự ý deploy lên production).

---

## 8. Production Environment Variables (`/opt/crove/sign/.env`)

```ini
PORT=3000
NEXTAUTH_SECRET="<SECRET_32_BYTES>"
NEXT_PRIVATE_ENCRYPTION_KEY="<HEX_16_BYTES>"
NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY="<HEX_16_BYTES>"

# App URLs
NEXT_PUBLIC_WEBAPP_URL="https://sign.crove.com"
NEXT_PRIVATE_INTERNAL_WEBAPP_URL="http://localhost:3000"

# Database Connection (Supabase Transaction Pooler - schema: sign)
NEXT_PRIVATE_DATABASE_URL="postgresql://postgres.gulptwduchsjcsbndmua:<DB_PASSWORD>@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?schema=sign&sslmode=no-verify&pgbouncer=true&connection_limit=5"
NEXT_PRIVATE_DIRECT_DATABASE_URL="postgresql://postgres.gulptwduchsjcsbndmua:<DB_PASSWORD>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?schema=sign&sslmode=no-verify"

# Storage & Mail
NEXT_PUBLIC_UPLOAD_TRANSPORT="database"
NEXT_PRIVATE_SMTP_TRANSPORT="smtp-auth"
NEXT_PRIVATE_SMTP_HOST="127.0.0.1"
NEXT_PRIVATE_SMTP_PORT=25
NEXT_PRIVATE_SMTP_FROM_NAME="Crove Sign"
NEXT_PRIVATE_SMTP_FROM_ADDRESS="noreply@crove.com"

# DOS.Me OIDC SSO
NEXT_PRIVATE_OIDC_WELL_KNOWN="https://gulptwduchsjcsbndmua.supabase.co/auth/v1/.well-known/openid-configuration"
NEXT_PRIVATE_OIDC_CLIENT_ID="18790ccb-4d71-48cd-ad24-aee5f3ced3da"
NEXT_PRIVATE_OIDC_CLIENT_SECRET="<OAUTH_CLIENT_SECRET>"
NEXT_PRIVATE_OIDC_PROVIDER_LABEL="DOS.Me ID"
NEXT_PRIVATE_OIDC_SKIP_VERIFY=true
NEXT_PRIVATE_OIDC_PROMPT="consent"

# Ecosystem Webhooks & Queues
CROVE_DOS_WEBHOOK_SECRET="<WEBHOOK_SECRET>"
NEXT_PRIVATE_JOBS_PROVIDER="bullmq"
NEXT_PRIVATE_REDIS_URL="redis://127.0.0.1:6379"

# SSO-First Access Controls
NEXT_PUBLIC_DISABLE_EMAIL_PASSWORD_SIGNUP=true
NEXT_PUBLIC_DISABLE_EMAIL_PASSWORD_SIGNIN=true
NEXT_PUBLIC_DISABLE_OIDC_AUTO_REDIRECT=true
```

---

## 9. Operations & Runbook

### 9.1. Service Lifecycle Commands
```bash
cd /opt/crove/sign
sudo docker compose pull
sudo docker compose up -d --force-recreate
```

### 9.2. Status & Health Check Commands
```bash
# Check container status
docker ps --filter name=crove-sign

# Inspect application logs
docker logs --tail 50 crove-sign

# Query health check endpoint
curl -s http://127.0.0.1:4008/api/health
```

### 9.3. Cloudflare Tunnel Configuration
- Tunnel config file: `/opt/crove/tunnel/config.yml`.
- After modifying ingress rules, restart connector:
  ```bash
  cd /opt/crove
  sudo docker compose -f docker-compose.prod.yaml restart cloudflared
  ```

### 9.4. Automated Database Backup & Disaster Recovery (Schema: sign)
- **Backup Script**: `/opt/crove/sign/scripts/backup-sign-db.sh` (`scripts/backup-sign-db.sh`).
- **Restore Script**: `/opt/crove/sign/scripts/restore-sign-db.sh` (`scripts/restore-sign-db.sh`).
- **Storage Path**: `/opt/crove/sign/backups/`.
- **Retention Policy**: Automated gzip compression (`.sql.gz`) and pruning of snapshots older than 30 days.
- **Cron Schedule (Daily at 03:00 UTC / 10:00 AM UTC+7)**:
  ```bash
  0 3 * * * /opt/crove/sign/scripts/backup-sign-db.sh /opt/crove/sign/.env >> /opt/crove/sign/backups/backup.log 2>&1
  ```
- **Manual Backup Trigger**:
  ```bash
  sudo /opt/crove/sign/scripts/backup-sign-db.sh /opt/crove/sign/.env
  ```
- **Restore Runbook**:
  ```bash
  sudo /opt/crove/sign/scripts/restore-sign-db.sh /opt/crove/sign/backups/sign-backup-latest.sql.gz /opt/crove/sign/.env
  ```

---

## 10. Cross-Repository Architectural References

Official master architecture and integration specifications are maintained in the central DOS.Me documentation tree:
- **`docs/api/CRM-DESK-SYNC-WEBHOOKS.md`** (*repo: dos-me*): Webhook Ingress, Event Schemas, and Verification Contracts.
- **`docs/platform/INTEGRATION-GUIDE.md`** (*repo: dos-me*): Master technical specification for OIDC SSO, PKCE Bridges, Entitlements, Webhooks, Two-Way Org Sync, and Connections Hub.
- **`docs/web-id/AUTH-ARCHITECTURE.md`** (*repo: dos-me*): Authentication & Login Architecture.
- **`https://dev.dos.me/webhooks`**: Developer Portal for Webhook Registration & Delivery Logs.

*Note on Repository Files:*
- `ARCHITECTURE.md` (root): Upstream Documenso codebase architecture (internal monorepo package layers).
- `docs/ARCHITECTURE.md`: Crove OS ecosystem integration specification (Deployment, Database Schema, OIDC, 2-Tier Hybrid Sync, Branding).
