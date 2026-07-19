-- ═══════════════════════════════════════════════════════════════
-- CHẠY TỪNG LỆNH MỘT trong Supabase SQL Editor nếu bị lỗi
-- ═══════════════════════════════════════════════════════════════

-- BƯỚC 1: Tạo bảng (KHÔNG có foreign key để tránh lỗi)
CREATE TABLE IF NOT EXISTS exam_progress (
  id                BIGSERIAL PRIMARY KEY,
  homework_id       BIGINT NOT NULL,
  username          TEXT NOT NULL,
  student_name      TEXT,
  class_name        TEXT,
  current_question  INT DEFAULT 0,
  answered_count    INT DEFAULT 0,
  total_questions   INT DEFAULT 0,
  started_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  elapsed_secs      INT DEFAULT 0,
  status            TEXT DEFAULT 'active',
  UNIQUE(homework_id, username)
);

-- BƯỚC 2: Index
CREATE INDEX IF NOT EXISTS idx_exam_progress_homework ON exam_progress(homework_id);
CREATE INDEX IF NOT EXISTS idx_exam_progress_updated  ON exam_progress(updated_at);

-- BƯỚC 3: Bật RLS
ALTER TABLE exam_progress ENABLE ROW LEVEL SECURITY;

-- BƯỚC 4: Xóa policy cũ
DROP POLICY IF EXISTS "exam_progress_all"    ON exam_progress;
DROP POLICY IF EXISTS "exam_progress_select" ON exam_progress;
DROP POLICY IF EXISTS "exam_progress_insert" ON exam_progress;
DROP POLICY IF EXISTS "exam_progress_update" ON exam_progress;
DROP POLICY IF EXISTS "exam_progress_delete" ON exam_progress;

-- BƯỚC 5: Tạo policy mới cho phép tất cả (anon key)
CREATE POLICY "exam_progress_select" ON exam_progress FOR SELECT USING (true);
CREATE POLICY "exam_progress_insert" ON exam_progress FOR INSERT WITH CHECK (true);
CREATE POLICY "exam_progress_update" ON exam_progress FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "exam_progress_delete" ON exam_progress FOR DELETE USING (true);

-- BƯỚC 6: Bật Realtime (nếu báo lỗi "already exists" thì bỏ qua)
ALTER PUBLICATION supabase_realtime ADD TABLE exam_progress;
