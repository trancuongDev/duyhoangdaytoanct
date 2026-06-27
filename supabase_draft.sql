-- Thêm cột is_draft để lưu bài nháp (chưa giao cho học sinh)
-- Chạy trong Supabase Dashboard → SQL Editor → New query → Run

alter table homework
  add column if not exists is_draft boolean not null default false;
