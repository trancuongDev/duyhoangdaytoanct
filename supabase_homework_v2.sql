-- ============================================================
-- BÀI TẬP ONLINE v2 — Chạy TOÀN BỘ file này trong
-- Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- ── 1. Bảng bài tập ────────────────────────────────────────
create table if not exists homework (
  id          bigint generated always as identity primary key,
  title       text        not null,
  description text,
  class_name  text        default null,
  due_date    date        default null,
  time_limit  int         default null,   -- phút, null = không giới hạn
  attach_url  text        default null,
  attach_text text        default null,
  created_by  text        default null,
  created_at  timestamptz default now()
);
alter table homework disable row level security;

-- ── 2. Bảng câu hỏi ────────────────────────────────────────
-- question_type: 'multiple_choice' | 'true_false' | 'matching' | 'short_answer'
-- data (jsonb): chứa options/correct/statements/pairs/sample_answer
create table if not exists homework_questions (
  id            bigint generated always as identity primary key,
  homework_id   bigint      references homework(id) on delete cascade,
  order_index   int         not null default 0,
  question_type text        not null,
  question_text text        not null,
  image_url     text        default null,
  data          jsonb       not null default '{}',
  points        numeric(5,2) default 1,
  created_at    timestamptz default now()
);
alter table homework_questions disable row level security;

-- ── 3. Bảng nộp bài ────────────────────────────────────────
create table if not exists homework_submissions (
  id           bigint generated always as identity primary key,
  homework_id  bigint      references homework(id) on delete cascade,
  username     text        not null,
  student_name text,
  class_name   text,
  answers      jsonb       default '{}',   -- { "question_id": answer }
  submit_url   text        default null,
  note         text        default null,
  status       text        default 'submitted', -- submitted | graded | returned
  score        numeric(5,2) default null,
  max_score    numeric(5,2) default null,
  feedback     text        default null,
  time_used    int         default null,   -- giây đã dùng
  submitted_at timestamptz default now(),
  graded_at    timestamptz default null,
  unique(homework_id, username)
);
alter table homework_submissions disable row level security;

-- ── 4. Bật Realtime ────────────────────────────────────────
alter publication supabase_realtime add table homework;
alter publication supabase_realtime add table homework_questions;
alter publication supabase_realtime add table homework_submissions;

-- ── 5. Storage bucket cho ảnh câu hỏi ─────────────────────
insert into storage.buckets (id, name, public)
values ('homework-images', 'homework-images', true)
on conflict do nothing;

-- Xóa policy cũ nếu đã tồn tại rồi tạo lại
drop policy if exists "Public Access homework-images" on storage.objects;
create policy "Public Access homework-images" on storage.objects
  for all
  using  (bucket_id = 'homework-images')
  with check (bucket_id = 'homework-images');

-- ============================================================
-- MIGRATION (nếu bảng ĐÃ tồn tại từ version cũ — chạy riêng)
-- ============================================================
-- alter table homework            add column if not exists time_limit int         default null;
-- alter table homework_submissions add column if not exists time_used  int         default null;
-- alter table homework_submissions add column if not exists max_score  numeric(5,2) default null;
-- alter table homework_submissions add column if not exists answers    jsonb       default '{}';
