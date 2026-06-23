# 📚 Hướng Dẫn Sử Dụng & Cài Đặt
## DHDT LMS v1.4.5

---

## 🗂 Tổng quan hệ thống

Đây là hệ thống quản lý học tập (LMS) dành cho trung tâm dạy học tư nhân, gồm:

- **Trang đăng nhập** (`index.html`) — dùng chung cho admin và học sinh
- **Trang học sinh** (`student.html`) — xem bài học, video, tài liệu
- **Trang quản trị** (`admin.html`) — quản lý toàn bộ hệ thống
- **Backend Supabase** — database, auth, storage (đang dùng chính)
- **Backend Node.js** (`server/`) — phiên bản cũ, không dùng chính

---

## ⚙️ Cài đặt Supabase (Backend chính)

### Bước 1 — Tạo tài khoản Supabase
Truy cập [https://supabase.com](https://supabase.com) → Đăng ký miễn phí → Tạo project mới.

### Bước 2 — Tạo database
Vào **SQL Editor** trong Supabase Dashboard, copy toàn bộ nội dung file `supabase_schema.sql` và chạy.

File này sẽ tạo các bảng:
| Bảng | Mô tả |
|---|---|
| `students` | Tài khoản học sinh |
| `classes` | Lớp học |
| `lessons` | Bài học |
| `lesson_groups` | Nhóm bài học |
| `lesson_videos` | Video bài giảng |
| `lesson_docs` | Tài liệu học tập |
| `alerts` | Nhật ký cảnh báo |
| `access_logs` | Lịch sử truy cập |
| `announcements` | Thông báo |
| `lesson_views` | Video đã xem |
| `lesson_favorites` | Bài học yêu thích |
| `notification_reads` | Thông báo đã đọc |

### Bước 3 — Tạo Storage Bucket
Vào **Storage** → Tạo bucket tên `lessons`, bật **Public**.

### Bước 4 — Lấy API Key
Vào **Settings > API**, copy:
- `Project URL`
- `anon public key`

### Bước 5 — Cập nhật API Key vào code
Mở file `index.html`, tìm đoạn:
```js
const db = createClient(
  'https://xxx.supabase.co',
  'eyJ...'
);
```
Thay bằng URL và key của bạn. Làm tương tự trong `student.js`, `admin.js`, `supabase.js`.

---

## 🌐 Deploy Frontend (Hosting)

### Cách 1 — GitHub Pages (miễn phí)
1. Tạo repository trên GitHub
2. Upload toàn bộ file lên (trừ thư mục `server/`)
3. Vào **Settings > Pages** → chọn branch `main` → Save
4. Truy cập theo link GitHub Pages được cấp

### Cách 2 — Netlify (miễn phí)
1. Truy cập [https://netlify.com](https://netlify.com)
2. Kéo thả thư mục dự án vào Netlify
3. Trang web sẽ live ngay lập tức

### Cách 3 — Chạy local
Mở trực tiếp file `index.html` bằng trình duyệt, hoặc dùng extension **Live Server** trong VS Code.

---

## 👤 Tài khoản Admin

Tài khoản admin được lưu trong `localStorage` của trình duyệt khi lần đầu truy cập.

**Thông tin mặc định:**
| Trường | Giá trị |
|---|---|
| Tên đăng nhập | `admin` |
| Mật khẩu | `admindH89065` |

> ⚠️ Đổi mật khẩu ngay sau khi đăng nhập lần đầu tại trang **Hồ sơ > Đổi mật khẩu**.

---

## 📖 Hướng dẫn sử dụng Admin

### Thêm lớp học
**Quản trị > Lớp học > Tạo lớp** → Nhập tên lớp, ngày khai giảng, ngày kết thúc.

### Thêm học sinh
**Quản trị > Thêm học viên mới** → Điền đầy đủ thông tin:
- Họ tên, SĐT, Gmail (dùng để đăng nhập)
- Chọn lớp, ngày hết hạn tài khoản
- Mật khẩu tự động tạo theo mã học viên

Sau khi lưu, hệ thống hiển thị thông tin tài khoản để gửi cho học sinh.

### Thêm bài học
1. **Nhóm bài học > Tạo nhóm** — tạo nhóm trước (VD: Chương 1, Chương 2)
2. **Bài học > Tạo bài học** — chọn nhóm, gán lớp
3. Vào chi tiết bài học → **Thêm video** hoặc **Thêm tài liệu**

### Gửi thông báo
**Thông báo > Tạo thông báo mới** → Chọn gửi theo lớp hoặc học sinh cụ thể.

### Khóa / Mở khóa tài khoản
**Danh sách học sinh** → Nhấn nút khóa/mở khóa bên cạnh tên học sinh.

---

## 📱 Hướng dẫn sử dụng Học sinh

### Xin cấp tài khoản học tập

> 📌 Học viên mới vui lòng nhắn tin riêng để xin cấp tài khoản học trên web. Link website đã được ghim trên nhóm.

Khi nhắn tin, vui lòng gửi đầy đủ theo đúng thứ tự bên dưới:

**1️⃣ Tin nhắn đầu tiên:**
> "Xin cấp tài khoản học tập trên web"

**2️⃣ Gửi riêng 2 dòng:**
```
Dòng 1: Số điện thoại
Dòng 2: Gmail
```

❌ Không ghi chung một dòng  
❌ Không ghi chữ "SĐT" hoặc "Gmail" phía trước  
❌ Không gửi thiếu thông tin  

⚠️ Những trường hợp gửi sai mẫu, ghi thiếu, nhắn không rõ nội dung hoặc spam sẽ được trả lời chậm hơn do hệ thống cần kiểm tra lại.

---

### Đăng nhập
- Dùng **Gmail** và **mật khẩu** được cấp bởi trợ lý
- Mỗi tài khoản chỉ đăng nhập được **1 thiết bị** tại một thời điểm

### Xem bài học
**Bài học** → Chọn nhóm → Chọn bài → Xem video hoặc tài liệu

### Cài app về máy (PWA)
Trên trình duyệt Chrome/Safari → Nhấn **"Tải app về máy"** hoặc **"Add to Home Screen"**

---

## 🔧 Cài đặt Backend Node.js (tuỳ chọn, không bắt buộc)

> Backend Node.js là phiên bản cũ. Hệ thống hiện dùng Supabase. Chỉ cài nếu cần.

### Yêu cầu
- Node.js LTS ([https://nodejs.org](https://nodejs.org))
- MySQL 8.0+ hoặc XAMPP

### Các bước
```bash
# 1. Tạo database MySQL
# Mở phpMyAdmin hoặc MySQL Workbench, chạy file:
server/schema.sql

# 2. Cài thư viện
cd server
npm install

# 3. Tạo file cấu hình
copy .env.example .env
# Mở .env, điền thông tin MySQL:
# DB_HOST=localhost
# DB_USER=root
# DB_PASS=your_password
# DB_NAME=duyhoangtoan
# JWT_SECRET=your_secret_key

# 4. Chạy server
npm start
# Server chạy tại http://localhost:3000
```

**Tài khoản mặc định (MySQL):**
| Vai trò | Tên đăng nhập | Mật khẩu |
|---|---|---|
| Giáo viên | `duyhoangtoan` | `admin123` |
| Trợ lý | `trolytoan` | `tro123` |

---

## 🚨 Lưu ý bảo mật quan trọng

- **Đổi mật khẩu admin** ngay sau khi cài đặt
- **Không chia sẻ API key** Supabase công khai
- Mỗi học sinh chỉ được dùng **1 thiết bị** — đăng nhập thiết bị mới sẽ đẩy thiết bị cũ ra
- Hệ thống ghi log toàn bộ hoạt động đăng nhập và truy cập nội dung

---

## 📞 Hỗ trợ kỹ thuật

Liên hệ người phát triển để được hỗ trợ cài đặt và vận hành.

---

*DHDT LMS v1.4.5 — Cần Thơ*
