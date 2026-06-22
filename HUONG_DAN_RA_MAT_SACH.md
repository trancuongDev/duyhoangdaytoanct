# Ra mắt bản mới — xóa sạch dữ liệu cũ

## 1. Supabase (bắt buộc)

1. Vào **Supabase Dashboard** → **SQL Editor**
2. Mở file `supabase_reset_ra_mat.sql` trong project
3. Copy toàn bộ → **Run**
4. Cuối script có bảng kiểm tra — tất cả `so_dong` phải là **0** (trừ `app_settings` có 1 dòng `maintenance`)

**Đã xóa:** học sinh, lớp, nhóm/bài học, video, tài liệu, log, cảnh báo, thông báo, file trong bucket `lessons`.

**Giữ lại:** cấu trúc bảng, bucket, API key trong code.

### Nếu lỗi “relation student_classes does not exist”

Chạy lại `truncate` **bỏ dòng** `student_classes,` trong file SQL.

### Nếu lỗi “relation schedules does not exist”

Chạy lại `truncate` **bỏ dòng** `schedules` trong file SQL.

---

## 2. Trình duyệt (admin đăng nhập localStorage)

Tài khoản admin lưu trong **localStorage** từng máy, không nằm Supabase.

Trên máy dùng quản trị:

1. Mở trang đăng nhập LMS
2. `F12` → **Application** (Chrome) / **Storage** (Firefox)
3. **Local Storage** → chọn domain site
4. Xóa các key: `dh_teacher`, `dh_admin_attempts` (hoặc **Clear all**)
5. Reload trang — hệ thống tạo lại admin mặc định theo `index.html`

---

## 3. Session học sinh / admin đang mở

Mọi tab đang đăng nhập: **đăng xuất** hoặc xóa **Session Storage** (`dh_role`, `dh_user`, `dh_token`...) rồi đăng nhập lại.

---

## 4. Backend MySQL (chỉ nếu bạn còn chạy `server/`)

```sql
USE duyhoangtoan;
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE alerts;
TRUNCATE TABLE exams;
TRUNCATE TABLE videos;
TRUNCATE TABLE users;
SET FOREIGN_KEY_CHECKS = 1;
```

Sau đó chạy lại phần `INSERT` tài khoản mặc định trong `server/schema.sql` nếu cần.

---

## 5. Sau khi xóa — làm gì tiếp

1. Tạo lớp học mới (Admin)
2. Tạo nhóm bài học + bài học
3. Thêm học viên
4. Đổi mật khẩu admin ngay sau lần đăng nhập đầu
