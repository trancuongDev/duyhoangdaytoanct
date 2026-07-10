-- Migration: thêm cột cho phép tải đề bài (không có đáp án)
-- Chạy 1 lần trong Supabase SQL Editor

alter table homework
  add column if not exists allow_download boolean default false,
  add column if not exists attach_url     text    default null,
  add column if not exists attach_name    text    default null;

-- allow_download: true = học sinh được tải file đề về
-- attach_url: link file đề (PDF/image) upload lên storage
-- attach_name: tên file hiển thị
