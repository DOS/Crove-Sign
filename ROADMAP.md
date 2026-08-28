# Crove Sign - Product & Technical Roadmap

Lộ trình phát triển và hoàn thiện nền tảng Ký kết Điện tử Doanh nghiệp **Crove Sign** (Documenso Fork) tích hợp sâu trong Hệ sinh thái **Crove OS** và **DOS.Me**.

---

## 🧭 Tổng quan Tiến độ (Progress Overview)

```
[Phase 1: Foundation & SSO]          ████████████████████ 100% Hoàn thành
[Phase 2: Hybrid Org Sync & Events]   ████████████████████ 100% Hoàn thành
[Phase 3: Brand & Upstream Engine]    ████████████████████ 100% Hoàn thành
[Phase 4: Multi-Language & Backup]    ████████████████████ 100% Hoàn thành
[Phase 5: PoC EAS Attestation]        ░░░░░░░░░░░░░░░░░░░░  Ready for Testnet PoC
[Phase 6: Multi-Chain & QES/CloudHSM] ░░░░░░░░░░░░░░░░░░░░  Planned
```

---

## 🎯 Chi tiết các Giai đoạn (Milestones)

### ✅ Giai đoạn 1: Nền tảng, Hạ tầng & Đăng nhập Tập trung (Completed)
- [x] **Hạ tầng Container & Schema Isolation**: Triển khai Docker trên GCP VM (`crove-server`), kết nối Supabase Postgres phân vùng schema `sign` độc lập với 163 bảng và extension `pgcrypto`.
- [x] **SSO-First via DOS.Me ID**: Tích hợp OpenID Connect (OIDC) với Authorization Code + PKCE, ánh xạ claims profile (`name`, `email`, `picture`).
- [x] **Định tuyến An toàn**: Cấu hình Cloudflare Tunnel `Crove-GCP` trỏ về domain `https://sign.crove.com`.

---

### ✅ Giai đoạn 2: Kiến trúc Đồng bộ Tổ chức 2 Chiều & Webhook Queue (Completed)
- [x] **Inbound JIT Provisioning**: Tự động tạo và cập nhật Tổ chức/Nhóm quyền trong `sign.Organisation` khi user đăng nhập qua OIDC ID Token & UserInfo.
- [x] **Outbound API Delegation**: Khi user bấm tạo Organization trong app, backend ủy quyền gọi `POST https://api.dos.me/organizations` để kiểm tra gói cước và nhận ID chuẩn hóa toàn hệ sinh thái.
- [x] **Webhook Ingress (`/api/webhooks/dos-org-sync`)**:
  - Xác thực chữ ký HMAC-SHA256 qua header `X-DOS-Signature`.
  - Hỗ trợ đầy đủ vòng đời: `organization.created`, `updated`, `deleted`, `member_added`, `member_removed`, `user.updated`.
  - Cơ chế Idempotency Cache 10 phút chống trùng lặp.
- [x] **Background Queue Phase 2**: Xử lý qua BullMQ (`internal.process-dos-webhook`) với 5 lần thử lại Exponential Backoff.
- [x] **Ecosystem Event Dispatcher**: Phát sự kiện nghiệp vụ sang Event Router (`api.dos.me/internal/events/publish`) để CRM và Desk cập nhật trạng thái hợp đồng.

---

### ✅ Giai đoạn 3: White-Labeling & Tự động hóa Sync Upstream (Completed)
- [x] **Zero-Conflict Brand Patching (`scripts/patch-crove-branding.mjs`)**: Tự động thay thế thương hiệu trên 12 catalog Lingui PO, PWA manifests, và SVG assets mà không sửa đè React components gốc.
- [x] **Upstream Release Watcher (`.github/workflows/sync-upstream.yml`)**: Tự động quét release mới từ `documenso/documenso` mỗi 12 tiếng, merge vào `main`, patch branding và tạo release tương ứng.
- [x] **Multi-tag Container Build (`.github/workflows/build-docker.yml`)**: Tự động build và push container image lên GHCR (`:latest`, `:dev`, `:v*`) khi có release tag mà không tự ý deploy đè lên production VM.

---

### ✅ Giai đoạn 4: Đa ngôn ngữ Tiếng Việt & Disaster Recovery (Completed)
- [x] **Tiếng Việt Toàn diện (`vi`)**:
  - Thêm `vi` vào `SUPPORTED_LANGUAGE_CODES` và `SUPPORTED_LANGUAGES`.
  - Hoàn thiện catalog `packages/lib/translations/vi/web.po` với 3.157 chuỗi dịch chuyên ngành e-signature (Document Preferences, Signature Pad, Audit Logs, Recipients, Settings).
  - Đóng góp mở PR chính thức lên upstream Documenso: [PR #3307](https://github.com/documenso/documenso/pull/3307).
- [x] **Tự động hóa Sao lưu & Phục hồi CSDL**:
  - Script `scripts/backup-sign-db.sh`: Dump schema `sign` qua `postgres:17-alpine`, nén gzip và tự động dọn dẹp bản sao lưu cũ quá 30 ngày.
  - Script `scripts/restore-sign-db.sh`: Phục hồi dữ liệu tức thời từ file dump nén.
  - Cấu hình Cronjob chạy tự động 03:00 UTC (10:00 AM UTC+7) hàng ngày trên `crove-server`.

---

### ⏳ Giai đoạn 5: PoC Blockchain Integrity Receipt trên DOS Chain Testnet (Next Phase)
- [ ] **Xác minh EAS Testnet & Benchmark**: Đo thời gian inclusion, gas cost thực tế trên DOS Chain Testnet.
- [ ] **Smart Contract `CroveAttestationResolver.sol`**:
  - Duy trì mapping on-chain `documentHash => bytes32[] UIDs` phục vụ tra cứu ngược tức thời.
  - Access control chỉ cho phép dedicated signer wallet của Crove Sign phát hành attestation.
- [ ] **Transactional Outbox & Nonce Coordinator**:
  - Tạo bảng `sign.BlockchainAnchor` ghi nhận trạng thái `PENDING -> SUBMITTED -> CONFIRMED` trong cùng transaction hoàn thành tài liệu.
  - Quản lý nonce giao dịch tuần tự cho ví phát hành.
- [ ] **RFC 8785 JSON Canonicalization (JCS)**: Chuẩn hóa thứ tự key và format của audit trail trước khi tạo `auditRoot` hash.
- [ ] **Trang Tra cứu Độc lập (Public Verification Portal)**:
  - Cho phép người dùng kéo thả file PDF bất kỳ để kiểm tra SHA-256 hash trực tiếp từ trình duyệt Web Crypto API.
  - Hiển thị chính xác tính toàn vẹn và bằng chứng block height trên DOS Chain.

---

### 🔮 Giai đoạn 6: Đa chuỗi & Chuẩn Hóa Pháp Lý Nâng Cao (Future Roadmap)
- [ ] **Multi-Chain Portability**: Cấu hình mở rộng attestation sang các Layer 2 EVM (Base, Arbitrum, Optimism) và Arweave/Sign Protocol.
- [ ] **Dịch vụ Dấu thời gian Pháp lý (Qualified Electronic Timestamp)**: Tích hợp với đơn vị cung cấp dịch vụ tin cậy được cấp phép theo Nghị định 23/2025/NĐ-CP và Luật Giao dịch điện tử 20/2023/QH15.
- [ ] **Cloud HSM & QES Hardware Signatures**: Hỗ trợ ký số doanh nghiệp qua Google Cloud KMS / AWS CloudHSM tuân thủ tiêu chuẩn PAdES LTV.
