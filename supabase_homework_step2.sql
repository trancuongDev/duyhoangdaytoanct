-- ============================================================
-- BƯỚC 2: Chạy file này SAU khi bước 1 đã thành công
-- Bật Realtime cho 3 bảng
-- (Chạy từng dòng một nếu gặp lỗi)
-- ============================================================

alter publication supabase_realtime add table homework;
alter publication supabase_realtime add table homework_questions;
alter publication supabase_realtime add table homework_submissions;
