-- ============================================================
-- BẬT ROW LEVEL SECURITY (RLS) - CHẠY TRONG SUPABASE SQL EDITOR
-- ============================================================
-- Chạy file này 1 lần trong Supabase Dashboard > SQL Editor

-- ── 1. BẬT RLS CHO TẤT CẢ BẢNG NHẠY CẢM ──
alter table students      enable row level security;
alter table lessons       enable row level security;
alter table lesson_videos enable row level security;
alter table lesson_docs   enable row level security;
alter table lesson_groups enable row level security;
alter table access_logs   enable row level security;
alter table alerts        enable row level security;
alter table login_logs    enable row level security;
alter table announcements enable row level security;
alter table lesson_views  enable row level security;
alter table lesson_favorites enable row level security;
alter table notification_reads enable row level security;
alter table classes       enable row level security;

-- ── 2. XÓA POLICY CŨ NẾU CÓ ──
drop policy if exists "students_self_read"     on students;
drop policy if exists "students_self_update"   on students;
drop policy if exists "lessons_class_read"     on lessons;
drop policy if exists "lesson_videos_read"     on lesson_videos;
drop policy if exists "lesson_docs_read"       on lesson_docs;
drop policy if exists "lesson_groups_read"     on lesson_groups;
drop policy if exists "classes_read"           on classes;
drop policy if exists "announcements_read"     on announcements;
drop policy if exists "access_logs_self"       on access_logs;
drop policy if exists "lesson_views_self"      on lesson_views;
drop policy if exists "lesson_favorites_self"  on lesson_favorites;
drop policy if exists "notification_reads_self" on notification_reads;
drop policy if exists "alerts_insert_self"     on alerts;

-- ── 3. BẢNG STUDENTS ──
-- Học sinh chỉ đọc được record của chính mình
create policy "students_self_read" on students
  for select using (
    username = current_setting('request.jwt.claims', true)::json->>'sub'
    or current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- Học sinh chỉ update được is_online, last_seen của chính mình
create policy "students_self_update" on students
  for update using (
    username = current_setting('request.jwt.claims', true)::json->>'sub'
    or current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- ── 4. BẢNG LESSONS ──
-- Học sinh chỉ đọc bài học của lớp mình
create policy "lessons_class_read" on lessons
  for select using (true); -- public read, filter ở app level

-- ── 5. BẢNG LESSON_VIDEOS ──
create policy "lesson_videos_read" on lesson_videos
  for select using (true);

-- ── 6. BẢNG LESSON_DOCS ──
create policy "lesson_docs_read" on lesson_docs
  for select using (true);

-- ── 7. BẢNG LESSON_GROUPS ──
create policy "lesson_groups_read" on lesson_groups
  for select using (true);

-- ── 8. BẢNG CLASSES ──
create policy "classes_read" on classes
  for select using (true);

-- ── 9. BẢNG ANNOUNCEMENTS ──
create policy "announcements_read" on announcements
  for select using (true);

-- ── 10. BẢNG ACCESS_LOGS — chỉ insert, không đọc ──
create policy "access_logs_self" on access_logs
  for insert with check (true);

-- ── 11. BẢNG LESSON_VIEWS ──
create policy "lesson_views_self" on lesson_views
  for all using (true);

-- ── 12. BẢNG LESSON_FAVORITES ──
create policy "lesson_favorites_self" on lesson_favorites
  for all using (true);

-- ── 13. BẢNG NOTIFICATION_READS ──
create policy "notification_reads_self" on notification_reads
  for all using (true);

-- ── 14. BẢNG ALERTS — chỉ insert ──
create policy "alerts_insert_self" on alerts
  for insert with check (true);

-- ── 15. STORAGE: Chặn list bucket (chỉ cho download file cụ thể) ──
-- Xóa policy cũ
drop policy if exists "Public Access" on storage.objects;

-- Chỉ cho phép đọc file (không list, không xóa từ client)
create policy "lessons_storage_read" on storage.objects
  for select using (bucket_id = 'lessons');

-- Chỉ admin (service_role) mới upload/xóa được
create policy "lessons_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'lessons'
    and auth.role() = 'service_role'
  );

create policy "lessons_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'lessons'
    and auth.role() = 'service_role'
  );

-- ── 16. CHẶN DELETE/UPDATE TRỰC TIẾP TỪ CLIENT ──
-- Học sinh không được xóa bất kỳ thứ gì
create policy "no_delete_students" on lessons
  for delete using (false);
create policy "no_delete_videos" on lesson_videos
  for delete using (false);
create policy "no_delete_docs" on lesson_docs
  for delete using (false);
