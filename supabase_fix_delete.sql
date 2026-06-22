-- ============================================================
-- FIX: Cho phép xóa học sinh từ admin (anon key)
-- Chạy file này trong Supabase Dashboard > SQL Editor
-- ============================================================

-- Cách 1: Tắt RLS hoàn toàn cho bảng students (đơn giản nhất)
alter table students disable row level security;

-- Cách 2: Hoặc nếu muốn giữ RLS, thêm policy cho phép DELETE
-- drop policy if exists "students_allow_delete" on students;
-- create policy "students_allow_delete" on students
--   for delete using (true);

-- Tương tự cho các bảng liên quan khi xóa học sinh
alter table login_logs    disable row level security;
alter table access_logs   disable row level security;
alter table alerts        disable row level security;
alter table announcements disable row level security;
alter table lesson_views  disable row level security;
alter table lesson_favorites disable row level security;
alter table notification_reads disable row level security;
alter table student_classes  disable row level security;
