-- ============================================================
-- CHAY_SQL_ALLOWED_STUDENTS.sql
-- Chạy toàn bộ file này trong Supabase SQL Editor
-- ============================================================

-- 1. Thêm cột allowed_usernames vào bảng lessons
ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS allowed_usernames TEXT DEFAULT NULL;

-- 2. Thêm cột allowed_usernames vào bảng lesson_groups
ALTER TABLE lesson_groups
  ADD COLUMN IF NOT EXISTS allowed_usernames TEXT DEFAULT NULL;

-- 3. Tạo bảng assistants (tài khoản trợ lý)
CREATE TABLE IF NOT EXISTS assistants (
  id         BIGSERIAL PRIMARY KEY,
  username   TEXT NOT NULL UNIQUE,
  password   TEXT NOT NULL,
  full_name  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE assistants DISABLE ROW LEVEL SECURITY;

-- 4. Backup mật khẩu admin vào app_settings (phòng khi clear browser)
-- Giá trị sẽ được cập nhật tự động từ code khi đổi mật khẩu
INSERT INTO app_settings (key, value)
  VALUES ('admin_password_hash', '')
  ON CONFLICT (key) DO NOTHING;

-- 5. Thêm cột allowed_usernames vào bảng homework (gán bài tập cho học sinh cụ thể)
ALTER TABLE homework
  ADD COLUMN IF NOT EXISTS allowed_usernames TEXT DEFAULT NULL;

COMMENT ON COLUMN lessons.allowed_usernames IS
  'Danh sách Gmail học sinh được xem bài, phân cách bởi dấu phẩy. NULL = theo class_name.';
COMMENT ON COLUMN lesson_groups.allowed_usernames IS
  'Danh sách Gmail học sinh được xem nhóm, phân cách bởi dấu phẩy. NULL = theo class_name.';
COMMENT ON COLUMN homework.allowed_usernames IS
  'Danh sách Gmail học sinh được làm bài tập, phân cách bởi dấu phẩy. NULL = theo class_name.';
