-- ============================================================
-- XÓA TOÀN BỘ DỮ LIỆU — RA MẮT BẢN MỚI (GIỮ CẤU TRÚC BẢNG)
-- Chạy trong: Supabase Dashboard → SQL Editor → Run
-- ⚠️ KHÔNG THỂ HOÀN TÁC. Backup trước nếu cần.
-- ============================================================

-- 1) Xóa file trong Storage bucket "lessons" (video/tài liệu upload)
delete from storage.objects
where bucket_id = 'lessons';

-- 2) Xóa dữ liệu các bảng (thứ tự an toàn theo khóa ngoại)
-- Bỏ comment dòng nào nếu bảng chưa tồn tại trên project của bạn.

truncate table
  notification_reads,
  lesson_views,
  lesson_favorites,
  access_logs,
  login_logs,
  alerts,
  lesson_videos,
  lesson_docs,
  lessons,
  student_classes,
  students,
  lesson_groups,
  classes,
  announcements,
  live_sessions,
  schedules
restart identity cascade;

-- 3) Cài đặt hệ thống — tắt bảo trì (bỏ qua nếu chưa có bảng app_settings)
delete from app_settings;
insert into app_settings (key, value) values ('maintenance', 'false');

-- ============================================================
-- KIỂM TRA SAU KHI CHẠY (kết quả đều = 0)
-- ============================================================
select 'students' as bang, count(*)::int as so_dong from students
union all select 'classes', count(*)::int from classes
union all select 'lesson_groups', count(*)::int from lesson_groups
union all select 'lessons', count(*)::int from lessons
union all select 'lesson_videos', count(*)::int from lesson_videos
union all select 'lesson_docs', count(*)::int from lesson_docs
union all select 'alerts', count(*)::int from alerts
union all select 'login_logs', count(*)::int from login_logs
union all select 'access_logs', count(*)::int from access_logs
union all select 'announcements', count(*)::int from announcements;
