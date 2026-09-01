# Changelog - Crove Sign

All notable architectural, infrastructure, database, identity, and feature changes for **Crove Sign** (Documenso v2.17.0 fork).

---

## [2026-09-01] - Enterprise Features Unlocked & RFC 3161 PAdES LTV Timestamping

### 1. Full Enterprise Capabilities & Claims Unlocked
- **Universal Enterprise Subscription Claims (`migration.sql`)**:
  - Unlocked all enterprise feature flags (`allowCustomBranding`, `hidePoweredBy`, `unlimitedDocuments`, `emailDomains`, `embedAuthoring`, `embedAuthoringWhiteLabel`, `embedSigning`, `embedSigningWhiteLabel`, `cfr21`, `hipaa`, `authenticationPortal`, `signingReminders`, `cscQesSigning`) across default subscription claims.
  - Set `teamCount = 0` (unlimited teams/workspaces) and `memberCount = 0` (unlimited seats) with up to 100 attachments and 100 recipients per envelope.
  - Updated JIT provisioning (`sync-dos-profile.ts`, `create-dos-organisation.ts`, `create-organisation.ts`) to default new organizations to Enterprise tier.
- **RFC 3161 Timestamp Authority (TSA) & PAdES LTV**:
  - Configured `NEXT_PRIVATE_SIGNING_TIMESTAMP_AUTHORITY="http://timestamp.digicert.com"` for cryptographic timestamp embedding and Adobe Acrobat Long-Term Validation (LTV).
  - Enforced modern ETSI CAdES/PAdES detached signature standard (`NEXT_PRIVATE_USE_LEGACY_SIGNING_SUBFILTER=false`).
  - Raised default document upload limit to 100MB (`NEXT_PUBLIC_DOCUMENT_SIZE_UPLOAD_LIMIT=100`).

---

## [2026-08-31] - EAS Benchmark Suite, Outbox State Machine Tests & DOS Chain Infrastructure

### 1. Attestation & Gas Benchmark Suite (`scripts/benchmark-doschain-attestation.mjs`)
- **RFC 8785 Canonical JSON Benchmark**: Achieves over 160,000 ops/sec deterministic canonical hashing.
- **Multi-PDF Merkle Tree Computation**: Sub-millisecond Merkle root computation (~50 µs for 50 PDF items).
- **EVM Gas Estimation**: ~73k gas for single document attestation and ~40k gas per document in 5-item `multiAttest` batch (45% gas savings).
- **DOS Chain Node RPC Probing**: Automatic latency and block height verification on DOS Chain Testnet and Mainnet.

### 2. Outbox Worker & Idempotency Simulation Test Suite
- Implemented `packages/lib/server-only/blockchain/outbox-worker.test.ts` verifying:
  - Strict anti-replay idempotency on duplicate queue invocations.
  - Outbox state machine transitions: `PENDING -> SUBMITTED -> CONFIRMED`.
  - Crash recovery & exponential retry for `RETRYABLE_FAILED` and terminal `PERMANENT_FAILED` states.

---

## [2026-08-28] - Smart Contract CroveAttestationResolver & EAS Interface

### 1. Smart Contract Implementation (`contracts/CroveAttestationResolver.sol`)
- **EAS Schema Resolver**:
  - Implemented `CroveAttestationResolver` inheriting from `SchemaResolver` connected to pre-deployed EAS Core on DOS Chain (`0x79799066b2b5072E4B154Bedde14Dbc22caa0EA5`).
  - Added dedicated access control `authorizedAttesters` ensuring only designated Crove Signer wallets can create attestations under this schema.
- **On-Chain Reverse Lookup**:
  - Maintained on-chain mapping `_documentHashToUIDs` (`bytes32 => bytes32[]`) and `_anchorIdToUIDs` (`bytes32 => bytes32[]`).
  - Provided zero-login public verification view functions: `getAttestationUIDsByDocumentHash`, `getLatestAttestationUID`, `isDocumentAttested`, and `verifyDocument`.
- **EAS Standards & Interfaces (`contracts/interfaces/`, `contracts/resolver/`)**:
  - Added `IEAS.sol` with standard `Attestation` struct.
  - Added `ISchemaResolver.sol` and abstract `SchemaResolver.sol`.
- **TypeScript ABI & Deployment Guide**:
  - Added TypeScript ABI artifact `packages/lib/server-only/blockchain/resolver-abi.ts` with schema v2 specification.
  - Added deployment & schema registration helper script `scripts/deploy-crove-resolver.mjs`.

---

## [2026-08-27] - Automated Upstream Release Sync & Container Build Pipeline

### 1. Upstream Sync Workflow (`.github/workflows/sync-upstream.yml`)
- **Automated Upstream Polling**: Runs every 12 hours via cron schedule (and on manual `workflow_dispatch`) to detect new official releases from `documenso/documenso`.
- **Auto-Merge & Brand Patching**:
  - Automatically fetches the target release tag from upstream.
  - Merges into `main`, runs `scripts/patch-crove-branding.mjs` to enforce Crove branding, commits changes, and tags the release.
  - Automatically publishes a GitHub Release in `DOS/Crove-Sign` matching the upstream version.
- **Docker Image Auto-Build**: Tag push triggers `.github/workflows/build-docker.yml` to build and push `ghcr.io/dos/crove-sign:<tag>` and `:latest` to GHCR without deploying to production.

### 2. Local Sync Script (`scripts/sync-upstream.mjs`)
- Added `npm run sync:upstream` command to trigger one-command local sync, merge, and brand patching.

### 3. Database Backup & Disaster Recovery Runbook
- Added automated daily database backup script `scripts/backup-sign-db.sh` (schema `sign` dump with gzip compression and 30-day retention).
- Added restore runbook `scripts/restore-sign-db.sh` for disaster recovery.

---

## [2026-08-25] - Vietnamese Localization & Webhook Queue Dispatcher Phase 2

### 1. Vietnamese (vi) Full Localization
- Added Vietnamese (`vi`) to `SUPPORTED_LANGUAGE_CODES` in `packages/lib/constants/locales.ts` and `SUPPORTED_LANGUAGES` in `packages/lib/constants/i18n.ts`.
- Created full Vietnamese translation catalog `packages/lib/translations/vi/web.po` covering UI components, document signing, recipient flows, template flows, team settings, organization management, and email templates.
- Ready for upstream PR to `documenso/documenso`.

### 2. Webhook Dispatcher Phase 2 (Persistent Queue & Retry)
- **BullMQ Background Processing**:
  - Implemented `internal.process-dos-webhook` job definition (`packages/lib/jobs/definitions/internal/process-dos-webhook.ts`, `process-dos-webhook.handler.ts`).
  - Configured BullMQ retry policy with **5 attempts** and exponential backoff delay starting at 2000ms ($2s \rightarrow 4s \rightarrow 8s \rightarrow 16s \rightarrow 32s$).
- **Idempotency Guard**:
  - Added 10-minute event ID / payload hash cache in `/api/webhooks/dos-org-sync` (`apps/remix/server/api/webhooks/dos-webhook.ts`) to avoid duplicate processing during network retries.

### 3. Automated Test Suite (E2E & Unit)
- **Unit / Integration Tests**:
  - `packages/lib/server-only/dos-id/verify-dos-signature.test.ts`: HMAC-SHA256 signature verification tests.
  - `packages/lib/server-only/dos-id/sync-dos-profile.test.ts`: Role mapping and JIT profile sync tests.
- **E2E Playwright Tests**:
  - `packages/app-tests/e2e/dos-id/dos-webhook-sync.spec.ts`: Live testing of `/api/webhooks/dos-org-sync` endpoint with valid/invalid signatures, and org/member lifecycle events.
  - `packages/app-tests/e2e/dos-id/dos-oidc-auth.spec.ts`: OIDC auth button and callback failure handling tests.

---

## [2026-08-25] - Automated Zero-Conflict Enterprise Brand Patching

### 1. Automated Branding Script (`scripts/patch-crove-branding.mjs`)
- **Automated Lingui PO Translation Patching**:
  - Implemented automated scanning and patching of all 12 localization catalogs in `packages/lib/translations/*/web.po`.
  - Replaces all legacy brand references in `msgstr` (`Documenso` $\rightarrow$ `Crove Sign`, `Documenso, Inc.` $\rightarrow$ `Crove, Inc.`, `support@documenso.com` $\rightarrow$ `support@crove.com`, etc.) while keeping upstream `msgid` source keys intact.
  - Guarantees **Zero Core Conflict** with upstream Documenso component files when merging future upstream updates.
- **PWA Manifests & SVG Assets Automation**:
  - Auto-synchronizes `apps/remix/public/site.webmanifest` and `packages/assets/site.webmanifest` with theme color `#10B981` and app name `Crove Sign`.
  - Generates and maintains standalone SVG components (`branding-logo.tsx`, `branding-logo-icon.tsx`, `favicon.svg`).
- **NPM / Yarn Command**:
  - Added `npm run patch:branding` (`yarn patch:branding`) script to `package.json`.

---

## [2026-08-23] - Hybrid Organization Sync & Production Mainline Release

### 1. Hybrid Organization Sync Architecture (API-First + JIT + Webhook)
- **API-First Organization Delegation**:
  - Integrated `POST https://api.dos.me/organizations` into the `createOrganisationRoute` flow (`packages/trpc/server/organisation-router/create-organisation.ts`).
  - When a user creates an Organization in Crove Sign, the backend delegates creation to DOS.Me Hub using the user's OIDC `access_token` to validate subscription quotas and fan-out webhook events across the entire Crove ecosystem (Crove CRM, Crove Post, Crove Cal, Crove Desk).
  - Automatically maps organization IDs from DOS.Me into the `sign.Organisation` schema.
  - New module: `packages/lib/server-only/dos-id/create-dos-organisation.ts`.
- **Just-In-Time (JIT) Provisioning & Profile Sync**:
  - During OIDC login/linking at `/api/auth/callback/oidc`, the system queries OIDC ID Token and the UserInfo endpoint (`/auth/v1/oauth/userinfo`).
  - Automatically syncs Full Name, downloads and optimizes avatar from `picture` / `avatar_url` into `sign.AvatarImage`.
  - JIT provisions Organizations and default Teams in `sign.Organisation`, with fallback query support against `public.organizations` & `public.org_members` in the shared PostgreSQL database.
  - Modules: `packages/lib/server-only/dos-id/sync-dos-profile.ts`, `packages/auth/server/lib/utils/handle-oauth-callback-url.ts`, `packages/auth/server/lib/utils/open-id.ts`.
- **Real-Time Webhook Listener (`/api/webhooks/dos-org-sync`)**:
  - Mounted Hono router at `POST /api/webhooks/dos-org-sync` (`apps/remix/server/api/webhooks/dos-webhook.ts`, `apps/remix/server/router.ts`).
  - Validates HMAC-SHA256 signatures via header `X-DOS-Signature` with secret `CROVE_DOS_WEBHOOK_SECRET`.
  - Handles events: `organization.created` / `org.created`, `organization.updated` / `org.updated`, `organization.deleted` / `org.deleted`, `organization.member_added` / `org.member_added`, `organization.member_removed` / `org.member_removed`, `user.updated`.
  - Modules: `packages/lib/server-only/dos-id/handle-dos-webhook.ts`, `packages/lib/server-only/dos-id/verify-dos-signature.ts`.

### 2. CI/CD & Production Build
- Added GitHub Actions workflow `.github/workflows/build-docker.yml` to automatically build and push multi-tag container images to GitHub Container Registry (`ghcr.io/dos/crove-sign:latest` and `ghcr.io/dos/crove-sign:dev`).
- Increased Node.js memory limit `ENV NODE_OPTIONS="--max-old-space-size=4096"` in `docker/Dockerfile` to avoid JS heap OOM during TypeScript and React Router production compilation.
- Completed PR #1 merge into `main` branch.

---

## [2026-08-22] - Infrastructure, Schema Isolation & SSO-First Deployment

### 1. Infrastructure & Server Deployment (crove-server / crove-os)
- Migrated production infrastructure to `crove-server` VM in GCP project `crove-os` (`asia-southeast1-b`, IP `34.87.89.118`).
- Configured Docker Compose (`/opt/crove/sign/docker-compose.yml`) running container `ghcr.io/dos/crove-sign:latest` listening on local port `127.0.0.1:4008:3000`.
- Attached container to shared Docker bridge network `crove_postiz-network` enabling Cloudflare Tunnel direct reverse proxying via service name `http://crove-sign:3000`.
- Configured Ingress Rule on Cloudflare Tunnel `Crove-GCP` (`41d183ca-1507-4092-a2e5-a5bd988282ee`) routing public domain **`https://sign.crove.com`**.
- Compose configuration: `docker/compose.crove-server.yml`.

### 2. Database & Schema Isolation
- Connected to Supabase PostgreSQL (`gulptwduchsjcsbndmua`) via Session Pooler: `aws-1-ap-southeast-1.pooler.supabase.com:5432` with `schema=sign&sslmode=no-verify`.
- Resolved Schema Drift in Prisma migrations:
  - `packages/prisma/migrations/20240205120648_create_delete_account/migration.sql`: Removed hardcoded `"public".` references in favor of generic `User`, `Role`, `IdentityProvider`.
  - `packages/prisma/migrations/20250522054049_add_id_generator/migration.sql`: Set `SET search_path = sign, extensions, public` and qualified `extensions.gen_random_bytes(step)` for `nanoid()` and `generate_id()` functions.
- Successfully applied all **163 Prisma migrations** to isolated schema `sign`.

### 3. DOS.Me ID Identity Integration (OIDC SSO-First)
- Direct integration with Supabase Auth OpenID Connect Provider (`https://gulptwduchsjcsbndmua.supabase.co/auth/v1/.well-known/openid-configuration`).
- OAuth Client configuration:
  - `NEXT_PRIVATE_OIDC_CLIENT_ID`: `18790ccb-4d71-48cd-ad24-aee5f3ced3da` (OAuth app `Crove`).
  - `NEXT_PRIVATE_OIDC_CLIENT_SECRET`: Sourced from Secret Manager `CROVE_POSTIZ_OAUTH_CLIENT_SECRET`.
  - `token_endpoint_auth_method`: `client_secret_basic`.
  - Redirect URI: `https://sign.crove.com/api/auth/callback/oidc`.
- Enabled **SSO-First** enforcement:
  - `NEXT_PUBLIC_DISABLE_EMAIL_PASSWORD_SIGNUP=true`
  - `NEXT_PUBLIC_DISABLE_EMAIL_PASSWORD_SIGNIN=true`
  - `NEXT_PUBLIC_DISABLE_OIDC_AUTO_REDIRECT=true`
  - `NEXT_PRIVATE_OIDC_PROVIDER_LABEL="DOS.Me ID"`
- Supported Passkeys and automated Account Linking when matching existing emails.

### 4. System Architecture Documentation
- Initialized comprehensive architecture documentation at `docs/ARCHITECTURE.md` (covering network topology, database schema isolation, OIDC flow, organization sync models, and operations runbook).

---

## [2026-08-21] - Repository Fork & Dev Branch Setup
- Analyzed and audited Documenso v2.17.0 monorepo codebase.
- Created `dev` feature branch and established tracking with `origin/dev`.
