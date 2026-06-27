-- ============================================================
-- BƯỚC 1: Chạy file này trước trong Supabase SQL Editor
-- Tạo 3 bảng + storage bucket
-- ============================================================

-- Bảng bài tập
create table if not exists homework (
  id          bigint generated always as identity primary key,
  title       text         not null,
  description text,
  class_name  text         default null,
  due_date    date         default null,
  time_limit  int          default null,
  attach_url  text         default null,
  attach_text text         default null,
  created_by  text         default null,
  created_at  timestamptz  default now()
);
alter table homework disable row level security;

-- Bảng câu hỏi
create table if not exists homework_questions (
  id            bigint       generated always as identity primary key,
  homework_id   bigint       references homework(id) on delete cascade,
  order_index   int          not null default 0,
  question_type text         not null,
  question_text text         not null,
  image_url     text         default null,
  data          jsonb        not null default '{}',
  points        numeric(5,2) default 1,
  created_at    timestamptz  default now()
);
alter table homework_questions disable row level security;

-- Bảng nộp bài
create table if not exists homework_submissions (
  id           bigint       generated always as identity primary key,
  homework_id  bigint       references homework(id) on delete cascade,
  username     text         not null,
  student_name text,
  class_name   text,
  answers      jsonb        default '{}',
  submit_url   text         default null,
  note         text         default null,
  status       text         default 'submitted',
  score        numeric(5,2) default null,
  max_score    numeric(5,2) default null,
  feedback     text         default null,
  time_used    int          default null,
  submitted_at timestamptz  default now(),
  graded_at    timestamptz  default null,
  unique(homework_id, username)
);
alter table homework_submissions disable row level security;

-- Storage bucket ảnh câu hỏi
insert into storage.buckets (id, name, public)
values ('homework-images', 'homework-images', true)
on conflict do nothing;

drop policy if exists "Public Access homework-images" on storage.objects;
create policy "Public Access homework-images" on storage.objects
  for all
  using  (bucket_id = 'homework-images')
  with check (bucket_id = 'homework-images');
