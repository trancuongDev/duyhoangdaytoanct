-- ============================================================
-- FIX: Cho phép xóa alerts từ admin (anon key)
-- Chạy trong Supabase Dashboard > SQL Editor
-- ============================================================

-- Xóa policy cũ nếu có
drop policy if exists "alerts_delete" on alerts;
drop policy if exists "alerts_all"    on alerts;

-- Cho phép anon xóa alerts (admin dùng anon key)
create policy "alerts_delete" on alerts
  for delete using (true);

-- Cho phép anon update alerts (nếu cần)
create policy "alerts_update" on alerts
  for update using (true);

-- Cho phép anon select alerts
drop policy if exists "alerts_select" on alerts;
create policy "alerts_select" on alerts
  for select using (true);
