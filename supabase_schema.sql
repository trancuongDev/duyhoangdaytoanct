-- Chạy file này trong Supabase SQL Editor

-- Bảng lớp học
create table if not exists classes (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  start_date date default null,   -- Ngày khai giảng
  end_date   date default null,   -- Ngày kết thúc
  created_at timestamptz default now()
);

-- Chạy lệnh này nếu bảng đã tồn tại (migration):
-- alter table classes add column if not exists start_date date default null;
-- alter table classes add column if not exists end_date date default null;

-- Bảng học sinh
create table if not exists students (
  id           bigint generated always as identity primary key,
  student_code text,
  full_name    text not null,
  phone        text,
  username     text not null unique,
  password     text not null,
  class_name   text,
  active       boolean default true,
  expiry_date  date default null,        -- Ngày hết hạn tài khoản (null = không giới hạn)
  notes        text default null,        -- Ghi chú riêng cho học viên
  manually_unlocked boolean default false, -- Admin mở thủ công, bỏ qua kiểm tra lớp hết hạn
  is_online    boolean default false,       -- Đang online hay không
  last_seen    timestamptz default null,    -- Lần cuối hoạt động
  created_at   timestamptz default now()
);

-- Chạy lệnh này nếu bảng đã tồn tại (migration):
-- alter table students add column if not exists expiry_date date default null;
-- alter table students add column if not exists notes text default null;

-- Bảng nhóm bài học
create table if not exists lesson_groups (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  class_name text,
  parent_id  bigint references lesson_groups(id) on delete cascade,
  created_at timestamptz default now()
);
alter table lesson_groups disable row level security;

-- Bảng bài học
create table if not exists lessons (
  id           bigint generated always as identity primary key,
  name         text not null,
  class_name   text,
  description  text,
  group_name   text default null,
  group_id     bigint references lesson_groups(id) on delete set null,
  created_at   timestamptz default now()
);

-- Migration nếu bảng đã tồn tại:
-- alter table lessons add column if not exists group_name text default null;
-- alter table lessons add column if not exists group_id bigint references lesson_groups(id) on delete set null;
-- alter table lesson_groups add column if not exists parent_id bigint references lesson_groups(id) on delete cascade;
-- create table if not exists lesson_groups (id bigint generated always as identity primary key, name text not null unique, class_name text, parent_id bigint references lesson_groups(id) on delete cascade, created_at timestamptz default now());
-- alter table lesson_groups disable row level security;

-- Bảng video trong bài học
create table if not exists lesson_videos (
  id         bigint generated always as identity primary key,
  lesson_id  bigint references lessons(id) on delete cascade,
  title      text not null,
  file_name  text,
  storage_path text,
  video_url  text default null,   -- Link video (YouTube, Drive, MP4...)
  created_at timestamptz default now()
);

-- Migration nếu bảng đã tồn tại:
-- alter table lesson_videos add column if not exists video_url text default null;

-- Bảng tài liệu trong bài học
create table if not exists lesson_docs (
  id           bigint generated always as identity primary key,
  lesson_id    bigint references lessons(id) on delete cascade,
  title        text not null,
  file_name    text,
  file_type    text,
  storage_path text,
  doc_url      text default null,   -- Link tài liệu (Google Drive, PDF...)
  created_at   timestamptz default now()
);

-- Migration nếu bảng đã tồn tại:
-- alter table lesson_docs add column if not exists doc_url text default null;

-- Bảng cảnh báo
create table if not exists alerts (
  id           bigint generated always as identity primary key,
  username     text,
  student_name text,
  class_name   text,
  reason       text,
  created_at   timestamptz default now()
);

-- Tắt RLS (dùng anon key trực tiếp từ frontend)
alter table classes      disable row level security;
alter table students     disable row level security;
alter table lessons      disable row level security;
alter table lesson_videos disable row level security;
alter table lesson_docs  disable row level security;
alter table alerts       disable row level security;

-- Tạo storage bucket cho file video và tài liệu
insert into storage.buckets (id, name, public)
values ('lessons', 'lessons', true)
on conflict do nothing;

-- Policy cho phép upload/download public
create policy "Public Access" on storage.objects
  for all using (bucket_id = 'lessons');

-- Bảng nhật ký truy cập tài liệu/video
create table if not exists access_logs (
  id           bigint generated always as identity primary key,
  username     text not null,
  student_name text,
  class_name   text,
  lesson_id    bigint,
  lesson_name  text,
  content_id   bigint,
  content_title text,
  content_type text,   -- 'video' | 'doc'
  accessed_at  timestamptz default now()
);
alter table access_logs disable row level security;

-- Bảng đánh dấu video đã xem
create table if not exists lesson_views (
  id         bigint generated always as identity primary key,
  username   text not null,
  video_id   bigint references lesson_videos(id) on delete cascade,
  viewed_at  timestamptz default now(),
  unique(username, video_id)
);
alter table lesson_views disable row level security;

-- ============================================================
-- MIGRATION: Thêm session_token vào students
-- ============================================================
alter table students add column if not exists session_token text default null;

-- ============================================================
-- MIGRATION: Thêm login_attempts, last_login vào students
-- ============================================================
alter table students add column if not exists login_attempts int default 0;
alter table students add column if not exists last_login timestamptz default null;

-- ============================================================
-- Bảng lịch sử đăng nhập
-- ============================================================
create table if not exists login_logs (
  id           bigint generated always as identity primary key,
  username     text not null,
  student_name text,
  class_name   text,
  logged_in_at timestamptz default now()
);
alter table login_logs disable row level security;

-- ============================================================
-- Bảng thông báo (announcements)
-- ============================================================
create table if not exists announcements (
  id         bigint generated always as identity primary key,
  title      text not null,
  content    text not null,
  class_name text default null,   -- null = gửi tất cả lớp
  pinned     boolean default false,
  expires_at timestamptz default null, -- null = không hết hạn
  target_username text default null,   -- null = gửi theo lớp/tất cả
  created_at timestamptz default now()
);
alter table announcements disable row level security;

-- Thêm cột expires_at nếu bảng đã tồn tại (chạy 1 lần)
-- alter table announcements add column if not exists expires_at timestamptz default null;

-- ============================================================
-- Bật Realtime cho các bảng cần cập nhật tức thì
-- (Chạy trong Supabase Dashboard > Database > Replication)
-- ============================================================
-- alter publication supabase_realtime add table students;
-- alter publication supabase_realtime add table announcements;
-- alter publication supabase_realtime add table lessons;
-- alter publication supabase_realtime add table lesson_videos;
-- alter publication supabase_realtime add table lesson_docs;
-- alter publication supabase_realtime add table lesson_groups;

-- ============================================================
-- Bảng yêu thích bài học
-- ============================================================
create table if not exists lesson_favorites (
  id         bigint generated always as identity primary key,
  username   text not null,
  lesson_id  bigint references lessons(id) on delete cascade,
  created_at timestamptz default now(),
  unique(username, lesson_id)
);
alter table lesson_favorites disable row level security;

-- ============================================================
-- Bảng đánh dấu thông báo đã đọc
-- ============================================================
create table if not exists notification_reads (
  id             bigint generated always as identity primary key,
  username       text not null,
  announcement_id bigint references announcements(id) on delete cascade,
  read_at        timestamptz default now(),
  unique(username, announcement_id)
);
alter table notification_reads disable row level security;

-- ============================================================
-- Bảng phòng học LIVE
-- ============================================================
create table if not exists live_sessions (
  id          bigint generated always as identity primary key,
  title       text not null,
  stream_url  text not null,
  class_name  text default null,   -- null = tất cả lớp
  is_active   boolean default true,
  created_by  text,
  created_at  timestamptz default now(),
  ended_at    timestamptz default null
);
alter table live_sessions disable row level security;
-- alter publication supabase_realtime add table live_sessions;

-- Migration: thêm link vào thông báo
alter table announcements add column if not exists link_url text default null;
alter table announcements add column if not exists link_text text default null;

-- Migration: thêm thông tin thiết bị vào login_logs
alter table login_logs add column if not exists device_info text default null;
alter table login_logs add column if not exists browser text default null;
alter table login_logs add column if not exists os text default null;
alter table login_logs add column if not exists device_type text default null;

-- Migration: thêm cột is_embed vào lesson_videos
alter table lesson_videos add column if not exists is_embed boolean default false;

-- ============================================================
-- BẮT BUỘC: Bật Realtime cho bảng students
-- Cần chạy trong Supabase Dashboard > SQL Editor
-- Để tính năng đăng xuất thiết bị cũ tức thì hoạt động
-- ============================================================
alter publication supabase_realtime add table students;

-- Đảm bảo các bảng khác cũng được bật Realtime
alter publication supabase_realtime add table announcements;
alter publication supabase_realtime add table app_settings;

-- ============================================================
-- Bảng quà điểm hằng ngày
-- ============================================================
create table if not exists daily_rewards (
  id         bigint generated always as identity primary key,
  username   text not null,
  reward_date date not null,
  points     int not null default 10,
  streak_day int not null default 1,
  created_at timestamptz default now(),
  unique(username, reward_date)
);
alter table daily_rewards disable row level security;
alter publication supabase_realtime add table daily_rewards;
