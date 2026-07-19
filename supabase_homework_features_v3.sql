-- ══════════════════════════════════════════════════════════════
-- MIGRATION: Homework Features v3
-- Chạy trong Supabase Dashboard → SQL Editor → New query → Run
-- ══════════════════════════════════════════════════════════════

-- 1. Hẹn giờ mở bài (null = mở ngay)
ALTER TABLE homework
  ADD COLUMN IF NOT EXISTS open_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Xáo trộn thứ tự câu hỏi mỗi học sinh khác nhau
ALTER TABLE homework
  ADD COLUMN IF NOT EXISTS shuffle_questions BOOLEAN DEFAULT FALSE;

-- 3. Xáo trộn đáp án trắc nghiệm
ALTER TABLE homework
  ADD COLUMN IF NOT EXISTS shuffle_answers BOOLEAN DEFAULT FALSE;

-- 4. Chống copy-paste trong ô nhập đáp án
ALTER TABLE homework
  ADD COLUMN IF NOT EXISTS anti_paste BOOLEAN DEFAULT FALSE;

-- 5. Các cột đã dùng nhưng chưa có migration
ALTER TABLE homework
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE;

ALTER TABLE homework
  ADD COLUMN IF NOT EXISTS grading_notes TEXT DEFAULT NULL;

-- 6. Đảm bảo Realtime bật
ALTER PUBLICATION supabase_realtime ADD TABLE homework;
