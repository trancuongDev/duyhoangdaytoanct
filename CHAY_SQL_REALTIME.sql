-- Chạy TỪNG DÒNG MỘT trong Supabase SQL Editor
-- Dòng nào báo "already member" thì bỏ qua — KHÔNG PHẢI LỖI

ALTER PUBLICATION supabase_realtime ADD TABLE homework;
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE homework_submissions;
