-- ============================================================
-- MIGRATION: Thêm cột priority và scheduled_at cho announcements
-- Chạy trong Supabase Dashboard > SQL Editor
-- ============================================================

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';
-- priority: 'low' | 'normal' | 'high' | 'urgent'

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ DEFAULT NULL;
-- scheduled_at: null = gửi ngay, có giá trị = lên lịch gửi

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS expires_at_custom TIMESTAMPTZ DEFAULT NULL;
-- Hỗ trợ thời hạn tùy chỉnh (thay thế expires_at cứng 24h)

-- Tạo index để query nhanh hơn
CREATE INDEX IF NOT EXISTS idx_announcements_pinned ON announcements(pinned);
CREATE INDEX IF NOT EXISTS idx_announcements_class ON announcements(class_name);
CREATE INDEX IF NOT EXISTS idx_announcements_priority ON announcements(priority);
CREATE INDEX IF NOT EXISTS idx_announcements_scheduled ON announcements(scheduled_at);
