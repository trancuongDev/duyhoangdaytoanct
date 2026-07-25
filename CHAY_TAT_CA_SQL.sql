-- ══════════════════════════════════════════════════════════════════
-- CHẠY FILE NÀY 1 LẦN DUY NHẤT — Supabase SQL Editor → Run
-- Bao gồm TẤT CẢ migration cần thiết cho hệ thống DHDT LMS
-- ══════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- PHẦN 1: Bảng homework — tính năng mới
-- ────────────────────────────────────────────────────────────────
ALTER TABLE homework ADD COLUMN IF NOT EXISTS open_at           TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE homework ADD COLUMN IF NOT EXISTS shuffle_questions BOOLEAN     DEFAULT FALSE;
ALTER TABLE homework ADD COLUMN IF NOT EXISTS shuffle_answers   BOOLEAN     DEFAULT FALSE;
ALTER TABLE homework ADD COLUMN IF NOT EXISTS anti_paste        BOOLEAN     DEFAULT FALSE;
ALTER TABLE homework ADD COLUMN IF NOT EXISTS is_locked         BOOLEAN     DEFAULT FALSE;
ALTER TABLE homework ADD COLUMN IF NOT EXISTS grading_notes     TEXT        DEFAULT NULL;
ALTER TABLE homework ADD COLUMN IF NOT EXISTS deleted_at        TIMESTAMPTZ DEFAULT NULL;

-- ────────────────────────────────────────────────────────────────
-- PHẦN 2: Bảng exam_progress — live monitor
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_progress (
  id               BIGSERIAL PRIMARY KEY,
  homework_id      BIGINT NOT NULL,
  username         TEXT NOT NULL,
  student_name     TEXT,
  class_name       TEXT,
  current_question INT         DEFAULT 0,
  answered_count   INT         DEFAULT 0,
  total_questions  INT         DEFAULT 0,
  started_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  elapsed_secs     INT         DEFAULT 0,
  status           TEXT        DEFAULT 'active',
  UNIQUE(homework_id, username)
);
ALTER TABLE exam_progress ADD COLUMN IF NOT EXISTS tab_violations    INT     DEFAULT 0;
ALTER TABLE exam_progress ADD COLUMN IF NOT EXISTS force_submit      BOOLEAN DEFAULT FALSE;
ALTER TABLE exam_progress ADD COLUMN IF NOT EXISTS force_stopped     BOOLEAN DEFAULT FALSE;
ALTER TABLE exam_progress ADD COLUMN IF NOT EXISTS flagged_questions TEXT    DEFAULT NULL;
ALTER TABLE exam_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "exam_progress_select" ON exam_progress;
DROP POLICY IF EXISTS "exam_progress_insert" ON exam_progress;
DROP POLICY IF EXISTS "exam_progress_update" ON exam_progress;
DROP POLICY IF EXISTS "exam_progress_delete" ON exam_progress;
CREATE POLICY "exam_progress_select" ON exam_progress FOR SELECT USING (true);
CREATE POLICY "exam_progress_insert" ON exam_progress FOR INSERT WITH CHECK (true);
CREATE POLICY "exam_progress_update" ON exam_progress FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "exam_progress_delete" ON exam_progress FOR DELETE USING (true);
CREATE INDEX IF NOT EXISTS idx_exam_progress_homework ON exam_progress(homework_id);
CREATE INDEX IF NOT EXISTS idx_exam_progress_updated  ON exam_progress(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_progress_status   ON exam_progress(status, updated_at DESC);

-- ────────────────────────────────────────────────────────────────
-- PHẦN 3: File Manager
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS file_folders (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  color      TEXT DEFAULT '#6366f1',
  icon       TEXT DEFAULT '📁',
  class_name TEXT DEFAULT NULL,
  parent_id  BIGINT REFERENCES file_folders(id) ON DELETE CASCADE,
  sort_order INT DEFAULT 0,
  is_pinned  BOOLEAN DEFAULT FALSE,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE file_folders DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS file_items (
  id             BIGSERIAL PRIMARY KEY,
  folder_id      BIGINT REFERENCES file_folders(id) ON DELETE SET NULL,
  display_name   TEXT NOT NULL,
  file_name      TEXT NOT NULL,
  file_url       TEXT NOT NULL,
  file_type      TEXT DEFAULT 'other',
  file_size      BIGINT DEFAULT 0,
  class_name     TEXT DEFAULT NULL,
  tags           TEXT DEFAULT NULL,
  is_pinned      BOOLEAN DEFAULT FALSE,
  download_count INT DEFAULT 0,
  deleted_at     TIMESTAMPTZ DEFAULT NULL,
  created_by     TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE file_items DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS file_downloads (
  id            BIGSERIAL PRIMARY KEY,
  file_id       BIGINT REFERENCES file_items(id) ON DELETE CASCADE,
  username      TEXT NOT NULL,
  student_name  TEXT,
  class_name    TEXT,
  downloaded_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE file_downloads DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_file_items_folder   ON file_items(folder_id);
CREATE INDEX IF NOT EXISTS idx_file_items_deleted  ON file_items(deleted_at);
CREATE INDEX IF NOT EXISTS idx_file_downloads_file ON file_downloads(file_id);

-- Storage bucket cho file tài liệu
INSERT INTO storage.buckets (id, name, public)
VALUES ('files', 'files', true)
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "Public Access files" ON storage.objects;
CREATE POLICY "Public Access files" ON storage.objects
  FOR ALL USING (bucket_id = 'files') WITH CHECK (bucket_id = 'files');

-- ────────────────────────────────────────────────────────────────
-- PHẦN 4: Bật Realtime — mỗi bảng chạy riêng
-- Nếu dòng nào báo "already member" thì bỏ qua, KHÔNG phải lỗi
-- ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE homework;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE exam_progress;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE homework_submissions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE file_items;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE file_folders;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
