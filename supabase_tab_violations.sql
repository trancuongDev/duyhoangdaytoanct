-- Migration: thêm cột tab_violations và force_submitted vào homework_submissions
-- Chạy 1 lần trong Supabase SQL Editor

alter table homework_submissions
  add column if not exists tab_violations int default null;

-- force_submitted: true nếu bài bị tự động nộp do học sinh tắt tab / hết lượt vi phạm
alter table homework_submissions
  add column if not exists force_submitted boolean default null;
