-- ══════════════════════════════════════════════════════════════
-- MIGRATION: Live Monitor v2 — Tab violations & Force Submit
-- Chạy trong Supabase Dashboard → SQL Editor → New query → Run
-- ══════════════════════════════════════════════════════════════

-- 1. Thêm cột tab_violations (số lần học sinh chuyển tab)
ALTER TABLE exam_progress
  ADD COLUMN IF NOT EXISTS tab_violations INT DEFAULT 0;

-- 2. Thêm cột force_submit (admin bật = học sinh bị tự động nộp bài)
ALTER TABLE exam_progress
  ADD COLUMN IF NOT EXISTS force_submit BOOLEAN DEFAULT FALSE;

-- 3. Thêm cột flagged_questions (câu đánh dấu, lưu dạng "1,3,5")
ALTER TABLE exam_progress
  ADD COLUMN IF NOT EXISTS flagged_questions TEXT DEFAULT NULL;

-- 4. Đảm bảo Realtime đã bật cho bảng này
--    (bỏ qua nếu báo "already exists")
ALTER PUBLICATION supabase_realtime ADD TABLE exam_progress;

-- 5. Index để query nhanh học sinh đang active
CREATE INDEX IF NOT EXISTS idx_exam_progress_status_updated
  ON exam_progress(status, updated_at DESC);
