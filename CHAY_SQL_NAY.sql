-- ================================================================
-- THIÊN TUỆ ENGLISH — FULL DATABASE SCHEMA
-- Chạy toàn bộ file này trong Supabase SQL Editor
-- ================================================================

-- ── 1. STUDENTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students (
  id                bigserial PRIMARY KEY,
  full_name         text NOT NULL,
  username          text UNIQUE NOT NULL,
  password          text NOT NULL,
  phone             text,
  class_name        text,
  student_code      text UNIQUE,
  active            boolean DEFAULT true,
  manually_unlocked boolean DEFAULT false,
  expiry_date       date,
  login_attempts    int DEFAULT 0,
  session_token     text,
  last_login        timestamptz,
  last_seen         timestamptz,
  is_online         boolean DEFAULT false,
  notes             text,
  created_at        timestamptz DEFAULT now()
);

-- ── 2. CLASSES ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS classes (
  id         bigserial PRIMARY KEY,
  name       text UNIQUE NOT NULL,
  start_date date,
  end_date   date,
  created_at timestamptz DEFAULT now()
);

-- ── 3. STUDENT_CLASSES (đa lớp) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS student_classes (
  id         bigserial PRIMARY KEY,
  student_id bigint REFERENCES students(id) ON DELETE CASCADE,
  class_name text NOT NULL,
  joined_at  timestamptz DEFAULT now(),
  UNIQUE(student_id, class_name)
);

-- ── 4. LESSON_GROUPS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lesson_groups (
  id               bigserial PRIMARY KEY,
  name             text NOT NULL,
  class_name       text,
  allowed_usernames text,
  parent_id        bigint REFERENCES lesson_groups(id) ON DELETE SET NULL,
  sort_order       int DEFAULT 0,
  created_at       timestamptz DEFAULT now()
);

-- ── 5. LESSONS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lessons (
  id               bigserial PRIMARY KEY,
  name             text NOT NULL,
  description      text,
  class_name       text,
  group_id         bigint REFERENCES lesson_groups(id) ON DELETE SET NULL,
  group_name       text,
  allowed_usernames text,
  sort_order       int DEFAULT 0,
  created_at       timestamptz DEFAULT now()
);

-- ── 6. LESSON_VIDEOS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lesson_videos (
  id         bigserial PRIMARY KEY,
  lesson_id  bigint REFERENCES lessons(id) ON DELETE CASCADE,
  title      text,
  url        text NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ── 7. LESSON_DOCS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lesson_docs (
  id         bigserial PRIMARY KEY,
  lesson_id  bigint REFERENCES lessons(id) ON DELETE CASCADE,
  title      text,
  url        text NOT NULL,
  file_type  text,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ── 8. ALERTS (cảnh báo bảo mật) ────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id           bigserial PRIMARY KEY,
  username     text,
  student_name text,
  class_name   text,
  reason       text NOT NULL,
  created_at   timestamptz DEFAULT now()
);

-- ── 9. ANNOUNCEMENTS (thông báo) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id         bigserial PRIMARY KEY,
  title      text NOT NULL,
  content    text,
  class_name text,
  created_by text,
  created_at timestamptz DEFAULT now()
);

-- ── 10. SCHEDULES (lịch học) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedules (
  id          bigserial PRIMARY KEY,
  title       text NOT NULL,
  description text,
  class_name  text,
  event_date  date NOT NULL,
  event_time  text,
  created_at  timestamptz DEFAULT now()
);

-- ── 11. HOMEWORKS (bài tập) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS homeworks (
  id           bigserial PRIMARY KEY,
  title        text NOT NULL,
  description  text,
  class_name   text,
  questions    jsonb DEFAULT '[]',
  open_at      timestamptz,
  close_at     timestamptz,
  duration_min int,
  shuffle      boolean DEFAULT true,
  active       boolean DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

-- ── 12. EXAM_PROGRESS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_progress (
  id          bigserial PRIMARY KEY,
  homework_id bigint REFERENCES homeworks(id) ON DELETE CASCADE,
  username    text NOT NULL,
  status      text DEFAULT 'in_progress',
  answers     jsonb DEFAULT '{}',
  score       numeric,
  started_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(homework_id, username)
);

-- ── 13. LOGIN_LOGS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_logs (
  id           bigserial PRIMARY KEY,
  username     text,
  student_name text,
  class_name   text,
  device_info  text,
  browser      text,
  os           text,
  device_type  text,
  created_at   timestamptz DEFAULT now()
);

-- ── 14. ASSISTANTS (trợ lý) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS assistants (
  id         bigserial PRIMARY KEY,
  full_name  text NOT NULL,
  username   text UNIQUE NOT NULL,
  password   text NOT NULL,
  active     boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ── 15. ASSISTANT_LOGS (nhật ký trợ lý) ─────────────────────────
CREATE TABLE IF NOT EXISTS assistant_logs (
  id          bigserial PRIMARY KEY,
  assistant   text,
  action_type text,
  description text,
  created_at  timestamptz DEFAULT now()
);

-- ── 16. FILES (quản lý file) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS files (
  id           bigserial PRIMARY KEY,
  name         text NOT NULL,
  url          text NOT NULL,
  file_type    text,
  size_bytes   bigint,
  folder       text DEFAULT 'root',
  class_name   text,
  uploaded_by  text,
  deleted      boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

-- ── 17. SETTINGS (cài đặt hệ thống) ─────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz DEFAULT now()
);

-- Thêm cài đặt mặc định
INSERT INTO settings (key, value) VALUES
  ('sys_name',      'Thiên Tuệ English'),
  ('teacher_name',  'Giáo Viên'),
  ('global_notice', ''),
  ('maintenance',   'false')
ON CONFLICT (key) DO NOTHING;

-- ── 18. ALLOWED_STUDENTS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS allowed_students (
  id         bigserial PRIMARY KEY,
  username   text UNIQUE NOT NULL,
  class_name text,
  created_at timestamptz DEFAULT now()
);

-- ── 19. ACCESS_LOGS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS access_logs (
  id          bigserial PRIMARY KEY,
  username    text,
  page        text,
  action      text,
  created_at  timestamptz DEFAULT now()
);

-- ================================================================
-- ROW LEVEL SECURITY — Cho phép tất cả (anon key)
-- ================================================================
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'students','classes','student_classes','lesson_groups','lessons',
    'lesson_videos','lesson_docs','alerts','announcements','schedules',
    'homeworks','exam_progress','login_logs','assistants','assistant_logs',
    'files','settings','allowed_students','access_logs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'DO $inner$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = %L AND policyname = %L
        ) THEN
          CREATE POLICY "allow_all_%s" ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
        END IF;
      END $inner$',
      t, 'allow_all_' || t, t, t
    );
  END LOOP;
END $$;

-- ================================================================
-- REALTIME — Bật realtime cho các bảng quan trọng
-- ================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE students;
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE schedules;

-- ================================================================
-- XONG! Toàn bộ schema đã sẵn sàng cho Thiên Tuệ English
-- ================================================================

-- ================================================================
-- MIGRATION: Cập nhật lesson_videos & lesson_docs cho phiên bản mới
-- Chạy phần này nếu đã có DB cũ (thêm các cột còn thiếu)
-- ================================================================

-- schedule_slots (lịch học theo tuần — thay thế schedules cũ)
CREATE TABLE IF NOT EXISTS schedule_slots (
  id          bigserial PRIMARY KEY,
  week_start  date NOT NULL,
  day_of_week int NOT NULL,   -- 2=Thứ 2 ... 8=Chủ Nhật
  class_name  text,
  session     text,           -- 'morning' | 'afternoon' | 'evening'
  start_time  text NOT NULL,  -- 'HH:MM'
  end_time    text NOT NULL,  -- 'HH:MM'
  subject     text NOT NULL,
  notes       text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE schedule_slots ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='schedule_slots' AND policyname='allow_all_schedule_slots') THEN
    CREATE POLICY "allow_all_schedule_slots" ON schedule_slots FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- lesson_videos: thêm cột video_url, storage_path, file_name, is_embed
ALTER TABLE lesson_videos ADD COLUMN IF NOT EXISTS video_url    text;
ALTER TABLE lesson_videos ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE lesson_videos ADD COLUMN IF NOT EXISTS file_name    text;
ALTER TABLE lesson_videos ADD COLUMN IF NOT EXISTS is_embed     boolean DEFAULT false;

-- lesson_docs: thêm cột doc_url, storage_path, file_name (file_type đã có sẵn)
ALTER TABLE lesson_docs ADD COLUMN IF NOT EXISTS doc_url      text;
ALTER TABLE lesson_docs ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE lesson_docs ADD COLUMN IF NOT EXISTS file_name    text;

-- file_folders & file_items (File Manager mới)
CREATE TABLE IF NOT EXISTS file_folders (
  id         bigserial PRIMARY KEY,
  name       text NOT NULL,
  icon       text DEFAULT '📁',
  color      text DEFAULT '#6366f1',
  class_name text,
  parent_id  bigint REFERENCES file_folders(id) ON DELETE SET NULL,
  is_pinned  boolean DEFAULT false,
  sort_order int DEFAULT 0,
  created_by text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS file_items (
  id             bigserial PRIMARY KEY,
  display_name   text NOT NULL,
  file_name      text,
  file_url       text NOT NULL,
  file_type      text,
  file_size      bigint,
  folder_id      bigint REFERENCES file_folders(id) ON DELETE SET NULL,
  class_name     text,
  tags           text,
  is_pinned      boolean DEFAULT false,
  download_count int DEFAULT 0,
  deleted_at     timestamptz,
  created_by     text,
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS file_downloads (
  id           bigserial PRIMARY KEY,
  file_id      bigint REFERENCES file_items(id) ON DELETE CASCADE,
  username     text,
  student_name text,
  created_at   timestamptz DEFAULT now()
);

-- RLS cho các bảng mới
ALTER TABLE file_folders  ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_downloads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='file_folders' AND policyname='allow_all_file_folders') THEN
    CREATE POLICY "allow_all_file_folders" ON file_folders FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='file_items' AND policyname='allow_all_file_items') THEN
    CREATE POLICY "allow_all_file_items" ON file_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='file_downloads' AND policyname='allow_all_file_downloads') THEN
    CREATE POLICY "allow_all_file_downloads" ON file_downloads FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- device_alerts (cảnh báo thiết bị)
CREATE TABLE IF NOT EXISTS device_alerts (
  id           bigserial PRIMARY KEY,
  username     text,
  student_name text,
  class_name   text,
  device_info  text,
  reason       text,
  created_at   timestamptz DEFAULT now()
);
ALTER TABLE device_alerts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='device_alerts' AND policyname='allow_all_device_alerts') THEN
    CREATE POLICY "allow_all_device_alerts" ON device_alerts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ================================================================
-- XONG MIGRATION! Reload lại trang admin sau khi chạy xong.
-- ================================================================

-- ================================================================
-- MIGRATION 2: Cập nhật access_logs, login_logs, announcements
-- ================================================================

-- access_logs: thêm các cột mới cho thống kê truy cập
ALTER TABLE access_logs ADD COLUMN IF NOT EXISTS accessed_at   timestamptz DEFAULT now();
ALTER TABLE access_logs ADD COLUMN IF NOT EXISTS content_type  text;   -- 'video' | 'doc'
ALTER TABLE access_logs ADD COLUMN IF NOT EXISTS content_id    bigint;
ALTER TABLE access_logs ADD COLUMN IF NOT EXISTS content_title text;
ALTER TABLE access_logs ADD COLUMN IF NOT EXISTS lesson_id     bigint;
ALTER TABLE access_logs ADD COLUMN IF NOT EXISTS lesson_name   text;
ALTER TABLE access_logs ADD COLUMN IF NOT EXISTS student_name  text;
ALTER TABLE access_logs ADD COLUMN IF NOT EXISTS class_name    text;
-- Đồng bộ accessed_at từ created_at cho dữ liệu cũ
UPDATE access_logs SET accessed_at = created_at WHERE accessed_at IS NULL;

-- login_logs: thêm cột logged_in_at
ALTER TABLE login_logs ADD COLUMN IF NOT EXISTS logged_in_at timestamptz DEFAULT now();
-- Đồng bộ logged_in_at từ created_at cho dữ liệu cũ
UPDATE login_logs SET logged_in_at = created_at WHERE logged_in_at IS NULL;

-- announcements: thêm cột pinned, priority, scheduled_at
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS pinned          boolean DEFAULT false;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS priority        text DEFAULT 'normal';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS scheduled_at    timestamptz;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS expires_at      timestamptz;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS target_username text;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS link_url        text;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS link_text       text;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS image_url       text;

-- ================================================================
-- XONG MIGRATION 2!
-- ================================================================

-- ================================================================
-- BẢNG GIÁO VIÊN (teachers) — Admin tạo, lưu vào Supabase
-- ================================================================
CREATE TABLE IF NOT EXISTS teachers (
  id         bigserial PRIMARY KEY,
  full_name  text NOT NULL,
  username   text UNIQUE NOT NULL,
  password   text NOT NULL,
  class_name text,          -- lớp được quản lý (phân quyền)
  active     boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'teachers' AND policyname = 'allow_all_teachers'
  ) THEN
    CREATE POLICY "allow_all_teachers" ON teachers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ================================================================
-- BẢNG QUẢN LÝ LỚP FACEBOOK / ZALO (members.html)
-- Chạy phần này nếu chưa có 2 bảng bên dưới
-- ================================================================

-- ── 20. FB_CLASSES (danh sách lớp) ───────────────────────────────
CREATE TABLE IF NOT EXISTS fb_classes (
  id         bigserial PRIMARY KEY,
  name       text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ── 21. CLASS_MEMBERS (học viên trong lớp) ───────────────────────
CREATE TABLE IF NOT EXISTS class_members (
  id          bigserial PRIMARY KEY,
  member_code text UNIQUE,
  full_name   text NOT NULL,
  class_name  text NOT NULL,
  zalo        text,
  gmail       text,
  fb_name     text,
  notes       text,
  created_at  timestamptz DEFAULT now()
);

-- ── RLS cho 2 bảng mới ───────────────────────────────────────────
ALTER TABLE fb_classes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'fb_classes' AND policyname = 'allow_all_fb_classes'
  ) THEN
    CREATE POLICY "allow_all_fb_classes" ON fb_classes
      FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'class_members' AND policyname = 'allow_all_class_members'
  ) THEN
    CREATE POLICY "allow_all_class_members" ON class_members
      FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ================================================================
-- XONG! Chạy xong thì reload trang members.html
-- ================================================================


-- ================================================================
-- MIGRATION: TRANG BÀI TẬP (homework.html)
-- Chạy toàn bộ phần này trong Supabase SQL Editor
-- ================================================================

-- ── 1. HOMEWORK (đề bài tập) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS homework (
  id                bigserial PRIMARY KEY,
  title             text NOT NULL,
  description       text,
  class_name        text,                    -- null = giao tất cả, "12A,12B" = nhiều lớp
  allowed_usernames text,                    -- gán riêng cho học sinh cụ thể
  due_date          date,                    -- hạn nộp (null = không giới hạn)
  time_limit        int,                     -- phút làm bài (null = không giới hạn)
  max_attempts      int DEFAULT 1,           -- 0 = không giới hạn lần làm
  total_score       numeric,
  grading_notes     text,
  created_by        text,
  is_draft          boolean DEFAULT false,
  is_locked         boolean DEFAULT false,
  allow_download    boolean DEFAULT false,
  shuffle_questions boolean DEFAULT false,
  shuffle_answers   boolean DEFAULT false,
  anti_paste        boolean DEFAULT false,
  open_at           timestamptz,             -- hẹn giờ mở bài
  deleted_at        timestamptz,             -- soft delete (thùng rác)
  created_at        timestamptz DEFAULT now()
);

-- ── 2. HOMEWORK_QUESTIONS (câu hỏi) ────────────────────────────
CREATE TABLE IF NOT EXISTS homework_questions (
  id            bigserial PRIMARY KEY,
  homework_id   bigint REFERENCES homework(id) ON DELETE CASCADE,
  order_index   int DEFAULT 0,
  question_type text NOT NULL,   -- 'multiple_choice' | 'true_false' | 'matching' | 'short_answer' | 'section'
  question_text text,
  image_url     text,
  data          jsonb DEFAULT '{}',  -- options, correct_answer, pairs, accepted_answers...
  points        numeric DEFAULT 1,
  created_at    timestamptz DEFAULT now()
);

-- ── 3. HOMEWORK_SUBMISSIONS (bài nộp) ──────────────────────────
CREATE TABLE IF NOT EXISTS homework_submissions (
  id              bigserial PRIMARY KEY,
  homework_id     bigint REFERENCES homework(id) ON DELETE CASCADE,
  username        text NOT NULL,
  student_name    text,
  class_name      text,
  answers         jsonb DEFAULT '{}',   -- { question_id: answer }
  note            text,
  status          text DEFAULT 'submitted',  -- 'submitted' | 'graded' | 'active'
  score           numeric,
  max_score       numeric,
  manual_scores   jsonb,                -- chấm tay tự luận { question_id: score }
  time_used       int,                  -- giây đã dùng
  attempt         int DEFAULT 1,
  tab_violations  int DEFAULT 0,
  force_submitted boolean DEFAULT false,
  submitted_at    timestamptz DEFAULT now(),
  UNIQUE(homework_id, username, attempt)
);

-- ── 4. EXAM_PROGRESS (theo dõi học sinh đang làm bài realtime) ─
CREATE TABLE IF NOT EXISTS exam_progress (
  id                bigserial PRIMARY KEY,
  homework_id       bigint REFERENCES homework(id) ON DELETE CASCADE,
  username          text NOT NULL,
  student_name      text,
  class_name        text,
  current_question  int DEFAULT 0,
  answered_count    int DEFAULT 0,
  total_questions   int DEFAULT 0,
  elapsed_secs      int DEFAULT 0,
  status            text DEFAULT 'active',  -- 'active' | 'submitted' | 'force_stopped'
  tab_violations    int DEFAULT 0,
  flagged_questions text,
  force_submit      boolean DEFAULT false,  -- admin bắt buộc nộp
  updated_at        timestamptz DEFAULT now(),
  UNIQUE(homework_id, username)
);

-- ── 5. APP_SETTINGS (cài đặt ứng dụng, gồm maintenance mode) ──
CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      text,
  updated_at timestamptz DEFAULT now()
);

-- Giá trị mặc định
INSERT INTO app_settings (key, value) VALUES
  ('maintenance', 'false'),
  ('homework_notice', '')
ON CONFLICT (key) DO NOTHING;

-- ================================================================
-- ROW LEVEL SECURITY — Cho phép anon truy cập
-- ================================================================
ALTER TABLE homework             ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_questions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_progress        ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings         ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='homework' AND policyname='allow_all_homework') THEN
    CREATE POLICY "allow_all_homework" ON homework FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='homework_questions' AND policyname='allow_all_homework_questions') THEN
    CREATE POLICY "allow_all_homework_questions" ON homework_questions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='homework_submissions' AND policyname='allow_all_homework_submissions') THEN
    CREATE POLICY "allow_all_homework_submissions" ON homework_submissions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='exam_progress' AND policyname='allow_all_exam_progress') THEN
    CREATE POLICY "allow_all_exam_progress" ON exam_progress FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='app_settings' AND policyname='allow_all_app_settings') THEN
    CREATE POLICY "allow_all_app_settings" ON app_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ================================================================
-- REALTIME — Bật realtime để theo dõi làm bài trực tiếp
-- ================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE exam_progress;
ALTER PUBLICATION supabase_realtime ADD TABLE homework_submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE app_settings;

-- ================================================================
-- INDEX — Tăng tốc truy vấn
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_homework_class         ON homework(class_name);
CREATE INDEX IF NOT EXISTS idx_hw_questions_hw_id     ON homework_questions(homework_id);
CREATE INDEX IF NOT EXISTS idx_hw_submissions_hw_id   ON homework_submissions(homework_id);
CREATE INDEX IF NOT EXISTS idx_hw_submissions_user    ON homework_submissions(username);
CREATE INDEX IF NOT EXISTS idx_exam_progress_hw_user  ON exam_progress(homework_id, username);

-- ================================================================
-- XONG! Reload lại trang homework.html sau khi chạy xong.
-- ================================================================


-- ================================================================
-- VOCAB & GRAMMAR — Từ vựng và Ngữ pháp
-- ================================================================

-- Bộ từ vựng (do GV tạo)
CREATE TABLE IF NOT EXISTS vocab_sets (
  id               bigserial PRIMARY KEY,
  title            text NOT NULL,
  description      text,
  class_name       text,
  allowed_usernames text,
  created_by       text,
  sort_order       int DEFAULT 0,
  created_at       timestamptz DEFAULT now()
);

-- Từng từ trong bộ từ vựng
CREATE TABLE IF NOT EXISTS vocab_words (
  id          bigserial PRIMARY KEY,
  set_id      bigint REFERENCES vocab_sets(id) ON DELETE CASCADE,
  word        text NOT NULL,         -- từ tiếng Anh
  phonetic    text,                  -- phiên âm /prəˌnʌn.siˈeɪ.ʃən/
  meaning     text NOT NULL,         -- nghĩa tiếng Việt
  example     text,                  -- câu ví dụ
  image_url   text,                  -- ảnh minh họa (tuỳ chọn)
  sort_order  int DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- Bài học ngữ pháp (do GV tạo)
CREATE TABLE IF NOT EXISTS grammar_lessons (
  id               bigserial PRIMARY KEY,
  title            text NOT NULL,    -- VD: "Thì hiện tại đơn"
  content          text NOT NULL,    -- Giải thích (HTML hoặc Markdown)
  class_name       text,
  allowed_usernames text,
  created_by       text,
  sort_order       int DEFAULT 0,
  created_at       timestamptz DEFAULT now()
);

-- Câu hỏi quiz cho bài ngữ pháp
CREATE TABLE IF NOT EXISTS grammar_questions (
  id          bigserial PRIMARY KEY,
  lesson_id   bigint REFERENCES grammar_lessons(id) ON DELETE CASCADE,
  question    text NOT NULL,
  option_a    text NOT NULL,
  option_b    text NOT NULL,
  option_c    text NOT NULL,
  option_d    text NOT NULL,
  answer      text NOT NULL,         -- 'A' | 'B' | 'C' | 'D'
  explanation text,
  sort_order  int DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- RLS + Policies
ALTER TABLE vocab_sets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocab_words      ENABLE ROW LEVEL SECURITY;
ALTER TABLE grammar_lessons  ENABLE ROW LEVEL SECURITY;
ALTER TABLE grammar_questions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vocab_sets' AND policyname='allow_all_vocab_sets') THEN
    CREATE POLICY "allow_all_vocab_sets" ON vocab_sets FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vocab_words' AND policyname='allow_all_vocab_words') THEN
    CREATE POLICY "allow_all_vocab_words" ON vocab_words FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='grammar_lessons' AND policyname='allow_all_grammar_lessons') THEN
    CREATE POLICY "allow_all_grammar_lessons" ON grammar_lessons FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='grammar_questions' AND policyname='allow_all_grammar_questions') THEN
    CREATE POLICY "allow_all_grammar_questions" ON grammar_questions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
