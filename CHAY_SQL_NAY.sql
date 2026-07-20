-- ══════════════════════════════════════════════════════════════════
-- CHẠY TỪNG DÒNG MỘT — bỏ qua dòng nào báo lỗi "already exists"
-- ══════════════════════════════════════════════════════════════════

-- ── PHẦN 1: Bảng homework (an toàn, chạy hết 1 lần) ──────────────
ALTER TABLE homework ADD COLUMN IF NOT EXISTS open_at           TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE homework ADD COLUMN IF NOT EXISTS shuffle_questions BOOLEAN     DEFAULT FALSE;
ALTER TABLE homework ADD COLUMN IF NOT EXISTS shuffle_answers   BOOLEAN     DEFAULT FALSE;
ALTER TABLE homework ADD COLUMN IF NOT EXISTS anti_paste        BOOLEAN     DEFAULT FALSE;
ALTER TABLE homework ADD COLUMN IF NOT EXISTS is_locked         BOOLEAN     DEFAULT FALSE;
ALTER TABLE homework ADD COLUMN IF NOT EXISTS grading_notes     TEXT        DEFAULT NULL;


-- PHẦN 4: Thùng rác bài tập (soft delete)
ALTER TABLE homework ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_homework_deleted ON homework(deleted_at);
