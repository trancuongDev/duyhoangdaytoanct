-- ============================================================
-- MIGRATION: Bảng giao bài tập (homework)
-- Chạy file này trong Supabase SQL Editor
-- ============================================================

-- Bảng bài tập
create table if not exists homework (
  id           bigint generated always as identity primary key,
  title        text not null,
  description  text,
  class_name   text default null,     -- null = tất cả lớp
  due_date     date default null,     -- Hạn nộp
  attach_url   text default null,     -- Link tệp đính kèm (Drive, PDF...)
  attach_text  text default null,     -- Tên hiển thị của link
  created_by   text default null,
  created_at   timestamptz default now()
);
alter table homework disable row level security;
alter publication supabase_realtime add table homework;

-- Bảng nộp bài
create table if not exists homework_submissions (
  id           bigint generated always as identity primary key,
  homework_id  bigint references homework(id) on delete cascade,
  username     text not null,
  student_name text,
  class_name   text,
  submit_url   text default null,     -- Link nộp bài (Drive, ảnh...)
  note         text default null,     -- Ghi chú của học sinh
  status       text default 'submitted',  -- 'submitted' | 'graded' | 'returned'
  score        numeric(5,2) default null, -- Điểm (nếu chấm)
  feedback     text default null,     -- Nhận xét của giáo viên
  submitted_at timestamptz default now(),
  graded_at    timestamptz default null,
  unique(homework_id, username)
);
alter table homework_submissions disable row level security;
alter publication supabase_realtime add table homework_submissions;
