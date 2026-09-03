# Crove Sign & Crove Suite Workflow Integration Specification

Tài liệu đặc tả kiến trúc tích hợp luồng hợp đồng, giải pháp UX không ép buộc (Non-intrusive UX) và các mẫu Workflow Automation Templates giữa **Crove Sign** và các sản phẩm trong hệ sinh thái (**Crove CRM / Twenty CRM**, **Crove Desk**, **DOS.Me ID**).

---

## 1. Triết Lý Thiết Kế UX & Kiến Trúc Tách Rời (Modular & Standalone First)

### A. Nguyên tắc Độc lập Tuyệt đối (Independent by Default)
- **Người dùng chỉ dùng Crove CRM (Không dùng Sign)**:
  - Pipeline bán hàng hoạt động hoàn toàn độc lập với các stage tiêu chuẩn: `New`, `Proposal`, `Negotiation`, `Closed Won`, `Closed Lost`.
  - Không có bất kỳ cảnh báo lỗi hay ràng buộc bắt buộc phải có tài khoản Crove Sign.
- **Người dùng chỉ dùng Crove Sign (Không dùng CRM)**:
  - Ký và gửi tài liệu độc lập qua dashboard `https://sign.crove.com`.
- **Người dùng sử dụng Cả Hệ Sinh Thái Crove Suite (Unified Experience)**:
  - Tự động hưởng lợi từ cơ chế **Zero-Latency JIT Claims** và **Event-Driven Automation**:
    - Gửi hợp đồng từ CRM -> Tự động cập nhật trạng thái `Contract Pending`.
    - Khách hàng ký xong trên Sign -> Tự động đóng Deal `Closed Won`, đính kèm file PDF đã ký và link tra cứu Blockchain Verification Receipt.

---

## 2. Event Payload Schemas từ Crove Sign

Crove Sign dispatch sự kiện qua background queue (BullMQ) tới `https://api.dos.me/internal/events/publish`:

### Sự kiện: `contract.completed` / `contract.signed`
```json
{
  "event": "contract.completed",
  "data": {
    "contract_id": "envelope_shbhoshcblcwbulf",
    "envelope_id": "envelope_shbhoshcblcwbulf",
    "document_id": 1001,
    "title": "Hợp Đồng Dịch Vụ - Enterprise Plan",
    "status": "COMPLETED",
    "customer_emails": ["tran.thi.mai@example.com"],
    "primary_customer_email": "tran.thi.mai@example.com",
    "owner_email": "sales.rep@crove.com",
    "org_id": "org_987654321",
    "team_id": 3,
    "artifact_root": "0x4a7e9185a43b...",
    "signers": [
      {
        "email": "tran.thi.mai@example.com",
        "name": "Trần Thị Mai",
        "role": "SIGNER",
        "status": "SIGNED",
        "signed_at": "2026-09-03T07:30:00.000Z"
      }
    ],
    "download_url": "https://sign.crove.com/api/v2/documents/envelope_shbhoshcblcwbulf/download",
    "verification_url": "https://sign.crove.com/articles/verify-document?token=qr_token_abc",
    "completed_at": "2026-09-03T07:30:00.000Z",
    "source": "crove_sign"
  }
}
```

---

## 3. Mẫu Workflow Automation Templates cho Crove CRM (Twenty)

### Template 1: Tự động chốt hợp đồng (Auto-Close Opportunity on Sign)
- **Trigger**: Webhook Event `contract.completed` nhận từ `api.dos.me`.
- **Condition (Bộ lọc)**: `status == "COMPLETED"`.
- **Actions (Hành động)**:
  1. Tìm `Opportunity` có `Contact.email` khớp với `data.primary_customer_email` hoặc có `Contract ID == data.contract_id`.
  2. Cập nhật `Opportunity.stage` -> `CLOSED_WON`.
  3. Lưu `data.download_url` vào trường `Contract PDF URL`.
  4. Lưu `data.verification_url` vào trường `Blockchain Receipt URL`.
  5. Tạo Task cho Account Manager: *"Bàn giao hợp đồng và onboarding khách hàng mới"*.

### Template 2: Đồng bộ Onboarding cho Crove Desk
- **Trigger**: Webhook Event `contract.completed`.
- **Actions**:
  1. Tạo Ticket hỗ trợ mới trong Inbox `Customer Onboarding` với tiêu đề: `[Onboarding] Khách hàng mới - ${data.title}`.
  2. Gán link hợp đồng và danh sách người ký vào nội dung Ticket.

---

## 4. Hướng dẫn thiết lập trên Crove CRM (Twenty)

1. **Thêm Custom Fields cho Object `Opportunity`**:
   - `Contract ID` (`Text`, Optional)
   - `Contract PDF` (`URL`, Optional)
   - `Blockchain Receipt` (`URL`, Optional)
   - `Signed Date` (`DateTime`, Optional)

2. **Kích hoạt Workflow**:
   - Người dùng có thể bật/tắt Template *"Crove Sign Automation"* trong mục **Settings -> Workflows -> Template Library** chỉ với 1 cú click (Toggle Switch).
