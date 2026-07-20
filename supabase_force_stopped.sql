-- ══════════════════════════════════════════════════════════════
-- MIGRATION: Thêm cột force_stopped vào exam_progress
-- Mục đích: Khi admin buộc dừng bài thi, học sinh KHÔNG được
--           làm lại dù bài làm bị xóa trong homework_submissions
-- Chạy 1 lần trong Supabase Dashboard → SQL Editor
-- ══════════════════════════════════════════════════════════════

ALTER TABLE exam_progress
  ADD COLUMN IF NOT EXISTS force_stopped BOOLEAN DEFAULT FALSE;

-- Index để query nhanh khi kiểm tra trạng thái buộc dừng
CREATE INDEX IF NOT EXISTS idx_exam_progress_force_stopped
  ON exam_progress(homework_id, username, force_stopped)
  WHERE force_stopped = TRUE;
