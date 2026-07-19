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

-- ── PHẦN 2: Bảng exam_progress ───────────────────────────────────
-- Bước 2a: Thêm cột mới (bỏ qua nếu báo "column already exists")
ALTER TABLE exam_progress ADD COLUMN IF NOT EXISTS tab_violations    INT     DEFAULT 0;
ALTER TABLE exam_progress ADD COLUMN IF NOT EXISTS force_submit      BOOLEAN DEFAULT FALSE;
ALTER TABLE exam_progress ADD COLUMN IF NOT EXISTS flagged_questions TEXT    DEFAULT NULL;

-- Bước 2b: RLS policies
ALTER TABLE exam_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "exam_progress_select" ON exam_progress;
DROP POLICY IF EXISTS "exam_progress_insert" ON exam_progress;
DROP POLICY IF EXISTS "exam_progress_update" ON exam_progress;
DROP POLICY IF EXISTS "exam_progress_delete" ON exam_progress;
CREATE POLICY "exam_progress_select" ON exam_progress FOR SELECT USING (true);
CREATE POLICY "exam_progress_insert" ON exam_progress FOR INSERT WITH CHECK (true);
CREATE POLICY "exam_progress_update" ON exam_progress FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "exam_progress_delete" ON exam_progress FOR DELETE USING (true);

-- Bước 2c: Index (bỏ qua nếu báo "already exists")
CREATE INDEX IF NOT EXISTS idx_exam_progress_homework ON exam_progress(homework_id);
CREATE INDEX IF NOT EXISTS idx_exam_progress_updated  ON exam_progress(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_progress_status   ON exam_progress(status, updated_at DESC);
