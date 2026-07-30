-- ============================================================
-- FIX: Cho phép xóa alerts từ admin (anon key)
-- Chạy trong Supabase Dashboard > SQL Editor
-- ============================================================

-- Xóa policy cũ nếu có
drop policy if exists "alerts_delete" on alerts;
drop policy if exists "alerts_all"    on alerts;

-- Cho phép anon xóa alerts (admin dùng anon key)
drop policy if exists "alerts_delete" on alerts;
drop policy if exists "alerts_all"    on alerts;

-- Cho phép anon update alerts (nếu cần)
create policy "alerts_update" on alerts
  for update using (true);

-- Cho phép anon select alerts
drop policy if exists "alerts_select" on alerts;
create policy "alerts_select" on alerts
  for select using (true);

-- ============================================================
-- FIX: Cho phép xóa/sửa announcements từ admin (anon key)
-- ============================================================
drop policy if exists "announcements_delete" on announcements;
drop policy if exists "announcements_insert" on announcements;
drop policy if exists "announcements_update" on announcements;

create policy "announcements_insert" on announcements for insert with check (true);
create policy "announcements_update" on announcements for update using (true);
create policy "announcements_delete" on announcements for delete using (true);
