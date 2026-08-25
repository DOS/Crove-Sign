import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const enPoPath = path.join(ROOT_DIR, 'packages', 'lib', 'translations', 'en', 'web.po');
const viPoPath = path.join(ROOT_DIR, 'packages', 'lib', 'translations', 'vi', 'web.po');

// Dictionary of English to Vietnamese translations for Crove Sign / Documenso
const VI_TRANSLATIONS = new Map([
  ["Default Document Language", "Ngôn ngữ tài liệu mặc định"],
  ["Default document language", "Ngôn ngữ tài liệu mặc định"],
  ["Default Document Visibility", "Quyền hiển thị tài liệu mặc định"],
  ["Default document visibility", "Quyền hiển thị tài liệu mặc định"],
  ["Default Date Format", "Định dạng ngày mặc định"],
  ["Default date format", "Định dạng ngày mặc định"],
  ["Default Email", "Email mặc định"],
  ["Inherit from organisation", "Kế thừa từ tổ chức"],
  ["Inherit from organization", "Kế thừa từ tổ chức"],
  ["Vietnamese", "Tiếng Việt"],
  ["English", "Tiếng Anh"],
  ["French", "Tiếng Pháp"],
  ["German", "Tiếng Đức"],
  ["Spanish", "Tiếng Tây Ban Nha"],
  ["Italian", "Tiếng Ý"],
  ["Dutch", "Tiếng Hà Lan"],
  ["Polish", "Tiếng Ba Lan"],
  ["Portuguese (Brazil)", "Tiếng Bồ Đào Nha (Brazil)"],
  ["Japanese", "Tiếng Nhật"],
  ["Korean", "Tiếng Hàn"],
  ["Chinese", "Tiếng Trung"],
  ["Dashboard", "Bảng điều khiển"],
  ["Documents", "Tài liệu"],
  ["Templates", "Mẫu tài liệu"],
  ["Signatures", "Chữ ký"],
  ["Settings", "Cài đặt"],
  ["Inbox", "Hộp thư"],
  ["Profile", "Hồ sơ cá nhân"],
  ["Team", "Đội nhóm"],
  ["Teams", "Các đội nhóm"],
  ["Organisation", "Tổ chức"],
  ["Organisations", "Các tổ chức"],
  ["Organization", "Tổ chức"],
  ["Organizations", "Các tổ chức"],
  ["General", "Chung"],
  ["Members", "Thành viên"],
  ["Billing", "Thanh toán & Gói dịch vụ"],
  ["Public Profile", "Hồ sơ công khai"],
  ["Security", "Bảo mật"],
  ["Webhooks", "Webhooks"],
  ["API Tokens", "Mã API Tokens"],
  ["Email Domains", "Tên miền Email"],
  ["Custom Branding", "Thương hiệu tùy chỉnh"],
  ["Branding", "Thương hiệu"],
  ["Audit Log", "Nhật ký kiểm toán"],
  ["Audit Logs", "Nhật ký kiểm toán"],
  ["Support", "Hỗ trợ"],
  ["Help", "Trợ giúp"],
  ["Sign In", "Đăng nhập"],
  ["Sign Up", "Đăng ký"],
  ["Sign Out", "Đăng xuất"],
  ["Create Account", "Tạo tài khoản"],
  ["Create Document", "Tạo tài liệu"],
  ["Create Template", "Tạo mẫu tài liệu"],
  ["Create Organisation", "Tạo tổ chức"],
  ["Create Team", "Tạo đội nhóm"],
  ["Create Webhook", "Tạo Webhook"],
  ["Create Token", "Tạo Token"],
  ["Save", "Lưu"],
  ["Cancel", "Hủy"],
  ["Delete", "Xóa"],
  ["Edit", "Chỉnh sửa"],
  ["Update", "Cập nhật"],
  ["Continue", "Tiếp tục"],
  ["Back", "Quay lại"],
  ["Next", "Tiếp theo"],
  ["Finish", "Hoàn thành"],
  ["Sign", "Ký"],
  ["Sign Document", "Ký tài liệu"],
  ["Sign Document - Crove Sign", "Ký tài liệu - Crove Sign"],
  ["Send", "Gửi"],
  ["Send Document", "Gửi tài liệu"],
  ["Resend", "Gửi lại"],
  ["Download", "Tải xuống"],
  ["Preview", "Xem trước"],
  ["Copy Link", "Sao chép liên kết"],
  ["Copied!", "Đã sao chép!"],
  ["Search", "Tìm kiếm"],
  ["Filter", "Lọc"],
  ["Upload", "Tải lên"],
  ["Upload Document", "Tải lên tài liệu"],
  ["Confirm", "Xác nhận"],
  ["Accept", "Chấp nhận"],
  ["Decline", "Từ chối"],
  ["Reject", "Từ chối"],
  ["Duplicate", "Nhân bản"],
  ["Draft", "Bản nháp"],
  ["Pending", "Đang chờ ký"],
  ["Completed", "Đã hoàn thành"],
  ["Signed", "Đã ký"],
  ["Rejected", "Đã từ chối"],
  ["Cancelled", "Đã hủy"],
  ["Expired", "Đã hết hạn"],
  ["Full Name", "Họ và tên"],
  ["Name", "Tên"],
  ["Email", "Email"],
  ["Email Address", "Địa chỉ Email"],
  ["Password", "Mật khẩu"],
  ["Current Password", "Mật khẩu hiện tại"],
  ["New Password", "Mật khẩu mới"],
  ["Confirm Password", "Xác nhận mật khẩu"],
  ["Role", "Vai trò"],
  ["Admin", "Quản trị viên"],
  ["Manager", "Quản lý"],
  ["Member", "Thành viên"],
  ["Owner", "Chủ sở hữu"],
  ["Signer", "Người ký"],
  ["Approver", "Người phê duyệt"],
  ["Viewer", "Người xem"],
  ["Recipient", "Người nhận"],
  ["Recipients", "Những người nhận"],
  ["Signature", "Chữ ký"],
  ["Initials", "Chữ ký tắt"],
  ["Date", "Ngày tháng"],
  ["Text", "Văn bản"],
  ["Checkbox", "Hộp kiểm"],
  ["Radio", "Nút chọn"],
  ["Dropdown", "Menu chọn"],
  ["Welcome to Crove Sign", "Chào mừng bạn đến với Crove Sign"],
  ["Welcome to Crove Sign!", "Chào mừng bạn đến với Crove Sign!"],
  ["Electronic Signature Disclosure", "Công bố về Chữ ký Điện tử"],
  ["Your email has been successfully confirmed! You can now use all features of Crove Sign.", "Email của bạn đã được xác nhận thành công! Bạn có thể sử dụng đầy đủ các tính năng của Crove Sign."],
  ["Your email has already been confirmed. You can now use all features of Crove Sign.", "Email của bạn đã được xác nhận trước đó. Bạn có thể sử dụng tất cả tính năng của Crove Sign."],
  ["This document is available in your Crove Sign account. You can view more details, recipients, and audit logs there.", "Tài liệu này khả dụng trong tài khoản Crove Sign của bạn. Bạn có thể xem thêm chi tiết, người nhận và nhật ký kiểm toán tại đó."],
  ["Use API tokens to authenticate with the Crove Sign API.", "Sử dụng API tokens để xác thực với Crove Sign API."],
  ["The URL for Crove Sign to send webhook events to.", "URL endpoint để Crove Sign gửi sự kiện webhook đến."],
  ["Read our documentation to get started with Crove Sign.", "Đọc tài liệu hướng dẫn để bắt đầu sử dụng Crove Sign."],
  ["Return to Crove Sign sign in page here", "Quay lại trang đăng nhập Crove Sign tại đây"],
]);

const enContent = fs.readFileSync(enPoPath, 'utf-8');

// Parse PO entries cleanly
const entries = [];
const lines = enContent.split('\n');

let currentComments = [];
let currentMsgIdLines = [];
let currentMsgStrLines = [];
let state = 'COMMENTS'; // COMMENTS | MSGID | MSGSTR

for (const line of lines) {
  if (line.startsWith('#') || (line === '' && state === 'COMMENTS')) {
    if (state === 'MSGSTR') {
      entries.push({
        comments: currentComments,
        msgid: currentMsgIdLines,
        msgstr: currentMsgStrLines,
      });
      currentComments = [];
      currentMsgIdLines = [];
      currentMsgStrLines = [];
      state = 'COMMENTS';
    }
    if (line !== '') {
      currentComments.push(line);
    }
  } else if (line.startsWith('msgid ')) {
    if (state === 'MSGSTR') {
      entries.push({
        comments: currentComments,
        msgid: currentMsgIdLines,
        msgstr: currentMsgStrLines,
      });
      currentComments = [];
      currentMsgIdLines = [];
      currentMsgStrLines = [];
    }
    state = 'MSGID';
    currentMsgIdLines.push(line.slice(6));
  } else if (line.startsWith('msgstr ')) {
    state = 'MSGSTR';
    currentMsgStrLines.push(line.slice(7));
  } else if (line.startsWith('"')) {
    if (state === 'MSGID') {
      currentMsgIdLines.push(line);
    } else if (state === 'MSGSTR') {
      currentMsgStrLines.push(line);
    }
  }
}

if (currentMsgIdLines.length > 0) {
  entries.push({
    comments: currentComments,
    msgid: currentMsgIdLines,
    msgstr: currentMsgStrLines,
  });
}

// Convert entries to Vietnamese PO
const outputLines = [];

for (const entry of entries) {
  // Handle header
  const isHeader = entry.msgid.length === 1 && entry.msgid[0] === '""';

  if (entry.comments.length > 0) {
    outputLines.push(...entry.comments);
  }

  outputLines.push(`msgid ${entry.msgid.join('\n')}`);

  if (isHeader) {
    let headerStr = entry.msgstr.join('\n');
    headerStr = headerStr.replace('"Language: en\\n"', '"Language: vi\\n"');
    outputLines.push(`msgstr ${headerStr}`);
    outputLines.push('');
    continue;
  }

  // Extract raw string value of msgid
  const rawMsgId = entry.msgid
    .map((l) => JSON.parse(l))
    .join('');

  if (VI_TRANSLATIONS.has(rawMsgId)) {
    const translated = VI_TRANSLATIONS.get(rawMsgId);
    outputLines.push(`msgstr ${JSON.stringify(translated)}`);
  } else {
    // Keep original string as default fallback
    outputLines.push(`msgstr ${entry.msgstr.join('\n')}`);
  }

  outputLines.push('');
}

const viDir = path.dirname(viPoPath);
if (!fs.existsSync(viDir)) {
  fs.mkdirSync(viDir, { recursive: true });
}

fs.writeFileSync(viPoPath, outputLines.join('\n'), 'utf-8');
console.log(`✅ Cleanly generated valid Vietnamese PO catalog: ${viPoPath}`);
