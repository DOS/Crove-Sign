import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const enPoPath = path.join(ROOT_DIR, 'packages', 'lib', 'translations', 'en', 'web.po');
const viPoPath = path.join(ROOT_DIR, 'packages', 'lib', 'translations', 'vi', 'web.po');

// Comprehensive dictionary for Documenso / Crove Sign e-signing platform
const VI_TRANSLATIONS = new Map([
  // Navigation & Shell
  ["Dashboard", "Bảng điều khiển"],
  ["Documents", "Tài liệu"],
  ["Templates", "Mẫu tài liệu"],
  ["Signatures", "Chữ ký"],
  ["Settings", "Cài đặt"],
  ["Inbox", "Hộp thư"],
  ["Personal Inbox", "Hộp thư cá nhân"],
  ["Profile", "Hồ sơ cá nhân"],
  ["Account", "Tài khoản"],
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
  ["Language", "Ngôn ngữ"],
  ["Preferences", "Tùy chọn"],
  ["Reminders", "Nhắc nhở ký"],
  ["Certificates", "Chứng chỉ & Chứng thư"],
  ["Groups", "Nhóm quyền"],
  ["ORGANISATION SETTINGS", "CÀI ĐẶT TỔ CHỨC"],
  ["TEAM SETTINGS", "CÀI ĐẶT ĐỘI NHÓM"],
  ["ACCOUNT SETTINGS", "CÀI ĐẶT TÀI KHOẢN"],

  // Document Preferences & Settings
  ["Document Preferences", "Tùy chọn tài liệu"],
  ["Document preferences", "Tùy chọn tài liệu"],
  ["Default Document Language", "Ngôn ngữ tài liệu mặc định"],
  ["Default document language", "Ngôn ngữ tài liệu mặc định"],
  ["Default Document Visibility", "Quyền hiển thị tài liệu mặc định"],
  ["Default document visibility", "Quyền hiển thị tài liệu mặc định"],
  ["Default Date Format", "Định dạng ngày mặc định"],
  ["Default date format", "Định dạng ngày mặc định"],
  ["Default Time Zone", "Múi giờ mặc định"],
  ["Default time zone", "Múi giờ mặc định"],
  ["Local timezone", "Múi giờ địa phương"],
  ["Default Signature Settings", "Cài đặt chữ ký mặc định"],
  ["Default signature settings", "Cài đặt chữ ký mặc định"],
  ["Default Recipients", "Người nhận mặc định"],
  ["Default recipients", "Người nhận mặc định"],
  ["Default Email", "Email mặc định"],
  ["Default Email Settings", "Cài đặt Email mặc định"],
  ["Default Envelope Expiration", "Thời hạn gói tài liệu mặc định"],
  ["Default file", "Tệp mặc định"],
  ["Inherit from organisation", "Kế thừa từ tổ chức"],
  ["Inherit from organization", "Kế thừa từ tổ chức"],
  ["Everyone can access and view the document", "Mọi người đều có thể truy cập và xem tài liệu"],
  ["Only recipients and owner can access", "Chỉ người nhận và chủ sở hữu mới có thể truy cập"],
  ["Controls the default visibility of an uploaded document.", "Kiểm soát quyền hiển thị mặc định của tài liệu được tải lên."],
  ["Controls the default language of an uploaded document. This will be used as the language in email communications with the recipients.", "Kiểm soát ngôn ngữ mặc định của tài liệu được tải lên. Ngôn ngữ này sẽ được sử dụng trong các email gửi tới người nhận."],
  ["Controls which signatures are allowed to be used when signing a document.", "Kiểm soát các loại chữ ký được phép sử dụng khi ký tài liệu."],
  ["Recipients that will be automatically added to new documents.", "Những người nhận sẽ được tự động thêm vào các tài liệu mới."],
  ["Type, Draw, Upload", "Nhập chữ, Vẽ, Tải ảnh lên"],
  ["Type", "Nhập chữ"],
  ["Draw", "Vẽ chữ ký"],
  ["Select or enter email address", "Chọn hoặc nhập địa chỉ email"],
  ["Select language", "Chọn ngôn ngữ"],
  ["Select timezone", "Chọn múi giờ"],
  ["Select date format", "Chọn định dạng ngày"],
  ["Select...", "Chọn..."],
  ["Search...", "Tìm kiếm..."],
  ["Search languages...", "Tìm kiếm ngôn ngữ..."],
  ["Search documents", "Tìm kiếm tài liệu"],
  ["Search templates", "Tìm kiếm mẫu tài liệu"],
  ["Search members", "Tìm kiếm thành viên"],
  ["Search webhooks", "Tìm kiếm webhooks"],
  ["Search tokens", "Tìm kiếm mã tokens"],

  // Languages
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

  // Actions & Buttons
  ["Sign In", "Đăng nhập"],
  ["Sign Up", "Đăng ký"],
  ["Sign Out", "Đăng xuất"],
  ["Log In", "Đăng nhập"],
  ["Log Out", "Đăng xuất"],
  ["Create Account", "Tạo tài khoản"],
  ["Create Document", "Tạo tài liệu"],
  ["Create Template", "Tạo mẫu tài liệu"],
  ["Create Organisation", "Tạo tổ chức"],
  ["Create Organization", "Tạo tổ chức"],
  ["Create Team", "Tạo đội nhóm"],
  ["Create Webhook", "Tạo Webhook"],
  ["Create Token", "Tạo Token"],
  ["Save", "Lưu"],
  ["Save Changes", "Lưu thay đổi"],
  ["Save changes", "Lưu thay đổi"],
  ["Cancel", "Hủy"],
  ["Delete", "Xóa"],
  ["Delete Document", "Xóa tài liệu"],
  ["Delete Template", "Xóa mẫu tài liệu"],
  ["Edit", "Chỉnh sửa"],
  ["Update", "Cập nhật"],
  ["Continue", "Tiếp tục"],
  ["Back", "Quay lại"],
  ["Back to home", "Quay lại trang chủ"],
  ["Next", "Tiếp theo"],
  ["Finish", "Hoàn thành"],
  ["Sign", "Ký"],
  ["Sign Document", "Ký tài liệu"],
  ["Sign document", "Ký tài liệu"],
  ["Sign Document - Crove Sign", "Ký tài liệu - Crove Sign"],
  ["Sign Document - Documenso", "Ký tài liệu - Crove Sign"],
  ["Sign Now", "Ký ngay"],
  ["Send", "Gửi"],
  ["Send Document", "Gửi tài liệu"],
  ["Send document", "Gửi tài liệu"],
  ["Resend", "Gửi lại"],
  ["Download", "Tải xuống"],
  ["Download Document", "Tải xuống tài liệu"],
  ["Download Certificate", "Tải xuống chứng chỉ ký"],
  ["Preview", "Xem trước"],
  ["Preview Document", "Xem trước tài liệu"],
  ["Copy Link", "Sao chép liên kết"],
  ["Copied!", "Đã sao chép!"],
  ["Filter", "Lọc"],
  ["Upload", "Tải lên"],
  ["Upload Document", "Tải lên tài liệu"],
  ["Upload PDF", "Tải lên tệp PDF"],
  ["Confirm", "Xác nhận"],
  ["Accept", "Chấp nhận"],
  ["Decline", "Từ chối"],
  ["Reject", "Từ chối"],
  ["Duplicate", "Nhân bản"],
  ["Rename", "Đổi tên"],
  ["Add Recipient", "Thêm người nhận"],
  ["Add Field", "Thêm trường ký"],
  ["Add Field...", "Thêm trường..."],
  ["Add Team", "Thêm đội nhóm"],
  ["Add Member", "Thêm thành viên"],
  ["Invite Member", "Mời thành viên"],
  ["Invite Members", "Mời các thành viên"],
  ["Manage Members", "Quản lý thành viên"],
  ["Manage Teams", "Quản lý đội nhóm"],
  ["Leave Team", "Rời khỏi đội nhóm"],
  ["Leave Organisation", "Rời khỏi tổ chức"],

  // Document Signing View & Fields
  ["Adopt and Sign", "Chấp nhận và Ký"],
  ["Adopt Signature", "Chấp nhận chữ ký"],
  ["Draw Signature", "Vẽ chữ ký"],
  ["Type Signature", "Nhập chữ ký"],
  ["Upload Signature", "Tải lên ảnh chữ ký"],
  ["Clear", "Xóa vẽ lại"],
  ["Clear signature", "Xóa chữ ký vẽ lại"],
  ["Your Signature", "Chữ ký của bạn"],
  ["Your Initials", "Chữ ký tắt của bạn"],
  ["Required", "Bắt buộc"],
  ["Optional", "Tùy chọn"],
  ["Read Only", "Chỉ đọc"],
  ["Read only", "Chỉ đọc"],
  ["Signature Field", "Trường chữ ký"],
  ["Initials Field", "Trường chữ ký tắt"],
  ["Date Field", "Trường ngày tháng"],
  ["Text Field", "Trường văn bản"],
  ["Number Field", "Trường số"],
  ["Checkbox Field", "Trường hộp kiểm"],
  ["Radio Field", "Trường nút chọn"],
  ["Dropdown Field", "Trường danh sách chọn"],
  ["Insert Signature", "Chèn chữ ký"],
  ["Insert Initials", "Chèn chữ ký tắt"],
  ["Insert Date", "Chèn ngày tháng"],
  ["Insert Text", "Chèn văn bản"],
  ["Click to sign", "Nhấn để ký"],
  ["Click to add initials", "Nhấn để thêm chữ ký tắt"],
  ["Click to enter date", "Nhấn để nhập ngày"],
  ["Click to enter text", "Nhấn để nhập văn bản"],

  // Document & Recipient Statuses
  ["Draft", "Bản nháp"],
  ["Pending", "Đang chờ ký"],
  ["Completed", "Đã hoàn thành"],
  ["Signed", "Đã ký"],
  ["Rejected", "Đã từ chối"],
  ["Cancelled", "Đã hủy"],
  ["Expired", "Đã hết hạn"],
  ["Inbox empty", "Hộp thư trống"],
  ["No documents found", "Không tìm thấy tài liệu nào"],
  ["No templates found", "Không tìm thấy mẫu nào"],

  // Form Fields & Roles
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
  ["Number", "Số"],
  ["Radio", "Nút chọn một"],
  ["Checkbox", "Hộp kiểm"],
  ["Dropdown", "Danh sách chọn"],

  // Brand / Crove Ecosystem strings
  ["Welcome to Crove Sign", "Chào mừng bạn đến với Crove Sign"],
  ["Welcome to Crove Sign!", "Chào mừng bạn đến với Crove Sign!"],
  ["Welcome to Documenso", "Chào mừng bạn đến với Crove Sign"],
  ["Welcome to Documenso!", "Chào mừng bạn đến với Crove Sign!"],
  ["Electronic Signature Disclosure", "Công bố về Chữ ký Điện tử"],
  ["Your email has been successfully confirmed! You can now use all features of Crove Sign.", "Email của bạn đã được xác nhận thành công! Bạn có thể sử dụng đầy đủ các tính năng của Crove Sign."],
  ["Your email has already been confirmed. You can now use all features of Crove Sign.", "Email của bạn đã được xác nhận trước đó. Bạn có thể sử dụng tất cả tính năng của Crove Sign."],
  ["This document is available in your Crove Sign account. You can view more details, recipients, and audit logs there.", "Tài liệu này khả dụng trong tài khoản Crove Sign của bạn. Bạn có thể xem thêm chi tiết, người nhận và nhật ký kiểm toán tại đó."],
  ["Use API tokens to authenticate with the Crove Sign API.", "Sử dụng API tokens để xác thực với Crove Sign API."],
  ["The URL for Crove Sign to send webhook events to.", "URL endpoint để Crove Sign gửi sự kiện webhook đến."],
  ["Read our documentation to get started with Crove Sign.", "Đọc tài liệu hướng dẫn để bắt đầu sử dụng Crove Sign."],
  ["Return to Crove Sign sign in page here", "Quay lại trang đăng nhập Crove Sign tại đây"],
  ["An error occurred. Please try again.", "Đã xảy ra lỗi. Vui lòng thử lại."],
  ["Something went wrong.", "Đã có sự cố xảy ra."],
  ["All rights reserved.", "Đã đăng ký bản quyền."],
]);

// Word replacement map
const PHRASE_REPLACEMENTS = [
  [/\bDocument Preferences\b/gi, 'Tùy chọn tài liệu'],
  [/\bDefault Document Language\b/gi, 'Ngôn ngữ tài liệu mặc định'],
  [/\bDefault Document Visibility\b/gi, 'Quyền hiển thị tài liệu mặc định'],
  [/\bDefault Date Format\b/gi, 'Định dạng ngày mặc định'],
  [/\bDefault Time Zone\b/gi, 'Múi giờ mặc định'],
  [/\bDefault Signature Settings\b/gi, 'Cài đặt chữ ký mặc định'],
  [/\bDefault Recipients\b/gi, 'Người nhận mặc định'],
  [/\bDefault Email\b/gi, 'Email mặc định'],
  [/\bInherit from organisation\b/gi, 'Kế thừa từ tổ chức'],
  [/\bInherit from organization\b/gi, 'Kế thừa từ tổ chức'],
  [/\belectronic signature\b/gi, 'chữ ký điện tử'],
  [/\belectronic signatures\b/gi, 'chữ ký điện tử'],
  [/\bdigital signature\b/gi, 'chữ ký số'],
  [/\bdigital signatures\b/gi, 'chữ ký số'],
  [/\baudit log\b/gi, 'nhật ký kiểm toán'],
  [/\baudit logs\b/gi, 'nhật ký kiểm toán'],
  [/\bpublic profile\b/gi, 'hồ sơ công khai'],
  [/\bemail domain\b/gi, 'tên miền email'],
  [/\bemail domains\b/gi, 'tên miền email'],
  [/\bcustom branding\b/gi, 'thương hiệu tùy chỉnh'],
  [/\bAPI token\b/gi, 'mã API token'],
  [/\bAPI tokens\b/gi, 'mã API tokens'],
  [/\bteam settings\b/gi, 'cài đặt đội nhóm'],
  [/\borganisation settings\b/gi, 'cài đặt tổ chức'],
  [/\borganization settings\b/gi, 'cài đặt tổ chức'],
  [/\baccount settings\b/gi, 'cài đặt tài khoản'],
  [/\bterms and conditions\b/gi, 'điều khoản và điều kiện'],
  [/\ball rights reserved\b/gi, 'đã đăng ký bản quyền'],
  [/\bplease try again\b/gi, 'vui lòng thử lại'],
  [/\bplease try again later\b/gi, 'vui lòng thử lại sau'],
  [/\bthis action cannot be undone\b/gi, 'hành động này không thể hoàn tác'],
  [/\bthis action is irreversible\b/gi, 'hành động này không thể đảo ngược'],
  [/\bDocumenso\b/g, 'Crove Sign'],
  [/\bDocumenso, Inc\.\b/g, 'Crove, Inc.'],
];

function translateString(englishStr) {
  if (!englishStr || englishStr.trim() === '') return '';

  // 1. Exact dictionary match
  if (VI_TRANSLATIONS.has(englishStr)) {
    return VI_TRANSLATIONS.get(englishStr);
  }

  const trimmed = englishStr.trim();
  if (VI_TRANSLATIONS.has(trimmed)) {
    return VI_TRANSLATIONS.get(trimmed);
  }

  // 2. Phrase substitutions
  let result = englishStr;
  for (const [from, to] of PHRASE_REPLACEMENTS) {
    result = result.replace(from, to);
  }

  return result;
}

console.log('🔄 Parsing English PO and building comprehensive Vietnamese PO...');

const enContent = fs.readFileSync(enPoPath, 'utf-8');
const lines = enContent.split('\n');

const entries = [];
let currentComments = [];
let currentMsgIdLines = [];
let currentMsgStrLines = [];
let state = 'COMMENTS';

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

console.log(`📊 Found ${entries.length} translation entries.`);

const outputLines = [];
let translatedCount = 0;

for (const entry of entries) {
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

  const rawMsgId = entry.msgid
    .map((l) => JSON.parse(l))
    .join('');

  const translatedText = translateString(rawMsgId);

  if (translatedText && translatedText !== rawMsgId) {
    translatedCount++;
  }

  outputLines.push(`msgstr ${JSON.stringify(translatedText)}`);
  outputLines.push('');
}

const viDir = path.dirname(viPoPath);
if (!fs.existsSync(viDir)) {
  fs.mkdirSync(viDir, { recursive: true });
}

fs.writeFileSync(viPoPath, outputLines.join('\n'), 'utf-8');
console.log(`✅ Finished generating Vietnamese catalog at: ${viPoPath}`);
console.log(`📈 Custom translated count: ${translatedCount} / ${entries.length}`);
