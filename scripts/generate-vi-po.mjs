import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const enPoPath = path.join(ROOT_DIR, 'packages', 'lib', 'translations', 'en', 'web.po');
const viPoPath = path.join(ROOT_DIR, 'packages', 'lib', 'translations', 'vi', 'web.po');

// Dictionary of common Documenso/Crove Sign English to Vietnamese phrases
const VI_TRANSLATIONS = {
  // Navigation & Core terms
  "Dashboard": "Bảng điều khiển",
  "Documents": "Tài liệu",
  "Templates": "Mẫu tài liệu",
  "Signatures": "Chữ ký",
  "Settings": "Cài đặt",
  "Inbox": "Hộp thư",
  "Profile": "Hồ sơ cá nhân",
  "Team": "Đội nhóm",
  "Teams": "Các đội nhóm",
  "Organisation": "Tổ chức",
  "Organisations": "Các tổ chức",
  "Organization": "Tổ chức",
  "Organizations": "Các tổ chức",
  "General": "Chung",
  "Members": "Thành viên",
  "Billing": "Thanh toán & Gói dịch vụ",
  "Public Profile": "Hồ sơ công khai",
  "Security": "Bảo mật",
  "Webhooks": "Webhooks",
  "API Tokens": "Mã API Tokens",
  "Email Domains": "Tên miền Email",
  "Custom Branding": "Thương hiệu tùy chỉnh",
  "Branding": "Thương hiệu",
  "Audit Log": "Nhật ký kiểm toán",
  "Audit Logs": "Nhật ký kiểm toán",
  "Support": "Hỗ trợ",
  "Help": "Trợ giúp",

  // Actions
  "Sign In": "Đăng nhập",
  "Sign Up": "Đăng ký",
  "Sign Out": "Đăng xuất",
  "Create Account": "Tạo tài khoản",
  "Create Document": "Tạo tài liệu",
  "Create Template": "Tạo mẫu tài liệu",
  "Create Organisation": "Tạo tổ chức",
  "Create Team": "Tạo đội nhóm",
  "Create Webhook": "Tạo Webhook",
  "Create Token": "Tạo Token",
  "Save": "Lưu",
  "Cancel": "Hủy",
  "Delete": "Xóa",
  "Edit": "Chỉnh sửa",
  "Update": "Cập nhật",
  "Continue": "Tiếp tục",
  "Back": "Quay lại",
  "Next": "Tiếp theo",
  "Finish": "Hoàn thành",
  "Sign": "Ký",
  "Sign Document": "Ký tài liệu",
  "Sign Document - Crove Sign": "Ký tài liệu - Crove Sign",
  "Sign Document - Documenso": "Ký tài liệu - Crove Sign",
  "Send": "Gửi",
  "Send Document": "Gửi tài liệu",
  "Resend": "Gửi lại",
  "Download": "Tải xuống",
  "Preview": "Xem trước",
  "Copy Link": "Sao chép liên kết",
  "Copied!": "Đã sao chép!",
  "Search": "Tìm kiếm",
  "Filter": "Lọc",
  "Upload": "Tải lên",
  "Upload Document": "Tải lên tài liệu",
  "Confirm": "Xác nhận",
  "Accept": "Chấp nhận",
  "Decline": "Từ chối",
  "Reject": "Từ chối",
  "Duplicate": "Nhân bản",

  // Document & Envelope States
  "Draft": "Bản nháp",
  "Pending": "Đang chờ ký",
  "Completed": "Đã hoàn thành",
  "Signed": "Đã ký",
  "Rejected": "Đã từ chối",
  "Cancelled": "Đã hủy",
  "Expired": "Đã hết hạn",

  // Form Fields & Roles
  "Full Name": "Họ và tên",
  "Name": "Tên",
  "Email": "Email",
  "Email Address": "Địa chỉ Email",
  "Password": "Mật khẩu",
  "Current Password": "Mật khẩu hiện tại",
  "New Password": "Mật khẩu mới",
  "Confirm Password": "Xác nhận mật khẩu",
  "Role": "Vai trò",
  "Admin": "Quản trị viên",
  "Manager": "Quản lý",
  "Member": "Thành viên",
  "Owner": "Chủ sở hữu",
  "Signer": "Người ký",
  "Approver": "Người phê duyệt",
  "Viewer": "Người xem",
  "Recipient": "Người nhận",
  "Recipients": "Những người nhận",
  "Signature": "Chữ ký",
  "Initials": "Chữ ký tắt",
  "Date": "Ngày tháng",
  "Text": "Văn bản",
  "Checkbox": "Hộp kiểm",
  "Radio": "Nút chọn",
  "Dropdown": "Menu chọn",

  // Messages & Notifications
  "Welcome to Crove Sign": "Chào mừng bạn đến với Crove Sign",
  "Welcome to Crove Sign!": "Chào mừng bạn đến với Crove Sign!",
  "Welcome to Documenso": "Chào mừng bạn đến với Crove Sign",
  "Welcome to Documenso!": "Chào mừng bạn đến với Crove Sign!",
  "Electronic Signature Disclosure": "Công bố về Chữ ký Điện tử",
  "Your email has been successfully confirmed! You can now use all features of Crove Sign.": "Email của bạn đã được xác nhận thành công! Bạn có thể sử dụng đầy đủ các tính năng của Crove Sign.",
  "Your email has already been confirmed. You can now use all features of Crove Sign.": "Email của bạn đã được xác nhận trước đó. Bạn có thể sử dụng tất cả tính năng của Crove Sign.",
  "This document is available in your Crove Sign account. You can view more details, recipients, and audit logs there.": "Tài liệu này khả dụng trong tài khoản Crove Sign của bạn. Bạn có thể xem thêm chi tiết, người nhận và nhật ký kiểm toán tại đó.",
  "Use API tokens to authenticate with the Crove Sign API.": "Sử dụng API tokens để xác thực với Crove Sign API.",
  "The URL for Crove Sign to send webhook events to.": "URL endpoint để Crove Sign gửi sự kiện webhook đến.",
  "Read our documentation to get started with Crove Sign.": "Đọc tài liệu hướng dẫn để bắt đầu sử dụng Crove Sign.",
  "Return to Crove Sign sign in page here": "Quay lại trang đăng nhập Crove Sign tại đây",
  "Vietnamese": "Tiếng Việt",
  "English": "Tiếng Anh",
  "French": "Tiếng Pháp",
  "German": "Tiếng Đức",
  "Spanish": "Tiếng Tây Ban Nha",
  "Italian": "Tiếng Ý",
  "Dutch": "Tiếng Hà Lan",
  "Polish": "Tiếng Ba Lan",
  "Portuguese (Brazil)": "Tiếng Bồ Đào Nha (Brazil)",
  "Japanese": "Tiếng Nhật",
  "Korean": "Tiếng Hàn",
  "Chinese": "Tiếng Trung",
};

// Generate Vietnamese PO
const enContent = fs.readFileSync(enPoPath, 'utf-8');
const lines = enContent.split('\n');

const viLines = [];
let currentMsgId = '';
let inMsgId = false;
let inMsgStr = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  if (line.startsWith('"Language: en\\n"')) {
    viLines.push('"Language: vi\\n"');
    continue;
  }

  if (line.startsWith('msgid ')) {
    inMsgId = true;
    inMsgStr = false;
    currentMsgId = line.replace('msgid ', '').replace(/^"|"$/g, '');
    viLines.push(line);
  } else if (line.startsWith('msgstr ')) {
    inMsgId = false;
    inMsgStr = true;
    
    // Check if we have exact translation for currentMsgId
    let translated = VI_TRANSLATIONS[currentMsgId];
    if (!translated) {
      // Default to the original string or basic translation
      translated = currentMsgId;
    }
    
    viLines.push(`msgstr "${translated}"`);
  } else if (inMsgStr && line.startsWith('"')) {
    // Continuation of msgstr
    viLines.push(line);
  } else {
    viLines.push(line);
  }
}

const viDir = path.dirname(viPoPath);
if (!fs.existsSync(viDir)) {
  fs.mkdirSync(viDir, { recursive: true });
}

fs.writeFileSync(viPoPath, viLines.join('\n'), 'utf-8');
console.log(`✅ Successfully generated Vietnamese translation catalog: ${viPoPath}`);
