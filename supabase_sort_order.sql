-- Migration: thêm cột sort_order cho bài học
-- Chạy 1 lần trong Supabase SQL Editor

alter table lessons
  add column if not exists sort_order int default 0;

-- Gán sort_order ban đầu theo thứ tự created_at (bài cũ nhất = 1)
update lessons
set sort_order = sub.rn
from (
  select id, row_number() over (
    partition by coalesce(group_name, '')
    order by created_at asc
  ) as rn
  from lessons
) sub
where lessons.id = sub.id;
