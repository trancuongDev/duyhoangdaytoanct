-- ══════════════════════════════════════════════════════════════
-- FILE MANAGER — Hệ thống lưu trữ & quản lý tài liệu
-- Chạy trong Supabase Dashboard → SQL Editor → New query → Run
-- ══════════════════════════════════════════════════════════════

-- 1. Bảng thư mục
CREATE TABLE IF NOT EXISTS file_folders (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT DEFAULT '#6366f1',   -- màu icon
  icon        TEXT DEFAULT '📁',        -- emoji icon
  class_name  TEXT DEFAULT NULL,        -- null = tất cả lớp thấy, 'private' = chỉ admin
  parent_id   BIGINT REFERENCES file_folders(id) ON DELETE CASCADE,
  sort_order  INT DEFAULT 0,
  is_pinned   BOOLEAN DEFAULT FALSE,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE file_folders DISABLE ROW LEVEL SECURITY;

-- 2. Bảng file
CREATE TABLE IF NOT EXISTS file_items (
  id           BIGSERIAL PRIMARY KEY,
  folder_id    BIGINT REFERENCES file_folders(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,             -- tên hiển thị (tùy chỉnh)
  file_name    TEXT NOT NULL,             -- tên file gốc
  file_url     TEXT NOT NULL,             -- URL Supabase Storage hoặc link ngoài
  file_type    TEXT DEFAULT 'other',      -- pdf | doc | image | video | link | other
  file_size    BIGINT DEFAULT 0,          -- bytes
  class_name   TEXT DEFAULT NULL,         -- null = tất cả, 'private' = chỉ admin
  tags         TEXT DEFAULT NULL,         -- "Đề thi,Công thức" dạng CSV
  is_pinned    BOOLEAN DEFAULT FALSE,
  download_count INT DEFAULT 0,
  deleted_at   TIMESTAMPTZ DEFAULT NULL,  -- soft delete
  created_by   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE file_items DISABLE ROW LEVEL SECURITY;

-- 3. Bảng lịch sử tải file
CREATE TABLE IF NOT EXISTS file_downloads (
  id          BIGSERIAL PRIMARY KEY,
  file_id     BIGINT REFERENCES file_items(id) ON DELETE CASCADE,
  username    TEXT NOT NULL,
  student_name TEXT,
  class_name  TEXT,
  downloaded_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE file_downloads DISABLE ROW LEVEL SECURITY;

-- 4. Storage bucket cho file tài liệu
INSERT INTO storage.buckets (id, name, public)
VALUES ('files', 'files', true)
ON CONFLICT DO NOTHING;

DROP POLICY IF EXISTS "Public Access files" ON storage.objects;
CREATE POLICY "Public Access files" ON storage.objects
  FOR ALL USING (bucket_id = 'files') WITH CHECK (bucket_id = 'files');

-- 5. Index
CREATE INDEX IF NOT EXISTS idx_file_items_folder   ON file_items(folder_id);
CREATE INDEX IF NOT EXISTS idx_file_items_deleted  ON file_items(deleted_at);
CREATE INDEX IF NOT EXISTS idx_file_downloads_file ON file_downloads(file_id);

-- 6. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE file_items;
ALTER PUBLICATION supabase_realtime ADD TABLE file_folders;
