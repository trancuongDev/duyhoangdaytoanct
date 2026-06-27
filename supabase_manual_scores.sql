-- Thêm cột manual_scores để lưu điểm từng câu tự luận
-- Chạy 1 lần trong Supabase SQL Editor

alter table homework_submissions
  add column if not exists manual_scores jsonb default null;
