-- ============================================================
-- LỊCH HỌC V2 — Bảng schedule_slots (thay thế schedules)
-- Chạy trong Supabase Dashboard > SQL Editor
-- ============================================================

-- Bảng lịch học theo slot từng ngày trong tuần
create table if not exists schedule_slots (
  id           bigint generated always as identity primary key,
  week_start   date not null,          -- Ngày thứ 2 của tuần (VD: 2025-06-30)
  day_of_week  int  not null,          -- 2=Thứ 2, 3=Thứ 3, ..., 8=Chủ Nhật
  class_name   text default null,      -- null = tất cả lớp
  session      text not null,          -- 'sáng' | 'chiều' | 'tối'
  start_time   time not null,          -- VD: 08:00
  end_time     time not null,          -- VD: 10:00
  subject      text not null,          -- Nội dung buổi học
  notes        text default null,      -- Ghi chú thêm
  created_at   timestamptz default now()
);

alter table schedule_slots disable row level security;

-- Bật Realtime để học viên nhận lịch mới tức thì
alter publication supabase_realtime add table schedule_slots;

-- Migration: giữ lại bảng schedules cũ (ảnh) — không xóa để không mất dữ liệu
-- Bảng schedules cũ vẫn tồn tại nhưng UI sẽ dùng schedule_slots

-- Index để query nhanh theo tuần + lớp
create index if not exists idx_schedule_slots_week on schedule_slots(week_start);
create index if not exists idx_schedule_slots_class on schedule_slots(class_name);
