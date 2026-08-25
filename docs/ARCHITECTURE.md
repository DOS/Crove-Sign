# System Architecture - Crove Sign (Crove OS)

This document describes the technical architecture, data flows, network infrastructure, database schema isolation, and Identity & Organization Synchronization mechanisms of **Crove Sign** within the **Crove OS / DOS.Me** ecosystem.

---

## 1. System Overview

**Crove Sign** is the electronic signature service (e-Signature Engine) of the Crove ecosystem, built on top of the Documenso v2.17.0 core (React Router v7 / Remix + Hono + Prisma + PDF Signing Engine).

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
| **Connection Endpoint** | `aws-1-ap-southeast-1.pooler.supabase.com:5432` |
| **Connection String** | `postgresql://postgres.gulptwduchsjcsbndmua:<DB_PASSWORD>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?schema=sign&sslmode=no-verify` |
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
     │                               ├─ Token Request (Basic Auth) ───────>│
     │                               │<─ Returns Access Token + ID Token ──┤
     │                               │                                     │
     │                               ├─ Query UserInfo & ID Token Claims   │
     │                               ├─ Upsert User & Account in DB (sign) │
     │                               ├─ Set Session Cookie                 │
     │<── Redirect 302 to Dashboard ─┤                                     │
```

### 4.3. SSO-First Environment Policy
```ini
# Disable local password signup and signin forms:
NEXT_PUBLIC_DISABLE_EMAIL_PASSWORD_SIGNUP=true
NEXT_PUBLIC_DISABLE_EMAIL_PASSWORD_SIGNIN=true

# Keep signin page displaying DOS.Me ID & Passkey:
NEXT_PUBLIC_DISABLE_OIDC_AUTO_REDIRECT=true
NEXT_PRIVATE_OIDC_SKIP_VERIFY=true
NEXT_PRIVATE_OIDC_PROVIDER_LABEL="DOS.Me ID"
```

---

## 5. Organization Synchronization Architecture

The Crove OS ecosystem implements a **Hybrid Organization Sync (API-First Delegation + JIT + Webhook Lifecycle)** model for cross-product consistency and Single Source of Truth:

```
                      ┌───────────────────────────────┐
                      │    DOS.Me Core Workspace      │
                      │ (public.organizations / roles)│
                      └───────────────┬───────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
              ▼ (JIT / API Delegate)  ▼ (OIDC Claims)         ▼ (JIT / Webhook)
    ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
    │    Crove Sign    │    │    Crove Post    │    │    Crove CRM     │
    │  (schema: sign)  │    │  (schema: post)  │    │  (schema: core)  │
    └──────────────────┘    └──────────────────┘    └──────────────────┘
```

### 5.1. Just-In-Time (JIT) Provisioning & Identity Sync
- When a user logs in via DOS.Me ID, the callback (`/api/auth/callback/oidc`) inspects ID Token and the UserInfo endpoint (`/auth/v1/oauth/userinfo`).
- **Profile Sync**: Updates `name` and downloads/optimizes avatar from `picture` / `avatar_url` into `sign.AvatarImage`.
- **Org Claims / Fallback Query**: Parses organizations from claims, with direct fallback querying `public.organizations` & `public.org_members` via PostgreSQL to auto-create `sign.Organisation` + default `sign.Team`.

### 5.2. API-First Delegation (Bidirectional Org Creation)
- When a user clicks **+ Create Organisation** inside Crove Sign:
  1. Sign backend retrieves the active session's OIDC `access_token`.
  2. Sends an authorized request: `POST https://api.dos.me/organizations` with `{ name, slug }`.
  3. `api.dos.me` validates subscription quotas $\rightarrow$ writes to `public.organizations` $\rightarrow$ triggers `WebhookDispatcherService` to fan-out `org.created` to all Crove apps (CRM, Post, Cal, Desk).
  4. Crove Sign receives the standard ID from `api.dos.me` and creates the organization in schema `sign.Organisation`.

### 5.3. Real-Time Webhook Lifecycle (`/api/webhooks/dos-org-sync`)
- Listens for real-time changes from `id.dos.me` / `dos.me`:
  - **Security Signature**: Validates HMAC-SHA256 via header `X-DOS-Signature: sha256=<hash>` using `CROVE_DOS_WEBHOOK_SECRET`.
  - **Supported Events**:
    - `organization.created` / `org.created`: Auto-creates Organization and default Team.
    - `organization.updated` / `org.updated`: Syncs name and slug.
    - `organization.deleted` / `org.deleted`: Safely deletes organization and cascades envelope handling.
    - `organization.member_added` / `org.member_added`: Adds member and assigns role (`ADMIN`, `MANAGER`, `MEMBER`).
    - `organization.member_removed` / `org.member_removed`: Removes member access.
    - `user.updated`: Syncs display name and avatar updates.

---

## 6. Branding & White-Label Architecture

Crove Sign employs a **Two-Tier Branding Strategy** to ensure complete visual white-labeling while keeping upstream code conflicts to near zero:

### 6.1. Tier 1: Dynamic Database-Driven Tenant Branding (Zero Code Conflict)
- **Built-in Documenso Engine**: Documenso already includes an Enterprise White-label engine stored in `sign.OrganisationGlobalSettings`:
  - `brandingEnabled`: Boolean flag activating custom branding.
  - `brandingLogo`: Custom SVG/PNG logo rendered in header, recipient signing pages, and PDF signature disclosures.
  - `brandingUrl`: Custom landing redirect URL.
  - `brandingCompanyDetails`: Custom legal footer information.
  - `brandingColors`: Custom primary, background, and accent color scheme.
  - `brandingCss`: Custom PostCSS/Tailwind override stylesheets (up to 256 KB) injected into `/t/[teamUrl]/*` and signing flows.
- **Automated Default Provisioning**:
  - When JIT or Webhook provisions the primary `Crove` organization, default Crove branding (Logo, `#10B981` Emerald accent, and custom styles) is automatically attached without altering any upstream React component code.

### 6.2. Tier 2: Global Application Assets & Meta (Isolated Asset Layer)
- **Asset Replacement**:
  - Header & Navigation: `apps/remix/app/components/general/branding-logo.tsx` and `@documenso/assets/logo.png`.
  - Favicon & Manifest: `apps/remix/public/favicon*.png`, `apple-touch-icon.png`, `site.webmanifest`.
  - OpenGraph Meta Tags: `apps/remix/app/utils/meta.ts` reading default title `Crove Sign` and description.
- **Upstream Merge Isolation**:
  - All brand asset changes are isolated to dedicated standalone files rather than inlined across UI templates, guaranteeing that `git merge upstream/main` applies cleanly.

---

## 7. Cross-Repository Architectural References

Official master architecture and integration specifications are maintained in the central DOS.Me documentation tree:
- **`docs/platform/INTEGRATION-GUIDE.md`** (*repo: dos-me*): Master technical specification for OIDC SSO, PKCE Bridges, Entitlements, Webhooks, Two-Way Org Sync, and Connections Hub.
- **`docs/web-id/AUTH-ARCHITECTURE.md`** (*repo: dos-me*): Authentication & Login Architecture.
- **`docs/api/PROVIDER-CONNECTIONS.md`** (*repo: dos-me*): Third-party SaaS OAuth integrations.
- **`docs/README.md`** (*repo: dos-me*): Central documentation navigation catalog.

*Note on Repository Files:*
- `ARCHITECTURE.md` (root): Upstream Documenso codebase architecture (internal monorepo package layers).
- `docs/ARCHITECTURE.md`: Crove OS ecosystem integration specification (Deployment, Database Schema, OIDC, 2-Way Sync, Branding).

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

# Database Connection (Supabase Session Pooler - schema: sign)
NEXT_PRIVATE_DATABASE_URL="postgresql://postgres.gulptwduchsjcsbndmua:<DB_PASSWORD>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?schema=sign&sslmode=no-verify"
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

# SSO-First Access Controls
NEXT_PUBLIC_DISABLE_EMAIL_PASSWORD_SIGNUP=true
NEXT_PUBLIC_DISABLE_EMAIL_PASSWORD_SIGNIN=true
NEXT_PUBLIC_DISABLE_OIDC_AUTO_REDIRECT=true
```

---

## 8. Branding & White-Label Architecture

Crove Sign employs an **Automated Script & Lingui Patching Pattern** (`yarn patch:branding` / `npm run patch:branding`) via `scripts/patch-crove-branding.mjs` to ensure zero core conflict with upstream Documenso:

1. **Lingui Translation Catalog Automation (`packages/lib/translations/*/web.po`)**:
   - The script iterates through all locale catalogs and patches target `msgstr` lines (e.g. `Documenso` $\rightarrow$ `Crove Sign`, `Documenso, Inc.` $\rightarrow$ `Crove, Inc.`).
   - Keeps `msgid` source keys completely identical to upstream Documenso so upstream components (`t\`Welcome to Documenso\``) render `"Welcome to Crove Sign"` automatically at runtime without editing React components.
2. **PWA Manifests & Favicons**:
   - Automatically maintains `apps/remix/public/site.webmanifest`, `packages/assets/site.webmanifest`, and `apps/remix/public/favicon.svg`.
3. **SVG Branding Assets**:
   - Manages standalone vector logos (`apps/remix/app/components/general/branding-logo.tsx` and `branding-logo-icon.tsx`).
4. **Zero-Conflict Upstream Sync Workflow**:
   ```bash
   # Kéo code mới từ upstream về dev
   git fetch upstream main
   git merge upstream/main
   
   # Tự động hóa áp dụng toàn bộ branding Crove Sign
   npm run patch:branding
   ```

---

## 9. Deployment Configuration Reference

### 9.1. Service Lifecycle Commands
```bash
cd /opt/crove/sign
sudo docker compose up -d
sudo docker compose restart
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
