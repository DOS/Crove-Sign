# Changelog - Crove Sign

All notable architectural, infrastructure, database, identity, and feature changes for **Crove Sign** (Documenso v2.17.0 fork).

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
