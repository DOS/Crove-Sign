# Kiến Trúc Hệ Thống Crove Sign (Crove OS)

Tài liệu mô tả kiến trúc kỹ thuật, luồng dữ liệu, hạ tầng mạng, cơ sở dữ liệu và cơ chế tích hợp định danh (Identity & SSO) của **Crove Sign** trong hệ sinh thái **Crove OS / DOS.Me**.

---

## 1. Tổng Quan Hệ Thống

**Crove Sign** là dịch vụ ký tài liệu số điện tử (e-Signature Engine) của hệ sinh thái Crove, được xây dựng dựa trên core Documenso v2.17.0 (React Router v7 / Remix + Hono + Prisma + PDF Signing Engine).

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

## 2. Hạ Tầng & Mạng (Infrastructure & Network)

### 2.1. Máy Chủ Ứng Dụng (Cloud VM)
- **GCP Project**: `crove-os` (Project Number: `352034351652`, Organization: Tingee).
- **Instance**: `crove-server` (`asia-southeast1-b`).
- **Cấu hình**: `e2-standard-2` (2 vCPU, 8GB RAM), 50GB Boot Disk.
- **Docker Compose Stack**: Đặt tại `/opt/crove/sign/docker-compose.yml`, expose local port `127.0.0.1:4008:3000`.

### 2.2. Định Tuyến & Tên Miền (Cloudflare Zero Trust)
- **Tên miền công khai**: `https://sign.crove.com`.
- **Cloudflare Tunnel**: `Crove-GCP` (Tunnel ID: `41d183ca-1507-4092-a2e5-a5bd988282ee`).
- **Ingress Rule**:
  ```yaml
  - hostname: sign.crove.com
    service: http://crove-sign:3000
    originRequest:
      httpHostHeader: sign.crove.com
  ```
- **Docker Network**: Container `crove-sign` gắn vào `crove_postiz-network` để `crove-cloudflared` phân giải DNS nội bộ trực tiếp qua service name `crove-sign`.

---

## 3. Kiến Trúc Cơ Sở Dữ Liệu (Database Architecture)

Crove Sign sử dụng chung cụm PostgreSQL quản trị bởi Supabase (`gulptwduchsjcsbndmua`) nhưng được **cô lập hoàn toàn ở cấp độ Schema (Schema-level Multi-Tenancy)**:

| Thông số | Giá trị |
| :--- | :--- |
| **Schema Name** | `sign` (Độc lập với `public`, `cal`, `post`, `crm`, `dosai`, `dosafe`) |
| **Prisma Migrations** | 163 migrations áp dụng thành công trong schema `sign` |
| **Connection Endpoint** | `aws-1-ap-southeast-1.pooler.supabase.com:5432` |
| **Connection String** | `postgresql://postgres.gulptwduchsjcsbndmua:<DB_PASSWORD>@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?schema=sign&sslmode=no-verify` |
| **Cơ chế mở rộng ID** | Tích hợp hàm `sign.nanoid()` và `sign.nanoid_optimized()` sử dụng extension `extensions.pgcrypto` |

### 3.1. Các bảng dữ liệu cốt lõi
- `sign.User`: Thông tin người dùng e-sign (map theo `email` hoặc `sub` từ DOS ID).
- `sign.Account`: Liên kết tài khoản OAuth/OIDC với `provider = 'oidc'`, `providerAccountId = sub`.
- `sign.Organisation` & `sign.OrganisationMember`: Tổ chức, quyền hạn thành viên, branding, seat limits.
- `sign.Team` & `sign.TeamMember`: Nhóm làm việc trong tổ chức.
- `sign.Envelope` & `sign.EnvelopeItem`: Tài liệu ký (PDF), trạng thái hoàn thành, audit trail.
- `sign.Recipient` & `sign.Field` & `sign.Signature`: Người nhận, tọa độ các ô ký/text/date và chữ ký số.

---

## 4. Định Danh & Xác Thực (Authentication & SSO)

Crove Sign triển khai mô hình **SSO-First** tập trung về **DOS.Me ID** qua giao thức chuẩn **OpenID Connect (OIDC)**:

### 4.1. Thông số Cấu Hình OIDC
- **Provider**: DOS.Me ID (Supabase Auth OpenID Connect Provider).
- **Well-Known Discovery**: `https://gulptwduchsjcsbndmua.supabase.co/auth/v1/.well-known/openid-configuration`.
- **Client ID**: `18790ccb-4d71-48cd-ad24-aee5f3ced3da` (OAuth Client `Crove`).
- **Token Endpoint Auth Method**: `client_secret_basic` (Authorization Basic header).
- **Scopes**: `openid profile email offline_access`.
- **Redirect / Callback URI**: `https://sign.crove.com/api/auth/callback/oidc`.
- **Prompt**: `consent`.

### 4.2. Luồng Đăng Nhập (OIDC Authorization Code Flow with PKCE)

```
User -> Browser               Crove Sign (App)             DOS.Me ID (Supabase Auth)
     │                               │                                     │
     ├──── Bấm "DOS.Me ID" ─────────>│                                     │
     │                               ├─ Tạo state & PKCE code_verifier ───>│
     │                               ├─ Redirect sang /oauth/authorize ────┤
     │<── Redirect 302 ──────────────┤                                     │
     │                                                                     │
     ├──── Đăng nhập / Cấp quyền trên id.dos.me ──────────────────────────>│
     │                                                                     │
     │<── Callback 302 về /api/auth/callback/oidc?code=...&state=... ──────┤
     │                                                                     │
     ├──── Gửi code & state ────────>│                                     │
     │                               ├─ Gửi Token Request (Basic Auth) ───>│
     │                               │<─ Trả về Access Token + ID Token ───┤
     │                               │                                     │
     │                               ├─ Decode ID Token (sub, email, name) │
     │                               ├─ Upsert User & Account in DB (sign) │
     │                               ├─ Tạo Session Cookie                 │
     │<── Redirect 302 về Dashboard ─┤                                     │
```

### 4.3. Chính sách SSO-First (Cài đặt môi trường)
```ini
# Vô hiệu hóa form đăng ký/đăng nhập local bằng mật khẩu:
NEXT_PUBLIC_DISABLE_EMAIL_PASSWORD_SIGNUP=true
NEXT_PUBLIC_DISABLE_EMAIL_PASSWORD_SIGNIN=true

# Giữ trang signin hiển thị nút DOS.Me ID & Passkey:
NEXT_PUBLIC_DISABLE_OIDC_AUTO_REDIRECT=true
NEXT_PRIVATE_OIDC_SKIP_VERIFY=true
NEXT_PRIVATE_OIDC_PROVIDER_LABEL="DOS.Me ID"
```

---

## 5. Kiến Trúc Đồng Bộ Tổ Chức (Organization Synchronization)

Hệ sinh thái Crove OS áp dụng mô hình **Hybrid Organization Sync** để quản lý đa tổ chức nhất quán:

```
                      ┌───────────────────────────────┐
                      │    DOS.Me Core Workspace      │
                      │ (public.organizations / roles)│
                      └───────────────┬───────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
              ▼ (JIT / Claims)        ▼ (OIDC Claims)         ▼ (JIT / Webhook)
    ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
    │    Crove Sign    │    │    Crove Post    │    │    Crove CRM     │
    │  (schema: sign)  │    │  (schema: post)  │    │  (schema: core)  │
    └──────────────────┘    └──────────────────┘    └──────────────────┘
```

1. **Just-In-Time (JIT) Provisioning**:
   - Khi người dùng đăng nhập lần đầu qua DOS.Me ID, Crove Sign tự động tạo bản ghi `User` và `Personal Organisation` + `Personal Team`.
   - Nếu email đã tồn tại trước đó, hệ thống thực hiện **Account Linking** tự động liên kết `providerAccountId` (`sub`) vào user đó.
2. **Organization Claims Sync**:
   - ID Token / UserInfo mang thông tin `organization_id` và `role` từ DOS.Me.
   - Callback Auth tiến hành cập nhật/tạo tổ chức doanh nghiệp tương ứng và gán vai trò (`ADMIN` hoặc `MEMBER`) trong schema `sign`.
3. **Webhook Lifecycle (Phase 2)**:
   - Lắng nghe sự kiện `organization.created`, `organization.member_added`, `organization.member_removed` từ DOS.Me để đồng bộ trạng thái thành viên theo thời gian thực.

---

## 6. Danh Mục Biến Môi Trường Sản Xuất (`/opt/crove/sign/.env`)

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

## 7. Quy Trình Vận Hành & Khôi Phục (Operations & Runbook)

### 7.1. Khởi động / Khởi động lại dịch vụ
```bash
cd /opt/crove/sign
sudo docker compose up -d
sudo docker compose restart
```

### 7.2. Kiểm tra trạng thái & Healthcheck
```bash
# Kiểm tra container status
docker ps --filter name=crove-sign

# Kiểm tra log ứng dụng
docker logs --tail 50 crove-sign

# Kiểm tra endpoint sức khỏe
curl -s http://127.0.0.1:4008/api/health
```

### 7.3. Cập nhật Ingress Tunnel khi cần
- File cấu hình Cloudflare Tunnel: `/opt/crove/tunnel/config.yml`.
- Sau khi chỉnh sửa, khởi động lại connector:
  ```bash
  cd /opt/crove
  sudo docker compose -f docker-compose.prod.yaml restart cloudflared
  ```
