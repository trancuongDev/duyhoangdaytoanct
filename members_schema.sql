-- Bảng lớp học độc lập (quản lý học viên FB)
create table if not exists fb_classes (
  id          bigint generated always as identity primary key,
  name        text not null unique,
  created_at  timestamptz default now()
);
alter table fb_classes disable row level security;

-- Bảng quản lý học viên lớp (không có tài khoản đăng nhập)
create table if not exists class_members (
  id          bigint generated always as identity primary key,
  member_code text not null unique,   -- Mã HV: [LỚP]-XXXXX
  full_name   text not null,
  phone       text default null,
  zalo        text default null,
  gmail       text default null,
  fb_name     text default null,
  class_name  text not null,
  notes       text default null,
  created_at  timestamptz default now()
);
alter table class_members disable row level security;
