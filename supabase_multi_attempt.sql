-- Migration: hỗ trợ làm bài nhiều lần
-- Chạy trong Supabase Dashboard → SQL Editor → New query → Run

-- 1. Thêm cột attempt (lần thứ mấy), mặc định 1 cho các bài cũ
alter table homework_submissions
  add column if not exists attempt int not null default 1;

-- 2. Xóa constraint cũ (chỉ cho phép 1 lần)
alter table homework_submissions
  drop constraint if exists homework_submissions_homework_id_username_key;

-- 3. Thêm constraint mới (cho phép nhiều lần, mỗi lần khác attempt)
alter table homework_submissions
  add constraint homework_submissions_homework_id_username_attempt_key
  unique (homework_id, username, attempt);

-- 4. Thêm cột manual_scores nếu chưa có
alter table homework_submissions
  add column if not exists manual_scores jsonb default null;
