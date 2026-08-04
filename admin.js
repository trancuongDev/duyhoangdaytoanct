//// Khởi tạo Supabase client (CDN đã load sẵn qua script tag)
const db = supabase.createClient(
  'https://gojpmogjretoxplydjvg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvanBtb2dqcmV0b3hwbHlkanZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0Nzg4ODEsImV4cCI6MjA5MzA1NDg4MX0.iLCNd2VRMiZoFp6_KclZlFsOenUNoM041tl1fobHKDA'
);

// ── Toast thông báo ──────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, ok = true) {
  const t = document.getElementById('adminToast');
  if (!t) return;
  t.textContent = (ok ? '✅ ' : '❌ ') + msg;
  t.style.background = ok ? '#1e293b' : '#7f1d1d';
  t.style.opacity = '1';
  t.style.transform = 'translateX(-50%) translateY(0)';
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(-50%) translateY(80px)';
  }, 3000);
}

// ── Browser Notification cho admin ──────────────────────────────
(function _initAdminNotif() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    // Hỏi quyền sau khi trang load xong
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => Notification.requestPermission(), 2500);
    });
  }
})();

function _adminBrowserNotify(title, body, icon = 'icons/icon-192.png') {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return; // tab đang active → dùng popup trong trang
  try {
    const n = new Notification(title, { body, icon, badge: icon, requireInteraction: false });
    n.onclick = () => { window.focus(); n.close(); };
    setTimeout(() => n.close(), 6000);
  } catch(e) {}
}

// ---- Hash mật khẩu SHA-256 (dùng chung toàn file) ----
async function hashPw(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ---- Mã hóa / giải mã link AES-GCM ----
const _ENC_KEY = 'DHDTCT-LMS-2025-SECURE-KEY-32BYT'; // 32 ký tự
async function _getKey() {
  const raw = new TextEncoder().encode(_ENC_KEY.slice(0,32).padEnd(32,'0'));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt','decrypt']);
}
async function encryptUrl(url) {
  if (!url || url.startsWith('ENC:')) return url;
  try {
    const key = await _getKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, new TextEncoder().encode(url));
    const combined = new Uint8Array(iv.length + enc.byteLength);
    combined.set(iv); combined.set(new Uint8Array(enc), iv.length);
    return 'ENC:' + btoa(String.fromCharCode(...combined));
  } catch { return url; }
}
async function decryptUrl(enc) {
  if (!enc || !enc.startsWith('ENC:')) return enc;
  try {
    const key = await _getKey();
    const combined = Uint8Array.from(atob(enc.slice(4)), c => c.charCodeAt(0));
    const iv = combined.slice(0,12), data = combined.slice(12);
    const dec = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, data);
    return new TextDecoder().decode(dec);
  } catch { return enc; }
}

// ---- Kiểm tra trùng Gmail / SĐT ----
async function checkDuplicate(username, phone, excludeId=null) {
  const warnings = [];
  const queries = [];
  if (username) {
    let q = db.from('students').select('id,full_name').eq('username', username);
    if (excludeId) q = q.neq('id', excludeId);
    queries.push(q);
  } else queries.push(Promise.resolve({ data: [] }));
  if (phone) {
    let q = db.from('students').select('id,full_name').eq('phone', phone);
    if (excludeId) q = q.neq('id', excludeId);
    queries.push(q);
  } else queries.push(Promise.resolve({ data: [] }));

  const [{ data: gmailData }, { data: phoneData }] = await Promise.all(queries);
  if (gmailData?.length) warnings.push(`Gmail <b>${username}</b> đã được dùng bởi <b>${gmailData[0].full_name}</b>.`);
  if (phoneData?.length) warnings.push(`SĐT <b>${phone}</b> đã được dùng bởi <b>${phoneData[0].full_name}</b>.`);
  return warnings;
}

// ---- Gmail validation ----
function isValidGmail(val) {
  return /^[a-zA-Z0-9._%+\-]+@gmail\.com$/i.test(val.trim());
}
function attachGmailValidation(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('blur', async () => {
    const val = el.value.trim();
    // Xóa hint cũ
    let hint = el.nextElementSibling;
    if (hint && hint.classList.contains('gmail-hint')) hint.remove();
    if (val && !isValidGmail(val)) {
      el.style.borderColor = 'var(--danger, #ef4444)';
      hint = document.createElement('small');
      hint.className = 'gmail-hint';
      hint.style.cssText = 'color:var(--danger,#ef4444);font-size:.78rem;margin-top:2px;display:block';
      hint.textContent = 'Gmail không hợp lệ. VD: hocsinh@gmail.com';
      el.insertAdjacentElement('afterend', hint);
    } else if (val && isValidGmail(val)) {
      el.style.borderColor = '';
      const excludeId = el.closest('form,div')?.querySelector('[data-editing-id]')?.dataset.editingId || null;
      // Lấy thông tin học viên nếu đã tồn tại
      const { data: existing } = await db.from('students').select('*').eq('username', val).maybeSingle();
      if (existing && !excludeId) {
        // Chỉ áp dụng cho form tạo mới (csUsername)
        if (id === 'csUsername') {
          el.style.borderColor = 'var(--warning,#f59e0b)';
          hint = document.createElement('div');
          hint.className = 'gmail-hint';
          hint.style.cssText = 'background:#fef3c7;border:1.5px solid #f59e0b;border-radius:10px;padding:.75rem 1rem;margin-top:.4rem;font-size:.83rem';
          hint.innerHTML = `
            <div style="font-weight:700;color:#92400e;margin-bottom:.4rem">⚠️ Gmail này đã có tài khoản: <b>${existing.full_name}</b></div>
            <div style="color:#78350f;margin-bottom:.6rem">Lớp hiện tại: <b>${existing.class_name||'Chưa có'}</b></div>
            <div style="display:flex;gap:.5rem;flex-wrap:wrap">
              <button type="button" id="fillExistingBtn" style="background:#f59e0b;color:#fff;border:none;padding:.4rem .9rem;border-radius:8px;font-size:.82rem;font-weight:700;cursor:pointer">📋 Điền thông tin & thêm lớp phụ</button>
              <button type="button" id="deleteExistingBtn" style="background:#ef4444;color:#fff;border:none;padding:.4rem .9rem;border-radius:8px;font-size:.82rem;font-weight:700;cursor:pointer">🗑 Xóa & cấp tài khoản mới</button>
            </div>`;
          el.insertAdjacentElement('afterend', hint);
          hint.querySelector('#deleteExistingBtn').addEventListener('click', () => {
            showConfirm(`Xóa tài khoản của "${existing.full_name}" để cấp mới?`, async () => {
              await db.from('students').delete().eq('id', existing.id);
              // Reset hint và form để cấp mới
              hint.remove();
              el.style.borderColor = '';
              delete el.dataset.existingId;
              delete el.dataset.existingClasses;
              document.getElementById('csName').value = '';
              document.getElementById('csPhone').value = '';
              genStudentCode().then(c => {
                document.getElementById('csCode').value = c;
                document.getElementById('csPassword').value = c;
              });
              renderMiniStudents();
            });
          });
          hint.querySelector('#fillExistingBtn').addEventListener('click', async () => {
            // Điền thông tin vào form
            document.getElementById('csName').value = existing.full_name;
            document.getElementById('csPhone').value = existing.phone || '';
            document.getElementById('csCode').value = existing.student_code || '';
            document.getElementById('csPassword').value = existing.student_code || '';
            if (existing.expiry_date) document.getElementById('csExpiry').value = existing.expiry_date;
            if (existing.notes) document.getElementById('csNotes').value = existing.notes;
            await populateCsClassSelect();
            // Đổi sang mode thêm lớp phụ
            _resetCsClassSelect();
            // Thêm label hướng dẫn
            hint.innerHTML = `
              <div style="font-weight:700;color:#065f46;margin-bottom:.3rem">✅ Đã điền thông tin của <b>${existing.full_name}</b></div>
              <div style="color:#047857;font-size:.8rem">Lớp hiện tại: <b>${existing.class_name||'Chưa có'}</b><br/>Chọn lớp mới bên dưới để thêm vào tài khoản này.</div>`;
            hint.style.background = '#d1fae5';
            hint.style.borderColor = '#10b981';
            // Đánh dấu đây là update thay vì insert
            el.dataset.existingId = existing.id;
            el.dataset.existingClasses = existing.class_name || '';
          });
        } else {
          el.style.borderColor = 'var(--warning,#f59e0b)';
          hint = document.createElement('small');
          hint.className = 'gmail-hint';
          hint.style.cssText = 'color:var(--warning,#f59e0b);font-size:.78rem;margin-top:2px;display:block;font-weight:600';
          hint.innerHTML = `⚠️ Gmail đã được dùng bởi <b>${existing.full_name}</b>`;
          el.insertAdjacentElement('afterend', hint);
        }
      }
    } else {
      el.style.borderColor = '';
    }
  });
  el.addEventListener('input', () => {
    el.style.borderColor = '';
    const hint = el.nextElementSibling;
    if (hint && hint.classList.contains('gmail-hint')) hint.remove();
  });
}

// ---- Kiểm tra trùng SĐT realtime khi blur ----
function attachPhoneDuplicateCheck(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('blur', async () => {
    const val = el.value.trim();
    let hint = el.nextElementSibling;
    if (hint && hint.classList.contains('phone-dup-hint')) hint.remove();
    if (!val || val.length < 10) return;
    const excludeId = el.closest('form,div')?.querySelector('[data-editing-id]')?.dataset.editingId || null;
    const dups = await checkDuplicate(null, val, excludeId);
    if (dups.length) {
      el.style.borderColor = 'var(--warning,#f59e0b)';
      hint = document.createElement('small');
      hint.className = 'phone-dup-hint';
      hint.style.cssText = 'color:var(--warning,#f59e0b);font-size:.78rem;margin-top:2px;display:block;font-weight:600';
      hint.innerHTML = '⚠️ ' + dups[0];
      el.insertAdjacentElement('afterend', hint);
    } else {
      el.style.borderColor = '';
    }
  });
  el.addEventListener('input', () => {
    el.style.borderColor = '';
    const hint = el.nextElementSibling;
    if (hint && hint.classList.contains('phone-dup-hint')) hint.remove();
  });
}

// ---- Phone input: chỉ cho nhập số, tự bỏ chữ, tối đa 10 số ----
function enforcePhoneInput(e) {
  const input = e.target;
  const pos = input.selectionStart;
  const cleaned = input.value.replace(/\D/g, '').slice(0, 10);
  if (input.value !== cleaned) {
    input.value = cleaned;
    // giữ vị trí con trỏ
    const newPos = Math.min(pos, cleaned.length);
    input.setSelectionRange(newPos, newPos);
  }
}
document.addEventListener('DOMContentLoaded', () => {
  ['csPhone', 'addPhone'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', enforcePhoneInput);
  });
  ['csPhone', 'addPhone', 'esPhone'].forEach(attachPhoneDuplicateCheck);
  ['csUsername', 'addUsername', 'esUsername'].forEach(attachGmailValidation);

  // Đóng dropdown Công cụ khi click ra ngoài
  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('toolsDropdownWrap');
    const menu = document.getElementById('toolsDropdownMenu');
    if (wrap && menu && !wrap.contains(e.target)) {
      menu.style.display = 'none';
    }
  });
});

// ---- Custom confirm popup ----
function showConfirm(message, onOk, { title='Xác nhận xóa', icon='🗑', okText='Xóa', cancelText='Hủy', onCancel=null } = {}) {
  document.getElementById('confirmIcon').textContent = icon;
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmOkBtn').textContent = okText;
  const cancelBtn = document.getElementById('confirmCancelBtn');
  cancelBtn.textContent = cancelText;
  document.getElementById('confirmModal').classList.add('open');
  const ok = document.getElementById('confirmOkBtn');
  const cancel = document.getElementById('confirmCancelBtn');
  const close = () => {
    document.getElementById('confirmModal').classList.remove('open');
    // Clone để xóa hết event listeners cũ
    ok.replaceWith(ok.cloneNode(true));
    cancel.replaceWith(cancel.cloneNode(true));
  };
  ok.addEventListener('click', () => { close(); onOk(); }, { once: true });
  cancel.addEventListener('click', () => {
    close();
    if (onCancel) onCancel();
  }, { once: true });
}

// Auth guard
const _role = sessionStorage.getItem('dh_role');
if (_role !== 'teacher' && _role !== 'assistant') location.href = 'login.html';
const isTeacher = _role === 'teacher';

// ---- Helpers ----
function fmtDate(d) { if (!d) return ''; const [y,m,day]=(d||'').split('-'); return `${day}/${m}/${y}`; }
function fmtTime(ts) { return new Date(ts).toLocaleString('vi-VN'); }

// ---- Ghi log biến động tài khoản vào bảng alerts ----
async function logAccountActivity(action, student) {
  // action: 'Tạo tài khoản' | 'Xóa tài khoản' | 'Sửa tài khoản'
  const by = sessionStorage.getItem('dh_name') || 'Admin';
  const role = isTeacher ? 'Admin' : 'Trợ lý';
  await db.from('alerts').insert({
    student_name: student.full_name || student.name || '',
    username:     student.username  || '',
    class_name:   student.class_name || student.cls || '',
    reason:       `${action} — bởi ${role} ${by}`
  });
}

// ---- Ghi log hoạt động hệ thống tổng quát ----
// category: 'Học sinh' | 'Bài học' | 'Nhóm bài' | 'Video' | 'Tài liệu' | 'Lớp học' | 'Thông báo' | 'Lịch học' | 'File' | 'Thư mục' | 'Hệ thống'
async function logActivity(category, action, detail = '', extra = '') {
  const by   = sessionStorage.getItem('dh_name') || 'Admin';
  const role = isTeacher ? 'Admin' : 'Trợ lý';
  await db.from('alerts').insert({
    student_name: detail,      // Dùng student_name để lưu tên đối tượng
    username:     extra || '', // Dùng username để lưu thông tin phụ (lớp, v.v.)
    class_name:   category,    // Dùng class_name để lưu danh mục
    reason:       `[${category}] ${action} — bởi ${role} ${by}`
  }).catch(() => {}); // Không chặn UI nếu log lỗi
}

const displayName = sessionStorage.getItem('dh_name') || 'Admin';
const displayRole = isTeacher ? 'Admin' : 'Trợ lý';
document.getElementById('teacherName').textContent = displayName;
document.getElementById('profileName').textContent  = displayName;
document.querySelector('.av-role').textContent      = displayRole;

if (!isTeacher) {
  // Ẩn duy nhất link Quản trị hệ thống (chỉ dành cho teacher)
  document.querySelectorAll('a[href="sysadmin.html"]').forEach(el => el.style.display = 'none');

  // Ẩn các field ngày hết hạn (trợ lý không được đặt)
  ['expiryReminderPanel','classExpiryNotices','syncExpiryBtn',
   'studentFilterExpiry','csExpiryGroup','esExpiryGroup','addExpiryGroup'
  ].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
}

document.getElementById('logoutBtn').addEventListener('click', e => { e.preventDefault(); sessionStorage.clear(); location.href='login.html'; });
document.getElementById('menuToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarBackdrop').classList.toggle('show');
});
document.getElementById('sidebarBackdrop').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('show');
});

// Sidebar mini toggle (desktop) — nút ◀ thu nhỏ
document.querySelector('.sidebar-mini-toggle')?.addEventListener('click', () => {
  document.body.classList.add('sidebar-mini');
  sessionStorage.setItem('dh_sidebar_mini', '1');
});
// Nút ▶ mở lại
document.querySelector('.sidebar-mini-reopen button')?.addEventListener('click', () => {
  document.body.classList.remove('sidebar-mini');
  sessionStorage.setItem('dh_sidebar_mini', '');
});
// Khôi phục trạng thái
if (sessionStorage.getItem('dh_sidebar_mini') === '1') document.body.classList.add('sidebar-mini');

// ---- Sidebar navigation ----
function showPage(name) {
  sessionStorage.setItem('dh_page', name);
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.slink').forEach(l => l.classList.remove('active'));
  const key = name.charAt(0).toUpperCase() + name.slice(1).replace(/-([a-z])/g, g => g[1].toUpperCase());
  const page = document.getElementById('page' + key);
  if (page) page.classList.add('active');
  document.querySelectorAll(`[data-page="${name}"]`).forEach(l => l.classList.add('active'));
  if (name === 'overview')       renderOverview();
  if (name === 'students')       { populateClassFilters(); renderStudents(); startStudentAutoRefresh(); }
  if (name !== 'students')       stopStudentAutoRefresh();
  if (name === 'create-student') {
    renderMiniStudents();
    populateCsClassSelect();
    genStudentCode().then(code => {
      document.getElementById('csCode').value = code;
      document.getElementById('csPassword').value = code;
    });
  }
  if (name === 'lessons')        { populateClassFilters(); renderLessons(); }
  if (name === 'lesson-groups')  { populateClassFilters(); renderGroups(); }
  if (name === 'security')       {
    const dateEl = document.getElementById('alertDateFilter');
    if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];
    renderAlerts();
  }
  if (name === 'devices')        {
    const today = new Date().toISOString().split('T')[0];
    const fromEl = document.getElementById('deviceAlertDateFrom');
    if (fromEl && !fromEl.value) fromEl.value = today;
    renderDeviceAlerts();
  }
  if (name === 'access-stats')   renderAccessStats();
  if (name === 'login-history')  renderLoginHistory();
  if (name === 'announcements')  { populateClassFilters(); renderAnnouncements(); }
  if (name === 'classes')        renderClasses();
  if (name === 'schedule')       { populateClassFilters(); renderSchedule(); }
  if (name === 'files')          initFileManager();
  if (name === 'guide')          adminRenderGuide();
}
document.querySelectorAll('.slink[data-page]').forEach(l => {
  l.addEventListener('click', e => { e.preventDefault(); showPage(l.dataset.page); document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarBackdrop').classList.remove('show'); });
});
document.querySelectorAll('[data-goto]').forEach(l => {
  l.addEventListener('click', e => { e.preventDefault(); showPage(l.dataset.goto); });
});


// ---- Class filters ----
// Cache danh sách lớp — invalidate khi thêm/xóa lớp
let _classesCache = null;
let _classesCacheTime = 0;
const _CLASSES_CACHE_TTL = 30000; // 30s

async function getClasses() {
  const now = Date.now();
  if (_classesCache && (now - _classesCacheTime) < _CLASSES_CACHE_TTL) {
    return _classesCache;
  }
  const [{ data: cls }, { data: sts }, { data: sc }] = await Promise.all([
    db.from('classes').select('name').order('name'),
    db.from('students').select('class_name'),
    db.from('student_classes').select('class_name'),
  ]);
  const fromClasses  = (cls||[]).map(c => c.name);
  const fromStudents = (sts||[])
    .flatMap(s => (s.class_name||'').split(',').map(c => c.trim()))
    .filter(Boolean);
  const fromSC = (sc||[]).map(s => s.class_name).filter(Boolean);
  _classesCache = [...new Set([...fromClasses, ...fromStudents, ...fromSC])].sort();
  _classesCacheTime = now;
  return _classesCache;
}

function _invalidateClassesCache() {
  _classesCache = null;
  _classesCacheTime = 0;
}

let _populatingFilters = false;

async function populateClassFilters() {
  const classes = await getClasses();
  const filterOpts = '<option value="">Tất cả lớp</option>' + classes.map(c=>`<option value="${c}">${c}</option>`).join('');
  const modalOpts  = '<option value="">-- Tất cả lớp --</option>' + classes.map(c=>`<option value="${c}">${c}</option>`).join('');
  _populatingFilters = true;
  ['studentFilterClass','lessonFilterClass','accessFilterClass','loginHistoryFilterClass','annClass','annFilterClass','scheduleFilterClass'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    const cur = el.value; el.innerHTML = filterOpts; el.value = cur;
  });
  const lcs = document.getElementById('lClassSelect'); if (lcs) { const cur=lcs.value; lcs.innerHTML=modalOpts; lcs.value=cur; }
  ['addClass','esClass','groupClassSelect','scheduleClass','schedSlotClass'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    const cur = el.value; el.innerHTML = modalOpts; el.value = cur;
  });
  _populatingFilters = false;
}

// ---- Populate nhóm bài học vào dropdown (hỗ trợ cây 3 cấp) ----
async function populateGroupSelect(selectId, currentVal='') {
  const { data: groups } = await db.from('lesson_groups').select('*').order('name');
  const el = document.getElementById(selectId); if (!el) return;

  // Xây cây
  const roots = (groups||[]).filter(g => !g.parent_id);
  function buildOptions(nodes, depth=0) {
    let opts = '';
    nodes.forEach(g => {
      const prefix = depth === 0 ? '' : depth === 1 ? '　├ ' : '　　└ ';
      opts += `<option value="${g.id}">${prefix}${g.name}</option>`;
      const children = (groups||[]).filter(c => c.parent_id === g.id);
      if (children.length && depth < 2) opts += buildOptions(children, depth + 1);
    });
    return opts;
  }
  el.innerHTML = '<option value="">-- Không có nhóm --</option>' + buildOptions(roots);
  // Match theo id hoặc name
  if (currentVal) {
    const match = (groups||[]).find(g => g.id == currentVal || g.name === currentVal);
    if (match) el.value = match.id;
  }
}

// ============================================================
// NHÓM BÀI HỌC
// ============================================================
async function renderGroups() {
  const { data: list } = await db.from('lesson_groups').select('*').order('name');
  const container = document.getElementById('groupList');
  container.innerHTML = '';
  document.getElementById('emptyGroups').style.display = (list||[]).length ? 'none' : 'block';
  if (!(list||[]).length) return;

  const { data: allLessonsRaw } = await db.from('lessons').select('id,name,class_name,description,group_id,group_name,sort_order,allowed_usernames').order('sort_order', {ascending: true}).order('created_at', {ascending: true});
  // Dedup theo id phòng trùng
  const seenLessonIds = new Set();
  const allLessons = (allLessonsRaw||[]).filter(l => {
    if (seenLessonIds.has(l.id)) return false;
    seenLessonIds.add(l.id);
    return true;
  });
  const lessonIds = (allLessons||[]).map(l => l.id);
  const [{ data: allVids }, { data: allDocs }] = lessonIds.length ? await Promise.all([
    db.from('lesson_videos').select('lesson_id').in('lesson_id', lessonIds),
    db.from('lesson_docs').select('lesson_id').in('lesson_id', lessonIds),
  ]) : [{ data: [] }, { data: [] }];
  const vcMap = {}, dcMap = {};
  (allVids||[]).forEach(v => { vcMap[v.lesson_id] = (vcMap[v.lesson_id]||0)+1; });
  (allDocs||[]).forEach(d => { dcMap[d.lesson_id] = (dcMap[d.lesson_id]||0)+1; });

  const colors = [
    { gc:'#6366f1', gcLight:'#eef2ff', gcGlow:'rgba(99,102,241,.15)' },
    { gc:'#0ea5e9', gcLight:'#e0f2fe', gcGlow:'rgba(14,165,233,.15)' },
    { gc:'#10b981', gcLight:'#d1fae5', gcGlow:'rgba(16,185,129,.15)' },
    { gc:'#f59e0b', gcLight:'#fef3c7', gcGlow:'rgba(245,158,11,.15)' },
    { gc:'#ec4899', gcLight:'#fce7f3', gcGlow:'rgba(236,72,153,.15)' },
    { gc:'#8b5cf6', gcLight:'#ede9fe', gcGlow:'rgba(139,92,246,.15)' },
  ];

  const grid = document.createElement('div');
  grid.className = 'group-card-grid';
  container.appendChild(grid);

  function getLessonsForGroup(gId) {
    // Ưu tiên group_id, fallback group_name chỉ cho bài chưa có group_id
    const g = (list||[]).find(x => x.id === gId);
    const seen = new Set();
    return (allLessons||[]).filter(l => {
      let match;
      if (l.group_id != null) {
        match = l.group_id === gId; // bài có group_id → chỉ match đúng nhóm
      } else {
        match = g && l.group_name === g.name; // bài cũ chưa có group_id → fallback group_name
      }
      if (!match) return false;
      if (seen.has(l.id)) return false;
      seen.add(l.id);
      return true;
    });
  }

  function buildLessonItem(l, idx, onOpen, onEdit, onDel) {
    const item = document.createElement('div');
    item.className = 'group-lesson-item';
    item.dataset.id = l.id;
    const handle = document.createElement('div');
    handle.innerHTML = '⠿';
    handle.title = 'Kéo để sắp xếp';
    handle.style.cssText = 'cursor:grab;color:var(--muted);font-size:1.1rem;padding:0 .4rem;flex-shrink:0;user-select:none';
    handle.className = 'drag-handle';
    const num = document.createElement('div'); num.className = 'group-lesson-num'; num.textContent = idx + 1;
    const info = document.createElement('div'); info.className = 'group-lesson-info';
    info.innerHTML = `<div class="group-lesson-title"><span style="margin-right:.35rem">📚</span>${l.name}</div>
      <div class="group-lesson-stats"><span>${vcMap[l.id]||0} video</span><span>${dcMap[l.id]||0} tài liệu</span>${l.class_name?`<span class="class-tag" style="font-size:.68rem">${l.class_name}</span>`:''}${_allowedBadge(l.allowed_usernames)}</div>`;
    const acts = document.createElement('div'); acts.className = 'group-lesson-item-actions';
    const openBtn = document.createElement('button'); openBtn.className = 'group-lesson-open'; openBtn.textContent = '→';
    openBtn.addEventListener('click', e => { e.stopPropagation(); onOpen(); });
    acts.appendChild(openBtn);
    if (onEdit) { const eb = document.createElement('button'); eb.className = 'btn-sm'; eb.textContent = '✏️'; eb.addEventListener('click', e => { e.stopPropagation(); onEdit(); }); acts.appendChild(eb); }
    if (onDel)  { const db2 = document.createElement('button'); db2.className = 'btn-sm btn-danger'; db2.textContent = '🗑'; db2.addEventListener('click', e => { e.stopPropagation(); onDel(); }); acts.appendChild(db2); }
    item.appendChild(handle); item.appendChild(num); item.appendChild(info); item.appendChild(acts);
    item.addEventListener('click', onOpen);
    return item;
  }

  function buildGroupCard(g, depth, colorIdx) {
    const c = colors[colorIdx % colors.length];
    const children = (list||[]).filter(x => x.parent_id === g.id);
    const directLessons = getLessonsForGroup(g.id);

    const card = document.createElement('div');
    card.className = 'group-card';
    card.style.setProperty('--gc', c.gc);
    card.style.setProperty('--gc-light', c.gcLight);
    card.style.setProperty('--gc-glow', c.gcGlow);
    if (depth > 0) card.style.marginLeft = (depth * 18) + 'px';

    const header = document.createElement('div');
    header.className = 'group-card-header';

    const iconEl = document.createElement('div');
    iconEl.className = 'group-card-icon';
    const icons = ['📚','🎯','🔥','💡','⭐','🚀','📖','🏆'];
    iconEl.textContent = icons[(colorIdx + depth) % icons.length];

    const bodyEl = document.createElement('div');
    bodyEl.className = 'group-card-body';
    const depthBadge = depth === 1
      ? '<span style="font-size:.62rem;background:rgba(99,102,241,.12);color:var(--primary);padding:.1rem .4rem;border-radius:4px;margin-left:.4rem;font-weight:700">Nhóm con</span>'
      : depth === 2
      ? '<span style="font-size:.62rem;background:rgba(16,185,129,.12);color:#059669;padding:.1rem .4rem;border-radius:4px;margin-left:.4rem;font-weight:700">Nhóm cháu</span>'
      : '';
    bodyEl.innerHTML = `<div class="group-card-name">${g.name}${depthBadge}</div>
      <div class="group-card-meta">
        ${g.class_name ? g.class_name.split(',').map(c=>`<span class="class-tag">${c.trim()}</span>`).join('') : ''}
        ${_allowedBadge(g.allowed_usernames)}
        <span class="group-card-count">${children.length ? children.length + ' nhóm con • ' : ''}${directLessons.length} bài học</span>
      </div>`;

    const actionsEl = document.createElement('div');
    actionsEl.className = 'group-card-actions';
    if (depth < 2) {
      const addChildBtn = document.createElement('button');
      addChildBtn.className = 'btn-sm'; addChildBtn.title = 'Thêm nhóm con'; addChildBtn.textContent = '➕';
      addChildBtn.addEventListener('click', e => { e.stopPropagation(); openGroupModal(null, g.id); });
      actionsEl.appendChild(addChildBtn);
    }
    const editBtn = document.createElement('button'); editBtn.className = 'btn-sm'; editBtn.textContent = '✏️';
    editBtn.addEventListener('click', e => { e.stopPropagation(); openGroupModal(g); });
    const delBtn = document.createElement('button'); delBtn.className = 'btn-sm btn-danger'; delBtn.textContent = '🗑';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      showConfirm(`Xóa nhóm "${g.name}"? Nhóm con và bài học bên trong cũng bị ảnh hưởng.`, async () => {
        await db.from('lessons').update({ group_id: null, group_name: null }).eq('group_id', g.id);
        await db.from('lesson_groups').delete().eq('id', g.id);
        logActivity('Nhóm bài', 'Xóa nhóm bài học', g.name, g.class_name||'');
        renderGroups();
      });
    });
    actionsEl.appendChild(editBtn); actionsEl.appendChild(delBtn);

    const chevron = document.createElement('div');
    chevron.className = 'group-card-chevron'; chevron.textContent = '▼';

    header.appendChild(iconEl); header.appendChild(bodyEl); header.appendChild(actionsEl); header.appendChild(chevron);

    const lessonList = document.createElement('div');
    lessonList.className = 'group-lesson-list';
    const inner = document.createElement('div');
    inner.className = 'group-lesson-list-inner';
    lessonList.appendChild(inner);

    let expanded = false;
    header.addEventListener('click', e => {
      if (e.target.closest('.group-card-actions')) return;
      expanded = !expanded;
      card.classList.toggle('open', expanded);
      lessonList.classList.toggle('open', expanded);
      if (expanded && !inner.dataset.loaded) {
        inner.dataset.loaded = '1';
        if (children.length && depth < 2) {
          children.forEach((ch, ci) => inner.appendChild(buildGroupCard(ch, depth + 1, colorIdx + ci + 1)));
        }
        directLessons.forEach((l, idx) => {
          inner.appendChild(buildLessonItem(l, idx,
            () => openLessonDetail(l.id),
            () => openLessonModal(l),
            () => showConfirm(`Xóa bài học "${l.name}"?`, async () => { await db.from('lessons').delete().eq('id', l.id); logActivity('Bài học', 'Xóa bài học', l.name, l.class_name||''); renderGroups(); })
          ));
        });

        // Kích hoạt Sortable trong nhóm bài học
        if (typeof Sortable !== 'undefined' && directLessons.length > 1) {
          Sortable.create(inner, {
            handle: '.drag-handle',
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            onEnd: async function() {
              const items = [...inner.querySelectorAll('.group-lesson-item')];
              items.forEach((el, i) => {
                const numEl = el.querySelector('.group-lesson-num');
                if (numEl) numEl.textContent = i + 1;
              });
              for (const [i, el] of items.entries()) {
                await db.from('lessons').update({ sort_order: i + 1 }).eq('id', parseInt(el.dataset.id));
              }
            }
          });
        }
        if (!children.length && !directLessons.length) {
          const msg = document.createElement('div'); msg.className = 'group-empty-msg'; msg.textContent = 'Chưa có nội dung.';
          inner.appendChild(msg);
        }
      }
    });

    card.appendChild(header); card.appendChild(lessonList);
    return card;
  }

  const roots = (list||[]).filter(g => !g.parent_id);
  roots.forEach((g, gi) => grid.appendChild(buildGroupCard(g, 0, gi)));
}


let editingGroupId = null;

// ---- Helper: render tags lớp đã chọn trong groupModal ----
function renderGroupClassTags(selectedClasses) {
  const container = document.getElementById('groupClassTags');
  if (!container) return;
  container.innerHTML = '';
  if (!selectedClasses.length) {
    container.innerHTML = '<span style="color:var(--muted);font-size:.8rem">Tất cả lớp (không giới hạn)</span>';
    return;
  }
  selectedClasses.forEach(cls => {
    const tag = document.createElement('div');
    tag.style.cssText = 'display:flex;align-items:center;gap:.3rem;background:#eef2ff;color:#4338ca;padding:.25rem .6rem;border-radius:20px;font-size:.8rem;font-weight:600';
    tag.innerHTML = `<span>${cls}</span><button type="button" data-cls="${cls}" style="background:none;border:none;cursor:pointer;color:#6366f1;font-size:.85rem;padding:0;line-height:1">✕</button>`;
    tag.querySelector('button').addEventListener('click', () => {
      const idx = _groupSelectedClasses.indexOf(cls);
      if (idx > -1) _groupSelectedClasses.splice(idx, 1);
      renderGroupClassTags(_groupSelectedClasses);
    });
    container.appendChild(tag);
  });
}

let _groupSelectedClasses = [];

function openGroupModal(g=null, parentId=null) {
  editingGroupId = g ? g.id : null;
  document.getElementById('groupModalTitle').textContent = g ? 'Sửa nhóm' : (parentId ? 'Tạo nhóm con' : 'Tạo nhóm');
  document.getElementById('groupNameInput').value = g ? g.name : '';
  document.getElementById('groupNameInput').dataset.oldName = g ? g.name : '';
  document.getElementById('groupNameInput').dataset.parentId = g ? (g.parent_id || '') : (parentId || '');
  document.getElementById('groupError').textContent = '';

  // Parse class_name thành mảng (hỗ trợ cả cũ 1 lớp và mới nhiều lớp)
  const rawCls = g ? (g.class_name || '') : '';
  _groupSelectedClasses = rawCls ? rawCls.split(',').map(c => c.trim()).filter(Boolean) : [];

  // Fill allowed_usernames
  _groupSelectedUsernames = [];
  document.getElementById('groupStudentSearch').value = '';
  document.getElementById('groupAllowedUsernames').value = g?.allowed_usernames || '';
  if (g?.allowed_usernames) {
    _groupSelectedUsernames = g.allowed_usernames.split(',').map(u => u.trim()).filter(Boolean);
  }
  _renderGroupStudentTags();

  populateClassFilters().then(() => {
    const sel = document.getElementById('groupClassSelect');
    if (sel) sel.value = '';
    renderGroupClassTags(_groupSelectedClasses);
  });
  document.getElementById('groupModal').classList.add('open');
}

// ── Gán học sinh cụ thể vào nhóm bài học ─────────────────────
let _groupSelectedUsernames = [];

function _renderGroupStudentTags() {
  const wrap = document.getElementById('groupStudentTags');
  if (!wrap) return;
  if (!_groupSelectedUsernames.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = _groupSelectedUsernames.map(u => `
    <span style="display:inline-flex;align-items:center;gap:.3rem;background:#eef2ff;color:#3730a3;border:1.5px solid #c7d2fe;border-radius:20px;padding:.18rem .65rem;font-size:.78rem;font-weight:700">
      👤 ${u}
      <button type="button" onclick="_groupRemoveStudent('${u}')"
        style="background:none;border:none;cursor:pointer;color:#6366f1;font-size:.9rem;padding:0;line-height:1;margin-left:.15rem">✕</button>
    </span>`).join('');
  document.getElementById('groupAllowedUsernames').value = _groupSelectedUsernames.join(',');
}

function _groupRemoveStudent(u) {
  _groupSelectedUsernames = _groupSelectedUsernames.filter(x => x !== u);
  _renderGroupStudentTags();
}

function _groupAddStudent(username, name) {
  if (!_groupSelectedUsernames.includes(username)) {
    _groupSelectedUsernames.push(username);
    _renderGroupStudentTags();
  }
  document.getElementById('groupStudentSearch').value = '';
  document.getElementById('groupStudentDropdown').style.display = 'none';
}

// Autocomplete tìm kiếm học sinh cho nhóm
let _groupStudentSearchTimer = null;
document.getElementById('groupStudentSearch')?.addEventListener('input', function() {
  clearTimeout(_groupStudentSearchTimer);
  const q = this.value.trim();
  const dd = document.getElementById('groupStudentDropdown');
  if (!q) { dd.style.display = 'none'; return; }
  _groupStudentSearchTimer = setTimeout(async () => {
    const { data } = await db.from('students')
      .select('username,full_name,class_name')
      .or(`full_name.ilike.%${q}%,username.ilike.%${q}%`)
      .eq('active', true)
      .limit(10);
    if (!data?.length) {
      dd.innerHTML = '<div style="padding:.65rem 1rem;font-size:.83rem;color:var(--muted)">Không tìm thấy học sinh</div>';
      dd.style.display = 'block';
      return;
    }
    dd.innerHTML = data.map(s => `
      <div onclick="_groupAddStudent('${s.username}','${s.full_name.replace(/'/g,'&#39;')}')"
        style="padding:.6rem 1rem;cursor:pointer;font-size:.85rem;border-bottom:1px solid var(--border);transition:background .15s"
        onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
        <span style="font-weight:700">${s.full_name}</span>
        <span style="color:var(--muted);font-size:.78rem;margin-left:.4rem">${s.username}</span>
        ${s.class_name ? `<span style="float:right;font-size:.72rem;background:var(--primary-light);color:var(--primary);padding:.1rem .4rem;border-radius:6px;font-weight:700">${s.class_name}</span>` : ''}
      </div>`).join('');
    dd.style.display = 'block';
  }, 250);
});

// Khi chọn lớp từ dropdown → thêm vào tags
document.getElementById('groupClassSelect').addEventListener('change', function() {
  if (_populatingFilters) { this.value = ''; return; } // bỏ qua khi đang populate
  const cls = this.value;
  if (cls && !_groupSelectedClasses.includes(cls)) {
    _groupSelectedClasses.push(cls);
    renderGroupClassTags(_groupSelectedClasses);
  }
  this.value = '';
});
document.getElementById('openAddGroupBtn').addEventListener('click', () => openGroupModal());
document.getElementById('groupCancelBtn').addEventListener('click', () => document.getElementById('groupModal').classList.remove('open'));
document.getElementById('groupSaveBtn').addEventListener('click', async () => {
  const name = document.getElementById('groupNameInput').value.trim();
  const oldName = document.getElementById('groupNameInput').dataset.oldName;
  const parentId = document.getElementById('groupNameInput').dataset.parentId || null;
  const cls = _groupSelectedClasses.length ? _groupSelectedClasses.join(',') : null;
  const allowedUsernames = document.getElementById('groupAllowedUsernames').value.trim() || null;
  const err = document.getElementById('groupError');
  if (!name) { err.textContent = 'Vui lòng nhập tên nhóm.'; return; }

  if (editingGroupId) {
    await db.from('lesson_groups').update({ name, class_name: cls, allowed_usernames: allowedUsernames }).eq('id', editingGroupId);
    if (oldName && oldName !== name) await db.from('lessons').update({ group_name: name }).eq('group_name', oldName);
    // Đồng bộ toàn bộ bài học trong nhóm theo class_name mới + gắn group_id cho bài cũ dùng group_name
    const [{ data: byId }, { data: byName }] = await Promise.all([
      db.from('lessons').select('id').eq('group_id', editingGroupId),
      name ? db.from('lessons').select('id').eq('group_name', name) : { data: [] },
    ]);
    const allLessonIds = [...new Set([...(byId||[]), ...(byName||[])].map(l => l.id))];
    for (const lessonId of allLessonIds) {
      // Đồng bộ class_name và gắn group_id (migrate bài cũ dùng group_name)
      await db.from('lessons').update({ class_name: cls, group_id: editingGroupId, group_name: name }).eq('id', lessonId);
    }
  } else {
    const { error } = await db.from('lesson_groups').insert({
      name,
      class_name: cls,
      allowed_usernames: allowedUsernames,
      parent_id: parentId ? parseInt(parentId) : null
    });
    if (error) { err.textContent = 'Tên nhóm đã tồn tại.'; return; }
  }
  document.getElementById('groupModal').classList.remove('open');
  logActivity('Nhóm bài', editingGroupId ? 'Sửa nhóm bài học' : 'Thêm nhóm bài học', name, cls||'');
  renderGroups();
});

// ---- Tìm kiếm bài học trong nhóm ----
document.getElementById('groupSearch')?.addEventListener('input', async function() {
  const q = this.value.trim().toLowerCase();
  const resultsEl = document.getElementById('groupSearchResults');
  const groupListEl = document.getElementById('groupList');

  if (!q) {
    resultsEl.style.display = 'none';
    resultsEl.innerHTML = '';
    groupListEl.style.display = '';
    return;
  }

  // Tìm bài học khớp
  const { data: lessons } = await db.from('lessons')
    .select('id,name,class_name,group_id,group_name,description')
    .ilike('name', `%${q}%`)
    .order('name');

  groupListEl.style.display = 'none';
  resultsEl.style.display = '';

  if (!(lessons||[]).length) {
    resultsEl.innerHTML = '<div class="empty-state" style="padding:1.5rem">Không tìm thấy bài học nào.</div>';
    return;
  }

  // Lấy tên nhóm
  const { data: groups } = await db.from('lesson_groups').select('id,name');
  const groupMap = Object.fromEntries((groups||[]).map(g => [g.id, g.name]));

  resultsEl.innerHTML = `<div style="font-size:.82rem;color:var(--muted);margin-bottom:.6rem;font-weight:600">Tìm thấy ${lessons.length} bài học</div>`;
  const list = document.createElement('div');
  list.className = 'content-list';
  lessons.forEach(l => {
    const groupName = l.group_id ? (groupMap[l.group_id] || '—') : (l.group_name || '—');
    const row = document.createElement('div');
    row.className = 'content-row clickable';
    row.innerHTML = `
      <span class="list-icon">📚</span>
      <div class="list-info" style="flex:1">
        <div class="list-title">${l.name}</div>
        <div class="list-meta">
          ${l.class_name ? `<span class="class-tag">${l.class_name}</span>` : ''}
          <span style="color:var(--muted)">📂 ${groupName}</span>
        </div>
      </div>
      <button class="btn-sm btn-primary" style="flex-shrink:0">Mở →</button>`;
    row.addEventListener('click', () => {
      document.getElementById('groupSearch').value = '';
      resultsEl.style.display = 'none';
      groupListEl.style.display = '';
      showPage('lessons');
      setTimeout(() => openLessonDetail(l.id), 100);
    });
    list.appendChild(row);
  });
  resultsEl.appendChild(list);
});

// ============================================================
// OVERVIEW
// ============================================================
function animateCount(el, target, duration = 1000) {
  const start = parseInt(el.textContent) || 0;
  if (start === target) return;
  const startTime = performance.now();
  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = Math.round(start + (target - start) * ease);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

async function renderOverview() {
  const [{ count: sc }, { count: alertCount }, { data: recentLessons }, { data: recentAlerts }, { count: vidCount }, { count: docCount }] = await Promise.all([
    db.from('students').select('*', { count:'exact', head:true }),
    db.from('alerts').select('*', { count:'exact', head:true }).gte('created_at', new Date().toISOString().split('T')[0]),
    db.from('lessons').select('id,name,class_name').order('created_at', { ascending:false }).limit(4),
    db.from('alerts').select('*').order('created_at', { ascending:false }).limit(4),
    db.from('lesson_videos').select('*', { count:'exact', head:true }),
    db.from('lesson_docs').select('*', { count:'exact', head:true }),
  ]);

  // Nếu count trả về null → fetch lại thủ công
  let realSc = sc, realVid = vidCount, realDoc = docCount;
  if (realSc === null || realSc === undefined) {
    const { data: sd } = await db.from('students').select('id');
    realSc = (sd||[]).length;
  }
  if (realVid === null || realVid === undefined) {
    const { data: vd } = await db.from('lesson_videos').select('id');
    realVid = (vd||[]).length;
  }
  if (realDoc === null || realDoc === undefined) {
    const { data: dd } = await db.from('lesson_docs').select('id');
    realDoc = (dd||[]).length;
  }

  // Force set trước rồi animate để tránh bị skip khi start === target
  const elExams    = document.getElementById('statExams');
  const elVideos   = document.getElementById('statVideos');
  const elStudents = document.getElementById('statStudents');
  const elAlerts   = document.getElementById('statAlerts');
  if (elExams)    { elExams.textContent    = ''; animateCount(elExams,    realDoc        || 0); }
  if (elVideos)   { elVideos.textContent   = ''; animateCount(elVideos,   realVid        || 0); }
  if (elStudents) { elStudents.textContent = ''; animateCount(elStudents, realSc         || 0); }
  if (elAlerts)   { elAlerts.textContent   = ''; animateCount(elAlerts,   alertCount     || 0); }

  const re = document.getElementById('recentExams');
  re.innerHTML = (recentLessons||[]).map(l =>
    `<div class="list-row"><span class="list-icon">📚</span><div class="list-info"><div class="list-title">${l.name}</div><div class="list-meta">${l.class_name?`<span class="class-tag">${l.class_name}</span>`:''}</div></div></div>`
  ).join('') || '<p class="muted-sm">Chưa có bài học.</p>';

  const ra = document.getElementById('recentAlerts');
  ra.innerHTML = (recentAlerts||[]).map(a =>
    `<div class="list-row"><span class="list-icon">🚨</span><div class="list-info"><div class="list-title">${a.student_name}</div><div class="list-meta">${a.reason} • ${fmtTime(a.created_at)}</div></div></div>`
  ).join('') || '<p class="muted-sm">Chưa có cảnh báo.</p>';

  // Thông báo lớp hết hạn / sắp hết hạn
  const { data: allCls } = await db.from('classes').select('name,end_date');
  const today = new Date(); today.setHours(0,0,0,0);
  const WARN = 7;
  const notices = [];
  (allCls||[]).forEach(c => {
    if (!c.end_date) return;
    const end = new Date(c.end_date); end.setHours(0,0,0,0);
    const days = Math.round((end - today) / 86400000);
    if (days < 0) {
      notices.push(`<div style="background:#fee2e2;border-left:4px solid #ef4444;padding:.75rem 1rem;border-radius:8px;margin-bottom:.5rem;font-size:.88rem">🔴 Lớp <b>${c.name}</b> đã kết thúc vào ngày <b>${fmtDate(c.end_date)}</b>. Học sinh lớp này đã bị khóa tự động.</div>`);
    } else if (days <= WARN) {
      notices.push(`<div style="background:#fff3cd;border-left:4px solid #f59e0b;padding:.75rem 1rem;border-radius:8px;margin-bottom:.5rem;font-size:.88rem">⚠️ Lớp <b>${c.name}</b> sẽ kết thúc vào ngày <b>${fmtDate(c.end_date)}</b> (còn <b>${days} ngày</b>).</div>`);
    }
  });
  document.getElementById('classExpiryNotices').innerHTML = notices.join('');

  // Render online students
  renderOnlineStudents();

  // Render danh sách sắp hết hạn — không block nếu lỗi
  renderExpiryReminders().catch(() => {});
}

async function renderExpiryReminders() {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const warn7 = new Date(today); warn7.setDate(warn7.getDate() + 7);
    const { data: students } = await db.from('students')
      .select('id,full_name,username,class_name,expiry_date,active')
      .eq('active', true)
      .not('expiry_date', 'is', null)
      .lte('expiry_date', warn7.toISOString().split('T')[0])
      .gte('expiry_date', today.toISOString().split('T')[0])
      .order('expiry_date');

  const el = document.getElementById('expiryReminderList');
  const empty = document.getElementById('emptyExpiryReminder');
  if (!el) return;
  el.innerHTML = '';
  if (!(students||[]).length) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  (students||[]).forEach(s => {
    const exp = new Date(s.expiry_date); exp.setHours(0,0,0,0);
    const daysLeft = Math.round((exp - today) / 86400000);
    const color = daysLeft <= 1 ? '#dc2626' : daysLeft <= 3 ? '#d97706' : '#2563eb';
    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:.75rem;padding:.5rem .75rem;background:var(--bg);border-radius:8px;font-size:.85rem`;
    row.innerHTML = `
      <span style="width:8px;height:8px;background:${color};border-radius:50%;flex-shrink:0"></span>
      <div style="flex:1"><b>${s.full_name}</b> ${s.class_name?`<span class="class-tag">${s.class_name}</span>`:''}</div>
      <span style="color:${color};font-weight:700;font-size:.8rem">Còn ${daysLeft} ngày (${fmtDate(s.expiry_date)})</span>`;
    el.appendChild(row);
  });
  } catch(e) { console.warn('renderExpiryReminders:', e); }
}

document.getElementById('sendExpiryRemindersBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('sendExpiryRemindersBtn');
  btn.textContent = '⏳ Đang gửi...'; btn.disabled = true;

  const today = new Date(); today.setHours(0,0,0,0);
  const warn7 = new Date(today); warn7.setDate(warn7.getDate() + 7);
  const { data: students } = await db.from('students')
    .select('id,full_name,username,class_name,expiry_date,active')
    .eq('active', true).not('expiry_date','is',null)
    .lte('expiry_date', warn7.toISOString().split('T')[0])
    .gte('expiry_date', today.toISOString().split('T')[0]);

  if (!(students||[]).length) {
    btn.textContent = '✅ Không có ai sắp hết hạn';
    setTimeout(() => { btn.textContent = '📢 Gửi nhắc nhở tự động'; btn.disabled = false; }, 2000);
    return;
  }

  let sent = 0;
  for (const s of students) {
    const exp = new Date(s.expiry_date); exp.setHours(0,0,0,0);
    const daysLeft = Math.round((exp - today) / 86400000);
    const msg = daysLeft === 0
      ? `Tài khoản của bạn hết hạn HÔM NAY! trợ lý và giáo viên ko hổ trợ duy trì tài khoản.`
      : `Tài khoản của bạn sẽ hết hạn vào ngày ${exp.toLocaleDateString('vi-VN')} (còn ${daysLeft} ngày). trợ lý và giáo viên ko hổ trợ duy trì tài khoản.`;
    await db.from('announcements').insert({
      title: `⏰ Nhắc nhở: Tài khoản sắp hết hạn`,
      content: msg,
      target_username: s.username,
      pinned: false,
      class_name: null
    });
    sent++;
  }

  btn.textContent = `✅ Đã gửi ${sent} nhắc nhở`;
  setTimeout(() => { btn.textContent = '📢 Gửi nhắc nhở tự động'; btn.disabled = false; }, 3000);
});

async function renderOnlineStudents() {
  const cutoff = new Date(Date.now() - 90 * 1000).toISOString(); // 90 giây (heartbeat 20s + buffer)
  const { data: online } = await db.from('students')
    .select('full_name, class_name, last_seen')
    .eq('is_online', true)
    .gte('last_seen', cutoff)
    .order('last_seen', { ascending: false });

  const el = document.getElementById('onlineStudentList');
  const countEl = document.getElementById('onlineCount');
  if (!el) return;
  const list = online || [];
  if (countEl) {
    countEl.textContent = list.length + ' online';
    countEl.style.background = list.length ? '#dcfce7' : '#f1f5f9';
    countEl.style.color = list.length ? '#15803d' : '#64748b';
  }
  // Cập nhật badge sidebar
  const sideBadge = document.getElementById('sidebarOnlineBadge');
  if (sideBadge) {
    sideBadge.textContent = list.length;
    sideBadge.style.display = list.length ? 'inline' : 'none';
  }
  if (!list.length) {
    el.innerHTML = '<p class="muted-sm">Chưa có học sinh nào online.</p>';
    return;
  }
  el.innerHTML = list.map(s => {
    const mins = Math.floor((Date.now() - new Date(s.last_seen).getTime()) / 60000);
    const timeLabel = mins < 1 ? 'vừa xong' : `${mins} phút trước`;
    return `
    <div style="display:flex;align-items:center;gap:.5rem;background:#f0fdf4;padding:.45rem .85rem;border-radius:20px;font-size:.82rem;border:1px solid #bbf7d0;box-shadow:0 1px 3px rgba(16,185,129,.08)">
      <span style="width:8px;height:8px;background:#10b981;border-radius:50%;flex-shrink:0;box-shadow:0 0 0 3px rgba(16,185,129,.2);animation:onlinePulse 2s ease-in-out infinite"></span>
      <span style="font-weight:700;color:#065f46">${s.full_name}</span>
      ${s.class_name ? `<span class="class-tag" style="font-size:.7rem">${s.class_name}</span>` : ''}
      <span style="font-size:.7rem;color:#6ee7b7;margin-left:auto">${timeLabel}</span>
    </div>`;
  }).join('');
}

// ============================================================
// CREATE STUDENT
// ============================================================

async function populateCsClassSelect() {
  const classes = await getClasses();
  const opts = document.getElementById('csClassOptions');
  if (!opts) return;
  opts.innerHTML = '';
  classes.forEach(c => {
    const item = document.createElement('div');
    item.style.cssText = 'padding:.45rem .85rem;cursor:pointer;font-size:.88rem;display:flex;align-items:center;gap:.5rem;transition:background .12s';
    item.dataset.val = c;
    item.innerHTML = `<span class="_cs-check" style="width:16px;height:16px;border-radius:4px;border:1.5px solid var(--border);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .12s"></span>${c}`;
    item.addEventListener('mouseenter', () => item.style.background = 'var(--primary-light,#eef2ff)');
    item.addEventListener('mouseleave', () => item.style.background = '');
    item.addEventListener('click', () => _toggleCsClass(c));
    opts.appendChild(item);
  });
  // Đóng dropdown khi click ngoài
  document.addEventListener('click', (e) => {
    if (!document.getElementById('csClassWrap')?.contains(e.target)) {
      const dd = document.getElementById('csClassDropdown');
      if (dd) dd.style.display = 'none';
    }
  }, { capture: true });
}

// Multi-select lớp cho form tạo học viên
let _csSelectedClasses = [];

function _toggleCsClass(name) {
  const idx = _csSelectedClasses.indexOf(name);
  if (idx >= 0) _csSelectedClasses.splice(idx, 1);
  else _csSelectedClasses.push(name);
  _renderCsClassTags();
  // Tự điền ngày hết hạn theo lớp đầu tiên được chọn
  if (_csSelectedClasses.length === 1) {
    db.from('classes').select('end_date').eq('name', _csSelectedClasses[0]).single().then(({ data }) => {
      if (data?.end_date) document.getElementById('csExpiry').value = data.end_date;
    });
  }
}

function _renderCsClassTags() {
  const tagsEl = document.getElementById('csClassTags');
  const ph     = document.getElementById('csClassPlaceholder');
  const hidden = document.getElementById('csClassSelect');
  const opts   = document.getElementById('csClassOptions');
  if (hidden) hidden.value = _csSelectedClasses.join(',');
  if (opts) {
    opts.querySelectorAll('[data-val]').forEach(item => {
      const check = item.querySelector('._cs-check');
      const sel = _csSelectedClasses.includes(item.dataset.val);
      if (check) {
        check.style.background = sel ? 'var(--primary,#6366f1)' : '';
        check.style.borderColor = sel ? 'var(--primary,#6366f1)' : 'var(--border,#e2e8f0)';
        check.innerHTML = sel ? '<svg width="10" height="10" viewBox="0 0 10 10"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>' : '';
      }
    });
  }
  if (!tagsEl) return;
  tagsEl.querySelectorAll('._cs-tag').forEach(t => t.remove());
  if (ph) ph.style.display = _csSelectedClasses.length ? 'none' : '';
  _csSelectedClasses.forEach(name => {
    const tag = document.createElement('span');
    tag.className = '_cs-tag';
    tag.style.cssText = 'display:inline-flex;align-items:center;gap:.3rem;background:var(--primary,#6366f1);color:#fff;border-radius:20px;padding:.18rem .55rem .18rem .65rem;font-size:.78rem;font-weight:700';
    tag.innerHTML = `${name}<button type="button" style="background:rgba(255,255,255,.25);border:none;color:#fff;width:16px;height:16px;border-radius:50%;cursor:pointer;font-size:.7rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-left:.1rem" onclick="event.stopPropagation();_toggleCsClass('${name}')">✕</button>`;
    tagsEl.insertBefore(tag, ph);
  });
}

function _resetCsClassSelect() {
  _csSelectedClasses = [];
  _renderCsClassTags();
}

document.getElementById('csGenPwBtn') && document.getElementById('csGenPwBtn').addEventListener('click', () => {
  document.getElementById('csPassword').value = Math.random().toString(36).slice(2,8).toUpperCase();
});

// Mã học viên = mật khẩu tự động (readonly)
document.getElementById('csCode').addEventListener('input', () => {
  document.getElementById('csPassword').value = document.getElementById('csCode').value;
});

// addCode → addPassword sync
document.getElementById('addCode') && document.getElementById('addCode').addEventListener('input', () => {
  document.getElementById('addPassword').value = document.getElementById('addCode').value;
});

// Khi chọn lớp → đã tích hợp vào _toggleCsClass (tự điền ngày hết hạn theo lớp đầu tiên)

// Tự động tạo mã học viên 5 ký tự unique
async function genStudentCode() {
  // Tạo mã random và check trùng chỉ 1 lần thay vì fetch toàn bộ
  const upper  = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const lower  = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all    = upper + lower + digits;

  for (let attempt = 0; attempt < 10; attempt++) {
    const arr = [
      upper[Math.floor(Math.random() * upper.length)],
      lower[Math.floor(Math.random() * lower.length)],
      digits[Math.floor(Math.random() * digits.length)],
      ...Array.from({length: 2}, () => all[Math.floor(Math.random() * all.length)])
    ];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    const code = arr.join('');
    // Chỉ check xem mã này có tồn tại không
    const { data } = await db.from('students').select('id').eq('student_code', code).maybeSingle();
    if (!data) return code; // Không trùng → dùng ngay
  }
  // Fallback nếu 10 lần vẫn trùng (cực kỳ hiếm)
  return Date.now().toString(36).toUpperCase().slice(-5);
}

document.getElementById('csSaveBtn').addEventListener('click', async () => {
  const code     = document.getElementById('csCode').value.trim();
  const name     = document.getElementById('csName').value.trim();
  const phone    = document.getElementById('csPhone').value.trim();
  const username = document.getElementById('csUsername').value.trim();
  let   password = document.getElementById('csPassword').value.trim();
  const cls      = document.getElementById('csClassSelect').value.trim();
  const expiry   = document.getElementById('csExpiry').value || null;
  const notes    = document.getElementById('csNotes').value.trim() || null;
  const err = document.getElementById('csError');
  const suc = document.getElementById('csSuccess');
  err.textContent = ''; suc.textContent = '';

  if (!name)     { err.textContent = 'Vui long nhap ho va ten.'; return; }
  if (!username) { err.textContent = 'Vui long nhap Gmail.'; return; }
  if (!isValidGmail(username)) { err.textContent = 'Gmail không hợp lệ. VD: hocsinh@gmail.com'; return; }
  if (!cls)      { err.textContent = 'Vui lòng chọn ít nhất 1 lớp.'; return; }

  // Nếu chưa có mã/mật khẩu thì tự gen
  if (!password || !code) {
    const newCode = await genStudentCode();
    document.getElementById('csCode').value = newCode;
    document.getElementById('csPassword').value = newCode;
    password = newCode;
  }

  // Kiểm tra nếu đang thêm lớp phụ cho học viên đã có
  const usernameEl = document.getElementById('csUsername');
  const existingId = usernameEl?.dataset.existingId;
  const existingClasses = usernameEl?.dataset.existingClasses || '';

  if (existingId) {
    // Mode thêm lớp phụ — chỉ insert vào student_classes, không đụng class_name
    if (!cls) { err.textContent = 'Vui lòng chọn lớp muốn thêm.'; return; }
    const { data: existing } = await db.from('student_classes').select('id').eq('student_id', existingId).eq('class_name', cls).maybeSingle();
    if (existing) { err.textContent = `Học viên đã thuộc lớp ${cls} rồi.`; return; }
    const { error } = await db.from('student_classes').insert({ student_id: parseInt(existingId), class_name: cls });
    if (error) { err.textContent = error.message; return; }

    // Gửi email thông báo thêm lớp phụ (không chặn UI)
    sendClassAddedEmail({ username, full_name: name }, cls).catch(() => {});

    // Hiện modal thông tin
    document.getElementById('naName').textContent     = name;
    document.getElementById('naCode').textContent     = document.getElementById('csCode').value.trim() || '—';
    document.getElementById('naUsername').textContent = username;
    setPasswordDisplay(password);
    document.getElementById('naClass').textContent    = `${existingClasses}, ${cls}`.replace(/^,\s*/, '');
    document.getElementById('naPhone').textContent    = phone || '';
    document.getElementById('naStartDate').textContent = '—';
    document.getElementById('naEndDate').textContent   = '—';
    document.getElementById('newAccountModal').classList.add('open');

    // Reset
    ['csCode','csName','csPhone','csUsername','csPassword'].forEach(id => {
      const el2 = document.getElementById(id);
      el2.value = '';
      delete el2.dataset.existingId;
      delete el2.dataset.existingClasses;
    });
    const hint = document.getElementById('csUsername').nextElementSibling;
    if (hint?.classList.contains('gmail-hint')) hint.remove();
    document.getElementById('csExpiry').value = '';
    document.getElementById('csNotes').value = '';
    _resetCsClassSelect();
    err.textContent = ''; suc.textContent = '';
    genStudentCode().then(c => { document.getElementById('csCode').value = c; document.getElementById('csPassword').value = c; });
    await renderMiniStudents();
    return;
  }

  // Kiểm tra trùng Gmail / SĐT (chỉ khi tạo mới)
  const dupWarnings = await checkDuplicate(username, phone);
  if (dupWarnings.length) { err.innerHTML = '⚠️ ' + dupWarnings.join('<br/>⚠️ '); return; }

  const { error, data: newStudent } = await db.from('students').insert({
    student_code: document.getElementById('csCode').value.trim() || null,
    full_name: name, phone: phone || null,
    username, password: await hashPw(password),
    class_name: cls.split(',')[0].trim() || null,  // lớp đầu tiên làm lớp chính
    active: true, expiry_date: isTeacher ? expiry : null, notes
  }).select('id').single();

  if (error) { err.textContent = error.message.includes('unique') ? 'Gmail nay da ton tai.' : error.message; return; }
  // Thêm TẤT CẢ lớp vào student_classes
  const clsList = cls.split(',').map(c => c.trim()).filter(Boolean);
  if (clsList.length && newStudent?.id) {
    await Promise.all(clsList.map(c => db.from('student_classes').insert({ student_id: newStudent.id, class_name: c })));
  }

  // Hien modal thong tin tai khoan
  document.getElementById('naName').textContent     = name;
  document.getElementById('naCode').textContent     = document.getElementById('csCode').value.trim() || '—';
  document.getElementById('naUsername').textContent = username;
  setPasswordDisplay(password);
  document.getElementById('naClass').textContent    = cls || '';
  document.getElementById('naPhone').textContent    = phone || '';

  // Lay ngay khai giang va ket thuc cua lop
  if (cls) {
    const firstCls = cls.split(',')[0].trim();
    const { data: clsInfo } = await db.from('classes').select('start_date,end_date').eq('name', firstCls).single();
    document.getElementById('naStartDate').textContent = clsInfo?.start_date ? fmtDate(clsInfo.start_date) : 'Chưa có';
    document.getElementById('naEndDate').textContent   = clsInfo?.end_date   ? fmtDate(clsInfo.end_date)   : 'Chưa có';
  } else {
    document.getElementById('naStartDate').textContent = 'Chưa có';
    document.getElementById('naEndDate').textContent   = 'Chưa có';
  }
  document.getElementById('newAccountModal').classList.add('open');

  // Reset form
  ['csCode','csName','csPhone','csUsername','csPassword'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('csExpiry').value = '';
  document.getElementById('csNotes').value = '';
  _resetCsClassSelect();
  err.textContent = ''; suc.textContent = '';

  // Tao ma moi cho lan tiep theo
  genStudentCode().then(c => {
    document.getElementById('csCode').value = c;
    document.getElementById('csPassword').value = c;
  });

  logAccountActivity('Tạo tài khoản', { full_name: name, username, class_name: cls });

  // Gửi email thông tin tài khoản cho học sinh (không chặn UI)
  sendWelcomeEmail({
    full_name: name, username,
    password_raw: password,  // mật khẩu gốc trước khi hash
    class_name: cls || '',
    student_code: document.getElementById('naCode').textContent
  }).then(ok => {
    if (ok) showToast(`📧 Đã gửi thông tin tài khoản về ${username}`);
  });

  await renderMiniStudents();
  await populateClassFilters();
});

document.getElementById('csResetBtn').addEventListener('click', () => {
  ['csCode','csName','csPhone','csUsername','csPassword'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('csExpiry').value = '';
  document.getElementById('csNotes').value = '';
  _resetCsClassSelect();
  document.getElementById('csError').textContent = '';
  document.getElementById('csSuccess').textContent = '';
});

document.getElementById('goToStudentListBtn').addEventListener('click', () => showPage('students'));

// Modal thong tin tai khoan moi
document.getElementById('naCloseBtn').addEventListener('click', () => {
  document.getElementById('newAccountModal').classList.remove('open');
});
document.getElementById('naCancelBtn').addEventListener('click', () => {
  document.getElementById('newAccountModal').classList.remove('open');
});
document.getElementById('naCopyBtn').addEventListener('click', () => {
  const name  = document.getElementById('naName').textContent;
  const code  = document.getElementById('naCode').textContent;
  const user  = document.getElementById('naUsername').textContent;
  const pw    = document.getElementById('naPassword').textContent;
  const cls   = document.getElementById('naClass').textContent;
  const phone = document.getElementById('naPhone').textContent;
  const start = document.getElementById('naStartDate').textContent;
  const end   = document.getElementById('naEndDate').textContent;
  const spelled = pw.split('').map(c => {
    if (c >= 'A' && c <= 'Z') return `${c} hoa`;
    if (c >= 'a' && c <= 'z') return `${c} thường`;
    if (c >= '0' && c <= '9') return `số ${c}`;
    return c;
  }).join(' - ');
  const text  = `Họ tên: ${name}\nMã HV: ${code}\nGmail: ${user}\nMật khẩu: ${pw}\n📖 Đọc: ${spelled}\nLớp: ${cls}\nNgày khai giảng: ${start}\nNgày kết thúc: ${end}\nSĐT: ${phone}\n\n👉 Bạn sao chép mật khẩu trên rồi dán vào chỗ mật khẩu trong web nha.\n🌐 Link học: https://trancuongdev.github.io/duyhoangdaytoanct/\nNếu gặp vấn đề kỹ thuật hay gì cứ liên hệ mình nha.`;
  navigator.clipboard?.writeText(text).then(() => {
    const btn = document.getElementById('naCopyBtn');
    btn.textContent = '✅ Đã sao chép!';
    setTimeout(() => { btn.textContent = '📋 Sao chép'; }, 2000);
  });
});
document.getElementById('naShareBtn').addEventListener('click', async () => {
  const card = document.getElementById('naInfoCard');
  try {
    const canvas = await html2canvas(card, { scale: 2, useCORS: true, backgroundColor: '#f8faff' });
    canvas.toBlob(async (blob) => {
      const file = new File([blob], 'tai-khoan-hoc-vien.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Tài khoản học viên' });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'tai-khoan-hoc-vien.png'; a.click();
        URL.revokeObjectURL(url);
      }
    }, 'image/png');
  } catch(e) {
    console.error(e);
  }
});
let miniPage=1; const miniPerPage=8;
async function renderMiniStudents() {
  const { data: list } = await db.from('students').select('*').order('created_at', { ascending:false }).limit(10000);
  const tbody = document.getElementById('miniStudentBody');
  const totalPages = Math.max(1, Math.ceil((list||[]).length/miniPerPage));
  if (miniPage > totalPages) miniPage = totalPages;
  const slice = (list||[]).slice((miniPage-1)*miniPerPage, miniPage*miniPerPage);
  tbody.innerHTML = '';
  slice.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${s.student_code||'<span style="color:var(--muted)">—</span>'}</td><td>${s.full_name}</td><td>${s.phone||''}</td><td>${s.username}</td><td>${s.class_name||''}</td><td><span class="status-badge ${s.active?'active':'inactive'}">${s.active?'HD':'Khoa'}</span></td><td style="font-size:.78rem;color:var(--muted);white-space:nowrap">${s.created_at ? fmtTime(s.created_at) : '—'}</td><td style="white-space:nowrap"><button class="btn-sm" data-action="edit">&#x270F;&#xFE0F;</button> <button class="btn-sm" data-action="delete" style="color:#ef4444;border-color:#fca5a5" title="Xóa học viên">🗑</button></td>`;
    tr.querySelector('[data-action="edit"]').addEventListener('click', () => openEditStudent(s));
    tr.querySelector('[data-action="delete"]').addEventListener('click', () => {
      showConfirm(`Xóa học viên "${s.full_name}"?`, async () => {
        await db.from('students').delete().eq('id', s.id);
        logAccountActivity('Xóa tài khoản', s);
        renderMiniStudents(); renderStudents(); populateClassFilters();
      });
    });
    tbody.appendChild(tr);
  });
  const pg = document.getElementById('miniPagination');
  pg.innerHTML = '';
  if (totalPages <= 1) return;
  const prev = document.createElement('button');
  prev.className = 'page-btn'; prev.textContent = '‹';
  prev.disabled = miniPage === 1;
  prev.addEventListener('click', () => { miniPage--; renderMiniStudents(); });
  pg.appendChild(prev);

  const info = document.createElement('span');
  info.style.cssText = 'font-size:.82rem;color:var(--muted);padding:0 .5rem;font-weight:600';
  info.textContent = `${miniPage} / ${totalPages}`;
  pg.appendChild(info);

  const next = document.createElement('button');
  next.className = 'page-btn'; next.textContent = '›';
  next.disabled = miniPage === totalPages;
  next.addEventListener('click', () => { miniPage++; renderMiniStudents(); });
  pg.appendChild(next);
}


// ============================================================
// STUDENTS LIST
// ============================================================
let _allStudentsFiltered = [];
let _studentRenderCount = 0;
const STUDENT_BATCH = 50;

function renderStudentRow(s, today, expiredClasses) {
  const tr = document.createElement('tr');
  const loginAttempts = s.login_attempts || 0;
  const attemptsBadge = loginAttempts > 0 ? `<span class="status-pill orange" style="font-size:.7rem">⚠️ ${loginAttempts} lần sai</span>` : '';
  const actions = `<div class="smenu-wrap" style="position:relative">
    <button class="btn-sm smenu-toggle" style="font-size:1.2rem;padding:.2rem .6rem;font-weight:700;letter-spacing:.1em">⋯</button>
    <div class="student-menu" style="display:none;position:fixed;background:var(--card);border:1.5px solid var(--border);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.15);z-index:9999;min-width:170px;overflow:hidden">
      <button class="smenu-item" data-action="edit">✏️ Sửa thông tin</button>
      <button class="smenu-item" data-action="toggle">${s.active?'🔒 Khóa tài khoản':'🔓 Mở khóa'}</button>
      <button class="smenu-item" data-action="copy">📋 Copy tài khoản</button>
      <button class="smenu-item" data-action="export-img">🖼️ Xuất ảnh</button>
      ${loginAttempts>0?`<button class="smenu-item" data-action="reset-attempts">🔄 Reset lần sai</button>`:''}
      <button class="smenu-item" data-action="delete" style="color:#ef4444;border-top:1px solid var(--border)">🗑 Xóa</button>
    </div>
  </div>`;

  let studyStatus;
  if (!s.active) {
    if (s.expiry_date && new Date(s.expiry_date) < today) studyStatus = '<span class="status-pill red">⏰ Hết hạn</span>';
    else if (s.class_name && expiredClasses.has(s.class_name)) studyStatus = '<span class="status-pill red">🏫 Lớp kết thúc</span>';
    else studyStatus = '<span class="status-pill orange">🔒 Đã khóa</span>';
  } else if (s.is_online && s.last_seen && (Date.now() - new Date(s.last_seen).getTime()) < 90000) {
    studyStatus = '<span class="status-pill green">🟢 Online</span>';
  } else {
    studyStatus = '<span class="status-pill gray">⚫ Offline</span>';
  }

  tr.innerHTML = `<td>${s.student_code||'—'}</td><td>${s.full_name}${s.notes?` <span class="muted" title="${s.notes}" style="cursor:help">📝</span>`:''}${loginAttempts>0?' '+attemptsBadge:''}</td><td>${s.phone||'—'}</td><td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.username}</td><td>${(s.class_name||'').split(',').map(c=>c.trim()).filter(Boolean).map(c=>`<span class="class-tag">${c}</span>`).join(' ')||'—'}</td><td>${s.created_at ? fmtDate(s.created_at.split('T')[0]) : '—'}</td><td>${(() => {
    if (!s.expiry_date) return '<span style="color:var(--muted);font-size:.8rem">—</span>';
    const exp = new Date(s.expiry_date); exp.setHours(0,0,0,0);
    const daysLeft = Math.round((exp - today) / 86400000);
    if (daysLeft < 0) return `<span style="background:#fee2e2;color:#991b1b;font-size:.75rem;font-weight:700;padding:.15rem .5rem;border-radius:6px">Hết hạn</span>`;
    if (daysLeft === 0) return `<span style="background:#fef3c7;color:#92400e;font-size:.75rem;font-weight:700;padding:.15rem .5rem;border-radius:6px">Hôm nay</span>`;
    if (daysLeft <= 7) return `<span style="background:#fef3c7;color:#92400e;font-size:.75rem;font-weight:700;padding:.15rem .5rem;border-radius:6px">Còn ${daysLeft}n</span>`;
    return `<span style="font-size:.8rem;color:var(--muted)">${fmtDate(s.expiry_date)}</span>`;
  })()}</td><td><span class="status-badge ${s.active?'active':'inactive'}">${s.active?'Hoạt động':'Khóa'}</span></td><td>${studyStatus}</td><td>${actions}</td>`;

  tr.querySelector('.smenu-toggle').addEventListener('click', e => {
    e.stopPropagation();
    document.querySelectorAll('.student-menu').forEach(m => { if (m !== tr.querySelector('.student-menu')) m.style.display = 'none'; });
    const menu = tr.querySelector('.student-menu');
    if (menu.style.display === 'none' || !menu.style.display) {
      const rect = e.currentTarget.getBoundingClientRect();
      menu.style.display = 'block';
      const menuH = menu.offsetHeight || 220;
      const spaceBelow = window.innerHeight - rect.bottom;
      menu.style.top = (spaceBelow < menuH + 8 ? rect.top - menuH - 4 : rect.bottom + 4) + 'px';
      menu.style.left = Math.min(rect.right - 170, window.innerWidth - 178) + 'px';
    } else { menu.style.display = 'none'; }
  });
  tr.querySelector('[data-action="edit"]').addEventListener('click', () => openEditStudent(s));
  tr.querySelector('[data-action="toggle"]').addEventListener('click', async () => {
    const newActive = !s.active;
    const updates = { active: newActive, login_attempts: 0 };
    if (newActive) updates.manually_unlocked = true; else updates.manually_unlocked = false;
    await db.from('students').update(updates).eq('id', s.id);
    logActivity('Học sinh', newActive ? 'Mở khóa tài khoản' : 'Khóa tài khoản', s.full_name, s.class_name||'');
    renderStudents();
  });
  if (tr.querySelector('[data-action="reset-attempts"]')) {
    tr.querySelector('[data-action="reset-attempts"]').addEventListener('click', async () => {
      await db.from('students').update({ login_attempts: 0 }).eq('id', s.id);
      renderStudents();
    });
  }
  tr.querySelector('[data-action="copy"]').addEventListener('click', () => {
    const text = `Họ tên: ${s.full_name}\nMã HV: ${s.student_code||''}\nGmail: ${s.username}\nMật khẩu: ${s.student_code||''}\nLớp: ${s.class_name||''}\n\n🌐 Link học: https://trancuongdev.github.io/duyhoangdaytoanct/`;
    navigator.clipboard?.writeText(text).then(() => {
      const btn = tr.querySelector('[data-action="copy"]');
      btn.textContent = '✅ Đã copy!';
      setTimeout(() => { btn.textContent = '📋 Copy tài khoản'; }, 2000);
    });
  });
  tr.querySelector('[data-action="export-img"]').addEventListener('click', () => exportStudentCard(s));
  tr.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    showConfirm(`Xóa học sinh "${s.full_name}"?`, async () => {
      await db.from('students').delete().eq('id', s.id);
      logAccountActivity('Xóa tài khoản', s);
      renderStudents(); renderMiniStudents(); populateClassFilters();
    });
  });
  return tr;
}

function loadMoreStudents() {
  const tbody = document.getElementById('studentBody');
  const today = new Date(); today.setHours(0,0,0,0);
  const { _expiredClasses } = window._studentMeta || {};
  const batch = _allStudentsFiltered.slice(_studentRenderCount, _studentRenderCount + STUDENT_BATCH);
  batch.forEach(s => tbody.appendChild(renderStudentRow(s, today, _expiredClasses || new Set())));
  _studentRenderCount += batch.length;
}

async function renderStudents() {
  const q      = (document.getElementById('studentSearch').value||'').toLowerCase();
  const cls    = document.getElementById('studentFilterClass').value;
  const expiry = document.getElementById('studentFilterExpiry')?.value || '';
  let query = db.from('students').select('*').order('full_name').limit(10000);
  // Gộp 3 query vào Promise.all thay vì tuần tự
  const [{ data: list }, { data: scAll }, { data: allClasses }] = await Promise.all([
    query,
    db.from('student_classes').select('student_id,class_name'),
    db.from('classes').select('name,end_date'),
  ]);

  // Merge lớp phụ từ student_classes vào class_name
  const scMap = {}; // student_id → [class_name]
  (scAll||[]).forEach(sc => {
    if (!scMap[sc.student_id]) scMap[sc.student_id] = [];
    if (!scMap[sc.student_id].includes(sc.class_name)) scMap[sc.student_id].push(sc.class_name);
  });
  (list||[]).forEach(s => {
    const extras = scMap[s.id] || [];
    const base = (s.class_name||'').split(',').map(c=>c.trim()).filter(Boolean);
    s.class_name = [...new Set([...base, ...extras])].join(', ');
  });

  const today = new Date(); today.setHours(0,0,0,0);
  const expiredClasses = new Set((allClasses||[]).filter(c => c.end_date && new Date(c.end_date) < today).map(c => c.name));
  const expired = (list||[]).filter(s => s.active && !s.manually_unlocked && (
    (s.expiry_date && new Date(s.expiry_date) < today) ||
    (s.class_name && expiredClasses.has(s.class_name))
  ));
  if (expired.length) {
    await Promise.all(expired.map(s => db.from('students').update({ active: false }).eq('id', s.id)));
    expired.forEach(s => { s.active = false; });
  }

  let filtered = (list||[]).filter(s => {
    // Filter theo lớp — hỗ trợ nhiều lớp
    if (cls && !s.class_name?.split(',').map(c=>c.trim()).includes(cls)) return false;
    if (!q) return true;
    return s.full_name.toLowerCase().includes(q) || s.username.toLowerCase().includes(q) || (s.student_code||'').toLowerCase().includes(q) || (s.phone||'').includes(q);
  });
  if (expiry === 'expired') {
    filtered = filtered.filter(s => s.expiry_date && new Date(s.expiry_date) < today);
  } else if (expiry) {
    const days = parseInt(expiry);
    const future = new Date(today); future.setDate(future.getDate() + days);
    filtered = filtered.filter(s => s.expiry_date && new Date(s.expiry_date) >= today && new Date(s.expiry_date) <= future);
  }

  _allStudentsFiltered = filtered;
  _studentRenderCount = 0;
  window._studentMeta = { _expiredClasses: expiredClasses };

  const tbody = document.getElementById('studentBody');
  tbody.innerHTML = '';
  document.getElementById('emptyStudents').style.display = filtered.length ? 'none' : 'block';

  // Render batch đầu tiên
  loadMoreStudents();

  // Xóa sentinel cũ
  const old = document.getElementById('studentScrollSentinel');
  if (old) old.remove();

  // Thêm sentinel để trigger load thêm
  if (_studentRenderCount < filtered.length) {
    const sentinel = document.createElement('tr');
    sentinel.id = 'studentScrollSentinel';
    sentinel.innerHTML = `<td colspan="10" style="text-align:center;padding:1rem;color:var(--muted);font-size:.85rem">⏳ Đang tải thêm...</td>`;
    tbody.appendChild(sentinel);

    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && _studentRenderCount < _allStudentsFiltered.length) {
        loadMoreStudents();
        if (_studentRenderCount >= _allStudentsFiltered.length) {
          sentinel.remove();
          observer.disconnect();
        }
      }
    }, { threshold: 0.1 });
    observer.observe(sentinel);
  }

  // Xóa pagination cũ nếu còn
  const stPgEl = document.getElementById('studentPagination');
  if (stPgEl) stPgEl.remove();
}
// Debounce helper
function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

document.getElementById('studentSearch').addEventListener('input', debounce(renderStudents, 300));
document.getElementById('studentFilterClass').addEventListener('change', renderStudents);
document.getElementById('studentFilterExpiry')?.addEventListener('change', renderStudents);

document.getElementById('genMissingCodesBtn').addEventListener('click', async () => {
  const btn = document.getElementById('genMissingCodesBtn');
  btn.textContent = '⏳ Đang xử lý...'; btn.disabled = true;
  const { data: students } = await db.from('students').select('id,student_code').is('student_code', null);
  if (!students?.length) {
    btn.textContent = '✅ Không có học viên nào thiếu mã';
    setTimeout(() => { btn.textContent = '🔧 Sinh mã còn thiếu'; btn.disabled = false; }, 2000);
    return;
  }
  // Lấy tất cả mã đã dùng
  const { data: all } = await db.from('students').select('student_code');
  const usedCodes = new Set((all||[]).map(s => s.student_code).filter(Boolean));
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower = 'abcdefghijklmnopqrstuvwxyz', digits = '0123456789';
  const allChars = upper + lower + digits;
  function genCode() {
    const arr = [
      upper[Math.floor(Math.random()*upper.length)],
      lower[Math.floor(Math.random()*lower.length)],
      digits[Math.floor(Math.random()*digits.length)],
      ...Array.from({length:2}, () => allChars[Math.floor(Math.random()*allChars.length)])
    ];
    for (let i=arr.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
    return arr.join('');
  }
  let count = 0;
  for (const s of students) {
    let code; do { code = genCode(); } while (usedCodes.has(code));
    usedCodes.add(code);
    await db.from('students').update({ student_code: code }).eq('id', s.id);
    count++;
  }
  btn.textContent = `✅ Đã sinh ${count} mã`;
  setTimeout(() => { btn.textContent = '🔧 Sinh mã còn thiếu'; btn.disabled = false; }, 2500);
  renderStudents();
});

document.getElementById('syncExpiryBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('syncExpiryBtn');
  btn.textContent = '⏳ Đang đồng bộ...'; btn.disabled = true;

  // Lấy tất cả lớp có end_date
  const { data: classes } = await db.from('classes').select('name,end_date');
  const clsMap = Object.fromEntries((classes||[]).filter(c => c.end_date).map(c => [c.name, c.end_date]));

  // Lấy học viên chưa có expiry_date nhưng có class_name
  const { data: students } = await db.from('students').select('id,class_name,expiry_date');
  const toUpdate = (students||[]).filter(s => !s.expiry_date && s.class_name && clsMap[s.class_name]);

  if (!toUpdate.length) {
    btn.textContent = '✅ Tất cả đã có ngày hết hạn';
    setTimeout(() => { btn.textContent = '📅 Đồng bộ hết hạn'; btn.disabled = false; }, 2000);
    return;
  }

  // Nhóm theo lớp để update batch
  const byClass = {};
  toUpdate.forEach(s => {
    const end = clsMap[s.class_name];
    if (!byClass[end]) byClass[end] = [];
    byClass[end].push(s.id);
  });
  for (const [end_date, ids] of Object.entries(byClass)) {
    await db.from('students').update({ expiry_date: end_date }).in('id', ids);
  }

  btn.textContent = `✅ Đã cập nhật ${toUpdate.length} học viên`;
  setTimeout(() => { btn.textContent = '📅 Đồng bộ hết hạn'; btn.disabled = false; }, 2500);
  renderStudents();
});

document.getElementById('syncClassNameBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('syncClassNameBtn');
  btn.disabled = true; btn.textContent = '⏳ Đang đồng bộ...';
  // Lấy toàn bộ student_classes
  const { data: sc } = await db.from('student_classes').select('student_id, class_name');
  if (!sc || !sc.length) { btn.disabled=false; btn.textContent='🔄 Đồng bộ lớp'; alert('Không có dữ liệu student_classes.'); return; }
  // Gom lớp theo student_id
  const map = {};
  sc.forEach(r => {
    if (!map[r.student_id]) map[r.student_id] = [];
    if (r.class_name && !map[r.student_id].includes(r.class_name)) map[r.student_id].push(r.class_name);
  });
  // Cập nhật students.class_name cho những ai bị null hoặc khác
  const { data: students } = await db.from('students').select('id, class_name');
  let count = 0;
  for (const s of (students||[])) {
    const newCls = (map[s.id]||[]).join(',');
    if (newCls && newCls !== (s.class_name||'')) {
      await db.from('students').update({ class_name: newCls }).eq('id', s.id);
      count++;
    }
  }
  btn.disabled=false; btn.textContent='🔄 Đồng bộ lớp';
  alert(`✅ Đã đồng bộ ${count} học viên.`);
  renderStudents(); populateClassFilters();
});

document.getElementById('exportStudentsBtn').addEventListener('click', async () => {
  const cls = document.getElementById('studentFilterClass').value;
  let query = db.from('students').select('*').order('class_name').order('full_name').limit(10000);
  if (cls) query = query.eq('class_name', cls);
  const { data: list } = await query;
  if (!list?.length) { alert('Chưa có dữ liệu.'); return; }
  if (!list?.length) { alert('Chưa có học sinh nào.'); return; }

  const wb = XLSX.utils.book_new();

  // Nhóm theo lớp
  const byClass = {};
  list.forEach(s => {
    const k = s.class_name || 'Chưa có lớp';
    if (!byClass[k]) byClass[k] = [];
    byClass[k].push(s);
  });

  const today = new Date().toLocaleDateString('vi-VN');

  Object.entries(byClass).forEach(([clsName, students]) => {
    const wsData = [];

    // Tiêu đề
    wsData.push(['DHDTCT LMS Education System']);
    wsData.push([`DANH SÁCH HỌC VIÊN - ${clsName.toUpperCase()}`]);
    wsData.push([`Xuất ngày: ${today}  |  Tổng: ${students.length} học viên`]);
    wsData.push([]); // dòng trống

    // Header
    wsData.push(['STT','Mã HV','Họ và tên','SĐT','Gmail','Lớp','Ngày đăng ký','Ngày hết hạn','Trạng thái','Ghi chú']);

    // Data
    students.forEach((s, i) => {
      wsData.push([
        i + 1,
        s.student_code || '',
        s.full_name || '',
        s.phone || '',
        s.username || '',
        s.class_name || '',
        s.created_at ? fmtDate(s.created_at.split('T')[0]) : '',
        s.expiry_date ? fmtDate(s.expiry_date) : 'Không giới hạn',
        s.active ? 'Hoạt động' : 'Đã khóa',
        s.notes || ''
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Độ rộng cột
    ws['!cols'] = [
      {wch:5},{wch:10},{wch:25},{wch:14},{wch:28},{wch:12},
      {wch:14},{wch:16},{wch:12},{wch:20}
    ];

    // Merge tiêu đề
    ws['!merges'] = [
      {s:{r:0,c:0}, e:{r:0,c:9}},
      {s:{r:1,c:0}, e:{r:1,c:9}},
      {s:{r:2,c:0}, e:{r:2,c:9}},
    ];

    // Style header row (dòng 5 = index 4)
    const headerRow = 4;
    const cols = ['A','B','C','D','E','F','G','H','I','J'];
    cols.forEach(col => {
      const cell = ws[col + (headerRow+1)];
      if (cell) {
        cell.s = {
          fill: { fgColor: { rgb: '4F46E5' } },
          font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
          alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
          border: {
            top:    { style: 'thin', color: { rgb: 'CCCCCC' } },
            bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
            left:   { style: 'thin', color: { rgb: 'CCCCCC' } },
            right:  { style: 'thin', color: { rgb: 'CCCCCC' } },
          }
        };
      }
    });

    // Style title rows
    ['A1','A2','A3'].forEach((ref, i) => {
      if (ws[ref]) {
        ws[ref].s = {
          font: { bold: true, sz: i===0?14:i===1?12:10, color: { rgb: i===0?'4F46E5':'333333' } },
          alignment: { horizontal: 'center' }
        };
      }
    });

    // Style data rows — xen kẽ màu
    students.forEach((s, i) => {
      const row = headerRow + 2 + i;
      const bg = i % 2 === 0 ? 'F8F9FF' : 'FFFFFF';
      cols.forEach(col => {
        const ref = col + row;
        if (!ws[ref]) ws[ref] = { v: '', t: 's' };
        ws[ref].s = {
          fill: { fgColor: { rgb: bg } },
          font: { sz: 10 },
          alignment: { vertical: 'center', wrapText: false },
          border: {
            top:    { style: 'thin', color: { rgb: 'E2E8F0' } },
            bottom: { style: 'thin', color: { rgb: 'E2E8F0' } },
            left:   { style: 'thin', color: { rgb: 'E2E8F0' } },
            right:  { style: 'thin', color: { rgb: 'E2E8F0' } },
          }
        };
        // Màu trạng thái
        if (col === 'I') {
          ws[ref].s.font = {
            sz: 10, bold: true,
            color: { rgb: s.active ? '065F46' : '991B1B' }
          };
          ws[ref].s.fill = { fgColor: { rgb: s.active ? 'D1FAE5' : 'FEE2E2' } };
        }
      });
    });

    // Tên sheet = tên lớp (giới hạn 31 ký tự)
    const sheetName = clsName.replace(/[\\\/\?\*\[\]]/g,'').slice(0,31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  // Xuất file
  const fileName = `DanhSachHocVien${cls?'_'+cls:''}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, fileName, { bookType: 'xlsx', cellStyles: true });
});

document.getElementById('openAddStudentBtn').addEventListener('click', () => {
  ['addName','addPhone','addUsername','addPassword'].forEach(id => document.getElementById(id).value='');
  document.getElementById('addStudentError').textContent='';
  populateClassFilters().then(() => { document.getElementById('addClass').value=''; });
  genStudentCode().then(code => {
    document.getElementById('addCode').value = code;
    document.getElementById('addPassword').value = code;
  });
  document.getElementById('addStudentModal').classList.add('open');
});

document.getElementById('addStudentCancelBtn').addEventListener('click', () => document.getElementById('addStudentModal').classList.remove('open'));
document.getElementById('addStudentSaveBtn').addEventListener('click', async () => {
  const name=document.getElementById('addName').value.trim(), phone=document.getElementById('addPhone').value.trim();
  const username=document.getElementById('addUsername').value.trim(), password=document.getElementById('addPassword').value.trim();
  const cls=document.getElementById('addClass').value.trim(), code=document.getElementById('addCode').value.trim();
  const expiry=document.getElementById('addExpiry').value || null;
  const notes=document.getElementById('addNotes').value.trim() || null;
  const err=document.getElementById('addStudentError');
  err.textContent='';
  if (!name||!username||!password) { err.textContent='Vui lòng điền đầy đủ họ tên, Gmail và số báo danh.'; return; }
  if (!isValidGmail(username)) { err.textContent='Gmail không hợp lệ. VD: hocsinh@gmail.com'; return; }
  if (!cls) { err.textContent='Vui lòng chọn lớp.'; return; }
  // Kiểm tra trùng Gmail / SĐT
  const dupW = await checkDuplicate(username, phone);
  if (dupW.length) { err.innerHTML = '⚠️ ' + dupW.join('<br/>⚠️ '); return; }
  // Trợ lý không được đặt ngày hết hạn
  const expiryToSave = isTeacher ? expiry : null;
  const { error, data: newSt } = await db.from('students').insert({ student_code:code, full_name:name, phone, username, password: await hashPw(password), class_name:cls, active:true, expiry_date:expiryToSave, notes }).select('id').single();
  if (error) { err.textContent=error.message.includes('unique')?'Gmail đã tồn tại.':error.message; return; }
  // Thêm vào student_classes
  if (cls && newSt?.id) {
    await db.from('student_classes').insert({ student_id: newSt.id, class_name: cls });
  }
  logAccountActivity('Tạo tài khoản', { full_name: name, username, class_name: cls });
  document.getElementById('addStudentModal').classList.remove('open');
  renderStudents(); populateClassFilters();
});

let editingStudentId=null;

async function exportStudentCard(s) {
  // Lấy thông tin lớp
  let startDate = '—', endDate = '—';
  if (s.class_name) {
    const { data: cls } = await db.from('classes').select('start_date,end_date').eq('name', s.class_name).single();
    if (cls?.start_date) startDate = new Date(cls.start_date).toLocaleDateString('vi-VN');
    if (cls?.end_date)   endDate   = new Date(cls.end_date).toLocaleDateString('vi-VN');
  }

  // Tạo card tạm thời
  const card = document.createElement('div');
  card.style.cssText = 'position:fixed;left:-9999px;top:0;width:420px;background:#f8faff;border-radius:16px;overflow:hidden;font-family:Inter,sans-serif;border:1.5px solid #e0e7ff';
  card.innerHTML = `
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:1.5rem;text-align:center;color:#fff">
      <div style="font-weight:900;font-size:1.1rem;margin-bottom:.2rem">THONG TIN TAI KHOAN HOC VIEN</div>
      <div style="font-size:.75rem;opacity:.7">DHDTCT LMS Education System</div>
    </div>
    <div style="padding:1.25rem;display:flex;flex-direction:column;gap:.65rem">
      ${[
        ['Ho ten', s.full_name],
        ['Ma hoc vien', s.student_code||'—'],
        ['Gmail dang nhap', s.username],
        ['Mat khau', s.student_code||'—'],
        ['Lop', s.class_name||'—'],
        ['Khai giang', startDate],
        ['Ket thuc', endDate],
        ['SDT', s.phone||'—'],
        ['Link dang nhap', 'https://trcuongdve.github.io/duyhoangdaytoanct/'],
      ].map(([label, val]) => `
        <div style="display:flex;justify-content:space-between;align-items:center;background:#fff;border-radius:10px;padding:.6rem .9rem;border:1px solid #e0e7ff">
          <span style="font-size:.78rem;color:#64748b;font-weight:600">${label}</span>
          <span style="font-weight:700;font-size:.88rem;color:#1e1b4b">${val}</span>
        </div>`).join('')}
      <div style="text-align:center;font-size:.72rem;color:#94a3b8;margin-top:.25rem">Vui long bao mat thong tin tai khoan</div>
    </div>`;
  document.body.appendChild(card);

  try {
    const canvas = await html2canvas(card, { scale: 2, useCORS: true, backgroundColor: '#f8faff' });
    canvas.toBlob(async blob => {
      const file = new File([blob], `taikhoan-${s.student_code||s.full_name}.png`, { type: 'image/png' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Tài khoản ${s.full_name}` });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `taikhoan-${s.student_code||s.full_name}.png`;
        a.click();
      }
    }, 'image/png');
  } catch(e) {
    alert('Không thể xuất ảnh. Vui lòng thử lại.');
  } finally {
    document.body.removeChild(card);
  }
}

function openEditStudent(s) {
  editingStudentId = s.id;
  document.getElementById('esCode').value = s.student_code||'';
  document.getElementById('esName').value = s.full_name;
  document.getElementById('esPhone').value = s.phone||'';
  document.getElementById('esUsername').value = s.username;
  document.getElementById('esPassword').value = s.student_code||'';
  document.getElementById('esExpiry').value = s.expiry_date||'';
  document.getElementById('esNotes').value = s.notes||'';
  document.getElementById('esError').textContent = '';
  populateClassFilters().then(async () => {
    document.getElementById('esClass').value = s.class_name||'';
    const esAdd = document.getElementById('esAddClassSelect');
    if (esAdd) { esAdd.innerHTML = document.getElementById('esClass').innerHTML; esAdd.value = ''; }
    await renderEsClassList(s.id);
  });
  document.getElementById('editStudentModal').classList.add('open');
}

async function renderEsClassList(studentId) {
  const { data: scList } = await db.from('student_classes').select('id,class_name').eq('student_id', studentId);
  const el = document.getElementById('esClassList');
  if (!el) return;
  el.innerHTML = '';
  (scList||[]).forEach(sc => {
    const tag = document.createElement('div');
    tag.style.cssText = 'display:flex;align-items:center;gap:.3rem;background:#eef2ff;color:#4338ca;padding:.25rem .6rem;border-radius:20px;font-size:.8rem;font-weight:600';
    tag.innerHTML = `<span>${sc.class_name}</span>
      <button type="button" data-scid="${sc.id}" style="background:none;border:none;cursor:pointer;color:#6366f1;font-size:.85rem;padding:0;line-height:1">✕</button>`;
    tag.querySelector('button').addEventListener('click', async () => {
      await db.from('student_classes').delete().eq('id', sc.id);
      logActivity('Học sinh', 'Xóa khỏi lớp', sc.class_name, `student:${studentId}`);
      renderEsClassList(studentId);
    });
    el.appendChild(tag);
  });
  if (!(scList||[]).length) el.innerHTML = '<span style="color:var(--muted);font-size:.8rem">Chưa có lớp nào</span>';
}

document.getElementById('esAddClassBtn')?.addEventListener('click', async () => {
  const cls = document.getElementById('esAddClassSelect')?.value;
  if (!cls || !editingStudentId) return;
  const { error } = await db.from('student_classes').insert({ student_id: editingStudentId, class_name: cls });
  if (error && error.code === '23505') { alert('Học viên đã thuộc lớp này rồi.'); return; }

  // Lấy thông tin học sinh để gửi email
  const { data: stu } = await db.from('students').select('full_name,username').eq('id', editingStudentId).maybeSingle();
  if (stu?.username) sendClassAddedEmail({ username: stu.username, full_name: stu.full_name }, cls).catch(() => {});
  logActivity('Học sinh', 'Thêm vào lớp', cls, `student:${editingStudentId}`);

  renderEsClassList(editingStudentId);
  document.getElementById('esAddClassSelect').value = '';
});

// esCode → esPassword sync
document.getElementById('esCode').addEventListener('input', () => {
  document.getElementById('esPassword').value = document.getElementById('esCode').value;
});

// Nút tạo mã mới cho học viên đang sửa
document.getElementById('esGenCodeBtn')?.addEventListener('click', async () => {
  const btn = document.getElementById('esGenCodeBtn');
  btn.textContent = '⏳'; btn.disabled = true;
  const newCode = await genStudentCode();
  document.getElementById('esCode').value = newCode;
  document.getElementById('esPassword').value = newCode;
  btn.textContent = '🔄 Tạo mã mới'; btn.disabled = false;
});

document.getElementById('esCancelBtn').addEventListener('click', () => document.getElementById('editStudentModal').classList.remove('open'));
document.getElementById('esSaveBtn').addEventListener('click', async () => {
  const name=document.getElementById('esName').value.trim(), username=document.getElementById('esUsername').value.trim();
  const code=document.getElementById('esCode').value.trim(), err=document.getElementById('esError');
  const cls = document.getElementById('esClass').value.trim(); // chỉ lớp chính
  const expiry=document.getElementById('esExpiry').value || null;
  const notes=document.getElementById('esNotes').value.trim() || null;
  if (!name||!username) { err.textContent='Vui lòng điền đầy đủ.'; return; }
  if (!isValidGmail(username)) { err.textContent='Gmail không hợp lệ. VD: hocsinh@gmail.com'; return; }
  const phone = document.getElementById('esPhone')?.value.trim() || '';
  const dupWE = await checkDuplicate(username, phone, editingStudentId);
  if (dupWE.length) { err.innerHTML = '⚠️ ' + dupWE.join('<br/>⚠️ '); return; }
  // Trợ lý không được thay đổi ngày hết hạn — giữ nguyên giá trị cũ
  const updates={ student_code:code, full_name:name, username, class_name:cls||null, notes, phone: phone||null };
  if (isTeacher) updates.expiry_date = expiry;
  const { data: orig } = await db.from('students').select('student_code').eq('id', editingStudentId).single();
  if (code && code !== (orig?.student_code || '')) updates.password = await hashPw(code);
  const { error } = await db.from('students').update(updates).eq('id',editingStudentId);
  if (error) { err.textContent=error.message.includes('unique')?'Gmail đã tồn tại.':error.message; return; }
  // Đồng bộ lớp chính vào student_classes (upsert — không xóa lớp phụ)
  if (cls) {
    await db.from('student_classes').upsert({ student_id: editingStudentId, class_name: cls }, { onConflict: 'student_id,class_name' });
  }
  document.getElementById('editStudentModal').classList.remove('open');
  logAccountActivity('Sửa tài khoản', { full_name: name, username, class_name: cls });
  renderStudents(); renderMiniStudents(); populateClassFilters();
});

// ============================================================
// PROFILE / PASSWORD
// ============================================================

// Restore password hash từ Supabase nếu localStorage bị xóa
(async () => {
  try {
    const t = JSON.parse(localStorage.getItem('dh_teacher') || 'null');
    if (!t || !t.passwordHash || !t.hashed) {
      // Thử lấy từ Supabase
      const { data } = await db.from('app_settings').select('value').eq('key', 'admin_password_hash').maybeSingle();
      if (data?.value) {
        const current = t || {};
        localStorage.setItem('dh_teacher', JSON.stringify({ ...current, passwordHash: data.value, hashed: true }));
      }
    }
  } catch(e) {}
})();

document.getElementById('pwSaveBtn').addEventListener('click', async () => {
  const old=document.getElementById('pwOld').value, nw=document.getElementById('pwNew').value, cf=document.getElementById('pwConfirm').value;
  const err=document.getElementById('pwError'), ok=document.getElementById('pwSuccess');
  err.textContent=''; ok.textContent='';
  const t=JSON.parse(localStorage.getItem('dh_teacher'));
  if (!t) { err.textContent='Không tìm thấy thông tin tài khoản. Hãy đăng nhập lại.'; return; }

  const oldHash = await hashPw(old);
  if (oldHash !== t.passwordHash) { err.textContent='Mật khẩu hiện tại không đúng.'; return; }
  if (!nw) { err.textContent='Vui lòng nhập mật khẩu mới.'; return; }
  if (nw!==cf) { err.textContent='Mật khẩu xác nhận không khớp.'; return; }
  const newHash = await hashPw(nw);
  // Lưu localStorage
  localStorage.setItem('dh_teacher', JSON.stringify({...t, passwordHash: newHash, hashed: true }));
  // Backup lên Supabase để phòng clear browser
  try {
    await db.from('app_settings').upsert({ key: 'admin_password_hash', value: newHash }, { onConflict: 'key' });
  } catch(e) {}
  ok.textContent='Đổi mật khẩu thành công! Đã sao lưu lên cloud.';
  ['pwOld','pwNew','pwConfirm'].forEach(id=>document.getElementById(id).value='');
});

// ============================================================
// VIEWER MODAL
// ============================================================
// Helper: đọc mật khẩu bằng chữ
function spellPassword(pw) {
  return pw.split('').map(c => {
    if (c >= 'A' && c <= 'Z') return `${c} (${c} hoa)`;
    if (c >= 'a' && c <= 'z') return `${c} (${c} thường)`;
    if (c >= '0' && c <= '9') return `${c} (số ${c})`;
    return c;
  }).join(' – ');
}
function setPasswordDisplay(pw) {
  document.getElementById('naPassword').textContent = pw;
  const spelled = document.getElementById('naPasswordSpelled');
  if (spelled) spelled.textContent = '📖 Đọc: ' + spellPassword(pw);
}
function getEmbedUrl(url) {
  if (!url) return null;
  // YouTube
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?controls=0&modestbranding=1&rel=0&disablekb=1&iv_load_policy=3&fs=0`;
  // Google Drive
  const gd = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (gd) return `https://drive.google.com/file/d/${gd[1]}/preview`;
  return null;
}

function openViewer(title, url, fileName, fileType) {
  const isVideoType = fileType==='video'||(fileType||'').startsWith('video/');
  const isLinkType = fileType==='link';
  const isDocLink = fileType==='doc-link';
  const isHandwrittenLink = fileType==='handwritten-link';

  let displayTitle = title;
  if (isVideoType || isLinkType) displayTitle = 'Video bài học';
  else if (isHandwrittenLink) displayTitle = 'Bản viết tay';
  else if (isDocLink) displayTitle = 'Tài liệu';
  else displayTitle = 'Tài liệu';
  document.getElementById('viewerTitle').textContent = displayTitle;

  const body=document.getElementById('viewerBody'), dl=document.getElementById('viewerDownload');

  if (fileType==='link') {
    dl.style.display='none';
    const embed = getEmbedUrl(url);
    body.innerHTML = embed
      ? `<iframe src="${embed}" style="width:100%;height:400px;border:none;border-radius:8px" allowfullscreen></iframe>`
      : `<iframe src="${url}" style="width:100%;height:500px;border:none;border-radius:8px"></iframe>`;
  } else if (isDocLink || isHandwrittenLink) {
    // Tài liệu / viết tay dạng link — có nút tải
    const gdMatch = url && url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    const downloadUrl = gdMatch ? `https://drive.google.com/uc?export=download&id=${gdMatch[1]}` : url;
    dl.href = downloadUrl;
    dl.removeAttribute('download');
    dl.target = '_blank';
    dl.style.display = '';
    const embed = getEmbedUrl(url);
    body.innerHTML = `<iframe src="${embed||url}" style="width:100%;height:500px;border:none;border-radius:8px" allowfullscreen></iframe>`;
  } else if (isVideoType) {
    dl.style.display='none';
    body.innerHTML=`<video src="${url}" controls controlsList="nodownload nofullscreen noremoteplayback" disablePictureInPicture oncontextmenu="return false" class="viewer-video"></video>`;
  } else if (fileType==='application/pdf') {
    dl.href=url; dl.download=fileName||title; dl.style.display='';
    body.innerHTML=`<iframe src="${url}" class="viewer-iframe"></iframe>`;
  } else if ((fileType||'').startsWith('image/')) {
    dl.href=url; dl.download=fileName||title; dl.style.display='';
    body.innerHTML=`<img src="${url}" class="viewer-img" alt="${title}"/>`;
  } else {
    dl.href=url; dl.download=fileName||title; dl.style.display='';
    body.innerHTML=`<p class="muted-center">⚠️ Không xem trực tiếp được. Vui lòng tải xuống.</p>`;
  }
  document.getElementById('viewerModal').classList.add('open');
}
document.getElementById('closeViewer').addEventListener('click', closeViewer);
document.getElementById('viewerModal').addEventListener('click', e => { if(e.target===document.getElementById('viewerModal')) closeViewer(); });
function closeViewer() { document.getElementById('viewerModal').classList.remove('open'); document.getElementById('viewerBody').innerHTML=''; }

// ============================================================
// LESSONS
// ============================================================
let currentLessonId=null, pendingLessonVideoFile=null, pendingLessonDocFile=null;
let _renderLessonsTimer = null;

// ── Lưu / khôi phục trạng thái danh sách bài học ──
function _saveAdminLessonState() {
  const page = document.getElementById('pageLessons');
  if (page) sessionStorage.setItem('adm_lesson_scroll', page.scrollTop);
  const openGroups = [...document.querySelectorAll('#lessonList .group-card.open')]
    .map(c => c.dataset.groupId).filter(Boolean);
  sessionStorage.setItem('adm_open_groups', JSON.stringify(openGroups));
}

async function _restoreAdminLessonState() {
  const savedScroll = sessionStorage.getItem('adm_lesson_scroll');
  const savedGroups = JSON.parse(sessionStorage.getItem('adm_open_groups') || '[]');
  if (!savedGroups.length && !savedScroll) return;
  requestAnimationFrame(() => {
    savedGroups.forEach(gid => {
      const card = document.querySelector(`#lessonList .group-card[data-group-id="${gid}"]`);
      if (card && !card.classList.contains('open')) {
        card.querySelector('.group-card-header')?.click();
      }
    });
    if (savedScroll) {
      setTimeout(() => {
        const page = document.getElementById('pageLessons');
        if (page) page.scrollTop = parseInt(savedScroll);
      }, 100);
    }
    sessionStorage.removeItem('adm_lesson_scroll');
    sessionStorage.removeItem('adm_open_groups');
  });
}

async function renderLessons() {
  clearTimeout(_renderLessonsTimer);
  return new Promise(resolve => {
    _renderLessonsTimer = setTimeout(async () => {
      await _doRenderLessons();
      resolve();
    }, 80);
  });
}
async function _doRenderLessons() {
  document.getElementById('lessonListView').style.display='';
  document.getElementById('lessonDetailView').style.display='none';
  const fc = document.getElementById('lessonFilterClass').value;
  let query = db.from('lessons').select('*').order('group_name',{ascending:true}).order('sort_order',{ascending:true}).order('created_at',{ascending:true});
  if (fc) query = query.eq('class_name', fc);
  const { data: list } = await query;
  const el = document.getElementById('lessonList');
  el.innerHTML = '';
  document.getElementById('emptyLessons').style.display = (list||[]).length ? 'none' : 'block';
  if (!(list||[]).length) return;

  const ids = list.map(l => l.id);
  const [{ data: allVids }, { data: allDocs }] = await Promise.all([
    db.from('lesson_videos').select('lesson_id').in('lesson_id', ids),
    db.from('lesson_docs').select('lesson_id').in('lesson_id', ids),
  ]);
  const vcMap = {}, dcMap = {};
  (allVids||[]).forEach(v => { vcMap[v.lesson_id] = (vcMap[v.lesson_id]||0)+1; });
  (allDocs||[]).forEach(d => { dcMap[d.lesson_id] = (dcMap[d.lesson_id]||0)+1; });

  const groups = {};
  list.forEach(l => { const g = l.group_name || 'Chua phan nhom'; if (!groups[g]) groups[g] = []; groups[g].push(l); });

  const colors = [
    { gc:'#6366f1', gcLight:'#eef2ff', gcGlow:'rgba(99,102,241,.15)' },
    { gc:'#0ea5e9', gcLight:'#e0f2fe', gcGlow:'rgba(14,165,233,.15)' },
    { gc:'#10b981', gcLight:'#d1fae5', gcGlow:'rgba(16,185,129,.15)' },
    { gc:'#f59e0b', gcLight:'#fef3c7', gcGlow:'rgba(245,158,11,.15)' },
    { gc:'#ec4899', gcLight:'#fce7f3', gcGlow:'rgba(236,72,153,.15)' },
    { gc:'#8b5cf6', gcLight:'#ede9fe', gcGlow:'rgba(139,92,246,.15)' },
  ];

  const grid = document.createElement('div');
  grid.className = 'group-card-grid';
  el.appendChild(grid);

  Object.entries(groups).forEach(([groupName, lessons], gi) => {
    const c = colors[gi % colors.length];
    const card = document.createElement('div');
    card.className = 'group-card';
    card.dataset.groupId = groupName; // để khôi phục trạng thái mở
    card.style.setProperty('--gc', c.gc);
    card.style.setProperty('--gc-light', c.gcLight);
    card.style.setProperty('--gc-glow', c.gcGlow);

    const header = document.createElement('div');
    header.className = 'group-card-header';
    const iconEl = document.createElement('div');
    iconEl.className = 'group-card-icon';
    const groupIcons = ['\uD83D\uDCDA','\uD83C\uDFAF','\uD83D\uDD25','\uD83D\uDCA1','\uD83C\uDF1F','\uD83D\uDE80'];
    iconEl.textContent = groupIcons[gi % groupIcons.length];
    const bodyEl = document.createElement('div');
    bodyEl.className = 'group-card-body';
    bodyEl.innerHTML = `<div class="group-card-name">${groupName}</div><div class="group-card-meta"><span class="group-card-count">${lessons.length} bai hoc</span></div>`;
    const chevron = document.createElement('div');
    chevron.className = 'group-card-chevron';
    chevron.textContent = String.fromCharCode(9660);
    header.appendChild(iconEl);
    header.appendChild(bodyEl);
    header.appendChild(chevron);

    const lessonList = document.createElement('div');
    lessonList.className = 'group-lesson-list';
    const inner = document.createElement('div');
    inner.className = 'group-lesson-list-inner';
    lessonList.appendChild(inner);

    let expanded = false;
    header.addEventListener('click', () => {
      expanded = !expanded;
      card.classList.toggle('open', expanded);
      lessonList.classList.toggle('open', expanded);
      if (expanded && !inner.dataset.loaded) {
        inner.dataset.loaded = '1';
        if (!lessons.length) { inner.innerHTML = '<div class="group-empty-msg">Chua co bai hoc nao.</div>'; return; }
        lessons.forEach((l, idx) => {
          const vc = vcMap[l.id]||0, dc = dcMap[l.id]||0;
          const item = document.createElement('div');
          item.className = 'group-lesson-item';
          item.dataset.id = l.id;
          // Handle kéo thả
          const handle = document.createElement('div');
          handle.className = 'drag-handle';
          handle.title = 'Kéo để sắp xếp';
          handle.innerHTML = '⠿';
          handle.style.cssText = 'cursor:grab;color:var(--muted);font-size:1.1rem;padding:0 .4rem;flex-shrink:0;user-select:none';
          const num = document.createElement('div'); num.className = 'group-lesson-num'; num.textContent = idx+1;
          const info = document.createElement('div'); info.className = 'group-lesson-info';
          info.innerHTML = `<div class="group-lesson-title"><span style="margin-right:.35rem">\uD83D\uDCDA</span>${l.name}</div><div class="group-lesson-stats"><span>\uD83C\uDFAC ${vc}</span><span>\uD83D\uDCC4 ${dc}</span>${l.class_name?`<span class="class-tag" style="font-size:.68rem">${l.class_name}</span>`:''}${_allowedBadge(l.allowed_usernames)}</div>`;
          const acts = document.createElement('div'); acts.className = 'group-lesson-item-actions';
          const openBtn = document.createElement('button'); openBtn.className = 'group-lesson-open'; openBtn.textContent = String.fromCharCode(8594);
          openBtn.addEventListener('click', e => { e.stopPropagation(); openLessonDetail(l.id); });
          const eb = document.createElement('button'); eb.className = 'btn-sm'; eb.textContent = String.fromCharCode(9999,65039);
          eb.addEventListener('click', e => { e.stopPropagation(); openLessonModal(l); });
          const db2 = document.createElement('button'); db2.className = 'btn-sm btn-danger'; db2.textContent = String.fromCharCode(128465);
          db2.addEventListener('click', e => { e.stopPropagation(); showConfirm(`Xoa bai hoc "${l.name}"?`, async () => { _saveAdminLessonState(); await db.from('lessons').delete().eq('id',l.id); logActivity('Bài học', 'Xóa bài học', l.name, l.class_name||''); await renderLessons(); await _restoreAdminLessonState(); }); });
          acts.appendChild(openBtn); acts.appendChild(eb); acts.appendChild(db2);
          item.appendChild(handle); item.appendChild(num); item.appendChild(info); item.appendChild(acts);
          item.addEventListener('click', () => openLessonDetail(l.id));
          inner.appendChild(item);
        });

        // Kích hoạt SortableJS
        if (typeof Sortable !== 'undefined') {
          Sortable.create(inner, {
            handle: '.drag-handle',
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            onEnd: async function(evt) {
              // Lấy thứ tự mới
              const items = [...inner.querySelectorAll('.group-lesson-item')];
              // Cập nhật số thứ tự hiển thị
              items.forEach((el, i) => {
                const numEl = el.querySelector('.group-lesson-num');
                if (numEl) numEl.textContent = i + 1;
              });
              // Lưu sort_order vào DB
              const updates = items.map((el, i) => ({
                id: parseInt(el.dataset.id),
                sort_order: i + 1
              }));
              for (const u of updates) {
                await db.from('lessons').update({ sort_order: u.sort_order }).eq('id', u.id);
              }
            }
          });
        }
      }
    });

    card.appendChild(header);
    card.appendChild(lessonList);
    grid.appendChild(card);
  });
}
document.getElementById('lessonFilterClass').addEventListener('change', renderLessons);

let editingLessonId=null;
function openLessonModal(l=null) {
  editingLessonId = l ? l.id : null;
  document.getElementById('lessonModalTitle').textContent = l ? 'Sửa bài học' : 'Tạo bài học';
  document.getElementById('lNameInput').value = l ? l.name : '';
  document.getElementById('lDescInput').value = l ? (l.description||'') : '';
  document.getElementById('lError').textContent = '';
  // Ẩn/hiện phần thêm media inline (chỉ khi tạo mới)
  const mediaSection = document.getElementById('lInlineMediaSection');
  if (mediaSection) {
    mediaSection.style.display = l ? 'none' : '';
    document.getElementById('lInlineVideoLinks').value = '';
    document.getElementById('lInlineVideoTitle') && (document.getElementById('lInlineVideoTitle').value = '');
    document.getElementById('lInlineDocLinks').value = '';
    document.getElementById('lInlineHwLinks').value = '';
  }
  // Fill allowed_usernames
  _lSelectedUsernames = [];
  document.getElementById('lStudentSearch').value = '';
  document.getElementById('lAllowedUsernames').value = l?.allowed_usernames || '';
  if (l?.allowed_usernames) {
    _lSelectedUsernames = l.allowed_usernames.split(',').map(u => u.trim()).filter(Boolean);
  }
  _renderLStudentTags();
  // Truyền group_id nếu có, fallback group_name cũ
  populateGroupSelect('lGroupInput', l ? (l.group_id || l.group_name || '') : '');
  document.getElementById('lessonModal').classList.add('open');
}

// ── Helper: badge hiển thị học sinh được gán ─────────────────
function _allowedBadge(allowed_usernames) {
  if (!allowed_usernames) return '';
  const list = allowed_usernames.split(',').map(u => u.trim()).filter(Boolean);
  if (!list.length) return '';
  const tooltip = list.join('\n');
  return `<span title="${tooltip}" style="background:#ede9fe;color:#5b21b6;border-radius:20px;padding:.1rem .45rem;font-size:.68rem;font-weight:700;cursor:help" onclick="event.stopPropagation();_showAllowedModal(this,'${allowed_usernames.replace(/'/g,'&#39;')}')">👤 ${list.length} HS</span>`;
}

// Modal xem danh sách học sinh được gán
function _showAllowedModal(el, allowedRaw) {
  const list = allowedRaw.split(',').map(u => u.trim()).filter(Boolean);
  const existing = document.getElementById('_allowedModal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = '_allowedModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;display:flex;align-items:center;justify-content:center;padding:1rem';
  modal.innerHTML = `
    <div style="background:var(--card);border-radius:16px;padding:1.5rem;max-width:400px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.25);max-height:70vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <div style="font-weight:800;font-size:.95rem">👤 Học sinh được gán (${list.length})</div>
        <button onclick="document.getElementById('_allowedModal').remove()" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--muted)">✕</button>
      </div>
      ${list.map(u => `<div style="padding:.45rem .75rem;border-radius:8px;background:var(--bg);margin-bottom:.3rem;font-size:.85rem;font-weight:600">📧 ${u}</div>`).join('')}
    </div>`;
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}


let _lSelectedUsernames = []; // ['gmail1@gmail.com', ...]

function _renderLStudentTags() {
  const wrap = document.getElementById('lStudentTags');
  if (!wrap) return;
  if (!_lSelectedUsernames.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = _lSelectedUsernames.map(u => `
    <span style="display:inline-flex;align-items:center;gap:.3rem;background:#eef2ff;color:#3730a3;border:1.5px solid #c7d2fe;border-radius:20px;padding:.18rem .65rem;font-size:.78rem;font-weight:700">
      👤 ${u}
      <button type="button" onclick="_lRemoveStudent('${u}')"
        style="background:none;border:none;cursor:pointer;color:#6366f1;font-size:.9rem;padding:0;line-height:1;margin-left:.15rem">✕</button>
    </span>`).join('');
  document.getElementById('lAllowedUsernames').value = _lSelectedUsernames.join(',');
}

function _lRemoveStudent(u) {
  _lSelectedUsernames = _lSelectedUsernames.filter(x => x !== u);
  _renderLStudentTags();
}

// Search học sinh khi gõ vào ô tìm kiếm
let _lStudentSearchTimer = null;
document.getElementById('lStudentSearch')?.addEventListener('input', function() {
  clearTimeout(_lStudentSearchTimer);
  const q = this.value.trim();
  const dd = document.getElementById('lStudentDropdown');
  if (!q) { dd.style.display = 'none'; return; }
  _lStudentSearchTimer = setTimeout(async () => {
    const { data } = await db.from('students')
      .select('username,full_name,class_name')
      .or(`full_name.ilike.%${q}%,username.ilike.%${q}%`)
      .eq('active', true)
      .limit(10);
    if (!data?.length) { dd.innerHTML = '<div style="padding:.65rem 1rem;font-size:.83rem;color:var(--muted)">Không tìm thấy học sinh</div>'; dd.style.display = 'block'; return; }
    dd.innerHTML = data.map(s => `
      <div onclick="_lAddStudent('${s.username}','${s.full_name.replace(/'/g,'&#39;')}')"
        style="padding:.6rem 1rem;cursor:pointer;font-size:.85rem;border-bottom:1px solid var(--border);transition:background .15s"
        onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
        <span style="font-weight:700">${s.full_name}</span>
        <span style="color:var(--muted);font-size:.78rem;margin-left:.4rem">${s.username}</span>
        ${s.class_name ? `<span style="float:right;font-size:.72rem;background:var(--primary-light);color:var(--primary);padding:.1rem .4rem;border-radius:6px;font-weight:700">${s.class_name}</span>` : ''}
      </div>`).join('');
    dd.style.display = 'block';
  }, 250);
});

function _lAddStudent(username, name) {
  if (!_lSelectedUsernames.includes(username)) {
    _lSelectedUsernames.push(username);
    _renderLStudentTags();
  }
  document.getElementById('lStudentSearch').value = '';
  document.getElementById('lStudentDropdown').style.display = 'none';
}


document.getElementById('openAddLessonBtn').addEventListener('click', () => openLessonModal());
document.getElementById('lCancelBtn').addEventListener('click', () => document.getElementById('lessonModal').classList.remove('open'));
document.getElementById('lSaveBtn').addEventListener('click', async () => {
  const name = document.getElementById('lNameInput').value.trim(), err = document.getElementById('lError');
  if (!name) { err.textContent = 'Vui lòng nhập tên bài học.'; return; }
  const desc  = document.getElementById('lDescInput').value.trim();
  const groupId = document.getElementById('lGroupInput').value || null;
  const allowedUsernames = document.getElementById('lAllowedUsernames').value.trim() || null;
  // Lấy tên nhóm + lớp của nhóm để tự đồng bộ class_name cho bài học
  const { data: grpData } = groupId
    ? await db.from('lesson_groups').select('name,class_name').eq('id', groupId).single()
    : { data: null };
  const groupName = grpData ? grpData.name : null;
  const cls = grpData ? (grpData.class_name || null) : null;

  const btn = document.getElementById('lSaveBtn');
  btn.textContent = 'Đang lưu...'; btn.disabled = true;

  let lessonId = editingLessonId;
  if (editingLessonId) {
    await db.from('lessons').update({ name, class_name: cls, description: desc, group_id: groupId ? parseInt(groupId) : null, group_name: groupName, allowed_usernames: allowedUsernames }).eq('id', editingLessonId);
  } else {
    // Tính sort_order = max hiện tại trong nhóm + 1 → bài mới nằm cuối
    let nextOrder = 1;
    const { data: existing } = await db.from('lessons')
      .select('sort_order')
      .eq('group_name', groupName || '')
      .order('sort_order', { ascending: false })
      .limit(1);
    if (existing && existing.length > 0 && existing[0].sort_order != null) {
      nextOrder = existing[0].sort_order + 1;
    }
    const { data: newLesson } = await db.from('lessons').insert({ name, class_name: cls, description: desc, group_id: groupId ? parseInt(groupId) : null, group_name: groupName, sort_order: nextOrder, allowed_usernames: allowedUsernames }).select('id').single();
    lessonId = newLesson?.id;

    // Lưu video links inline
    if (lessonId) {
      const rawVideo = document.getElementById('lInlineVideoLinks').value.trim();
      if (rawVideo) {
        const videoLinks = rawVideo.split('\n').map(l=>l.trim()).filter(Boolean);
        const inlineTitle = document.getElementById('lInlineVideoTitle')?.value.trim() || '';
        for (const [i, url] of videoLinks.entries()) {
          const t = inlineTitle
            ? (videoLinks.length > 1 ? `${inlineTitle} (${i+1})` : inlineTitle)
            : `Video bài học${videoLinks.length > 1 ? ' ' + (i+1) : ''}`;
          await db.from('lesson_videos').insert({ lesson_id: lessonId, title: t, video_url: await encryptUrl(url), storage_path: null, file_name: null });
        }
      }
      // Lưu tài liệu links inline
      const rawDoc = document.getElementById('lInlineDocLinks').value.trim();
      if (rawDoc) {
        const docLinks = rawDoc.split('\n').map(l=>l.trim()).filter(Boolean);
        for (let i=0; i<docLinks.length; i++) {
          const url = docLinks[i];
          const gdMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
          const docUrl = gdMatch ? `https://drive.google.com/file/d/${gdMatch[1]}/preview` : url;
          const t = docLinks.length > 1 ? `Tài liệu ${i+1}` : 'Tài liệu';
          await db.from('lesson_docs').insert({ lesson_id: lessonId, title: t, file_name: null, file_type: 'link', storage_path: null, doc_url: await encryptUrl(docUrl) });
        }
      }
      // Lưu bản viết tay links inline
      const rawHw = document.getElementById('lInlineHwLinks').value.trim();
      if (rawHw) {
        const hwLinks = rawHw.split('\n').map(l=>l.trim()).filter(Boolean);
        for (let i=0; i<hwLinks.length; i++) {
          const url = hwLinks[i];
          const gdMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
          const docUrl = gdMatch ? `https://drive.google.com/file/d/${gdMatch[1]}/preview` : url;
          const t = hwLinks.length > 1 ? `Bản viết tay ${i+1}` : 'Bản viết tay';
          await db.from('lesson_docs').insert({ lesson_id: lessonId, title: t, file_name: null, file_type: 'handwritten', storage_path: null, doc_url: await encryptUrl(docUrl) });
        }
      }
    }
  }

  btn.textContent = 'Lưu'; btn.disabled = false;
  document.getElementById('lessonModal').classList.remove('open');
  logActivity('Bài học', editingLessonId ? 'Sửa bài học' : 'Thêm bài học', name, cls||'');
  _saveAdminLessonState(); // lưu trạng thái trước khi render lại
  await renderLessons();
  await _restoreAdminLessonState(); // khôi phục sau khi render xong
});

async function openLessonDetail(id) {
  currentLessonId = id;

  // Lưu scroll position và nhóm đang mở
  _saveAdminLessonState();

  document.getElementById('lessonListView').style.display = 'none';
  document.getElementById('lessonDetailView').style.display = '';
  document.getElementById('lessonDetailTitle').textContent = '...';
  document.getElementById('lessonDetailDesc').textContent  = '';

  // Load song song
  const [{ data:l }] = await Promise.all([
    db.from('lessons').select('*').eq('id',id).single(),
  ]);
  if (!l) return;
  document.getElementById('lessonDetailTitle').textContent = l.name;
  document.getElementById('lessonDetailDesc').textContent  = l.description||'';

  // Render video và doc song song
  await Promise.all([renderLessonVideos(id), renderLessonDocs(id)]);
}
document.getElementById('backToLessonsBtn').addEventListener('click', async () => {
  await renderLessons();
  await _restoreAdminLessonState();
});

async function renderLessonVideos(lessonId) {
  const { data:vids }=await db.from('lesson_videos').select('*').eq('lesson_id',lessonId).order('created_at');
  const grid=document.getElementById('lessonVideoGrid');
  grid.innerHTML='';
  document.getElementById('emptyLessonVideos').style.display=(vids||[]).length?'none':'block';
  const urls = await Promise.all((vids||[]).map(v =>
    v.video_url ? decryptUrl(v.video_url) : Promise.resolve(db.storage.from('lessons').getPublicUrl(v.storage_path).data.publicUrl)
  ));
  (vids||[]).forEach((v, i)=>{
    const isLink = !!v.video_url;
    const url = urls[i];
    const embed = isLink ? getEmbedUrl(url) : null;
    const card=document.createElement('div');
    card.className='video-card';
    if (embed) {
      card.innerHTML=`<div class="video-thumb" style="background:#000;display:flex;align-items:center;justify-content:center"><span style="font-size:2rem">🔗</span><span class="play-btn">▶</span></div><div class="video-info"><div class="video-title">${v.title}</div><button class="btn-sm btn-danger del-btn">🗑 Xóa</button></div>`;
    } else {
      card.innerHTML=`<div class="video-thumb"><video src="${url}" preload="none"></video><span class="play-btn">▶</span></div><div class="video-info"><div class="video-title">${v.title}</div><button class="btn-sm btn-danger del-btn">🗑 Xóa</button></div>`;
    }
    card.querySelector('.video-thumb').addEventListener('click',()=>openViewer(v.title, url, v.file_name, isLink ? 'link' : 'video'));
    card.querySelector('.del-btn').addEventListener('click', async ()=>{
      if (!isLink && v.storage_path) await db.storage.from('lessons').remove([v.storage_path]);
      await db.from('lesson_videos').delete().eq('id',v.id);
      logActivity('Video', 'Xóa video', v.title||'', `lesson:${lessonId}`);
      renderLessonVideos(lessonId);
    });
    grid.appendChild(card);
  });
}

async function renderLessonDocs(lessonId) {
  const { data:docs }=await db.from('lesson_docs').select('*').eq('lesson_id',lessonId).order('created_at');
  const el=document.getElementById('lessonDocList');
  el.innerHTML='';
  document.getElementById('emptyLessonDocs').style.display=(docs||[]).length?'none':'block';
  const urls = await Promise.all((docs||[]).map(d =>
    (d.file_type==='link'||d.file_type==='handwritten') ? decryptUrl(d.doc_url) : Promise.resolve(db.storage.from('lessons').getPublicUrl(d.storage_path).data.publicUrl)
  ));
  (docs||[]).forEach((d, i)=>{
    const isLink = d.file_type==='link';
    const isHandwritten = d.file_type==='handwritten';
    const url = urls[i];
    const row=document.createElement('div');
    row.className='content-row clickable';
    const icon = isHandwritten ? '✍️' : isLink ? '🔗' : '📄';
    row.innerHTML=`<span class="list-icon">${icon}</span><div class="list-info"><div class="list-title">${d.title}</div></div><div class="row-actions"><button class="btn-sm btn-danger">🗑</button></div>`;
    row.addEventListener('click', e=>{ if(!e.target.closest('.row-actions')) openViewer(isHandwritten?'Bản viết tay':d.title, url, d.file_name, isHandwritten?'handwritten-link':isLink?'doc-link':d.file_type); });
    row.querySelector('.btn-danger').addEventListener('click', async e=>{
      e.stopPropagation();
      if (!isLink && !isHandwritten && d.storage_path) await db.storage.from('lessons').remove([d.storage_path]);
      await db.from('lesson_docs').delete().eq('id',d.id);
      logActivity('Tài liệu', 'Xóa tài liệu', d.title||'', `lesson:${lessonId}`);
      renderLessonDocs(lessonId);
    });
    el.appendChild(row);
  });
}

document.getElementById('openAddVideoBtn').addEventListener('click', () => {
  pendingLessonVideoFile = null;
  document.getElementById('lessonPreviewVideo').src = '';
  document.getElementById('lessonVideoFileInput').value = '';
  document.getElementById('lvLinkInput').value = '';
  document.getElementById('lvLinkPreview').innerHTML = '';
  document.getElementById('lvEmbedInput').value = '';
  document.getElementById('videoFileSection').style.display = '';
  document.getElementById('videoLinkSection').style.display = 'none';
  document.getElementById('videoEmbedSection').style.display = 'none';
  document.getElementById('tabVideoFile').classList.add('active');
  document.getElementById('tabVideoLink').classList.remove('active');
  document.getElementById('tabVideoEmbed').classList.remove('active');
  document.getElementById('lessonVideoModal').classList.add('open');
});

document.getElementById('tabVideoFile').addEventListener('click', () => {
  document.getElementById('videoFileSection').style.display = '';
  document.getElementById('videoLinkSection').style.display = 'none';
  document.getElementById('videoEmbedSection').style.display = 'none';
  document.getElementById('tabVideoFile').classList.add('active');
  document.getElementById('tabVideoLink').classList.remove('active');
  document.getElementById('tabVideoEmbed').classList.remove('active');
});
document.getElementById('tabVideoLink').addEventListener('click', () => {
  document.getElementById('videoFileSection').style.display = 'none';
  document.getElementById('videoLinkSection').style.display = '';
  document.getElementById('videoEmbedSection').style.display = 'none';
  document.getElementById('tabVideoFile').classList.remove('active');
  document.getElementById('tabVideoLink').classList.add('active');
  document.getElementById('tabVideoEmbed').classList.remove('active');
});
document.getElementById('tabVideoEmbed').addEventListener('click', () => {
  document.getElementById('videoFileSection').style.display = 'none';
  document.getElementById('videoLinkSection').style.display = 'none';
  document.getElementById('videoEmbedSection').style.display = '';
  document.getElementById('tabVideoFile').classList.remove('active');
  document.getElementById('tabVideoLink').classList.remove('active');
  document.getElementById('tabVideoEmbed').classList.add('active');
});

// Preview khi nhập link — bỏ qua vì textarea nhiều dòng
document.getElementById('lvLinkInput').addEventListener('input', () => {});

document.getElementById('lessonVideoFileInput').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  pendingLessonVideoFile = f;
  document.getElementById('lessonPreviewVideo').src = URL.createObjectURL(f);
  document.getElementById('lvTitleInput').value = f.name.replace(/\.[^.]+$/, '');
});

document.getElementById('lvCancelBtn').addEventListener('click', () => {
  document.getElementById('lessonVideoModal').classList.remove('open');
  document.getElementById('lessonPreviewVideo').src = '';
  pendingLessonVideoFile = null;
});

document.getElementById('lvSaveBtn').addEventListener('click', async () => {
  const isLinkTab  = document.getElementById('tabVideoLink').classList.contains('active');
  const isEmbedTab = document.getElementById('tabVideoEmbed').classList.contains('active');
  const title = document.getElementById('lvTitleInput').value.trim() || 'Video bài học';
  const btn = document.getElementById('lvSaveBtn');
  btn.textContent = 'Đang lưu...'; btn.disabled = true;

  if (isEmbedTab) {
    // Lưu mã nhúng — trích src từ iframe hoặc lưu nguyên mã
    const raw = document.getElementById('lvEmbedInput').value.trim();
    if (!raw) { btn.textContent = 'Lưu'; btn.disabled = false; return; }
    // Trích src từ thẻ iframe nếu có
    const srcMatch = raw.match(/src=["']([^"']+)["']/);
    const embedUrl = srcMatch ? srcMatch[1] : raw;
    await db.from('lesson_videos').insert({ lesson_id: currentLessonId, title, video_url: await encryptUrl(embedUrl), storage_path: null, file_name: null, is_embed: true });
  } else if (isLinkTab) {
    const raw = document.getElementById('lvLinkInput').value.trim();
    if (!raw) { btn.textContent = 'Lưu'; btn.disabled = false; return; }
    const links = raw.split('\n').map(l=>l.trim()).filter(Boolean);
    for (const url of links) {
      await db.from('lesson_videos').insert({ lesson_id: currentLessonId, title, video_url: await encryptUrl(url), storage_path: null, file_name: null });
    }
  } else {
    if (!pendingLessonVideoFile) { btn.textContent = 'Lưu'; btn.disabled = false; return; }
    const safeName = `${Date.now()}_${pendingLessonVideoFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
    const path = `videos/${currentLessonId}/${safeName}`;
    const { error: upErr } = await db.storage.from('lessons').upload(path, pendingLessonVideoFile, { cacheControl: '3600', upsert: false });
    if (upErr) { alert('Lỗi upload: ' + upErr.message); btn.textContent = 'Lưu'; btn.disabled = false; return; }
    await db.from('lesson_videos').insert({ lesson_id: currentLessonId, title, file_name: pendingLessonVideoFile.name, storage_path: path, video_url: null });
  }

  btn.textContent = 'Lưu'; btn.disabled = false;
  document.getElementById('lessonVideoModal').classList.remove('open');
  document.getElementById('lessonPreviewVideo').src = '';
  document.getElementById('lvEmbedInput').value = '';
  pendingLessonVideoFile = null;
  logActivity('Video', 'Thêm video', title, `lesson:${currentLessonId}`);
  renderLessonVideos(currentLessonId);
});

document.getElementById('openAddDocBtn').addEventListener('click', () => {
  pendingLessonDocFile = null;
  document.getElementById('lessonDocFileInfo').textContent = '';
  document.getElementById('ldLinkInput').value = '';
  document.getElementById('ldHandwrittenInput').value = '';
  document.getElementById('docFileSection').style.display = '';
  document.getElementById('docLinkSection').style.display = 'none';
  document.getElementById('docHandwrittenSection').style.display = 'none';
  document.getElementById('tabDocFile').classList.add('active');
  document.getElementById('tabDocLink').classList.remove('active');
  document.getElementById('tabDocHandwritten').classList.remove('active');
  document.getElementById('lessonDocModal').classList.add('open');
});

document.getElementById('docUploadDrop').addEventListener('click', () => {
  document.getElementById('lessonDocInput').click();
});

document.getElementById('lessonDocInput').addEventListener('change', e=>{
  const f=e.target.files[0]; if(!f) return;
  pendingLessonDocFile=f;
  document.getElementById('lessonDocFileInfo').textContent=`📎 ${f.name}`;
  document.getElementById('ldTitleInput').value=f.name.replace(/\.[^.]+$/,'');
  e.target.value='';
});

document.getElementById('tabDocFile').addEventListener('click', () => {
  document.getElementById('docFileSection').style.display='';
  document.getElementById('docLinkSection').style.display='none';
  document.getElementById('docHandwrittenSection').style.display='none';
  document.getElementById('tabDocFile').classList.add('active');
  document.getElementById('tabDocLink').classList.remove('active');
  document.getElementById('tabDocHandwritten').classList.remove('active');
});
document.getElementById('tabDocLink').addEventListener('click', () => {
  document.getElementById('docFileSection').style.display='none';
  document.getElementById('docLinkSection').style.display='';
  document.getElementById('docHandwrittenSection').style.display='none';
  document.getElementById('tabDocFile').classList.remove('active');
  document.getElementById('tabDocLink').classList.add('active');
  document.getElementById('tabDocHandwritten').classList.remove('active');
});
document.getElementById('tabDocHandwritten').addEventListener('click', () => {
  document.getElementById('docFileSection').style.display='none';
  document.getElementById('docLinkSection').style.display='none';
  document.getElementById('docHandwrittenSection').style.display='';
  document.getElementById('tabDocFile').classList.remove('active');
  document.getElementById('tabDocLink').classList.remove('active');
  document.getElementById('tabDocHandwritten').classList.add('active');
});

document.getElementById('ldCancelBtn').addEventListener('click',()=>{ document.getElementById('lessonDocModal').classList.remove('open'); pendingLessonDocFile=null; });
document.getElementById('ldSaveBtn').addEventListener('click', async ()=>{
  const isLinkTab = document.getElementById('tabDocLink').classList.contains('active');
  const isHandwrittenTab = document.getElementById('tabDocHandwritten').classList.contains('active');
  // Tự động tiêu đề theo loại
  const title = isHandwrittenTab ? 'Bản viết tay' : isLinkTab ? 'Tài liệu' : (pendingLessonDocFile?.name.replace(/\.[^.]+$/,'') || 'Tài liệu');
  const btn = document.getElementById('ldSaveBtn');
  btn.textContent='Đang lưu...'; btn.disabled=true;

  if (isHandwrittenTab) {
    // Tab viết tay riêng (không dùng nữa nhưng giữ tương thích)
    const raw = document.getElementById('ldHandwrittenInput').value.trim();
    if (!raw) { btn.textContent='Tải lên'; btn.disabled=false; return; }
    const links = raw.split('\n').map(l=>l.trim()).filter(Boolean);
    for (let i=0; i<links.length; i++) {
      const url = links[i];
      const gdMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
      const docUrl = gdMatch ? `https://drive.google.com/file/d/${gdMatch[1]}/preview` : url;
      const t = links.length > 1 ? `Bản viết tay ${i+1}` : 'Bản viết tay';
      await db.from('lesson_docs').insert({lesson_id:currentLessonId, title:t, file_name:null, file_type:'handwritten', storage_path:null, doc_url:await encryptUrl(docUrl)});
    }
  } else if (isLinkTab) {
    // Tab tài liệu: lưu cả tài liệu + viết tay cùng lúc
    const rawDoc = document.getElementById('ldLinkInput').value.trim();
    const rawHw  = document.getElementById('ldHandwrittenInput').value.trim();
    if (!rawDoc && !rawHw) { btn.textContent='Tải lên'; btn.disabled=false; return; }
    const docLinks = rawDoc ? rawDoc.split('\n').map(l=>l.trim()).filter(Boolean) : [];
    for (let i=0; i<docLinks.length; i++) {
      const url = docLinks[i];
      const gdMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
      const docUrl = gdMatch ? `https://drive.google.com/file/d/${gdMatch[1]}/preview` : url;
      const t = docLinks.length > 1 ? `Tài liệu ${i+1}` : 'Tài liệu';
      await db.from('lesson_docs').insert({lesson_id:currentLessonId, title:t, file_name:null, file_type:'link', storage_path:null, doc_url:await encryptUrl(docUrl)});
    }
    const hwLinks = rawHw ? rawHw.split('\n').map(l=>l.trim()).filter(Boolean) : [];
    for (let i=0; i<hwLinks.length; i++) {
      const url = hwLinks[i];
      const gdMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
      const docUrl = gdMatch ? `https://drive.google.com/file/d/${gdMatch[1]}/preview` : url;
      const t = hwLinks.length > 1 ? `Bản viết tay ${i+1}` : 'Bản viết tay';
      await db.from('lesson_docs').insert({lesson_id:currentLessonId, title:t, file_name:null, file_type:'handwritten', storage_path:null, doc_url:await encryptUrl(docUrl)});
    }
  } else {
    if (!pendingLessonDocFile) { btn.textContent='Tải lên'; btn.disabled=false; return; }
    const safeName=`${Date.now()}_${pendingLessonDocFile.name.replace(/[^a-zA-Z0-9.\-_]/g,'_')}`;
    const path=`docs/${currentLessonId}/${safeName}`;
    const { error:upErr }=await db.storage.from('lessons').upload(path,pendingLessonDocFile);
    if (upErr) { alert('Lỗi upload: '+upErr.message); btn.textContent='Tải lên'; btn.disabled=false; return; }
    await db.from('lesson_docs').insert({lesson_id:currentLessonId,title,file_name:pendingLessonDocFile.name,file_type:pendingLessonDocFile.type,storage_path:path,doc_url:null});
  }

  btn.textContent='Tải lên'; btn.disabled=false;
  document.getElementById('lessonDocModal').classList.remove('open');
  document.getElementById('ldLinkInput').value='';
  document.getElementById('ldHandwrittenInput').value='';
  pendingLessonDocFile=null;
  logActivity('Tài liệu', 'Thêm tài liệu', title, `lesson:${currentLessonId}`);
  renderLessonDocs(currentLessonId);
});

// ============================================================
// CLASSES
// ============================================================
async function renderClasses() {
  document.getElementById('classListView').style.display='';
  document.getElementById('classDetailView').style.display='none';
  const allNames=await getClasses();
  const { data:clsData }=await db.from('classes').select('name,start_date,end_date');
  const clsMap=Object.fromEntries((clsData||[]).map(c=>[c.name,c]));
  const grid=document.getElementById('classGrid');
  grid.innerHTML='';
  document.getElementById('emptyClasses').style.display=allNames.length?'none':'block';
  const today = new Date(); today.setHours(0,0,0,0);
  const { data: allStudentsFull } = await db.from('students').select('id, class_name, active, is_online, last_seen');
  // Lấy tất cả student_classes để đếm đúng học viên nhiều lớp
  const { data: allSC } = await db.from('student_classes').select('student_id, class_name');
  const scMap = {}; // class_name → Set of student_id
  (allSC||[]).forEach(sc => {
    if (!scMap[sc.class_name]) scMap[sc.class_name] = new Set();
    scMap[sc.class_name].add(sc.student_id);
  });
  const studentMap = Object.fromEntries((allStudentsFull||[]).map(s=>[s.id, s]));

  const colors = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899'];
  allNames.forEach((cls, idx)=>{
    // Lấy học viên từ student_classes — chỉ đếm học sinh active
    const studentIds = scMap[cls] ? [...scMap[cls]] : [];
    const students = studentIds.map(id => studentMap[id]).filter(Boolean).filter(s => s.active !== false);
    // Fallback: học viên có class_name chứa cls nhưng chưa có trong student_classes
    const fallback = (allStudentsFull||[]).filter(s => {
      if (scMap[cls]?.has(s.id)) return false; // đã đếm rồi
      const sc = (s.class_name||'').split(',').map(c=>c.trim()).filter(Boolean);
      return sc.includes(cls) && s.active !== false;
    });
    const allInClass = [...students, ...fallback];
    const count = allInClass.length;
    const activeCount = allInClass.filter(s=>s.active).length;
    const onlineCount = allInClass.filter(s=>s.is_online && s.last_seen && (Date.now()-new Date(s.last_seen).getTime())<90000).length;
    const info = clsMap[cls]||{};
    const isExpired = info.end_date && new Date(info.end_date) < today;
    const color = isExpired ? '#94a3b8' : colors[idx % colors.length];

    // Tính số ngày còn lại
    let daysLabel = '';
    if (info.end_date) {
      const daysLeft = Math.round((new Date(info.end_date) - today) / 86400000);
      if (isExpired) daysLabel = `<span style="background:#fee2e2;color:#991b1b;font-size:.7rem;font-weight:700;padding:.2rem .55rem;border-radius:6px">Đã kết thúc</span>`;
      else if (daysLeft <= 7) daysLabel = `<span style="background:#fef3c7;color:#92400e;font-size:.7rem;font-weight:700;padding:.2rem .55rem;border-radius:6px">Còn ${daysLeft} ngày</span>`;
      else daysLabel = `<span style="background:#d1fae5;color:#065f46;font-size:.7rem;font-weight:700;padding:.2rem .55rem;border-radius:6px">Còn ${daysLeft} ngày</span>`;
    }

    const card = document.createElement('div');
    card.style.cssText = `background:var(--card);border-radius:16px;border:1.5px solid var(--border);box-shadow:var(--shadow);overflow:hidden;cursor:pointer;transition:transform .2s,box-shadow .2s`;
    card.onmouseover = () => { card.style.transform='translateY(-2px)'; card.style.boxShadow='0 8px 24px rgba(0,0,0,.12)'; };
    card.onmouseout  = () => { card.style.transform=''; card.style.boxShadow='var(--shadow)'; };
    card.innerHTML = `
      <!-- Header màu -->
      <div style="background:${color};padding:1.1rem 1.25rem;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:.75rem">
          <div style="width:40px;height:40px;background:rgba(255,255,255,.2);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem">🏫</div>
          <div>
            <div style="font-weight:900;font-size:1rem;color:#fff;letter-spacing:-.2px">${cls}</div>
            <div style="font-size:.72rem;color:rgba(255,255,255,.75);margin-top:.1rem">${count} học viên</div>
          </div>
        </div>
        <div style="display:flex;gap:.3rem">
          <button class="btn-sm" data-edit="${cls}" style="background:rgba(255,255,255,.2);border-color:rgba(255,255,255,.3);color:#fff;font-size:.8rem" onclick="event.stopPropagation()">✏️</button>
          <button class="btn-sm" data-del="${cls}" style="background:rgba(255,255,255,.15);border-color:rgba(255,255,255,.25);color:#fff;font-size:.8rem" onclick="event.stopPropagation()">🗑</button>
        </div>
      </div>
      <!-- Body thống kê -->
      <div style="padding:1rem 1.25rem;display:flex;flex-direction:column;gap:.6rem">
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <div style="flex:1;background:var(--bg);border-radius:10px;padding:.55rem .75rem;text-align:center">
            <div style="font-size:1.1rem;font-weight:800;color:var(--text)">${activeCount}</div>
            <div style="font-size:.7rem;color:var(--muted)">Hoạt động</div>
          </div>
          <div style="flex:1;background:var(--bg);border-radius:10px;padding:.55rem .75rem;text-align:center">
            <div style="font-size:1.1rem;font-weight:800;color:#10b981">${onlineCount}</div>
            <div style="font-size:.7rem;color:var(--muted)">Online</div>
          </div>
          <div style="flex:1;background:var(--bg);border-radius:10px;padding:.55rem .75rem;text-align:center">
            <div style="font-size:1.1rem;font-weight:800;color:var(--text)">${count-activeCount}</div>
            <div style="font-size:.7rem;color:var(--muted)">Đã khóa</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;font-size:.78rem;color:var(--muted)">
          <span>${info.start_date ? '📅 '+fmtDate(info.start_date) : ''}${info.start_date&&info.end_date?' → ':''}${info.end_date ? fmtDate(info.end_date) : ''}</span>
          ${daysLabel}
        </div>
      </div>`;
    card.addEventListener('click', e=>{ if(!e.target.closest('[data-edit],[data-del]')) openClassDetail(cls); });
    card.querySelector('[data-edit]').addEventListener('click', e=>{ e.stopPropagation(); openEditClassModal(cls, info); });
    card.querySelector('[data-del]').addEventListener('click', async e=>{
      e.stopPropagation();
      // Đếm học sinh trong lớp
      const { data: scList } = await db.from('student_classes').select('student_id').eq('class_name', cls);
      const scIds = (scList||[]).map(s => s.student_id);
      const { data: directStudents } = await db.from('students').select('id').ilike('class_name', `%${cls}%`);
      const allIds = [...new Set([...scIds, ...(directStudents||[]).map(s=>s.id)])];
      const studentCount = allIds.length;

      const msg = studentCount > 0
        ? `Xóa lớp "${cls}"?\n\nLớp này có ${studentCount} học sinh. Chọn hành động:`
        : `Xóa lớp "${cls}"? Lớp này không có học sinh.`;

      if (studentCount > 0) {
        // Mở modal 3 chức năng
        openDeleteClassModal(cls, allIds, studentCount);
      } else {
        showConfirm(`Xóa lớp "${cls}"? Lớp này không có học sinh.`, async () => {
          await db.from('classes').delete().eq('name', cls);
          await db.from('student_classes').delete().eq('class_name', cls);
          // Xóa tên lớp trong bài học
          const { data: mLessons } = await db.from('lessons').select('id,class_name').ilike('class_name', `%${cls}%`);
          for (const l of (mLessons||[])) {
            const parts = (l.class_name||'').split(',').map(c=>c.trim()).filter(c=>c&&c!==cls);
            await db.from('lessons').update({ class_name: parts.join(',')||null }).eq('id', l.id);
          }
          _invalidateClassesCache();
          renderClasses(); populateClassFilters();
        });
      }
    });
    grid.appendChild(card);
  });
}

async function openClassDetail(cls) {
  document.getElementById('classListView').style.display='none';
  document.getElementById('classDetailView').style.display='';
  document.getElementById('classDetailTitle').textContent=cls;
  const today = new Date(); today.setHours(0,0,0,0);
  // Lấy học viên từ student_classes (bao gồm lớp phụ)
  const { data: scList } = await db.from('student_classes').select('student_id').eq('class_name', cls);
  const scIds = (scList||[]).map(sc => sc.student_id);
  // Fallback: học viên có class_name chứa cls nhưng chưa có trong student_classes
  const { data: allStudents } = await db.from('students').select('*').limit(10000);
  const fallbackList = (allStudents||[]).filter(s => {
    if (scIds.includes(s.id)) return false;
    const sc = (s.class_name||'').split(',').map(c=>c.trim()).filter(Boolean);
    return sc.includes(cls);
  });
  const fallbackIds = fallbackList.map(s => s.id);
  const allIds = [...new Set([...scIds, ...fallbackIds])];
  let list = [];
  if (allIds.length) {
    list = (allStudents||[]).filter(s => allIds.includes(s.id));
  }
  const tbody=document.getElementById('classStudentBody');
  tbody.innerHTML='';
  document.getElementById('emptyClassStudents').style.display=(list||[]).length?'none':'block';
  (list||[]).forEach(s=>{
    let statusHtml;
    if (!s.active) {
      if (s.expiry_date && new Date(s.expiry_date) < today)
        statusHtml = '<span class="status-pill red">⏰ Hết hạn</span>';
      else
        statusHtml = '<span class="status-pill orange">🔒 Đã khóa</span>';
    } else if (s.is_online && s.last_seen && (Date.now() - new Date(s.last_seen).getTime()) < 90000) {
      statusHtml = '<span class="status-pill green">🟢 Online</span>';
    } else {
      statusHtml = '<span class="status-pill gray">⚫ Offline</span>';
    }
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${s.student_code||'—'}</td><td>${s.full_name}</td><td>${s.phone||'—'}</td><td>${s.username}</td><td>${statusHtml}</td>
      <td><button class="btn-sm ${s.active?'btn-danger':'btn-success'}" data-action="toggle">${s.active?'🔒 Khóa':'🔓 Mở'}</button></td>`;
    tr.querySelector('[data-action="toggle"]').addEventListener('click', async () => {
      const newActive = !s.active;
      const updates = { active: newActive, login_attempts: 0 };
      if (newActive) updates.manually_unlocked = true;
      else updates.manually_unlocked = false;
      await db.from('students').update(updates).eq('id', s.id);
      openClassDetail(cls);
    });
    tbody.appendChild(tr);
  });
}
document.getElementById('backToClassesBtn').addEventListener('click', renderClasses);

document.getElementById('unlockAllClassBtn').addEventListener('click', async () => {
  const cls = document.getElementById('classDetailTitle').textContent;
  if (!cls) return;
  showConfirm(`Mở khóa toàn bộ học sinh lớp "${cls}"?`, async () => {
    await db.from('students')
      .update({ active: true, manually_unlocked: true })
      .eq('class_name', cls)
      .eq('active', false);
    openClassDetail(cls);
    renderClasses();
  }, { title: 'Mở khóa toàn bộ', icon: '🔓', okText: 'Mở khóa' });
});

let editingClassName = null;

// ---- Helper dùng chung: xóa tên lớp khỏi students.class_name ----
async function removeClassFromStudents(className) {
  const { data: affected } = await db.from('students').select('id,class_name').ilike('class_name', `%${className}%`);
  const updates = (affected||[])
    .map(s => {
      const classes = (s.class_name||'').split(',').map(c=>c.trim()).filter(Boolean);
      if (!classes.includes(className)) return null;
      return { id: s.id, class_name: classes.filter(c=>c!==className).join(',') || null };
    })
    .filter(Boolean);
  // Chạy song song thay vì tuần tự
  await Promise.all(updates.map(u => db.from('students').update({ class_name: u.class_name }).eq('id', u.id)));
}

// ---- Helper dùng chung: xóa bảng lớp + student_classes + lessons + groups ----
async function deleteClassRecord(className) {
  _invalidateClassesCache();
  await db.from('classes').delete().eq('name', className);
  await db.from('student_classes').delete().eq('class_name', className);
  logActivity('Lớp học', 'Xóa lớp học', className);

  // Lấy lessons + groups song song, rồi update song song
  const [{ data: allLessons }, { data: allGroups }] = await Promise.all([
    db.from('lessons').select('id,class_name'),
    db.from('lesson_groups').select('id,class_name'),
  ]);

  // Xóa class_name trong bài học — chạy song song
  await Promise.all((allLessons||[])
    .filter(l => l.class_name && l.class_name.split(',').map(c=>c.trim()).some(p=>p.toLowerCase()===className.toLowerCase()))
    .map(l => {
      const parts = l.class_name.split(',').map(c=>c.trim()).filter(p=>p&&p.toLowerCase()!==className.toLowerCase());
      return db.from('lessons').update({ class_name: parts.join(',')||null }).eq('id', l.id);
    })
  );

  // Xóa class_name trong nhóm bài học — chạy song song
  await Promise.all((allGroups||[])
    .filter(g => g.class_name && g.class_name.split(',').map(c=>c.trim()).some(p=>p.toLowerCase()===className.toLowerCase()))
    .map(g => {
      const parts = g.class_name.split(',').map(c=>c.trim()).filter(p=>p&&p.toLowerCase()!==className.toLowerCase());
      return db.from('lesson_groups').update({ class_name: parts.join(',')||null }).eq('id', g.id);
    })
  );
}

// ---- Xóa lớp: 3 chức năng ----
function openDeleteClassModal(cls, allIds, studentCount) {
  document.getElementById('deleteClassTitle').textContent = `Xóa lớp "${cls}"`;
  document.getElementById('deleteClassDesc').textContent = `Lớp có ${studentCount} học viên. Chọn hành động:`;
  document.getElementById('deleteClassModal').classList.add('open');

  const closeModal = () => document.getElementById('deleteClassModal').classList.remove('open');

  // Clone nút để tránh listener chồng
  ['delCls_keepAll','delCls_delAll','delCls_selective','deleteClassCancelBtn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.replaceWith(el.cloneNode(true));
  });

  // Nút Hủy
  document.getElementById('deleteClassCancelBtn').addEventListener('click', closeModal, { once: true });

  // Option 1: Xóa lớp, giữ học viên
  document.getElementById('delCls_keepAll').addEventListener('click', async () => {
    closeModal();
    await deleteClassRecord(cls);
    await removeClassFromStudents(cls);
    _invalidateClassesCache();
    renderClasses(); populateClassFilters(); renderStudents(); renderOverview();
  }, { once: true });

  // Option 2: Xóa lớp & xóa toàn bộ học viên
  document.getElementById('delCls_delAll').addEventListener('click', () => {
    closeModal();
    showConfirm(
      `Xóa lớp "${cls}" và toàn bộ ${studentCount} học viên? Hành động này không thể hoàn tác!`,
      async () => {
        if (allIds.length) await db.from('students').delete().in('id', allIds);
        await deleteClassRecord(cls);
        _invalidateClassesCache();
        renderClasses(); populateClassFilters(); renderStudents(); renderOverview();
      },
      { title: `💣 Xác nhận xóa tất cả`, icon: '⚠️', okText: `Xóa ${studentCount} học viên & lớp` }
    );
  }, { once: true });

  // Option 3: Xóa có chọn lọc
  document.getElementById('delCls_selective').addEventListener('click', async () => {
    closeModal();
    // Load danh sách học viên
    const { data: students } = await db.from('students').select('id,full_name,username,expiry_date').in('id', allIds);
    const list = document.getElementById('selectiveStudentList');
    list.innerHTML = '';
    document.getElementById('selectiveDeleteDesc').textContent = `Lớp "${cls}" — tích chọn học viên muốn GIỮ LẠI, không tích sẽ bị xóa:`;
    // Map lưu expiry_date mới cho từng học viên giữ lại
    const keepMap = new Map(); // id -> { keepEl, dateEl }

    (students||[]).forEach(s => {
      const row = document.createElement('div');
      row.style.cssText = 'border-bottom:1px solid var(--border);padding:.55rem 1rem';
      row.setAttribute('data-student-row', `${s.full_name||''} ${s.username||''} ${s.id||''}`);

      const top = document.createElement('label');
      top.style.cssText = 'display:flex;align-items:center;gap:.65rem;cursor:pointer;font-size:.85rem';
      top.innerHTML = `<input type="checkbox" style="accent-color:#10b981;width:15px;height:15px;cursor:pointer" data-id="${s.id}"/>
        <span><b>${s.full_name||'—'}</b> <span style="color:#94a3b8;font-size:.78rem">${s.username||''}</span></span>
        <span style="margin-left:auto;font-size:.75rem;color:#10b981;font-weight:700;opacity:0" data-keep-badge>✅ Giữ lại</span>`;

      const dateRow = document.createElement('div');
      dateRow.style.cssText = 'display:none;margin-top:.4rem;padding-left:1.85rem;align-items:center;gap:.5rem';
      dateRow.innerHTML = `<span style="font-size:.78rem;color:#64748b">Duy trì đến:</span>
        <input type="date" value="${s.expiry_date||''}" style="border:1.5px solid #e0e7ff;border-radius:8px;padding:.25rem .6rem;font-size:.8rem;outline:none;color:#1e293b" data-expiry/>`;

      const cb = top.querySelector('input[type=checkbox]');
      const badge = top.querySelector('[data-keep-badge]');
      cb.addEventListener('change', () => {
        if (cb.checked) {
          badge.style.opacity = '1';
          dateRow.style.display = 'flex';
          keepMap.set(s.id, { dateEl: dateRow.querySelector('[data-expiry]') });
        } else {
          badge.style.opacity = '0';
          dateRow.style.display = 'none';
          keepMap.delete(s.id);
        }
        document.getElementById('selectiveSelectedCount').textContent = keepMap.size;
      });

      row.appendChild(top);
      row.appendChild(dateRow);
      list.appendChild(row);
    });

    document.getElementById('selectiveSelectedCount').textContent = '0';
    document.getElementById('selectiveDeleteModal').classList.add('open');

    // Tìm kiếm
    const searchInput = document.getElementById('selectiveSearch');
    searchInput.value = '';
    searchInput.oninput = () => {
      const q = searchInput.value.toLowerCase().trim();
      list.querySelectorAll('[data-student-row]').forEach(row => {
        const text = row.getAttribute('data-student-row').toLowerCase();
        row.style.display = !q || text.includes(q) ? '' : 'none';
      });
    };

    // Clone nút để tránh listener cũ
    ['selectiveCancelBtn','selectiveConfirmBtn'].forEach(id => {
      const el = document.getElementById(id); el.replaceWith(el.cloneNode(true));
    });

    document.getElementById('selectiveCancelBtn').addEventListener('click', () => {
      document.getElementById('selectiveDeleteModal').classList.remove('open');
    }, { once: true });

    document.getElementById('selectiveConfirmBtn').addEventListener('click', async () => {
      document.getElementById('selectiveDeleteModal').classList.remove('open');
      const keepIds = new Set(keepMap.keys());
      const deleteIds = allIds.filter(id => !keepIds.has(id));

      // Xóa học viên không được giữ
      if (deleteIds.length) await db.from('students').delete().in('id', deleteIds);

      // Cập nhật expiry_date cho học viên được giữ lại
      for (const [id, { dateEl }] of keepMap.entries()) {
        const newExpiry = dateEl.value || null;
        if (newExpiry) await db.from('students').update({ expiry_date: newExpiry }).eq('id', id);
      }

      // Xóa lớp
      await deleteClassRecord(cls);
      await removeClassFromStudents(cls);
      _invalidateClassesCache();
      renderClasses(); populateClassFilters(); renderStudents(); renderOverview();
    }, { once: true });
  }, { once: true });
}

function openEditClassModal(cls, clsData={}) {
  editingClassName=cls;
  document.getElementById('editClassName').value=cls;
  document.getElementById('editClassStart').value=clsData.start_date||'';
  document.getElementById('editClassEnd').value=clsData.end_date||'';
  document.getElementById('editClassError').textContent='';
  document.getElementById('editClassModal').classList.add('open');
}
document.getElementById('editClassCancelBtn').addEventListener('click',()=>document.getElementById('editClassModal').classList.remove('open'));
document.getElementById('editClassSaveBtn').addEventListener('click', async ()=>{
  const newName=document.getElementById('editClassName').value.trim(), err=document.getElementById('editClassError');
  if (!newName) { err.textContent='Vui lòng nhập tên lớp.'; return; }
  const start=document.getElementById('editClassStart').value||null;
  const end=document.getElementById('editClassEnd').value||null;
  const nameChanged = newName.toLowerCase() !== editingClassName.toLowerCase() || newName !== editingClassName;

  if (!nameChanged) {
    // Chỉ cập nhật ngày
    await db.from('classes').update({start_date:start, end_date:end}).eq('name', editingClassName);
  } else {
    // Đổi tên: UPDATE trực tiếp record cũ thay vì upsert+delete
    const { error } = await db.from('classes').update({ name: newName, start_date: start, end_date: end }).eq('name', editingClassName);
    if (error) { err.textContent = 'Lỗi: ' + error.message; return; }

    // Cập nhật student_classes
    await db.from('student_classes').update({ class_name: newName }).eq('class_name', editingClassName);

    // Cập nhật students.class_name — xử lý cả lớp đơn và comma-separated
    const { data: affected } = await db.from('students').select('id,class_name').ilike('class_name', `%${editingClassName}%`);
    for (const s of (affected||[])) {
      const classes = (s.class_name||'').split(',').map(c=>c.trim());
      // Chỉ xử lý nếu có khớp chính xác (case-sensitive) với editingClassName
      if (!classes.includes(editingClassName)) continue;
      const updated = classes.map(c => c===editingClassName ? newName : c).filter(Boolean);
      await db.from('students').update({ class_name: updated.join(',') }).eq('id', s.id);
    }
  }
  // Đồng bộ expiry_date cho tất cả học viên trong lớp
  if (end) {
    await db.from('students').update({ expiry_date: end }).eq('class_name', newName);
  }
  document.getElementById('editClassModal').classList.remove('open');
  _invalidateClassesCache();
  logActivity('Lớp học', 'Sửa lớp học', newName, `trước: ${editingClassName}`);
  renderClasses(); populateClassFilters();
});

document.getElementById('openAddClassBtn').addEventListener('click',()=>{
  document.getElementById('addClassName').value='';
  document.getElementById('addClassStart').value='';
  document.getElementById('addClassEnd').value='';
  document.getElementById('addClassError').textContent='';
  document.getElementById('addClassModal').classList.add('open');
});
document.getElementById('addClassCancelBtn').addEventListener('click',()=>document.getElementById('addClassModal').classList.remove('open'));
document.getElementById('addClassSaveBtn').addEventListener('click', async ()=>{
  const name=document.getElementById('addClassName').value.trim(), err=document.getElementById('addClassError');
  if (!name) { err.textContent='Vui lòng nhập tên lớp.'; return; }
  const start=document.getElementById('addClassStart').value||null;
  const end=document.getElementById('addClassEnd').value||null;
  const { error }=await db.from('classes').insert({name, start_date:start, end_date:end});
  if (error) { err.textContent='Tên lớp đã tồn tại.'; return; }
  document.getElementById('addClassModal').classList.remove('open');
  _invalidateClassesCache();
  logActivity('Lớp học', 'Thêm lớp học mới', name, `${start||''}→${end||''}`);
  renderClasses(); populateClassFilters();
});

// ============================================================
// DEVICE ALERTS
// ============================================================
async function renderDeviceAlerts() {
  const q        = (document.getElementById('deviceAlertSearch').value || '').toLowerCase();
  const dateFrom = document.getElementById('deviceAlertDateFrom')?.value || '';
  const dateTo   = document.getElementById('deviceAlertDateTo')?.value || '';

  const { data: list } = await db.from('alerts').select('*')
    .order('created_at', { ascending: false })
    .limit(5000);

  const deviceKeywords = ['thiết bị', 'đăng nhập', 'mật khẩu', 'admin', 'trợ lý'];
  let deviceList = (list||[]).filter(a => {
    const r = (a.reason||'').toLowerCase();
    return deviceKeywords.some(k => r.includes(k));
  });

  // Filter theo ngày
  if (dateFrom) {
    deviceList = deviceList.filter(a => a.created_at && a.created_at >= dateFrom);
  }
  if (dateTo) {
    deviceList = deviceList.filter(a => a.created_at && a.created_at <= dateTo + 'T23:59:59');
  }

  const filtered = deviceList.filter(a => !q || (a.student_name||'').toLowerCase().includes(q));
  const el = document.getElementById('deviceAlertList');
  el.innerHTML = '';
  document.getElementById('emptyDeviceAlerts').style.display = filtered.length ? 'none' : 'block';
  filtered.forEach(a => {
    const row = document.createElement('div');
    row.className = 'content-row alert-row';
    row.innerHTML = `
      <span class="list-icon">📱</span>
      <div class="list-info">
        <div class="list-title">${a.student_name} <span class="muted" style="font-weight:400">— ${a.username}</span></div>
        <div class="list-meta">
          ${a.class_name ? `<span class="class-tag">${a.class_name}</span>` : ''}
          <span class="alert-badge">${a.reason}</span>
          • ${fmtTime(a.created_at)}
        </div>
      </div>`;
    el.appendChild(row);
  });
}
document.getElementById('deviceAlertSearch').addEventListener('input', renderDeviceAlerts);
document.getElementById('deviceAlertDateFrom')?.addEventListener('change', renderDeviceAlerts);
document.getElementById('deviceAlertDateTo')?.addEventListener('change', renderDeviceAlerts);
document.getElementById('deviceAlertDateClear')?.addEventListener('click', () => {
  document.getElementById('deviceAlertDateFrom').value = '';
  document.getElementById('deviceAlertDateTo').value = '';
  renderDeviceAlerts();
});
document.getElementById('clearDeviceAlertsBtn').addEventListener('click', async () => {
  showConfirm('Xóa toàn bộ cảnh báo thiết bị?', async () => {
    // Lấy danh sách ID đang hiển thị rồi xóa theo id — chắc chắn hơn hardcode reason
    const { data: list } = await db.from('alerts').select('id,reason').limit(5000);
    const deviceKeywords = ['thiết bị', 'đăng nhập', 'mật khẩu', 'admin', 'trợ lý'];
    const ids = (list||[])
      .filter(a => deviceKeywords.some(k => (a.reason||'').toLowerCase().includes(k)))
      .map(a => a.id);
    if (ids.length) {
      // Xóa theo batch 100 ids
      for (let i = 0; i < ids.length; i += 100) {
        await db.from('alerts').delete().in('id', ids.slice(i, i + 100));
      }
    }
    renderDeviceAlerts();
  }, { title: 'Xóa cảnh báo', icon: '📱' });
});

// ============================================================
// SECURITY ALERTS
// ============================================================
async function renderAlerts() {
  const q = (document.getElementById('alertSearch').value||'').toLowerCase();
  const dateFilter = document.getElementById('alertDateFilter')?.value || '';
  let query = db.from('alerts').select('*').order('created_at',{ascending:false}).limit(10000);
  if (dateFilter) {
    query = query.gte('created_at', dateFilter).lte('created_at', dateFilter + 'T23:59:59');
  }
  const { data:list } = await query;
  const filtered = (list||[]).filter(a => !q || (a.student_name||'').toLowerCase().includes(q) || (a.username||'').toLowerCase().includes(q));
  const el = document.getElementById('alertList');
  el.innerHTML = '';
  document.getElementById('emptyAlerts').style.display = filtered.length ? 'none' : 'block';
  filtered.forEach(a => {
    const row = document.createElement('div');
    row.className = 'content-row alert-row';
    row.innerHTML = `<span class="list-icon">🚨</span><div class="list-info"><div class="list-title">${a.student_name} <span class="muted" style="font-weight:400">— ${a.username}</span></div><div class="list-meta"><span class="alert-badge">${a.reason}</span>${a.class_name?`<span class="class-tag">${a.class_name}</span>`:''} • ${fmtTime(a.created_at)}</div></div>`;
    el.appendChild(row);
  });
}
document.getElementById('alertSearch').addEventListener('input', renderAlerts);
document.getElementById('alertDateFilter')?.addEventListener('change', renderAlerts);
document.getElementById('alertDateClear')?.addEventListener('click', () => {
  document.getElementById('alertDateFilter').value = '';
  renderAlerts();
});
document.getElementById('exportAlertsBtn').addEventListener('click', async () => {
  const { data: list } = await db.from('alerts').select('*').order('created_at', { ascending: false }).limit(10000);
  if (!list || !list.length) { alert('Chưa có cảnh báo nào.'); return; }
  const rows = [['Họ tên', 'Tên đăng nhập', 'Lớp', 'Lý do', 'Thời gian']];
  list.forEach(a => rows.push([a.student_name||'', a.username||'', a.class_name||'', a.reason||'', fmtTime(a.created_at)]));
  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `canh_bao_${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
});
document.getElementById('clearAlertsBtn').addEventListener('click', async ()=>{
  showConfirm('Xóa toàn bộ nhật ký cảnh báo?', async () => {
    await db.from('alerts').delete().neq('id',0);
    renderAlerts(); renderOverview();
  }, { title: 'Xóa nhật ký', icon: '🚨' });
});

// ---- Init ----
const _validPages = ['overview','lessons','lesson-groups','create-student','students','classes','security','devices','access-stats','login-history','announcements','files','schedule','profile'];
const _savedPage = sessionStorage.getItem('dh_page');
populateClassFilters().then(() => {
  showPage(_validPages.includes(_savedPage) ? _savedPage : 'overview');
});

// ============================================================
// TỰ ĐỘNG KHÓA TÀI KHOẢN KHI LỚP HẾT HẠN
// ============================================================
async function autoLockExpiredAccounts() {
  const today = new Date(); today.setHours(0,0,0,0);

  const { data: classes } = await db.from('classes').select('name, end_date');
  if (!classes?.length) return;

  const expiredClassSet = new Set(classes.filter(c => {
    if (!c.end_date) return false;
    const end = new Date(c.end_date); end.setHours(0,0,0,0);
    return today > end;
  }).map(c => c.name));

  if (!expiredClassSet.size) return;

  // Lấy học sinh active chưa bị mở thủ công
  const { data: students } = await db.from('students')
    .select('id, class_name').eq('active', true).eq('manually_unlocked', false);
  if (!students?.length) return;

  // Lấy tất cả student_classes
  const { data: allSC } = await db.from('student_classes').select('student_id, class_name');
  const scByStudent = {};
  (allSC||[]).forEach(sc => {
    if (!scByStudent[sc.student_id]) scByStudent[sc.student_id] = [];
    scByStudent[sc.student_id].push(sc.class_name);
  });

  // Chỉ khóa khi TẤT CẢ lớp của học viên đã hết hạn
  const toLock = students.filter(s => {
    const allClasses = scByStudent[s.id]?.length
      ? scByStudent[s.id]
      : [s.class_name].filter(Boolean);
    if (!allClasses.length) return false;
    return allClasses.every(c => expiredClassSet.has(c));
  }).map(s => s.id);

  if (!toLock.length) return;
  await db.from('students').update({ active: false }).in('id', toLock);
}

// Chạy ngay khi admin đăng nhập
autoLockExpiredAccounts();

// ============================================================
// THÔNG BÁO
// ============================================================
let editingAnnId = null;

// Config màu/icon theo priority
const _ANN_PRIORITY = {
  urgent: { label: '🔴 Khẩn cấp', bg: '#fff5f5', border: '#fca5a5', badge: '#ef4444', text: '#991b1b' },
  high:   { label: '🟠 Cao',       bg: '#fff7ed', border: '#fed7aa', badge: '#f97316', text: '#9a3412' },
  normal: { label: '🔵 Bình thường', bg: 'var(--card)', border: 'var(--border)', badge: '#3b82f6', text: '#1d4ed8' },
  low:    { label: '⚪ Thấp',      bg: 'var(--bg)',   border: 'var(--border)', badge: '#94a3b8', text: '#64748b' },
};

function openAnnForm(ann = null) {
  editingAnnId = ann?.id || null;
  document.getElementById('annFormWrap').style.display = 'block';
  document.getElementById('annFormTitle').textContent = ann ? '✏️ Sửa thông báo' : '✏️ Tạo thông báo mới';
  document.getElementById('annTitle').value   = ann?.title   || '';
  document.getElementById('annContent').value = ann?.content || '';
  document.getElementById('annLink').value    = ann?.link_url  || '';
  document.getElementById('annLinkText').value = ann?.link_text || '';
  document.getElementById('annClass').value   = ann?.class_name || '';
  document.getElementById('annPinned').checked = ann?.pinned || false;
  document.getElementById('annExpire24h').checked = false;
  document.getElementById('annScheduledAt').value = ann?.scheduled_at
    ? new Date(ann.scheduled_at).toISOString().slice(0,16) : '';
  // priority
  const prio = ann?.priority || 'normal';
  document.querySelectorAll('input[name="annPriority"]').forEach(r => { r.checked = r.value === prio; });
  // student
  const annSearch = document.getElementById('annStudentSearch');
  if (annSearch) { annSearch.value = ann?.target_username || ''; annSearch.dataset.selectedUsername = ann?.target_username || ''; }
  const sel = document.getElementById('annStudentSelected');
  if (ann?.target_username) {
    document.getElementById('annStudentSelectedName').textContent = `👤 ${ann.target_username}`;
    sel.style.display = 'flex';
  } else { sel.style.display = 'none'; }
  document.getElementById('annError').textContent = '';
  document.getElementById('annFormWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeAnnForm() {
  editingAnnId = null;
  document.getElementById('annFormWrap').style.display = 'none';
}

document.getElementById('openAnnFormBtn')?.addEventListener('click', () => openAnnForm());

async function renderAnnouncements() {
  const { data: all } = await db.from('announcements').select('*').order('pinned', {ascending:false}).order('created_at', {ascending:false});

  // Stats bar
  const statsEl = document.getElementById('annStatsBar');
  if (statsEl) {
    const total   = (all||[]).length;
    const pinned  = (all||[]).filter(a => a.pinned).length;
    const urgent  = (all||[]).filter(a => a.priority === 'urgent').length;
    const sched   = (all||[]).filter(a => a.scheduled_at && new Date(a.scheduled_at) > new Date()).length;
    statsEl.innerHTML = `
      <div style="background:var(--card);border:1.5px solid var(--border);border-radius:10px;padding:.45rem .9rem;font-size:.82rem;font-weight:700;color:var(--text)">📢 ${total} thông báo</div>
      ${pinned  ? `<div style="background:#fef3c7;border:1.5px solid #fde68a;border-radius:10px;padding:.45rem .9rem;font-size:.82rem;font-weight:700;color:#92400e">📌 ${pinned} đã ghim</div>` : ''}
      ${urgent  ? `<div style="background:#fee2e2;border:1.5px solid #fca5a5;border-radius:10px;padding:.45rem .9rem;font-size:.82rem;font-weight:700;color:#991b1b">🔴 ${urgent} khẩn cấp</div>` : ''}
      ${sched   ? `<div style="background:#e0f2fe;border:1.5px solid #bae6fd;border-radius:10px;padding:.45rem .9rem;font-size:.82rem;font-weight:700;color:#0369a1">🕐 ${sched} chờ gửi</div>` : ''}`;
  }

  _renderAnnCards(all || []);
}

// Filter realtime — dùng lại data đã fetch, không re-query DB
document.getElementById('annSearch')?.addEventListener('input', () => _renderAnnCards(_annAllData));
document.getElementById('annFilterClass')?.addEventListener('change', () => _renderAnnCards(_annAllData));
document.getElementById('annFilterPriority')?.addEventListener('change', () => _renderAnnCards(_annAllData));

// Tab state
let _annCurrentTab = 'all';
let _annAllData = [];
let _annPageSize = 20;
let _annPage = 1;
function switchAnnTab(tab) {
  _annCurrentTab = tab;
  _annPage = 1; // reset về trang đầu khi đổi tab
  ['all','pinned','normal'].forEach(t => {
    const btn = document.getElementById(`annTab${t.charAt(0).toUpperCase()+t.slice(1)}`);
    if (!btn) return;
    if (t === tab) {
      btn.style.background = 'var(--primary)';
      btn.style.color = '#fff';
    } else {
      btn.style.background = 'transparent';
      btn.style.color = 'var(--muted)';
    }
  });
  _renderAnnCards(_annAllData);
}

function _renderAnnCards(all) {
  _annAllData = all;
  const searchQ   = (document.getElementById('annSearch')?.value || '').toLowerCase();
  const filterCls = document.getElementById('annFilterClass')?.value || '';
  const filterPrio = document.getElementById('annFilterPriority')?.value || '';

  let list = all.filter(a => {
    if (searchQ && !a.title.toLowerCase().includes(searchQ) && !a.content.toLowerCase().includes(searchQ)) return false;
    if (filterCls && a.class_name !== filterCls) return false;
    if (filterPrio && (a.priority||'normal') !== filterPrio) return false;
    return true;
  });

  const pinnedList   = list.filter(a => a.pinned);
  const unpinnedList = list.filter(a => !a.pinned);

  // Update badge counts
  document.getElementById('annTabAllCount').textContent    = list.length;
  document.getElementById('annTabPinnedCount').textContent = pinnedList.length;
  document.getElementById('annTabNormalCount').textContent = unpinnedList.length;

  // Items theo tab
  let items = _annCurrentTab === 'pinned' ? pinnedList
            : _annCurrentTab === 'normal' ? unpinnedList
            : list;

  // Nút xóa tất cả tab
  const clearBtn = document.getElementById('annClearTabBtn');
  if (clearBtn) {
    clearBtn.style.display = items.length ? '' : 'none';
    clearBtn.textContent = `🗑 Xóa ${items.length} thông báo${_annCurrentTab === 'pinned' ? ' ghim' : _annCurrentTab === 'normal' ? ' thường' : ''}`;
    clearBtn.onclick = null;
    clearBtn.addEventListener('click', () => {
      showConfirm(`Xóa ${items.length} thông báo?`, async () => {
        await Promise.all(items.map(a => db.from('announcements').delete().eq('id', a.id)));
        logActivity('Thông báo', `Xóa ${items.length} thông báo hàng loạt`, '');
        renderAnnouncements();
      }, { title: 'Xóa thông báo', icon: '📢', okText: 'Xóa tất cả' });
    }, { once: true });
  }

  const el = document.getElementById('annList');
  el.innerHTML = '';
  document.getElementById('emptyAnn').style.display = items.length ? 'none' : 'block';

  // Phân trang — chỉ render _annPage * _annPageSize items
  const visibleItems = items.slice(0, _annPage * _annPageSize);
  const hasMore = items.length > visibleItems.length;

  const now = new Date();
  visibleItems.forEach(a => {
    const p = _ANN_PRIORITY[a.priority||'normal'] || _ANN_PRIORITY.normal;
    const isExpired   = a.expires_at && new Date(a.expires_at) < now;
    const isScheduled = a.scheduled_at && new Date(a.scheduled_at) > now;

    const card = document.createElement('div');
    card.style.cssText = `background:${p.bg};border:1.5px solid ${isExpired ? '#fca5a5' : a.pinned ? '#fde68a' : p.border};border-radius:14px;padding:1rem 1.25rem;transition:box-shadow .2s;position:relative;overflow:hidden`;
    card.onmouseover = () => card.style.boxShadow = '0 4px 16px rgba(0,0,0,.08)';
    card.onmouseout  = () => card.style.boxShadow = '';

    const stripe = document.createElement('div');
    stripe.style.cssText = `position:absolute;left:0;top:0;bottom:0;width:4px;background:${p.badge};border-radius:4px 0 0 4px`;
    card.appendChild(stripe);

    card.innerHTML += `
      <div style="display:flex;align-items:flex-start;gap:.75rem;padding-left:.5rem">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin-bottom:.35rem">
            ${a.pinned ? '<span style="background:#fef3c7;color:#92400e;font-size:.68rem;font-weight:800;padding:.12rem .45rem;border-radius:6px">📌 Ghim</span>' : ''}
            <span style="background:${p.badge};color:#fff;font-size:.68rem;font-weight:800;padding:.12rem .45rem;border-radius:6px">${p.label}</span>
            ${a.class_name ? `<span class="class-tag">${a.class_name}</span>` : a.target_username ? `<span class="class-tag" style="background:#d1fae5;color:#065f46">👤 Cá nhân</span>` : '<span class="class-tag" style="background:#e0f2fe;color:#0369a1">📣 Tất cả</span>'}
            ${isExpired   ? '<span style="background:#fee2e2;color:#991b1b;font-size:.68rem;font-weight:700;padding:.12rem .45rem;border-radius:6px">⏰ Hết hạn</span>' : ''}
            ${isScheduled ? `<span style="background:#e0f2fe;color:#0369a1;font-size:.68rem;font-weight:700;padding:.12rem .45rem;border-radius:6px">🕐 ${new Date(a.scheduled_at).toLocaleString('vi-VN')}</span>` : ''}
          </div>
          <div style="font-weight:800;font-size:.95rem;color:var(--text);line-height:1.3;margin-bottom:.4rem">${a.title}</div>
          <div style="font-size:.84rem;color:var(--muted);line-height:1.65;white-space:pre-line">${a.content}</div>
          ${a.link_url ? `<div style="margin-top:.5rem"><a href="${a.link_url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:.3rem;color:#6366f1;font-size:.82rem;font-weight:600;text-decoration:none;background:#eef2ff;padding:.3rem .7rem;border-radius:8px">🔗 ${a.link_text||a.link_url}</a></div>` : ''}
          <div style="font-size:.73rem;color:#94a3b8;margin-top:.5rem;display:flex;gap:.75rem;flex-wrap:wrap">
            <span>📅 ${new Date(a.created_at).toLocaleString('vi-VN')}</span>
            ${a.expires_at ? `<span>⏱ Hết hạn: ${new Date(a.expires_at).toLocaleString('vi-VN')}</span>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:.35rem;flex-shrink:0">
          <button class="btn-sm" data-action="pin" title="${a.pinned ? 'Bỏ ghim' : 'Ghim'}" style="${a.pinned ? 'color:#f59e0b;border-color:#fde68a' : ''}">📌</button>
          <button class="btn-sm" data-action="edit" title="Sửa">✏️</button>
          <button class="btn-sm btn-danger" data-action="delete" title="Xóa">🗑</button>
        </div>
      </div>`;

    card.querySelector('[data-action="pin"]').addEventListener('click', async () => {
      await db.from('announcements').update({ pinned: !a.pinned }).eq('id', a.id);
      renderAnnouncements();
    });
    card.querySelector('[data-action="edit"]').addEventListener('click', () => openAnnForm(a));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => {
      showConfirm(`Xóa thông báo "${a.title}"?`, async () => {
        const { error } = await db.from('announcements').delete().eq('id', a.id);
        if (error) { console.error('[Ann delete]', error); showToast('❌ Lỗi xóa: ' + error.message); return; }
        logActivity('Thông báo', 'Xóa thông báo', a.title, a.class_name||'');
        renderAnnouncements();
      });
    });
    el.appendChild(card);
  });

  // Nút tải thêm
  if (hasMore) {
    const loadMore = document.createElement('button');
    loadMore.className = 'btn-outline';
    loadMore.style.cssText = 'width:100%;margin-top:.5rem;font-size:.85rem;font-weight:600';
    loadMore.textContent = `⬇ Tải thêm (còn ${items.length - visibleItems.length} thông báo)`;
    loadMore.addEventListener('click', () => {
      _annPage++;
      _renderAnnCards(_annAllData);
    });
    el.appendChild(loadMore);
  }
}

document.getElementById('annSaveBtn')?.addEventListener('click', async () => {
  const title    = document.getElementById('annTitle').value.trim();
  const content  = document.getElementById('annContent').value.trim();
  const cls      = document.getElementById('annClass').value;
  const pinned   = document.getElementById('annPinned').checked;
  const expire24h = document.getElementById('annExpire24h')?.checked;
  const link_url  = document.getElementById('annLink')?.value.trim() || null;
  const link_text = document.getElementById('annLinkText')?.value.trim() || null;
  const schedVal  = document.getElementById('annScheduledAt')?.value;
  const scheduled_at = schedVal ? new Date(schedVal).toISOString() : null;
  const priority  = document.querySelector('input[name="annPriority"]:checked')?.value || 'normal';
  const err = document.getElementById('annError');
  err.textContent = '';
  if (!title)   { err.textContent = 'Vui lòng nhập tiêu đề.'; return; }
  if (!content) { err.textContent = 'Vui lòng nhập nội dung.'; return; }

  const expires_at = expire24h ? new Date(Date.now() + 24*60*60*1000).toISOString() : null;
  const selectedUsername = document.getElementById('annStudentSearch')?.dataset.selectedUsername || '';
  const finalClass = selectedUsername ? null : (cls || null);
  const target_username = selectedUsername || null;

  const payload = { title, content, class_name: finalClass, pinned, expires_at, target_username, link_url, link_text, priority, scheduled_at };

  if (editingAnnId) {
    await db.from('announcements').update(payload).eq('id', editingAnnId);
  } else {
    await db.from('announcements').insert(payload);
  }
  logActivity('Thông báo', editingAnnId ? 'Sửa thông báo' : 'Gửi thông báo', title, finalClass||target_username||'');
  closeAnnForm();
  renderAnnouncements();
});

document.getElementById('annCancelBtn')?.addEventListener('click', closeAnnForm);

// ── Tìm kiếm học sinh cho thông báo ──
let _annStudentList = [];
(async () => {
  const { data } = await db.from('students').select('full_name,username,class_name').order('full_name');
  _annStudentList = data || [];
})();

document.getElementById('annStudentSearch')?.addEventListener('input', function() {
  const q = this.value.toLowerCase();
  const dd = document.getElementById('annStudentDropdown');
  if (!q) { dd.style.display = 'none'; return; }
  const matches = _annStudentList.filter(s => s.full_name.toLowerCase().includes(q) || s.username.toLowerCase().includes(q)).slice(0, 8);
  if (!matches.length) { dd.style.display = 'none'; return; }
  dd.style.display = 'block';
  dd.innerHTML = matches.map(s => `
    <div data-username="${s.username}" data-name="${s.full_name}" style="padding:.55rem .85rem;cursor:pointer;font-size:.85rem;border-bottom:1px solid var(--border);transition:background .15s" onmouseover="this.style.background='var(--primary-light)'" onmouseout="this.style.background=''">
      <div style="font-weight:600">${s.full_name}</div>
      <div style="font-size:.75rem;color:var(--muted)">${s.username} ${s.class_name?`• ${s.class_name}`:''}</div>
    </div>`).join('');
  dd.querySelectorAll('[data-username]').forEach(el => {
    el.addEventListener('click', () => {
      const input = document.getElementById('annStudentSearch');
      input.value = el.dataset.name;
      input.dataset.selectedUsername = el.dataset.username;
      dd.style.display = 'none';
      const sel = document.getElementById('annStudentSelected');
      document.getElementById('annStudentSelectedName').textContent = `👤 ${el.dataset.name}`;
      sel.style.display = 'flex';
      document.getElementById('annClass').value = '';
    });
  });
});

document.getElementById('annStudentClearBtn')?.addEventListener('click', () => {
  const input = document.getElementById('annStudentSearch');
  input.value = ''; input.dataset.selectedUsername = '';
  document.getElementById('annStudentSelected').style.display = 'none';
});

// ============================================================
// LỊCH SỬ ĐĂNG NHẬP
// ============================================================
async function renderLoginHistory() {
  const cls    = document.getElementById('loginHistoryFilterClass').value;
  const search = (document.getElementById('loginHistorySearch').value||'').toLowerCase();
  const from   = document.getElementById('loginHistoryDateFrom').value;
  const to     = document.getElementById('loginHistoryDateTo').value;

  let query = db.from('login_logs').select('*').order('logged_in_at', {ascending: false}).limit(10000);
  if (cls)  query = query.eq('class_name', cls);
  if (from) query = query.gte('logged_in_at', from);
  if (to)   query = query.lte('logged_in_at', to + 'T23:59:59');

  // Count chính xác không bị giới hạn
  let cq = db.from('login_logs').select('*', { count: 'exact', head: true });
  let cqToday = db.from('login_logs').select('*', { count: 'exact', head: true }).gte('logged_in_at', new Date().toISOString().split('T')[0]);
  if (cls) { cq = cq.eq('class_name', cls); cqToday = cqToday.eq('class_name', cls); }
  if (from) cq = cq.gte('logged_in_at', from);
  if (to)   cq = cq.lte('logged_in_at', to + 'T23:59:59');

  const [{ data: logs }, { count: totalCount }, { count: todayCount }] = await Promise.all([query, cq, cqToday]);
  const all = logs || [];

  // Stats
  const uniqueTotal = new Set(all.map(l => l.username)).size;

  document.getElementById('loginHistoryStats').innerHTML = `
    <div class="stat-card blue"><div class="stat-icon">📋</div><div><div class="stat-num">${totalCount||0}</div><div class="stat-label">Tổng lượt đăng nhập</div></div></div>
    <div class="stat-card green"><div class="stat-icon">📅</div><div><div class="stat-num">${todayCount||0}</div><div class="stat-label">Hôm nay</div></div></div>
    <div class="stat-card purple"><div class="stat-icon">👨‍🎓</div><div><div class="stat-num">${uniqueTotal}</div><div class="stat-label">Học sinh đã đăng nhập</div></div></div>
  `;

  const filtered = search ? all.filter(l =>
    (l.student_name||'').toLowerCase().includes(search) ||
    (l.username||'').toLowerCase().includes(search)
  ) : all;

  const el = document.getElementById('loginHistoryList');
  document.getElementById('emptyLoginHistory').style.display = filtered.length ? 'none' : 'block';
  const today = new Date().toISOString().split('T')[0];
  el.innerHTML = filtered.slice(0, 500).map(l => {
    const time = new Date(l.logged_in_at).toLocaleString('vi-VN');
    const isToday = l.logged_in_at?.startsWith(today);
    return `<div class="list-row">
      <span class="list-icon">🔑</span>
      <div class="list-info" style="flex:1">
        <div class="list-title">${l.student_name||l.username} ${isToday ? '<span class="status-pill green" style="font-size:.7rem">Hôm nay</span>' : ''}</div>
        <div class="list-meta">${l.username} ${l.class_name ? `• <span class="class-tag">${l.class_name}</span>` : ''} • ${time}</div>
        ${l.device_info ? `<div style="font-size:.75rem;color:var(--muted);margin-top:.15rem">
          ${l.device_type==='Mobile'?'📱':'💻'} ${l.device_info}
        </div>` : ''}
      </div>
    </div>`;
  }).join('');
}

document.getElementById('loginHistoryFilterClass').addEventListener('change', renderLoginHistory);
document.getElementById('loginHistorySearch').addEventListener('input', renderLoginHistory);
document.getElementById('loginHistoryDateFrom').addEventListener('change', renderLoginHistory);
document.getElementById('loginHistoryDateTo').addEventListener('change', renderLoginHistory);

document.getElementById('clearLoginHistoryBtn').addEventListener('click', () => {
  showConfirm('Xóa toàn bộ lịch sử đăng nhập?', async () => {
    await db.from('login_logs').delete().neq('id', 0);
    renderLoginHistory();
  }, { title: 'Xóa lịch sử', icon: '🗑', okText: 'Xóa' });
});

document.getElementById('exportLoginHistoryBtn').addEventListener('click', async () => {
  const { data: logs } = await db.from('login_logs').select('*').order('logged_in_at', {ascending: false}).limit(50000);
  if (!logs?.length) { alert('Chưa có dữ liệu.'); return; }
  const rows = [['Thời gian','Học sinh','Gmail','Lớp','Thiết bị','Trình duyệt','HĐH']];
  logs.forEach(l => rows.push([
    new Date(l.logged_in_at).toLocaleString('vi-VN'),
    l.student_name||'', l.username||'', l.class_name||'',
    l.device_type||'', l.browser||'', l.os||''
  ]));
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `lich_su_dang_nhap_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
});

// Auto-refresh danh sách học sinh để cập nhật online/offline
let _studentRefreshTimer = null;
function startStudentAutoRefresh() {
  stopStudentAutoRefresh();
  _studentRefreshTimer = setInterval(() => {
    if (document.getElementById('pageStudents').classList.contains('active')) {
      renderStudents();
    }
  }, 30000); // tăng từ 10s → 30s
}
function stopStudentAutoRefresh() {
  if (_studentRefreshTimer) { clearInterval(_studentRefreshTimer); _studentRefreshTimer = null; }
}

// Auto-refresh online panel — đã có realtime, chỉ fallback mỗi 60s
setInterval(() => {
  if (document.getElementById('pageOverview')?.classList.contains('active')) {
    renderOnlineStudents();
  }
}, 60000); // tăng từ 15s → 60s

// ── Realtime: online students ──
db.channel('realtime-online')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, (payload) => {
    // Cập nhật panel online ở tổng quan
    if (document.getElementById('pageOverview')?.classList.contains('active')) {
      renderOnlineStudents();
    }
    // Cập nhật danh sách học sinh nếu đang xem
    if (document.getElementById('pageStudents')?.classList.contains('active')) {
      renderStudents();
    }
    // Thông báo khi học sinh đăng nhập mới
    if (payload.eventType === 'UPDATE' && payload.new?.is_online && !payload.old?.is_online) {
      _adminNotify('🟢 Học sinh online',
        `${payload.new.full_name || payload.new.username} vừa đăng nhập`, 'info');
      _adminBrowserNotify('🟢 Học sinh online',
        `${payload.new.full_name || payload.new.username} vừa đăng nhập`);
    }
  })
  .subscribe();

// ── Realtime: announcements ──
db.channel('realtime-announcements')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
    if (document.getElementById('pageAnnouncements')?.classList.contains('active')) {
      renderAnnouncements();
    }
  })
  .subscribe();

// ── Realtime: lessons, videos, docs, groups ──
db.channel('realtime-lessons')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'lessons' }, () => {
    if (document.getElementById('pageLessons')?.classList.contains('active')) renderLessons();
    if (document.getElementById('pageLessonGroups')?.classList.contains('active')) renderGroups();
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'lesson_videos' }, () => {
    if (currentLessonId && document.getElementById('lessonDetailView')?.style.display !== 'none') {
      renderLessonVideos(currentLessonId);
    }
    // Chỉ render lại list khi đang ở list view (không phải detail view)
    if (document.getElementById('pageLessons')?.classList.contains('active') &&
        document.getElementById('lessonListView')?.style.display !== 'none') renderLessons();
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'lesson_docs' }, () => {
    if (currentLessonId && document.getElementById('lessonDetailView')?.style.display !== 'none') {
      renderLessonDocs(currentLessonId);
    }
    // Chỉ render lại list khi đang ở list view (không phải detail view)
    if (document.getElementById('pageLessons')?.classList.contains('active') &&
        document.getElementById('lessonListView')?.style.display !== 'none') renderLessons();
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'lesson_groups' }, () => {
    if (document.getElementById('pageLessonGroups')?.classList.contains('active')) renderGroups();
  })
  .subscribe();

// ── Realtime: access_logs ──
db.channel('realtime-access-logs')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'access_logs' }, () => {
    if (document.getElementById('pageAccessStats')?.classList.contains('active')) {
      renderAccessStats();
    }
  })
  .subscribe();

// ── Realtime: alerts (nhật ký cảnh báo) ──
db.channel('realtime-alerts')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, (payload) => {
    // Cập nhật badge số cảnh báo hôm nay
    const statEl = document.getElementById('statAlerts');
    if (statEl) statEl.textContent = parseInt(statEl.textContent || '0') + 1;

    // Badge nav
    const badge = document.getElementById('alertNavBadge');
    if (badge) {
      badge.style.display = 'inline';
      badge.textContent = parseInt(badge.textContent || '0') + 1;
    }

    // Nếu đang ở trang cảnh báo → refresh luôn
    if (document.getElementById('pageSecurity')?.classList.contains('active')) {
      renderAlerts();
    }
    // Nếu đang ở tổng quan → refresh recent alerts
    if (document.getElementById('pageOverview')?.classList.contains('active')) {
      renderOverview();
    }

    // Popup thông báo nhỏ
    _adminNotify('🚨 Cảnh báo mới', payload.new?.student_name
      ? `${payload.new.student_name} — ${(payload.new.reason||'').slice(0,60)}`
      : 'Có cảnh báo bảo mật mới', 'warn');
    // Browser notification khi tab nền
    _adminBrowserNotify('🚨 Cảnh báo mới',
      payload.new?.student_name
        ? `${payload.new.student_name} — ${(payload.new.reason||'').slice(0,80)}`
        : 'Có cảnh báo bảo mật mới');
  })
  .subscribe();

// ── Realtime: login_logs ──
db.channel('realtime-login-logs')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'login_logs' }, () => {
    if (document.getElementById('pageLoginHistory')?.classList.contains('active')) {
      renderLoginHistory();
    }
  })
  .subscribe();

// ── Realtime: homework & submissions (từ trang bài tập) ──
db.channel('realtime-homework-admin')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'homework_submissions' },
    (payload) => {
      const nw = payload.new;
      // Popup thông báo có học sinh nộp bài
      if (nw?.student_name) {
        _adminNotify('📬 Học sinh nộp bài',
          `${nw.student_name} vừa nộp bài`, 'submit');
        // Browser notification khi tab nền
        _adminBrowserNotify('📬 Học sinh nộp bài', `${nw.student_name} vừa nộp bài`);
      }
    }
  )
  .subscribe();

// ── Fallback polling 2s cho admin khi realtime gián đoạn ──────────
let _adminFallbackInterval = null;
let _adminRealtimeOk = true;

function _startAdminFallback() {
  if (_adminFallbackInterval) return;
  _adminRealtimeOk = false;
  _adminFallbackInterval = setInterval(async () => {
    const curPage = document.querySelector('.page.active')?.id || '';
    try {
      // Chỉ refresh nhẹ — online students thay vì toàn bộ overview
      if (curPage === 'pageOverview')    renderOnlineStudents();
      if (curPage === 'pageStudents')    renderStudents();
      if (curPage === 'pageSecurity')    renderAlerts();
      if (curPage === 'pageLoginHistory') renderLoginHistory();
    } catch(e) {}
  }, 30000); // tăng từ 2s → 30s
}

function _stopAdminFallback() {
  if (_adminFallbackInterval) {
    clearInterval(_adminFallbackInterval);
    _adminFallbackInterval = null;
    _adminRealtimeOk = true;
  }
}

// Kiểm tra realtime còn sống không — mỗi 10s
setInterval(() => {
  const channels = db.getChannels ? db.getChannels() : [];
  const allOk = channels.length === 0 || channels.some(c => c.state === 'joined');
  if (!allOk && !_adminFallbackInterval) _startAdminFallback();
  if (allOk && _adminFallbackInterval)  _stopAdminFallback();
}, 10000);

// ── Helper: popup thông báo nhỏ trong admin ──
function _adminNotify(title, body, type = 'info') {
  let stack = document.getElementById('_adminNotifyStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = '_adminNotifyStack';
    stack.style.cssText = 'position:fixed;bottom:1.5rem;right:1.25rem;z-index:9999;display:flex;flex-direction:column-reverse;gap:.45rem;max-width:300px;pointer-events:none';
    document.body.appendChild(stack);
  }
  const colors = {
    info:   'linear-gradient(135deg,#1e1b4b,#4338ca)',
    warn:   'linear-gradient(135deg,#78350f,#d97706)',
    submit: 'linear-gradient(135deg,#064e3b,#059669)',
  };
  const icons = { info:'💡', warn:'🚨', submit:'📬' };
  const div = document.createElement('div');
  div.style.cssText = `background:${colors[type]||colors.info};color:#fff;border-radius:12px;padding:.65rem 1rem;box-shadow:0 4px 20px rgba(0,0,0,.3);animation:_adminNIn .3s cubic-bezier(.34,1.56,.64,1);pointer-events:auto;border:1px solid rgba(255,255,255,.12);cursor:pointer`;
  div.innerHTML = `<div style="display:flex;align-items:center;gap:.5rem">
    <span style="font-size:1rem;flex-shrink:0">${icons[type]||'💡'}</span>
    <div style="flex:1;min-width:0">
      <div style="font-weight:800;font-size:.84rem">${title}</div>
      <div style="font-size:.75rem;opacity:.85;margin-top:.1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${body}</div>
    </div>
    <button onclick="this.parentNode.parentNode.remove()" style="background:rgba(255,255,255,.15);border:none;color:#fff;width:18px;height:18px;border-radius:50%;cursor:pointer;font-size:.65rem;display:flex;align-items:center;justify-content:center;flex-shrink:0">✕</button>
  </div>`;
  div.onclick = e => { if (e.target.tagName !== 'BUTTON') div.remove(); };
  stack.appendChild(div);

  // Âm thanh
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    if (type === 'warn') {
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(330, ctx.currentTime + 0.15);
    } else if (type === 'submit') {
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
    } else {
      osc.frequency.setValueAtTime(520, ctx.currentTime);
    }
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(); osc.stop(ctx.currentTime + 0.5);
  } catch(e) {}

  // Tự xóa sau 5s
  setTimeout(() => {
    if (!div.parentNode) return;
    div.style.transition = 'opacity .35s,transform .35s';
    div.style.opacity = '0'; div.style.transform = 'translateX(20px)';
    setTimeout(() => div.remove(), 380);
  }, 5000);

  // Inject CSS 1 lần
  if (!document.getElementById('_adminNotifyStyle')) {
    const s = document.createElement('style');
    s.id = '_adminNotifyStyle';
    s.textContent = `@keyframes _adminNIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}`;
    document.head.appendChild(s);
  }
}
// THỐNG KÊ TRUY CẬP
// ============================================================
async function renderAccessStats() {
  const cls    = document.getElementById('accessFilterClass').value;
  const type   = document.getElementById('accessFilterType').value;
  const search = (document.getElementById('accessSearch').value||'').toLowerCase();
  const from   = document.getElementById('accessDateFrom').value;
  const to     = document.getElementById('accessDateTo').value;

  let query = db.from('access_logs').select('*').order('accessed_at', {ascending: false}).limit(50000);
  if (cls)  query = query.eq('class_name', cls);
  if (type) query = query.eq('content_type', type);
  if (from) query = query.gte('accessed_at', from);
  if (to)   query = query.lte('accessed_at', to + 'T23:59:59');

  // Query count chính xác (không bị giới hạn 1000)
  let countQuery = db.from('access_logs').select('*', { count: 'exact', head: true });
  let countVideoQuery = db.from('access_logs').select('*', { count: 'exact', head: true }).eq('content_type', 'video');
  if (cls)  { countQuery = countQuery.eq('class_name', cls); countVideoQuery = countVideoQuery.eq('class_name', cls); }
  if (from) { countQuery = countQuery.gte('accessed_at', from); countVideoQuery = countVideoQuery.gte('accessed_at', from); }
  if (to)   { countQuery = countQuery.lte('accessed_at', to + 'T23:59:59'); countVideoQuery = countVideoQuery.lte('accessed_at', to + 'T23:59:59'); }

  const [{ data: logs }, { count: totalViews }, { count: videoViews }] = await Promise.all([query, countQuery, countVideoQuery]);
  const all = logs || [];

  // Stat tổng
  const uniqueUsers = new Set(all.map(l => l.username)).size;
  const docViews    = (totalViews||0) - (videoViews||0);

  document.getElementById('accessStatGrid').innerHTML = `
    <div class="stat-card blue"><div class="stat-icon">👁</div><div><div class="stat-num">${totalViews}</div><div class="stat-label">Tổng lượt xem</div></div></div>
    <div class="stat-card green"><div class="stat-icon">👨‍🎓</div><div><div class="stat-num">${uniqueUsers}</div><div class="stat-label">Học sinh đã truy cập</div></div></div>
    <div class="stat-card purple"><div class="stat-icon">🎬</div><div><div class="stat-num">${videoViews}</div><div class="stat-label">Lượt xem video</div></div></div>
  `;

  // Top bài học
  const lessonCount = {};
  all.forEach(l => { lessonCount[l.lesson_name] = (lessonCount[l.lesson_name]||0)+1; });
  const topLessons = Object.entries(lessonCount).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const tlEl = document.getElementById('topLessons');
  tlEl.innerHTML = topLessons.length ? topLessons.map(([name, cnt], i) => `
    <div class="list-row">
      <span style="width:22px;height:22px;background:var(--primary-light);color:var(--primary);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:800;flex-shrink:0">${i+1}</span>
      <div class="list-info" style="flex:1;min-width:0"><div class="list-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div></div>
      <span class="group-card-count" style="background:var(--primary-light);color:var(--primary);padding:.2rem .6rem;border-radius:20px;font-size:.75rem;font-weight:700">${cnt} lượt</span>
    </div>`).join('') : '<p class="muted-sm">Chưa có dữ liệu.</p>';

  // Top học sinh
  const studentCount = {};
  all.forEach(l => { if (!studentCount[l.username]) studentCount[l.username] = { name: l.student_name, cls: l.class_name, cnt: 0 }; studentCount[l.username].cnt++; });
  const topStudents = Object.values(studentCount).sort((a,b)=>b.cnt-a.cnt).slice(0,8);
  const tsEl = document.getElementById('topStudents');
  tsEl.innerHTML = topStudents.length ? topStudents.map((s, i) => `
    <div class="list-row">
      <span style="width:22px;height:22px;background:var(--primary-light);color:var(--primary);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:800;flex-shrink:0">${i+1}</span>
      <div class="list-info" style="flex:1"><div class="list-title">${s.name}</div><div class="list-meta">${s.cls||'—'}</div></div>
      <span class="group-card-count" style="background:var(--success);color:#fff;padding:.2rem .6rem;border-radius:20px;font-size:.75rem;font-weight:700">${s.cnt} lượt</span>
    </div>`).join('') : '<p class="muted-sm">Chưa có dữ liệu.</p>';

  // Log chi tiết — có phân trang
  const filtered = search ? all.filter(l => (l.student_name||'').toLowerCase().includes(search) || (l.username||'').toLowerCase().includes(search)) : all;
  const logEl = document.getElementById('accessLogList');
  document.getElementById('emptyAccessLog').style.display = filtered.length ? 'none' : 'block';

  const PER_PAGE = 50;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  // Giữ trang hiện tại nếu còn hợp lệ, không thì reset về 1
  if (!window._accessLogPage || window._accessLogPage > totalPages) window._accessLogPage = 1;
  const page = window._accessLogPage;
  const slice = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  logEl.innerHTML = slice.map(l => {
    const icon = l.content_type === 'video' ? '🎬' : '📄';
    const time = new Date(l.accessed_at).toLocaleString('vi-VN');
    return `<div class="list-row">
      <span class="list-icon">${icon}</span>
      <div class="list-info" style="flex:1">
        <div class="list-title">${l.student_name} <span class="muted" style="font-weight:400">— ${l.content_title}</span></div>
        <div class="list-meta">${l.lesson_name||''} ${l.class_name?`• <span class="class-tag">${l.class_name}</span>`:''} • ${time}</div>
      </div>
    </div>`;
  }).join('');

  // Render phân trang
  let pgHtml = '';
  if (totalPages > 1) {
    pgHtml += `<div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;margin-top:.85rem;padding-top:.75rem;border-top:1px solid var(--border)">`;
    pgHtml += `<span style="font-size:.8rem;color:var(--muted);margin-right:.25rem">${filtered.length} kết quả</span>`;
    // Nút prev
    pgHtml += `<button class="page-btn" ${page===1?'disabled style="opacity:.4;cursor:default"':''} data-ap="${page-1}">‹</button>`;
    // Các nút trang
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
        pgHtml += `<button class="page-btn${i===page?' active':''}" data-ap="${i}">${i}</button>`;
      } else if (i === page - 3 || i === page + 3) {
        pgHtml += `<span style="color:var(--muted);padding:0 .2rem">…</span>`;
      }
    }
    // Nút next
    pgHtml += `<button class="page-btn" ${page===totalPages?'disabled style="opacity:.4;cursor:default"':''} data-ap="${page+1}">›</button>`;
    pgHtml += `</div>`;
  }
  logEl.insertAdjacentHTML('beforeend', pgHtml);

  // Gắn sự kiện phân trang
  logEl.querySelectorAll('[data-ap]').forEach(btn => {
    btn.addEventListener('click', () => {
      window._accessLogPage = parseInt(btn.dataset.ap);
      renderAccessStats();
      logEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
} // end renderAccessStats

document.getElementById('accessFilterClass').addEventListener('change', () => { window._accessLogPage = 1; renderAccessStats(); });
document.getElementById('accessFilterType').addEventListener('change', () => { window._accessLogPage = 1; renderAccessStats(); });
document.getElementById('accessSearch').addEventListener('input', () => { window._accessLogPage = 1; renderAccessStats(); });
document.getElementById('accessDateFrom').addEventListener('change', () => { window._accessLogPage = 1; renderAccessStats(); });
document.getElementById('accessDateTo').addEventListener('change', () => { window._accessLogPage = 1; renderAccessStats(); });

// ---- Hàm vẽ biểu đồ theo ngày ----
function renderAccessChart(allLogs) {
  const todayStr = new Date().toISOString().split('T')[0];
  if (!window._chartDate) window._chartDate = todayStr;

  // Tạo điểm dữ liệu theo từng giờ trong 13 ngày xung quanh _chartDate (UTC)
  const points = { video: [], doc: [] };
  for (let i = -6; i <= 6; i++) {
    const dayDate = new Date(window._chartDate + 'T00:00:00Z');
    dayDate.setUTCDate(dayDate.getUTCDate() + i);
    const dayStr = dayDate.toISOString().split('T')[0];
    for (let h = 0; h < 24; h++) {
      const tStr = `${dayStr}T${String(h).padStart(2,'0')}:00:00Z`;
      const vCnt = allLogs.filter(l => l.content_type==='video' && (l.accessed_at||'').startsWith(dayStr) && new Date(l.accessed_at).getUTCHours()===h).length;
      const dCnt = allLogs.filter(l => l.content_type==='doc'   && (l.accessed_at||'').startsWith(dayStr) && new Date(l.accessed_at).getUTCHours()===h).length;
      points.video.push({ x: tStr, y: vCnt });
      points.doc.push({ x: tStr, y: dCnt });
    }
  }

  const winStart = window._chartDate + 'T00:00:00Z';
  const winEnd   = window._chartDate + 'T23:59:59Z';

  // Cập nhật label
  const [y,m,dd] = window._chartDate.split('-');
  const labelEl = document.getElementById('chartDayLabel');
  if (labelEl) labelEl.textContent = window._chartDate === todayStr ? `Hôm nay (${dd}/${m})` : `${dd}/${m}/${y}`;
  const nextBtn = document.getElementById('chartNextDay');
  if (nextBtn) nextBtn.disabled = window._chartDate >= todayStr;

  const canvas = document.getElementById('accessChart');
  if (!canvas) return;

  window._accessChart = new Chart(canvas, {
    type: 'line',
    data: {
      datasets: [
        { label: 'Video', data: points.video, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,.15)', borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 6, tension: 0.4, fill: true },
        { label: 'Tài liệu', data: points.doc, borderColor: '#06b6d4', backgroundColor: 'rgba(6,182,212,.1)', borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 6, tension: 0.4, fill: true }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { font: { size: 12 }, boxWidth: 12, usePointStyle: true } },
        tooltip: {
          backgroundColor: '#1e293b', titleFont: { size: 12 }, bodyFont: { size: 12 }, padding: 10, cornerRadius: 8,
          callbacks: { title: items => { const d = new Date(items[0].parsed.x); return `${String(d.getHours()).padStart(2,'0')}:00 — ${d.toLocaleDateString('vi-VN')}`; } }
        },
        zoom: {
          pan: {
            enabled: false,
            mode: 'x',
            onPan({ chart }) {
              const mid = (chart.scales.x.min + chart.scales.x.max) / 2;
              const midDate = new Date(mid).toISOString().split('T')[0];
              if (midDate !== window._chartDate) {
                window._chartDate = midDate > todayStr ? todayStr : midDate;
                const [y2,m2,d2] = window._chartDate.split('-');
                const lbl = document.getElementById('chartDayLabel');
                if (lbl) lbl.textContent = window._chartDate === todayStr ? `Hôm nay (${d2}/${m2})` : `${d2}/${m2}/${y2}`;
                const nb = document.getElementById('chartNextDay');
                if (nb) nb.disabled = window._chartDate >= todayStr;
              }
            }
          },
          limits: {
            x: {
              min: new Date(new Date().setDate(new Date().getDate()-6)).setHours(0,0,0,0),
              max: new Date(todayStr + 'T23:59:59').getTime()
            }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'hour', displayFormats: { hour: 'HH:mm dd/MM' }, tooltipFormat: 'HH:mm dd/MM' },
          min: winStart,
          max: winEnd,
          grid: { display: false },
          ticks: { font: { size: 10 }, maxRotation: 0, maxTicksLimit: 16 }
        },
        y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: 'rgba(0,0,0,.05)' } }
      }
    }
  });
  canvas.style.cursor = 'grab';

  // Kéo chuột/ngón tay để scroll liên tục theo pixel
  let _dragStartX = null;
  let _dragStartMin = null;
  let _dragStartMax = null;

  const onDragStart = e => {
    _dragStartX = e.touches ? e.touches[0].clientX : e.clientX;
    _dragStartMin = window._accessChart.scales.x.min;
    _dragStartMax = window._accessChart.scales.x.max;
    canvas.style.cursor = 'grabbing';
  };

  const onDragMove = e => {
    if (_dragStartX === null) return;
    const curX = e.touches ? e.touches[0].clientX : e.clientX;
    const diff = curX - _dragStartX;
    const range = _dragStartMax - _dragStartMin;
    const canvasWidth = canvas.offsetWidth;
    const msPerPx = range / canvasWidth;
    const shift = -diff * msPerPx;
    const todayEnd = new Date(todayStr + 'T23:59:59').getTime();
    let newMin = _dragStartMin + shift;
    let newMax = _dragStartMax + shift;
    if (newMax > todayEnd) { newMax = todayEnd; newMin = todayEnd - range; }
    window._accessChart.options.scales.x.min = new Date(newMin).toISOString();
    window._accessChart.options.scales.x.max = new Date(newMax).toISOString();
    window._accessChart.update('none');
    // Cập nhật label ngày
    const midDate = new Date((newMin + newMax) / 2).toISOString().split('T')[0];
    window._chartDate = midDate;
    const [y2,m2,d2] = midDate.split('-');
    const lbl = document.getElementById('chartDayLabel');
    if (lbl) lbl.textContent = midDate === todayStr ? `Hôm nay (${d2}/${m2})` : `${d2}/${m2}/${y2}`;
    const nb = document.getElementById('chartNextDay');
    if (nb) nb.disabled = midDate >= todayStr;
  };

  const onDragEnd = () => {
    _dragStartX = null;
    canvas.style.cursor = 'grab';
  };

  canvas.addEventListener('mousedown', onDragStart);
  canvas.addEventListener('mousemove', onDragMove);
  canvas.addEventListener('mouseup', onDragEnd);
  canvas.addEventListener('mouseleave', onDragEnd);
  canvas.addEventListener('touchstart', onDragStart, { passive: true });
  canvas.addEventListener('touchmove', onDragMove, { passive: true });
  canvas.addEventListener('touchend', onDragEnd, { passive: true });
}

// Nút điều hướng ngày biểu đồ
async function refreshChart() {
  if (window._accessChart) { window._accessChart.destroy(); window._accessChart = null; }
  const chartDate = window._chartDate || new Date().toISOString().split('T')[0];
  // Tính từ/đến theo UTC
  const centerDate = new Date(chartDate + 'T00:00:00Z');
  const fromDate = new Date(centerDate); fromDate.setUTCDate(fromDate.getUTCDate() - 6);
  const toDate   = new Date(centerDate); toDate.setUTCDate(toDate.getUTCDate() + 6);
  const chartFromStr = fromDate.toISOString().split('T')[0];
  const chartToStr   = toDate.toISOString().split('T')[0];
  const cls = document.getElementById('accessFilterClass').value;
  let q = db.from('access_logs').select('content_type,accessed_at')
    .gte('accessed_at', chartFromStr + 'T00:00:00Z')
    .lte('accessed_at', chartToStr + 'T23:59:59Z')
    .limit(100000);
  if (cls) q = q.eq('class_name', cls);
  const { data } = await q;
  renderAccessChart(data || []);
}

document.getElementById('chartPrevDay')?.addEventListener('click', () => {
  const d = new Date(window._chartDate); d.setDate(d.getDate() - 1);
  window._chartDate = d.toISOString().split('T')[0];
  refreshChart();
});
document.getElementById('chartNextDay')?.addEventListener('click', () => {
  const todayStr = new Date().toISOString().split('T')[0];
  if (window._chartDate >= todayStr) return;
  const d = new Date(window._chartDate); d.setDate(d.getDate() + 1);
  window._chartDate = d.toISOString().split('T')[0];
  refreshChart();
});
document.getElementById('chartTodayBtn')?.addEventListener('click', () => {
  window._chartDate = new Date().toISOString().split('T')[0];
  refreshChart();
});

document.getElementById('exportAccessBtn').addEventListener('click', async () => {
  const { data: logs } = await db.from('access_logs').select('*').order('accessed_at', {ascending: false}).limit(50000);
  if (!logs?.length) { alert('Chưa có dữ liệu.'); return; }
  const rows = [['Thời gian','Học sinh','Gmail','Lớp','Bài học','Nội dung','Loại']];
  logs.forEach(l => rows.push([
    new Date(l.accessed_at).toLocaleString('vi-VN'),
    l.student_name||'', l.username||'', l.class_name||'',
    l.lesson_name||'', l.content_title||'', l.content_type||''
  ]));
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `thong_ke_truy_cap_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
});

document.getElementById('clearAccessBtn')?.addEventListener('click', () => {
  showConfirm(
    'Xóa toàn bộ nhật ký truy cập? Hành động này không thể hoàn tác.',
    async () => {
      const { error } = await db.from('access_logs').delete().neq('id', 0);
      if (error) { alert('Lỗi: ' + error.message); return; }
      renderAccessStats();
    },
    { title: 'Xóa nhật ký truy cập', icon: '🗑', okText: 'Xóa tất cả', cancelText: 'Hủy' }
  );
});













// ============================================================
// TÌM KIẾM TOÀN CỤC
// ============================================================
let _globalStudentCache = [];
(async () => {
  const { data } = await db.from('students').select('student_code,full_name,username,class_name,active,phone').order('full_name');
  _globalStudentCache = data || [];
})();

// Refresh cache khi có thay đổi realtime
db.channel('global-search-cache')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, async () => {
    const { data } = await db.from('students').select('student_code,full_name,username,class_name,active,phone').order('full_name');
    _globalStudentCache = data || [];
  }).subscribe();

const globalSearchInput = document.getElementById('globalSearch');
const globalSearchDD    = document.getElementById('globalSearchDropdown');

globalSearchInput?.addEventListener('input', function() {
  const q = this.value.trim().toLowerCase();
  if (!q) { globalSearchDD.style.display = 'none'; return; }

  const matches = _globalStudentCache.filter(s =>
    s.full_name.toLowerCase().includes(q) ||
    (s.username||'').toLowerCase().includes(q) ||
    (s.student_code||'').toLowerCase().includes(q) ||
    (s.phone||'').includes(q)
  ).slice(0, 8);

  if (!matches.length) {
    globalSearchDD.innerHTML = '<div style="padding:.85rem 1rem;font-size:.85rem;color:var(--muted)">Không tìm thấy học sinh nào.</div>';
    globalSearchDD.style.display = 'block';
    return;
  }

  globalSearchDD.style.display = 'block';
  globalSearchDD.innerHTML = matches.map(s => `
    <div class="gs-item" data-username="${s.username}" style="display:flex;align-items:center;gap:.75rem;padding:.7rem 1rem;cursor:pointer;border-bottom:1px solid var(--border);transition:background .15s"
      onmouseover="this.style.background='var(--primary-light)'" onmouseout="this.style.background=''">
      <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem;flex-shrink:0">
        ${s.full_name.charAt(0).toUpperCase()}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:.88rem;color:var(--text)">${s.full_name}</div>
        <div style="font-size:.75rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.username} ${s.class_name?`• ${s.class_name}`:''}</div>
      </div>
      <span style="font-size:.72rem;font-weight:700;padding:.2rem .55rem;border-radius:20px;background:${s.active?'#d1fae5':'#fee2e2'};color:${s.active?'#065f46':'#991b1b'}">${s.active?'Hoạt động':'Khóa'}</span>
    </div>`).join('');

  globalSearchDD.querySelectorAll('.gs-item').forEach(el => {
    el.addEventListener('click', () => {
      globalSearchInput.value = '';
      globalSearchDD.style.display = 'none';
      // Chuyển sang trang học sinh và tìm kiếm
      showPage('students');
      const searchEl = document.getElementById('studentSearch');
      if (searchEl) {
        searchEl.value = el.querySelector('div > div:first-child').textContent.trim();
        renderStudents();
      }
    });
  });
});

// Đóng global search dropdown khi click ra ngoài
document.addEventListener('click', e => {
  if (!globalSearchInput?.contains(e.target) && !globalSearchDD?.contains(e.target)) {
    globalSearchDD.style.display = 'none';
  }
  if (!e.target.closest?.('.smenu-toggle') && !e.target.closest?.('.student-menu')) {
    document.querySelectorAll('.student-menu').forEach(m => m.style.display = 'none');
  }
});

// ============================================================
// DARK MODE
// ============================================================
const darkBtn = document.getElementById('darkModeBtn');
const isDark  = localStorage.getItem('dh_dark') === '1';
if (isDark) { document.body.classList.add('dark-mode'); if (darkBtn) darkBtn.textContent = '☀️'; }

darkBtn?.addEventListener('click', () => {
  const on = document.body.classList.toggle('dark-mode');
  if (darkBtn) darkBtn.textContent = on ? '☀️' : '🌙';
  localStorage.setItem('dh_dark', on ? '1' : '0');
});

// ============================================================
// BẢO TRÌ
// ============================================================
const maintenanceBtn = document.getElementById('maintenanceBtn');

async function checkMaintenanceStatus() {
  const { data } = await db.from('app_settings').select('value').eq('key', 'maintenance').maybeSingle();
  const isOn = data?.value === 'true';
  // Topbar button
  if (maintenanceBtn) {
    maintenanceBtn.style.background = isOn ? '#ef4444' : '';
    maintenanceBtn.style.borderColor = isOn ? '#ef4444' : '';
    maintenanceBtn.style.color = isOn ? '#fff' : '';
  }
  // Sidebar button
  const sideBtn = document.getElementById('maintenanceSideBtn');
  if (sideBtn) {
    sideBtn.style.color = isOn ? '#ef4444' : '';
    sideBtn.querySelector('.slink-label').textContent = isOn ? '🔴 Đang bảo trì' : 'Chế độ bảo trì';
  }
}
checkMaintenanceStatus();

maintenanceBtn?.addEventListener('click', async () => {
  const { data } = await db.from('app_settings').select('value').eq('key', 'maintenance').maybeSingle();
  const isOn = data?.value === 'true';
  const newVal = isOn ? 'false' : 'true';
  await db.from('app_settings').upsert({ key: 'maintenance', value: newVal }, { onConflict: 'key' });
  checkMaintenanceStatus();
  if (newVal === 'true') {
    showConfirm('Đã bật chế độ bảo trì. Học viên sẽ thấy thông báo bảo trì khi vào trang.', () => {}, { title: '🔧 Bảo trì đã bật', icon: '🔧', okText: 'OK' });
  }
});

// Nút bảo trì trong sidebar
document.getElementById('maintenanceSideBtn')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const { data } = await db.from('app_settings').select('value').eq('key', 'maintenance').maybeSingle();
  const isOn = data?.value === 'true';
  const newVal = isOn ? 'false' : 'true';
  await db.from('app_settings').upsert({ key: 'maintenance', value: newVal }, { onConflict: 'key' });
  const btn = document.getElementById('maintenanceSideBtn');
  if (newVal === 'true') {
    btn.style.color = '#ef4444';
    btn.querySelector('.slink-label').textContent = '🔴 Đang bảo trì';
    alert('✅ Đã bật bảo trì — học viên sẽ thấy thông báo bảo trì.');
  } else {
    btn.style.color = '';
    btn.querySelector('.slink-label').textContent = 'Chế độ bảo trì';
    alert('✅ Đã tắt bảo trì — học viên vào bình thường.');
  }
  checkMaintenanceStatus();
});

// ============================================================
// TỰ ĐỘNG ĐĂNG XUẤT SAU 15 PHÚT KHÔNG THAO TÁC
// ============================================================
(function autoLogout() {
  const TIMEOUT = 15 * 60 * 1000; // 15 phút
  const WARN    = 60 * 1000;       // cảnh báo trước 60 giây
  let timer, warnTimer;

  // Tạo overlay cảnh báo
  const overlay = document.createElement('div');
  overlay.id = 'autoLogoutOverlay';
  overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
  overlay.innerHTML = `
    <div style="background:var(--card);border-radius:20px;padding:2rem 2.5rem;text-align:center;max-width:360px;box-shadow:0 24px 64px rgba(0,0,0,.3)">
      <div style="font-size:2.5rem;margin-bottom:.75rem">⏱️</div>
      <div style="font-weight:800;font-size:1.1rem;margin-bottom:.5rem;color:var(--text)">Phiên sắp hết hạn</div>
      <div style="font-size:.9rem;color:var(--muted);margin-bottom:1.25rem">Bạn không hoạt động trong 15 phút.<br>Tự động đăng xuất sau <b id="alCountdown" style="color:#ef4444">60</b> giây.</div>
      <button id="alStayBtn" style="width:100%;padding:.75rem;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:none;border-radius:12px;font-size:.95rem;font-weight:700;cursor:pointer">Tiếp tục làm việc</button>
    </div>`;
  document.body.appendChild(overlay);

  let countdown;
  function showWarning() {
    overlay.style.display = 'flex';
    let secs = 60;
    document.getElementById('alCountdown').textContent = secs;
    countdown = setInterval(() => {
      secs--;
      const el = document.getElementById('alCountdown');
      if (el) el.textContent = secs;
      if (secs <= 0) { clearInterval(countdown); logout(); }
    }, 1000);
  }

  function logout() {
    clearInterval(countdown);
    overlay.style.display = 'none';
    sessionStorage.clear();
    location.href = 'login.html';
  }

  function reset() {
    clearTimeout(timer);
    clearTimeout(warnTimer);
    clearInterval(countdown);
    overlay.style.display = 'none';
    warnTimer = setTimeout(showWarning, TIMEOUT - WARN);
    timer     = setTimeout(logout, TIMEOUT);
  }

  document.getElementById('alStayBtn').addEventListener('click', reset);
  ['mousemove','keydown','click','touchstart','scroll'].forEach(e => document.addEventListener(e, reset, { passive: true }));
  reset();
})();

// ============================================================
// GREETING + ĐỒNG HỒ TỔNG QUAN
// ============================================================
(function initGreeting() {
  function update() {
    const now  = new Date();
    const h    = now.getHours();
    const name = sessionStorage.getItem('dh_name') || 'Admin';
    const greet = h < 12 ? '☀️ Chào buổi sáng' : h < 18 ? '🌤 Chào buổi chiều' : '🌙 Chào buổi tối';
    const days  = ['Chủ nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'];
    const dateStr = `${days[now.getDay()]}, ${now.toLocaleDateString('vi-VN')}`;
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const gt = document.getElementById('greetingText');
    const gd = document.getElementById('greetingDate');
    const gtime = document.getElementById('greetingTime');
    if (gt) gt.textContent = `${greet}, ${name}!`;
    if (gd) gd.textContent = dateStr;
    if (gtime) gtime.textContent = timeStr;
  }
  update();
  setInterval(update, 1000);
})();

// ============================================================
// LỊCH HỌC V2 — Theo tuần, từng slot ngày
// ============================================================

// ---- Helpers ngày ----
function getMonday(d) {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = dt.getDay();
  const diff = (day === 0) ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return dt;
}
function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtDateVN(d) {
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}`;
}
const DAY_LABELS = ['','','T2','T3','T4','T5','T6','T7','CN'];
const SESSION_ICON = { 'sáng':'☀️','chiều':'🌤','tối':'🌙' };

// ---- State tuần hiện tại ----
let schedCurrentWeekStart = getMonday(new Date());

// ---- Kiểm tra nhắc nhở Chủ Nhật ----
function checkScheduleSundayAlert() {
  const today = new Date();
  const isSunday = today.getDay() === 0;
  const el = document.getElementById('schedSundayAlert');
  if (el) el.style.display = isSunday ? 'flex' : 'none';
}

// ---- Render bảng lịch 7 ngày ----
async function renderSchedule() {
  checkScheduleSundayAlert();
  const cls = document.getElementById('scheduleFilterClass')?.value || '';
  const ws = toDateStr(schedCurrentWeekStart);
  const we = toDateStr(addDays(schedCurrentWeekStart, 6));

  // Cập nhật label tuần
  const wlEl = document.getElementById('schedWeekLabel');
  const wrEl = document.getElementById('schedWeekRange');
  if (wlEl) {
    const now = getMonday(new Date());
    const diff = Math.round((schedCurrentWeekStart - now) / 86400000 / 7);
    wlEl.textContent = diff === 0 ? '📅 Tuần này' : diff === 1 ? '📅 Tuần sau' : diff === -1 ? '📅 Tuần trước' : `📅 Tuần ${diff > 0 ? '+'+diff : diff}`;
  }
  if (wrEl) wrEl.textContent = `${fmtDateVN(schedCurrentWeekStart)} – ${fmtDateVN(addDays(schedCurrentWeekStart,6))}`;

  // Query
  let query = db.from('schedule_slots').select('*')
    .gte('week_start', ws).lte('week_start', ws)
    .order('day_of_week').order('start_time');
  if (cls) query = query.eq('class_name', cls);
  else query = query; // lấy hết
  const { data: slots } = await query;
  const list = slots || [];

  const container = document.getElementById('schedWeekTable');
  const emptyEl   = document.getElementById('emptySchedule');
  if (!container) return;

  // Group theo ngày
  const byDay = {};
  for (let i=2; i<=8; i++) byDay[i] = [];
  list.forEach(s => { if (byDay[s.day_of_week]) byDay[s.day_of_week].push(s); });

  // Build HTML bảng
  const today = new Date(); today.setHours(0,0,0,0);
  let html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:.4rem">';
  for (let dow=2; dow<=8; dow++) {
    const dayDate = addDays(schedCurrentWeekStart, dow-2);
    const isToday = dayDate.toDateString() === today.toDateString();
    const isSun   = dow === 8;
    const dateStr = toDateStr(dayDate);
    const daySlots = byDay[dow];

    html += `
      <div style="min-width:0">
        <!-- Header ngày -->
        <div style="text-align:center;padding:.45rem .25rem;border-radius:10px;margin-bottom:.35rem;cursor:pointer;transition:background .15s;
          background:${isToday ? 'var(--primary)' : isSun ? '#fef3c7' : 'var(--bg)'};
          border:1.5px solid ${isToday ? 'var(--primary)' : isSun ? '#f59e0b' : 'var(--border)'};"
          onclick="adminScheduleOpenAdd('${dateStr}',${dow})"
          onmouseover="this.style.opacity='.8'" onmouseout="this.style.opacity='1'"
          title="Thêm buổi học ngày ${fmtDateVN(dayDate)}">
          <div style="font-weight:800;font-size:.8rem;color:${isToday ? '#fff' : isSun ? '#92400e' : 'var(--text)'}">${DAY_LABELS[dow]}</div>
          <div style="font-size:.7rem;color:${isToday ? 'rgba(255,255,255,.75)' : 'var(--muted)'};margin-top:.1rem">${fmtDateVN(dayDate)}</div>
          <div style="font-size:.65rem;margin-top:.2rem;color:${isToday?'rgba(255,255,255,.7)':'var(--muted)'}">➕</div>
        </div>
        <!-- Slots -->
        <div style="display:flex;flex-direction:column;gap:.3rem" id="schedDay_${dow}">
          ${daySlots.length === 0
            ? `<div style="height:40px;border-radius:8px;border:1.5px dashed var(--border);opacity:.4"></div>`
            : daySlots.map(s => _adminScheduleSlotHTML(s)).join('')
          }
        </div>
      </div>`;
  }
  html += '</div>';

  container.innerHTML = html;
  emptyEl.style.display = 'none';

  // Bind nút xóa
  container.querySelectorAll('[data-sched-del]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.schedDel;
      const subj = btn.dataset.schedSubj || 'buổi học này';
      showConfirm(`Xóa "${subj}"?`, async () => {
        await db.from('schedule_slots').delete().eq('id', id);
        logActivity('Lịch học', 'Xóa lịch học', subj);
        renderSchedule();
      });
    });
  });

  // Bind nút sửa
  container.querySelectorAll('[data-sched-edit]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.schedEdit);
      // Tìm slot trong list
      const slot = list.find(s => s.id === id);
      if (slot) adminScheduleOpenEdit(slot);
    });
  });
}

function _adminScheduleSlotHTML(s) {
  const icon = SESSION_ICON[s.session] || '📅';
  return `
    <div style="background:var(--card);border-radius:10px;padding:.65rem .75rem;border:1.5px solid var(--border);position:relative;overflow:hidden;font-size:.82rem;box-shadow:0 1px 4px rgba(0,0,0,.06)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:.35rem;margin-bottom:.35rem">
        <span style="font-weight:800;font-size:.85rem;display:flex;align-items:center;gap:.3rem">${icon} ${s.session}</span>
        <div style="display:flex;gap:.3rem">
          <button class="btn-sm" data-sched-edit="${s.id}" style="padding:.2rem .5rem;font-size:.75rem;min-height:0;line-height:1" title="Sửa">✏️</button>
          <button class="btn-sm btn-danger" data-sched-del="${s.id}" data-sched-subj="${s.subject}" style="padding:.2rem .5rem;font-size:.75rem;min-height:0;line-height:1" title="Xóa">🗑</button>
        </div>
      </div>
      <div style="font-weight:800;font-size:.9rem;color:var(--text);line-height:1.3;margin-bottom:.3rem;white-space:normal;word-break:break-word">${s.subject}</div>
      <div style="color:var(--primary);font-weight:700;font-size:.8rem;margin-bottom:.25rem">⏰ ${s.start_time.slice(0,5)} – ${s.end_time.slice(0,5)}</div>
      ${s.class_name
        ? `<span class="class-tag" style="font-size:.72rem">${s.class_name}</span>`
        : `<span style="font-size:.72rem;color:var(--muted);font-style:italic">Tất cả lớp</span>`}
      ${s.notes ? `<div style="color:var(--muted);font-size:.75rem;margin-top:.25rem;font-style:italic">📌 ${s.notes}</div>` : ''}
    </div>`;
}

// ---- Điều hướng tuần ----
document.getElementById('schedPrevWeek')?.addEventListener('click', () => {
  schedCurrentWeekStart = addDays(schedCurrentWeekStart, -7);
  renderSchedule();
});
document.getElementById('schedNextWeek')?.addEventListener('click', () => {
  schedCurrentWeekStart = addDays(schedCurrentWeekStart, 7);
  renderSchedule();
});
document.getElementById('scheduleFilterClass')?.addEventListener('change', renderSchedule);

// ---- Helper: parse giờ từ chuỗi tự nhập ----
function _parseTime(str) {
  if (!str) return null;
  // Chấp nhận: 8, 8:00, 08:00, 8h, 8h30, 8:30, 830
  str = str.trim().replace(/\s/g,'').toLowerCase().replace('h',':');
  // Trường hợp chỉ gõ số như "830" → "8:30"
  if (/^\d{3,4}$/.test(str)) {
    str = str.slice(0,-2) + ':' + str.slice(-2);
  }
  const parts = str.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || '0', 10);
  if (isNaN(h) || h < 0 || h > 23) return null;
  if (isNaN(m) || m < 0 || m > 59) return null;
  return { h, m, str: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}` };
}

// ---- Helper: preview giờ tiếng Việt ----
function _timePreview(timeStr) {
  const t = _parseTime(timeStr);
  if (!t) return '';
  const { h, m } = t;
  const mTxt = m > 0 ? ` ${m} phút` : '';
  if (h === 0)  return `🌙 12 giờ đêm${mTxt}`;
  if (h < 6)    return `🌙 ${h} giờ sáng sớm${mTxt}`;
  if (h < 12)   return `☀️ ${h} giờ sáng${mTxt}`;
  if (h === 12) return `☀️ 12 giờ trưa${mTxt}`;
  if (h < 18)   return `🌤 ${h - 12} giờ chiều${mTxt} (${h}h)`;
  return `🌙 ${h - 12} giờ tối${mTxt} (${h}h)`;
}

function _updateTimeSummary() {
  const startRaw = document.getElementById('schedStartTime')?.value || '';
  const endRaw   = document.getElementById('schedEndTime')?.value   || '';
  const ts = _parseTime(startRaw);
  const te = _parseTime(endRaw);
  const prevS   = document.getElementById('schedStartPreview');
  const prevE   = document.getElementById('schedEndPreview');
  const summary = document.getElementById('schedTimeSummary');
  if (prevS) prevS.textContent = ts ? _timePreview(startRaw) : (startRaw ? '⚠️ Giờ không hợp lệ' : '');
  if (prevE) prevE.textContent = te ? _timePreview(endRaw)   : (endRaw   ? '⚠️ Giờ không hợp lệ' : '');
  if (!summary) return;
  if (!ts || !te) { summary.textContent = ''; return; }
  const startMins = ts.h*60 + ts.m;
  const endMins   = te.h*60 + te.m;
  const diff = endMins - startMins;
  if (diff > 0) {
    const dh = Math.floor(diff/60), dm = diff%60;
    const dur = dh > 0 ? `${dh} tiếng${dm > 0 ? ` ${dm} phút` : ''}` : `${dm} phút`;
    summary.textContent = `${ts.str} → ${te.str}  ·  Thời lượng: ${dur}`;
    summary.style.color = '#4f46e5';
  } else {
    summary.textContent = '⚠️ Giờ kết thúc phải sau giờ bắt đầu';
    summary.style.color = '#ef4444';
  }
}

// Bind sự kiện trực tiếp vào input text
document.getElementById('schedStartTime')?.addEventListener('input', _updateTimeSummary);
document.getElementById('schedEndTime')?.addEventListener('input', _updateTimeSummary);
_updateTimeSummary();

// ---- Session button active highlight ----
document.querySelectorAll('input[name="schedSession"]').forEach(radio => {
  radio.addEventListener('change', () => {
    document.querySelectorAll('.sched-session-btn').forEach(btn => btn.classList.remove('active'));
    radio.closest('.sched-session-btn')?.classList.add('active');
  });
});

// ---- Mở modal SỬA slot ----
let _editingSlotId = null;

function adminScheduleOpenEdit(slot) {
  _editingSlotId = slot.id;
  document.getElementById('schedModalTitle').textContent = '✏️ Sửa buổi học';
  document.getElementById('schedModalSubtitle').textContent = 'Chỉnh sửa thông tin buổi học';

  // Điền ngày từ week_start + day_of_week
  const [wy, wm, wd] = slot.week_start.split('-').map(Number);
  const slotD = new Date(wy, wm - 1, wd + (slot.day_of_week - 2));
  document.getElementById('schedSlotDate').value = _sToDateStrLocal(slotD);

  // Lớp
  populateClassFilters().then(() => {
    document.getElementById('schedSlotClass').value = slot.class_name || '';
  });

  // Buổi
  document.querySelectorAll('input[name="schedSession"]').forEach(r => r.checked = false);
  const sessionRadio = document.querySelector(`input[name="schedSession"][value="${slot.session}"]`);
  if (sessionRadio) sessionRadio.checked = true;
  document.querySelectorAll('.sched-session-btn').forEach(btn => btn.classList.remove('active'));
  sessionRadio?.closest('.sched-session-btn')?.classList.add('active');

  // Giờ
  document.getElementById('schedStartTime').value = slot.start_time.slice(0,5);
  document.getElementById('schedEndTime').value   = slot.end_time.slice(0,5);
  _updateTimeSummary();

  // Nội dung + ghi chú
  document.getElementById('schedSubject').value = slot.subject || '';
  document.getElementById('schedNotes').value   = slot.notes   || '';
  document.getElementById('schedSlotError').textContent = '';

  // Đổi nút lưu thành "Cập nhật"
  document.getElementById('schedSaveBtn').textContent = '💾 Cập nhật';

  document.getElementById('addScheduleModal').classList.add('open');
}

// Helper tạo date string local (tránh UTC offset)
function _sToDateStrLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function adminScheduleOpenAdd(dateStr, dow) {
  _editingSlotId = null; // reset — đây là thêm mới
  document.getElementById('schedModalTitle').textContent = '📅 Thêm buổi học';
  document.getElementById('schedModalSubtitle').textContent = 'Điền thông tin buổi học mới';
  document.getElementById('schedSlotDate').value = dateStr;
  document.getElementById('schedSlotClass').value = '';
  document.querySelectorAll('input[name="schedSession"]').forEach(r => r.checked = false);
  document.querySelector('input[name="schedSession"][value="sáng"]').checked = true;
  document.querySelectorAll('.sched-session-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector('input[name="schedSession"][value="sáng"]')?.closest('.sched-session-btn')?.classList.add('active');
  document.getElementById('schedStartTime').value = '08:00';
  document.getElementById('schedEndTime').value   = '10:00';
  _updateTimeSummary();
  document.getElementById('schedSubject').value = '';
  document.getElementById('schedNotes').value = '';
  document.getElementById('schedSlotError').textContent = '';
  document.getElementById('schedSaveBtn').textContent = '💾 Lưu lịch học';
  document.getElementById('addScheduleModal').classList.add('open');
}

// ---- Nút "Thêm lịch" trên header ----
document.getElementById('openAddScheduleBtn')?.addEventListener('click', async () => {
  await populateClassFilters();
  const today = toDateStr(new Date());
  adminScheduleOpenAdd(today, new Date().getDay() || 7);
});

// ---- Đóng modal ----
document.getElementById('schedCancelBtn')?.addEventListener('click', () => {
  document.getElementById('addScheduleModal').classList.remove('open');
});
document.getElementById('schedCancelBtnFooter')?.addEventListener('click', () => {
  document.getElementById('addScheduleModal').classList.remove('open');
});

// ---- Lưu slot ----
document.getElementById('schedSaveBtn')?.addEventListener('click', async () => {
  const dateVal  = document.getElementById('schedSlotDate').value;
  const cls      = document.getElementById('schedSlotClass').value;
  const session  = document.querySelector('input[name="schedSession"]:checked')?.value;
  const startT   = document.getElementById('schedStartTime').value;
  const endT     = document.getElementById('schedEndTime').value;
  const subject  = document.getElementById('schedSubject').value.trim();
  const notes    = document.getElementById('schedNotes').value.trim();
  const err      = document.getElementById('schedSlotError');
  const btn      = document.getElementById('schedSaveBtn');

  err.textContent = '';
  if (!dateVal)   { err.textContent = 'Vui lòng chọn ngày.'; return; }
  if (!session)   { err.textContent = 'Vui lòng chọn buổi học.'; return; }
  if (!startT)    { err.textContent = 'Vui lòng nhập giờ bắt đầu.'; return; }
  if (!endT)      { err.textContent = 'Vui lòng nhập giờ kết thúc.'; return; }

  // Parse giờ tự nhập
  const tsObj = _parseTime(startT);
  const teObj = _parseTime(endT);
  if (!tsObj) { err.textContent = 'Giờ bắt đầu không hợp lệ. VD: 08:00'; return; }
  if (!teObj) { err.textContent = 'Giờ kết thúc không hợp lệ. VD: 10:00'; return; }
  const startNorm = tsObj.str;
  const endNorm   = teObj.str;
  if (tsObj.h*60+tsObj.m >= teObj.h*60+teObj.m) { err.textContent = 'Giờ kết thúc phải sau giờ bắt đầu.'; return; }
  if (!subject)   { err.textContent = 'Vui lòng nhập nội dung buổi học.'; return; }

  // Tính week_start (thứ 2) và day_of_week
  const d = new Date(dateVal + 'T00:00:00');
  const weekStart = getMonday(d);
  const jsDay = d.getDay();
  const dow = jsDay === 0 ? 8 : jsDay + 1;

  // ---- Kiểm tra trùng giờ trong cùng ngày + lớp ----
  btn.textContent = '⏳ Đang kiểm tra...'; btn.disabled = true;
  const ws = toDateStr(weekStart);

  let conflictQuery = db.from('schedule_slots')
    .select('id,subject,start_time,end_time,class_name')
    .eq('week_start', ws)
    .eq('day_of_week', dow);
  // Lấy tất cả slot cùng ngày, sau đó lọc lớp phía client
  const { data: existingSlots } = await conflictQuery;

  // Hai buổi bị trùng nếu: startA < endB AND endA > startB
  const toMins = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
  const newStart = toMins(startNorm), newEnd = toMins(endNorm);

  const conflict = (existingSlots||[]).find(s => {
    if (_editingSlotId && s.id === _editingSlotId) return false; // bỏ qua chính nó khi sửa
    const sameClass = !s.class_name || !cls || s.class_name === cls;
    if (!sameClass) return false;
    const sStart = toMins(s.start_time), sEnd = toMins(s.end_time);
    return newStart < sEnd && newEnd > sStart;
  });

  if (conflict) {
    const cStart = conflict.start_time.slice(0,5);
    const cEnd   = conflict.end_time.slice(0,5);
    err.innerHTML = `⚠️ Trùng giờ với buổi <b>"${conflict.subject}"</b> (${cStart} – ${cEnd}). Vui lòng chọn khung giờ khác.`;
    btn.textContent = _editingSlotId ? '💾 Cập nhật' : '💾 Lưu lịch học'; btn.disabled = false;
    return;
  }

  // ---- Lưu / Cập nhật ----
  btn.textContent = '⏳ Đang lưu...';

  let saveError;
  if (_editingSlotId) {
    // UPDATE
    const { error } = await db.from('schedule_slots').update({
      week_start : ws,
      day_of_week: dow,
      class_name : cls || null,
      session,
      start_time : startNorm,
      end_time   : endNorm,
      subject,
      notes      : notes || null
    }).eq('id', _editingSlotId);
    saveError = error;
  } else {
    // INSERT
    const { error } = await db.from('schedule_slots').insert({
      week_start : ws,
      day_of_week: dow,
      class_name : cls || null,
      session,
      start_time : startNorm,
      end_time   : endNorm,
      subject,
      notes      : notes || null
    });
    saveError = error;
  }

  btn.textContent = _editingSlotId ? '💾 Cập nhật' : '💾 Lưu lịch học';
  btn.disabled = false;
  if (saveError) { err.textContent = 'Lỗi: ' + saveError.message; return; }

  _editingSlotId = null;
  document.getElementById('addScheduleModal').classList.remove('open');
  logActivity('Lịch học', _editingSlotId ? 'Sửa lịch học' : 'Thêm lịch học', subject||session, cls||'');
  schedCurrentWeekStart = weekStart;
  renderSchedule();
});

// ---- Nhắc Chủ Nhật — kiểm tra mỗi phút ----
setInterval(checkScheduleSundayAlert, 60000);

// ---- Toast nhắc Chủ Nhật toàn cục (hiện ở mọi trang) ----
function _showSundayToastGlobal() {
  const today = new Date();
  if (today.getDay() !== 0) return; // không phải CN

  const key = 'dh_sunday_toast_' + today.toDateString();
  if (sessionStorage.getItem(key)) return; // đã hiện trong session này
  sessionStorage.setItem(key, '1');

  const toast = document.getElementById('sundayScheduleToast');
  if (!toast) return;
  toast.style.display = 'block';

  // Progress bar chạy rồi tự ẩn sau 15s
  const bar = document.getElementById('sundayToastProgress');
  if (bar) {
    setTimeout(() => { bar.style.width = '0%'; }, 100);
    setTimeout(() => { toast.style.display = 'none'; }, 15000);
  }
}

// Hiện ngay sau khi trang load xong
setTimeout(_showSundayToastGlobal, 2000);

// ---- Push notification Chủ Nhật nhắc lên lịch ----
(function initSundayReminder() {
  function doSundayReminder() {
    const now = new Date();
    if (now.getDay() !== 0) return; // không phải CN
    const lastKey = 'dh_sched_reminded_' + now.toDateString();
    if (localStorage.getItem(lastKey)) return; // đã nhắc hôm nay
    localStorage.setItem(lastKey, '1');

    // Thử push notification
    if ('Notification' in window) {
      const send = () => new Notification('📅 Nhắc lịch học', {
        body: 'Hôm nay Chủ Nhật — hãy lên lịch cho tuần tới để học viên chuẩn bị!',
        icon: 'icons/icon-192.png'
      });
      if (Notification.permission === 'granted') { send(); }
      else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(p => { if (p === 'granted') send(); });
      }
    }
  }
  // Chạy ngay khi load và mỗi 30 phút
  doSundayReminder();
  setInterval(doSundayReminder, 30 * 60 * 1000);
})();


// ============================================================
// FILE MANAGER
// ============================================================
let _fmFolders = [];
let _fmFiles   = [];
let _fmCurrentFolder = null; // null = root
let _fmView    = 'grid';     // 'grid' | 'list'
let _fmShowTrash = false;
let _fmUploadFiles = [];     // files pending upload

// ── Helpers ─────────────────────────────────────────────────
function _fmFileIcon(type) {
  const map = { pdf:'📄', doc:'📝', image:'🖼️', video:'🎬', zip:'🗜️', xls:'📊', ppt:'📊', link:'🔗' };
  return map[type] || '📎';
}
function _fmFormatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1048576).toFixed(1) + ' MB';
}
function _fmFileType(name) {
  const ext = (name||'').split('.').pop().toLowerCase();
  if (['pdf'].includes(ext)) return 'pdf';
  if (['doc','docx'].includes(ext)) return 'doc';
  if (['xls','xlsx'].includes(ext)) return 'xls';
  if (['ppt','pptx'].includes(ext)) return 'ppt';
  if (['png','jpg','jpeg','gif','webp','svg'].includes(ext)) return 'image';
  if (['mp4','webm','mov','avi'].includes(ext)) return 'video';
  if (['zip','rar','7z'].includes(ext)) return 'zip';
  return 'other';
}
function _fmBreadcrumb() {
  const bc = document.getElementById('fileBreadcrumb');
  if (!bc) return;
  const parts = [];
  // Build path from root to current
  const buildPath = (folderId) => {
    if (!folderId) return;
    const f = _fmFolders.find(x => x.id == folderId);
    if (!f) return;
    buildPath(f.parent_id);
    parts.push(f);
  };
  buildPath(_fmCurrentFolder);
  bc.innerHTML = `<span style="cursor:pointer;color:var(--primary)" onclick="navigateFolder(null)">🏠 Tất cả</span>` +
    parts.map(f => ` <span style="color:var(--muted)">›</span> <span style="cursor:pointer;color:var(--primary)" onclick="navigateFolder(${f.id})">${f.icon||'📁'} ${f.name}</span>`).join('');
}

// ── Init ────────────────────────────────────────────────────
async function initFileManager() {
  await loadFileManagerData();
  _populateFolderSelects();
  _populateTagFilter();
  _fmBreadcrumb();
  renderFileManager();
  // Setup icon/color pickers
  _initFolderPickers();
}

async function loadFileManagerData() {
  const [folderRes, fileRes] = await Promise.all([
    db.from('file_folders').select('*').order('sort_order').order('name'),
    db.from('file_items').select('*').order('is_pinned', {ascending:false}).order('created_at', {ascending:false})
  ]);
  _fmFolders = folderRes.data || [];
  _fmFiles   = fileRes.data  || [];
}

function _populateFolderSelects() {
  const folderOpts = '<option value="">📁 Không có thư mục</option>' +
    _fmFolders.map(f => `<option value="${f.id}">${f.icon||'📁'} ${f.name}</option>`).join('');
  ['uploadFolder','editFileFolder'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { const cur = el.value; el.innerHTML = folderOpts; el.value = cur; }
  });
  // Thêm class options vào các select lớp
  getClasses().then(classes => {
    const classOpts = '<option value="">🌐 Tất cả học sinh</option><option value="private">🔒 Chỉ admin</option>' +
      classes.map(c => `<option value="${c}">${c}</option>`).join('');
    ['folderClass','uploadClass','editFileClass'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { const cur = el.value; el.innerHTML = classOpts; el.value = cur; }
    });
  });
}

function _populateTagFilter() {
  const allTags = new Set();
  _fmFiles.forEach(f => (f.tags||'').split(',').map(t=>t.trim()).filter(Boolean).forEach(t => allTags.add(t)));
  const sel = document.getElementById('fileTagFilter');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">🏷 Tất cả tag</option>' + [...allTags].sort().map(t => `<option value="${t}">${t}</option>`).join('');
  sel.value = cur;
}

function _initFolderPickers() {
  // Icon picker
  const picker = document.getElementById('folderIconPicker');
  if (picker) {
    picker.querySelectorAll('span').forEach(span => {
      span.style.cssText = 'cursor:pointer;font-size:1.5rem;padding:.2rem .3rem;border-radius:8px;transition:background .15s';
      span.addEventListener('click', () => {
        picker.querySelectorAll('span').forEach(s => s.style.background = '');
        span.style.background = 'var(--primary-light)';
        document.getElementById('folderIcon').value = span.textContent;
      });
    });
  }
  // Color picker
  const cpicker = document.getElementById('folderColorPicker');
  if (cpicker) {
    cpicker.querySelectorAll('span').forEach(span => {
      span.addEventListener('click', () => {
        cpicker.querySelectorAll('span').forEach(s => s.style.borderColor = 'transparent');
        span.style.borderColor = '#fff';
        document.getElementById('folderColor').value = span.dataset.color;
      });
    });
    // Set default
    const first = cpicker.querySelector('[data-color="#6366f1"]');
    if (first) first.style.borderColor = '#fff';
  }
}

// ── Render ───────────────────────────────────────────────────
function setFileView(v) {
  _fmView = v;
  document.getElementById('fileViewGrid').style.background = v === 'grid' ? 'var(--primary)' : 'var(--bg)';
  document.getElementById('fileViewGrid').style.color      = v === 'grid' ? '#fff' : 'var(--muted)';
  document.getElementById('fileViewList').style.background = v === 'list' ? 'var(--primary)' : 'var(--bg)';
  document.getElementById('fileViewList').style.color      = v === 'list' ? '#fff' : 'var(--muted)';
  renderFileManager();
}

function navigateFolder(folderId) {
  _fmCurrentFolder = folderId;
  _fmBreadcrumb();
  renderFileManager();
}

function toggleFileTrash() {
  _fmShowTrash = !_fmShowTrash;
  const btn = document.getElementById('fileTrashBtn');
  if (btn) btn.textContent = _fmShowTrash ? '← Quay lại' : '🗑 Thùng rác';
  renderFileManager();
}

function renderFileManager() {
  const el = document.getElementById('fileManagerContent');
  if (!el) return;
  const search  = (document.getElementById('fileSearch')?.value||'').toLowerCase();
  const tagFilter = document.getElementById('fileTagFilter')?.value || '';
  const sortBy  = document.getElementById('fileSortBy')?.value || 'name';

  if (_fmShowTrash) {
    _renderTrashView(el);
    return;
  }

  // Thư mục con ở root hoặc trong folder hiện tại
  const subFolders = _fmFolders.filter(f =>
    !f.parent_id ? !_fmCurrentFolder : String(f.parent_id) === String(_fmCurrentFolder)
  );

  // Files trong folder hiện tại
  let files = _fmFiles.filter(f => {
    if (f.deleted_at) return false;
    const inFolder = _fmCurrentFolder
      ? String(f.folder_id) === String(_fmCurrentFolder)
      : !f.folder_id;
    if (!inFolder) return false;
    if (search && !f.display_name.toLowerCase().includes(search) && !(f.tags||'').toLowerCase().includes(search)) return false;
    if (tagFilter && !(f.tags||'').split(',').map(t=>t.trim()).includes(tagFilter)) return false;
    return true;
  });

  // Sort files
  files = [...files].sort((a,b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    if (sortBy === 'name')      return a.display_name.localeCompare(b.display_name);
    if (sortBy === 'date')      return new Date(b.created_at) - new Date(a.created_at);
    if (sortBy === 'size')      return (b.file_size||0) - (a.file_size||0);
    if (sortBy === 'downloads') return (b.download_count||0) - (a.download_count||0);
    return 0;
  });

  // Stats bar
  const statsEl = document.getElementById('fileStatsBar');
  if (statsEl) {
    const totalSize = _fmFiles.filter(f=>!f.deleted_at).reduce((s,f)=>s+(f.file_size||0),0);
    const trashCount = _fmFiles.filter(f=>f.deleted_at).length;
    statsEl.innerHTML = [
      `<span style="background:var(--primary-light);color:var(--primary);border-radius:20px;padding:.2rem .7rem;font-size:.78rem;font-weight:700">${_fmFiles.filter(f=>!f.deleted_at).length} file</span>`,
      `<span style="background:#f0fdf4;color:#065f46;border-radius:20px;padding:.2rem .7rem;font-size:.78rem;font-weight:700">${_fmFolders.length} thư mục</span>`,
      totalSize ? `<span style="background:#fef3c7;color:#92400e;border-radius:20px;padding:.2rem .7rem;font-size:.78rem;font-weight:700">${_fmFormatSize(totalSize)}</span>` : '',
      trashCount ? `<span style="background:#fee2e2;color:#991b1b;border-radius:20px;padding:.2rem .7rem;font-size:.78rem;font-weight:700;cursor:pointer" onclick="toggleFileTrash()">🗑 ${trashCount} trong thùng rác</span>` : '',
    ].join('');
  }

  let html = '';

  // Thư mục
  if (subFolders.length) {
    html += `<div style="font-size:.78rem;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:.5rem">📁 Thư mục</div>`;
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(${_fmView==='grid'?'160px':'100%'},1fr));gap:.65rem;margin-bottom:1.25rem">`;
    subFolders.forEach(f => {
      const fileCount = _fmFiles.filter(x => String(x.folder_id) === String(f.id) && !x.deleted_at).length;
      html += `<div class="content-item" style="background:var(--card);border:1.5px solid var(--border);border-radius:14px;padding:.85rem 1rem;cursor:pointer;transition:all .18s;position:relative"
          onclick="navigateFolder(${f.id})"
          onmouseover="this.style.borderColor='${f.color||'#6366f1'}';this.style.boxShadow='0 4px 16px rgba(0,0,0,.1)'"
          onmouseout="this.style.borderColor='var(--border)';this.style.boxShadow=''">
        <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.35rem">
          <span style="font-size:1.6rem">${f.icon||'📁'}</span>
          ${f.is_pinned ? '<span style="font-size:.65rem;background:#fef3c7;color:#92400e;border-radius:4px;padding:.1rem .35rem;font-weight:800">📌</span>' : ''}
          ${f.class_name === 'private' ? '<span style="font-size:.65rem;background:#fee2e2;color:#991b1b;border-radius:4px;padding:.1rem .35rem;font-weight:800">🔒</span>' : ''}
        </div>
        <div style="font-weight:800;font-size:.88rem;color:var(--text);margin-bottom:.2rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</div>
        <div style="font-size:.75rem;color:var(--muted)">${fileCount} file</div>
        <div style="position:absolute;top:.5rem;right:.5rem;display:flex;gap:.2rem">
          <button onclick="event.stopPropagation();openFolderModal(${f.id})" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:.85rem;padding:.15rem .3rem;border-radius:5px" title="Sửa">✏️</button>
          <button onclick="event.stopPropagation();pinFolder(${f.id},${!f.is_pinned})" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:.85rem;padding:.15rem .3rem;border-radius:5px" title="${f.is_pinned?'Bỏ ghim':'Ghim'}">${f.is_pinned?'📌':'📍'}</button>
          <button onclick="event.stopPropagation();deleteFolder(${f.id},'${f.name.replace(/'/g,"&#39;")}')" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:.85rem;padding:.15rem .3rem;border-radius:5px" title="Xóa">🗑</button>
        </div>
      </div>`;
    });
    html += '</div>';
  }

  // Files
  if (files.length) {
    html += `<div style="font-size:.78rem;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:.5rem">📎 Tài liệu</div>`;
    if (_fmView === 'grid') {
      html += `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:.65rem">`;
      files.forEach(f => { html += _renderFileCard(f); });
      html += '</div>';
    } else {
      html += `<div style="background:var(--card);border:1.5px solid var(--border);border-radius:14px;overflow:hidden">`;
      files.forEach((f,i) => { html += _renderFileRow(f,i); });
      html += '</div>';
    }
  }

  if (!subFolders.length && !files.length) {
    html = `<div class="empty-state"><div style="font-size:3rem;margin-bottom:.75rem">📭</div><p>${search?'Không tìm thấy kết quả.':'Thư mục trống. Tạo thư mục hoặc tải file lên.'}</p></div>`;
  }

  el.innerHTML = html;
}

function _renderFileCard(f) {
  const icon  = _fmFileIcon(f.file_type);
  const size  = _fmFormatSize(f.file_size);
  const tags  = (f.tags||'').split(',').map(t=>t.trim()).filter(Boolean);
  const isPrivate = f.class_name === 'private';
  return `<div style="background:var(--card);border:1.5px solid var(--border);border-radius:14px;padding:.9rem;transition:all .18s;position:relative"
      onmouseover="this.style.boxShadow='0 4px 20px rgba(99,102,241,.12)';this.style.borderColor='var(--primary)'"
      onmouseout="this.style.boxShadow='';this.style.borderColor='var(--border)'">
    ${f.is_pinned ? '<div style="position:absolute;top:.4rem;left:.5rem;font-size:.7rem">📌</div>' : ''}
    ${isPrivate ? '<div style="position:absolute;top:.4rem;right:.5rem;font-size:.7rem">🔒</div>' : ''}
    <div style="font-size:2.2rem;margin-bottom:.5rem;text-align:center">${icon}</div>
    <div style="font-weight:700;font-size:.83rem;text-align:center;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.4;margin-bottom:.35rem">${f.display_name}</div>
    <div style="text-align:center;font-size:.72rem;color:var(--muted);margin-bottom:.4rem">${size}${size&&f.download_count?' · ':''} ${f.download_count?f.download_count+' lượt tải':''}</div>
    ${tags.length ? `<div style="display:flex;flex-wrap:wrap;gap:.2rem;justify-content:center;margin-bottom:.4rem">${tags.slice(0,2).map(t=>`<span style="background:var(--primary-light);color:var(--primary);border-radius:20px;padding:.08rem .45rem;font-size:.65rem;font-weight:700">${t}</span>`).join('')}</div>` : ''}
    <div style="display:flex;gap:.2rem;justify-content:center;margin-top:.4rem">
      <button onclick="downloadFile(${f.id},'${f.file_url.replace(/'/g,"\\'")}')" style="flex:1;background:var(--primary);border:none;color:#fff;border-radius:7px;padding:.3rem;font-size:.75rem;font-weight:700;cursor:pointer">⬇ Tải</button>
      <button onclick="openEditFileModal(${f.id})" style="background:var(--bg);border:1.5px solid var(--border);border-radius:7px;padding:.3rem .5rem;font-size:.8rem;cursor:pointer" title="Sửa">✏️</button>
      <button onclick="openShareModal(${f.id},'${f.file_url.replace(/'/g,"\\'")}')" style="background:var(--bg);border:1.5px solid var(--border);border-radius:7px;padding:.3rem .5rem;font-size:.8rem;cursor:pointer" title="Chia sẻ">🔗</button>
      <button onclick="openFileHistory(${f.id},'${f.display_name.replace(/'/g,"&#39;")}')" style="background:var(--bg);border:1.5px solid var(--border);border-radius:7px;padding:.3rem .5rem;font-size:.8rem;cursor:pointer" title="Lịch sử">📊</button>
      <button onclick="softDeleteFile(${f.id})" style="background:#fee2e2;border:none;border-radius:7px;padding:.3rem .5rem;font-size:.8rem;cursor:pointer;color:#ef4444" title="Xóa">🗑</button>
    </div>
  </div>`;
}

function _renderFileRow(f,i) {
  const icon = _fmFileIcon(f.file_type);
  const size = _fmFormatSize(f.file_size);
  const tags = (f.tags||'').split(',').map(t=>t.trim()).filter(Boolean);
  return `<div style="display:flex;align-items:center;gap:.85rem;padding:.6rem 1rem;${i?'border-top:1px solid var(--border)':''}">
    <span style="font-size:1.4rem;flex-shrink:0">${icon}</span>
    <div style="flex:1;min-width:0">
      <div style="font-weight:700;font-size:.87rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.is_pinned?'📌 ':''} ${f.display_name}</div>
      <div style="font-size:.73rem;color:var(--muted)">${size}${size?' · ':''}${new Date(f.created_at).toLocaleDateString('vi-VN')}</div>
    </div>
    ${tags.length ? `<div style="display:flex;gap:.2rem;flex-wrap:wrap">${tags.slice(0,2).map(t=>`<span style="background:var(--primary-light);color:var(--primary);border-radius:20px;padding:.08rem .45rem;font-size:.68rem;font-weight:700">${t}</span>`).join('')}</div>` : ''}
    <span style="font-size:.75rem;color:var(--muted);white-space:nowrap">${f.download_count||0} tải</span>
    <div style="display:flex;gap:.25rem;flex-shrink:0">
      <button onclick="downloadFile(${f.id},'${f.file_url.replace(/'/g,"\\'")}')" style="background:var(--primary);border:none;color:#fff;border-radius:7px;padding:.28rem .6rem;font-size:.75rem;font-weight:700;cursor:pointer">⬇</button>
      <button onclick="openEditFileModal(${f.id})" style="background:var(--bg);border:1.5px solid var(--border);border-radius:7px;padding:.28rem .5rem;font-size:.8rem;cursor:pointer">✏️</button>
      <button onclick="openShareModal(${f.id},'${f.file_url.replace(/'/g,"\\'")}')" style="background:var(--bg);border:1.5px solid var(--border);border-radius:7px;padding:.28rem .5rem;font-size:.8rem;cursor:pointer">🔗</button>
      <button onclick="softDeleteFile(${f.id})" style="background:#fee2e2;border:none;border-radius:7px;padding:.28rem .5rem;font-size:.8rem;cursor:pointer;color:#ef4444">🗑</button>
    </div>
  </div>`;
}

function _renderTrashView(el) {
  const trashed = _fmFiles.filter(f => f.deleted_at);
  if (!trashed.length) {
    el.innerHTML = `<div class="empty-state"><div style="font-size:3rem;margin-bottom:.75rem">🗑</div><p>Thùng rác trống.</p></div>`;
    return;
  }
  el.innerHTML = `
    <div style="background:#fef2f2;border:1.5px solid #fecaca;border-radius:12px;padding:.75rem 1rem;margin-bottom:1rem;font-size:.84rem;color:#991b1b;font-weight:600;display:flex;align-items:center;justify-content:space-between">
      <span>🗑 ${trashed.length} file trong thùng rác</span>
      <button onclick="emptyFileTrash()" style="background:#ef4444;color:#fff;border:none;border-radius:8px;padding:.35rem .75rem;font-size:.8rem;font-weight:700;cursor:pointer">Xóa tất cả vĩnh viễn</button>
    </div>
    <div style="background:var(--card);border:1.5px solid var(--border);border-radius:14px;overflow:hidden">
      ${trashed.map((f,i) => `
        <div style="display:flex;align-items:center;gap:.85rem;padding:.6rem 1rem;${i?'border-top:1px solid var(--border)':''}">
          <span style="font-size:1.4rem">${_fmFileIcon(f.file_type)}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:.87rem">${f.display_name}</div>
            <div style="font-size:.73rem;color:var(--muted)">Xóa lúc: ${new Date(f.deleted_at).toLocaleString('vi-VN')}</div>
          </div>
          <button onclick="restoreFile(${f.id})" style="background:#10b981;border:none;color:#fff;border-radius:8px;padding:.3rem .7rem;font-size:.78rem;font-weight:700;cursor:pointer">♻️ Khôi phục</button>
          <button onclick="permanentDeleteFile(${f.id},'${f.display_name.replace(/'/g,"&#39;")}')" style="background:#ef4444;border:none;color:#fff;border-radius:8px;padding:.3rem .7rem;font-size:.78rem;font-weight:700;cursor:pointer">🗑 Xóa vĩnh viễn</button>
        </div>`).join('')}
    </div>`;
}

// ── Folder actions ───────────────────────────────────────────
function openFolderModal(folderId = null) {
  const modal = document.getElementById('folderModal');
  document.getElementById('folderError').textContent = '';
  if (folderId) {
    const f = _fmFolders.find(x => x.id == folderId);
    if (!f) return;
    document.getElementById('folderEditId').value = folderId;
    document.getElementById('folderName').value   = f.name;
    document.getElementById('folderIcon').value   = f.icon || '📁';
    document.getElementById('folderColor').value  = f.color || '#6366f1';
    document.getElementById('folderClass').value  = f.class_name || '';
    document.getElementById('folderModalTitle').textContent = '✏️ Sửa thư mục';
    // Highlight selected icon/color
    document.querySelectorAll('#folderIconPicker span').forEach(s => {
      s.style.background = s.textContent === f.icon ? 'var(--primary-light)' : '';
    });
    document.querySelectorAll('#folderColorPicker span').forEach(s => {
      s.style.borderColor = s.dataset.color === f.color ? '#fff' : 'transparent';
    });
  } else {
    document.getElementById('folderEditId').value = '';
    document.getElementById('folderName').value   = '';
    document.getElementById('folderIcon').value   = '📁';
    document.getElementById('folderColor').value  = '#6366f1';
    document.getElementById('folderClass').value  = '';
    document.getElementById('folderModalTitle').textContent = '📁 Tạo thư mục';
    document.querySelectorAll('#folderIconPicker span').forEach(s => s.style.background = '');
    document.querySelectorAll('#folderColorPicker span').forEach(s => s.style.borderColor = s.dataset.color === '#6366f1' ? '#fff' : 'transparent');
  }
  modal.classList.add('open');
}

async function saveFolder() {
  const name  = document.getElementById('folderName').value.trim();
  const icon  = document.getElementById('folderIcon').value || '📁';
  const color = document.getElementById('folderColor').value || '#6366f1';
  const cls   = document.getElementById('folderClass').value || null;
  const editId = document.getElementById('folderEditId').value;
  const errEl  = document.getElementById('folderError');
  errEl.textContent = '';
  if (!name) { errEl.textContent = 'Vui lòng nhập tên thư mục.'; return; }

  const payload = { name, icon, color, class_name: cls, parent_id: _fmCurrentFolder || null };
  let error;
  if (editId) {
    ({ error } = await db.from('file_folders').update(payload).eq('id', editId));
  } else {
    ({ error } = await db.from('file_folders').insert({ ...payload, created_by: sessionStorage.getItem('dh_name') }));
  }
  if (error) { errEl.textContent = error.message; return; }
  document.getElementById('folderModal').classList.remove('open');
  await loadFileManagerData();
  renderFileManager();
  logActivity('Thư mục', editId ? 'Sửa thư mục' : 'Tạo thư mục', name, cls||'');
  showToast(editId ? '✅ Đã cập nhật thư mục' : '📁 Đã tạo thư mục');
}

async function deleteFolder(id, name) {
  showConfirm(`Xóa thư mục "${name}"?\nFile bên trong sẽ bị chuyển về root (không bị xóa).`, async () => {
    // Chuyển file về root
    await db.from('file_items').update({ folder_id: null }).eq('folder_id', id);
    await db.from('file_folders').delete().eq('id', id);
    logActivity('Thư mục', 'Xóa thư mục', name);
    await loadFileManagerData();
    renderFileManager();
    showToast('🗑 Đã xóa thư mục');
  });
}

async function pinFolder(id, pin) {
  await db.from('file_folders').update({ is_pinned: pin }).eq('id', id);
  await loadFileManagerData();
  renderFileManager();
}

// ── Upload actions ───────────────────────────────────────────
function openUploadModal() {
  _fmUploadFiles = [];
  document.getElementById('uploadFileList').innerHTML = '';
  document.getElementById('uploadDisplayName').value = '';
  document.getElementById('uploadLinkUrl').value = '';
  document.getElementById('uploadTags').value = '';
  document.getElementById('uploadClass').value = '';
  document.getElementById('uploadFolder').value = _fmCurrentFolder || '';
  document.getElementById('uploadError').textContent = '';
  document.getElementById('uploadProgress').style.display = 'none';
  document.getElementById('uploadModal').classList.add('open');
  _populateFolderSelects();
}

function closeUploadModal() {
  document.getElementById('uploadModal').classList.remove('open');
  _fmUploadFiles = [];
}

function handleFileDrop(e) {
  e.preventDefault();
  const zone = document.getElementById('dropZone');
  zone.style.borderColor = 'var(--border)';
  zone.style.background = '';
  handleFileSelect(e.dataTransfer.files);
}

function handleFileSelect(files) {
  if (!files || !files.length) return;
  _fmUploadFiles = [...files];
  const list = document.getElementById('uploadFileList');
  list.innerHTML = _fmUploadFiles.map((f,i) => `
    <div style="display:flex;align-items:center;gap:.6rem;background:var(--bg);border-radius:8px;padding:.45rem .75rem">
      <span>${_fmFileIcon(_fmFileType(f.name))}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:.83rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.name}</div>
        <div style="font-size:.72rem;color:var(--muted)">${_fmFormatSize(f.size)}</div>
      </div>
      <button onclick="_fmUploadFiles.splice(${i},1);handleFileSelect(new DataTransfer().files)" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:.9rem">✕</button>
    </div>`).join('');
  // Auto fill display name nếu chỉ 1 file
  if (_fmUploadFiles.length === 1) {
    const nameNoExt = _fmUploadFiles[0].name.replace(/\.[^/.]+$/, '');
    document.getElementById('uploadDisplayName').value = nameNoExt;
  }
}

async function doUpload() {
  const linkUrl     = document.getElementById('uploadLinkUrl').value.trim();
  const displayName = document.getElementById('uploadDisplayName').value.trim();
  const folderId    = document.getElementById('uploadFolder').value || null;
  const tags        = document.getElementById('uploadTags').value.trim() || null;
  const cls         = document.getElementById('uploadClass').value || null;
  const errEl       = document.getElementById('uploadError');
  const progWrap    = document.getElementById('uploadProgress');
  const progBar     = document.getElementById('uploadProgressBar');
  const progText    = document.getElementById('uploadProgressText');
  errEl.textContent = '';

  // Upload link ngoài
  if (linkUrl && !_fmUploadFiles.length) {
    if (!displayName) { errEl.textContent = 'Vui lòng nhập tên hiển thị cho link.'; return; }
    const { error } = await db.from('file_items').insert({
      display_name: displayName, file_name: linkUrl,
      file_url: linkUrl, file_type: 'link', folder_id: folderId,
      class_name: cls, tags, created_by: sessionStorage.getItem('dh_name')
    });
    if (error) { errEl.textContent = error.message; return; }
    closeUploadModal();
    await loadFileManagerData();
    _populateTagFilter();
    renderFileManager();
    logActivity('File', 'Thêm link tài liệu', displayName, cls||'');
    showToast('🔗 Đã thêm link tài liệu');
    return;
  }

  if (!_fmUploadFiles.length) { errEl.textContent = 'Vui lòng chọn file hoặc nhập link.'; return; }

  // Upload files lên Supabase Storage
  progWrap.style.display = 'block';
  const total = _fmUploadFiles.length;
  let done = 0;

  for (const file of _fmUploadFiles) {
    const safeName = `${Date.now()}_${file.name.replace(/\s+/g,'_')}`;
    const { data: upData, error: upErr } = await db.storage.from('files').upload(safeName, file, { upsert: false });
    if (upErr) { errEl.textContent = `Lỗi tải ${file.name}: ${upErr.message}`; continue; }
    const { data: urlData } = db.storage.from('files').getPublicUrl(safeName);
    const name = total === 1 && displayName ? displayName : file.name.replace(/\.[^/.]+$/, '');
    await db.from('file_items').insert({
      display_name: name, file_name: file.name,
      file_url: urlData.publicUrl, file_type: _fmFileType(file.name),
      file_size: file.size, folder_id: folderId,
      class_name: cls, tags, created_by: sessionStorage.getItem('dh_name')
    });
    done++;
    const pct = Math.round(done / total * 100);
    progBar.style.width = pct + '%';
    progText.textContent = `Đã tải ${done}/${total} file...`;
  }

  closeUploadModal();
  await loadFileManagerData();
  _populateTagFilter();
  renderFileManager();
  logActivity('File', `Tải lên ${done} file`, displayName || `${done} file`, cls||'');
  showToast(`✅ Đã tải lên ${done} file thành công`);
}

// ── File actions ─────────────────────────────────────────────
async function downloadFile(fileId, url) {
  // Tăng download count
  await db.from('file_items').update({ download_count: db.rpc ? undefined : undefined }).eq('id', fileId);
  // Dùng rpc nếu có, fallback update thủ công
  const f = _fmFiles.find(x => x.id == fileId);
  if (f) {
    await db.from('file_items').update({ download_count: (f.download_count||0) + 1 }).eq('id', fileId);
    // Ghi log
    await db.from('file_downloads').insert({
      file_id: fileId, username: sessionStorage.getItem('dh_user') || 'admin',
      student_name: sessionStorage.getItem('dh_name') || 'Admin'
    });
    f.download_count = (f.download_count||0) + 1;
  }
  window.open(url, '_blank');
}

function openEditFileModal(fileId) {
  const f = _fmFiles.find(x => x.id == fileId);
  if (!f) return;
  document.getElementById('editFileId').value       = fileId;
  document.getElementById('editFileName').value     = f.display_name;
  document.getElementById('editFileTags').value     = f.tags || '';
  document.getElementById('editFileClass').value    = f.class_name || '';
  document.getElementById('editFileError').textContent = '';
  _populateFolderSelects();
  setTimeout(() => { document.getElementById('editFileFolder').value = f.folder_id || ''; }, 100);
  document.getElementById('editFileModal').classList.add('open');
}

async function saveFileEdit() {
  const id      = document.getElementById('editFileId').value;
  const name    = document.getElementById('editFileName').value.trim();
  const folder  = document.getElementById('editFileFolder').value || null;
  const tags    = document.getElementById('editFileTags').value.trim() || null;
  const cls     = document.getElementById('editFileClass').value || null;
  const errEl   = document.getElementById('editFileError');
  if (!name) { errEl.textContent = 'Vui lòng nhập tên hiển thị.'; return; }
  const { error } = await db.from('file_items').update({ display_name: name, folder_id: folder, tags, class_name: cls }).eq('id', id);
  if (error) { errEl.textContent = error.message; return; }
  document.getElementById('editFileModal').classList.remove('open');
  await loadFileManagerData();
  _populateTagFilter();
  renderFileManager();
  logActivity('File', 'Sửa thông tin file', name, cls||'');
  showToast('✅ Đã cập nhật thông tin file');
}

async function softDeleteFile(fileId) {
  const f = _fmFiles.find(x => x.id == fileId);
  await db.from('file_items').update({ deleted_at: new Date().toISOString() }).eq('id', fileId);
  await loadFileManagerData();
  renderFileManager();
  logActivity('File', 'Xóa file (thùng rác)', f?.display_name||String(fileId));
  showToast('🗑 Đã chuyển vào thùng rác');
}

async function restoreFile(fileId) {
  const f = _fmFiles.find(x => x.id == fileId);
  await db.from('file_items').update({ deleted_at: null }).eq('id', fileId);
  await loadFileManagerData();
  renderFileManager();
  logActivity('File', 'Khôi phục file', f?.display_name||String(fileId));
  showToast('♻️ Đã khôi phục file');
}

async function permanentDeleteFile(fileId, name) {
  showConfirm(`Xóa vĩnh viễn "${name}"?\nHành động này không thể hoàn tác.`, async () => {
    const f = _fmFiles.find(x => x.id == fileId);
    // Xóa file trên Storage nếu có
    if (f && f.file_url && f.file_url.includes('supabase') && f.file_type !== 'link') {
      const path = f.file_url.split('/files/')[1];
      if (path) await db.storage.from('files').remove([path]);
    }
    await db.from('file_items').delete().eq('id', fileId);
    await loadFileManagerData();
    renderFileManager();
    logActivity('File', 'Xóa vĩnh viễn file', name);
    showToast('🗑 Đã xóa vĩnh viễn');
  });
}

async function emptyFileTrash() {
  showConfirm('Xóa toàn bộ file trong thùng rác?\nHành động này không thể hoàn tác.', async () => {
    const trashed = _fmFiles.filter(f => f.deleted_at);
    for (const f of trashed) {
      if (f.file_url && f.file_url.includes('supabase') && f.file_type !== 'link') {
        const path = f.file_url.split('/files/')[1];
        if (path) await db.storage.from('files').remove([path]);
      }
    }
    const ids = trashed.map(f => f.id);
    if (ids.length) await db.from('file_items').delete().in('id', ids);
    await loadFileManagerData();
    renderFileManager();
    logActivity('File', `Dọn thùng rác (${ids.length} file)`, '');
    showToast('🗑 Đã dọn sạch thùng rác');
  });
}

// ── Share & History ──────────────────────────────────────────
function openShareModal(fileId, url) {
  document.getElementById('shareFileId').value = fileId;
  document.getElementById('shareLinkBox').textContent = url;
  document.getElementById('shareFileModal').classList.add('open');
}

function copyShareLink() {
  const link = document.getElementById('shareLinkBox').textContent;
  navigator.clipboard.writeText(link).then(() => showToast('📋 Đã sao chép link'));
}

async function openFileHistory(fileId, fileName) {
  document.getElementById('fileHistoryTitle').textContent = `📊 Lịch sử tải: ${fileName}`;
  document.getElementById('fileHistoryContent').innerHTML = '<div style="text-align:center;padding:1rem;color:var(--muted)">Đang tải...</div>';
  document.getElementById('fileHistoryModal').classList.add('open');
  const { data } = await db.from('file_downloads').select('*').eq('file_id', fileId).order('downloaded_at', {ascending:false}).limit(50);
  if (!data || !data.length) {
    document.getElementById('fileHistoryContent').innerHTML = '<div style="text-align:center;padding:1rem;color:var(--muted)">Chưa có lượt tải nào.</div>';
    return;
  }
  document.getElementById('fileHistoryContent').innerHTML = `
    <div style="font-size:.82rem;color:var(--muted);margin-bottom:.75rem">${data.length} lượt tải gần nhất</div>
    <div style="display:flex;flex-direction:column;gap:.35rem;max-height:320px;overflow-y:auto">
      ${data.map(d => `
        <div style="display:flex;align-items:center;gap:.65rem;padding:.45rem .75rem;background:var(--bg);border-radius:8px">
          <span style="font-size:1rem">👤</span>
          <div style="flex:1">
            <div style="font-size:.85rem;font-weight:600">${d.student_name || d.username}</div>
            <div style="font-size:.73rem;color:var(--muted)">${new Date(d.downloaded_at).toLocaleString('vi-VN')}</div>
          </div>
          ${d.class_name ? `<span style="font-size:.72rem;background:var(--primary-light);color:var(--primary);border-radius:6px;padding:.1rem .4rem;font-weight:700">${d.class_name}</span>` : ''}
        </div>`).join('')}
    </div>`;
}

// Realtime cho file manager
db.channel('realtime-files')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'file_items' }, async () => {
    if (document.getElementById('pageFiles')?.classList.contains('active')) {
      await loadFileManagerData();
      renderFileManager();
    }
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'file_folders' }, async () => {
    if (document.getElementById('pageFiles')?.classList.contains('active')) {
      await loadFileManagerData();
      renderFileManager();
    }
  })
  .subscribe();


// ============================================================
// ĐỒNG BỘ GMAIL → LỚP PHỤ
// ============================================================
let _gmailSyncEmails = [];  // danh sách gmail từ file
let _gmailSyncResult = [];  // kết quả phân tích: { student, class }

async function openGmailSyncModal() {
  // Reset
  _gmailSyncEmails = [];
  _gmailSyncResult = [];
  document.getElementById('gmailSyncClass').value = '';
  document.getElementById('gmailFileInfo').style.display = 'none';
  document.getElementById('gmailSyncError').textContent = '';
  document.getElementById('gmailAnalyzeBtn').disabled = true;
  document.getElementById('gmailFileInput').value = '';
  // Reset textarea paste
  const pasteBox = document.getElementById('gmailPasteBox');
  if (pasteBox) pasteBox.value = '';
  const pasteInfo = document.getElementById('gmailPasteInfo');
  if (pasteInfo) pasteInfo.textContent = '';
  document.getElementById('gmailSyncStep1').style.display = 'block';
  document.getElementById('gmailSyncStep2').style.display = 'none';

  // Populate class select
  const classes = await getClasses();
  const sel = document.getElementById('gmailSyncClass');
  sel.innerHTML = '<option value="">-- Chọn lớp --</option>' +
    classes.map(c => `<option value="${c}">${c}</option>`).join('');

  document.getElementById('gmailSyncModal').classList.add('open');
}

function handleGmailDrop(e) {
  e.preventDefault();
  document.getElementById('gmailDropZone').style.borderColor = 'var(--border)';
  const file = e.dataTransfer.files[0];
  if (file) parseGmailFile(file);
}

// Parse từ textarea paste
function parseGmailPaste(text) {
  const pasteInfo = document.getElementById('gmailPasteInfo');
  if (!text || !text.trim()) {
    pasteInfo.textContent = '';
    // Nếu không có paste text, vẫn giữ emails từ file nếu có
    if (!_gmailSyncEmails.length || document.getElementById('gmailFileInfo').style.display === 'none') {
      document.getElementById('gmailAnalyzeBtn').disabled = !document.getElementById('gmailSyncClass').value;
    }
    return;
  }
  // Tách gmail bằng mọi loại separator
  const raw = text.replace(/[\n\r\t,;|]/g, ' ').split(' ');
  const emails = [...new Set(
    raw.map(s => s.trim().toLowerCase().replace(/['"<>]/g,''))
       .filter(s => /^[^\s@]+@gmail\.com$/.test(s))
  )];
  if (emails.length) {
    _gmailSyncEmails = emails;
    pasteInfo.innerHTML = `✅ Nhận được <b>${emails.length}</b> Gmail hợp lệ`;
    pasteInfo.style.color = '#065f46';
    document.getElementById('gmailAnalyzeBtn').disabled = !document.getElementById('gmailSyncClass').value;
    // Reset file info vì đang dùng paste
    document.getElementById('gmailFileInfo').style.display = 'none';
  } else {
    pasteInfo.innerHTML = '⚠️ Không tìm thấy Gmail hợp lệ trong nội dung dán';
    pasteInfo.style.color = '#92400e';
  }
}

async function parseGmailFile(file) {
  if (!file) return;
  const errEl = document.getElementById('gmailSyncError');
  errEl.textContent = '';

  try {
    let emails = [];
    const name = file.name.toLowerCase();

    if (name.endsWith('.csv')) {
      // Parse CSV
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      // Tìm cột nào chứa gmail
      lines.forEach(line => {
        const cols = line.split(/[,;\t]/);
        cols.forEach(col => {
          const val = col.trim().replace(/['"]/g, '').toLowerCase();
          if (val.includes('@gmail.com')) emails.push(val);
        });
      });
    } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      // Parse Excel với SheetJS
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      data.forEach(row => {
        row.forEach(cell => {
          const val = String(cell||'').trim().toLowerCase();
          if (val.includes('@gmail.com')) emails.push(val);
        });
      });
    } else {
      errEl.textContent = 'Chỉ hỗ trợ file .xlsx, .xls hoặc .csv';
      return;
    }

    // Loại trùng
    emails = [...new Set(emails.map(e => e.trim()).filter(e => /^[^\s@]+@gmail\.com$/.test(e)))];

    if (!emails.length) {
      errEl.textContent = 'Không tìm thấy địa chỉ Gmail nào trong file. Hãy kiểm tra lại định dạng file.';
      return;
    }

    _gmailSyncEmails = emails;
    document.getElementById('gmailFileInfo').style.display = 'block';
    document.getElementById('gmailFileInfo').innerHTML =
      `✅ Đã đọc <b>${emails.length}</b> Gmail từ file <b>${file.name}</b>`;
    document.getElementById('gmailDropZone').innerHTML =
      `<div style="font-size:1.5rem;margin-bottom:.25rem">✅</div><div style="font-weight:700;color:#065f46">${file.name}</div><div style="font-size:.78rem;color:var(--muted)">${emails.length} Gmail được tìm thấy</div>`;
    document.getElementById('gmailDropZone').style.borderColor = '#10b981';
    document.getElementById('gmailDropZone').style.background = '#f0fdf4';

    // Enable nút phân tích nếu đã chọn lớp
    document.getElementById('gmailAnalyzeBtn').disabled = !document.getElementById('gmailSyncClass').value;

  } catch(e) {
    errEl.textContent = 'Lỗi đọc file: ' + e.message;
  }
}

// Khi chọn lớp → enable nút analyze
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('gmailSyncClass')?.addEventListener('change', () => {
    document.getElementById('gmailAnalyzeBtn').disabled =
      !document.getElementById('gmailSyncClass').value || !_gmailSyncEmails.length;
  });
});

async function analyzeGmailSync() {
  const cls   = document.getElementById('gmailSyncClass').value;
  const errEl = document.getElementById('gmailSyncError');
  errEl.textContent = '';
  if (!cls)   { errEl.textContent = 'Vui lòng chọn lớp.'; return; }
  if (!_gmailSyncEmails.length) { errEl.textContent = 'Vui lòng upload file danh sách Gmail.'; return; }

  document.getElementById('gmailAnalyzeBtn').textContent = '⏳ Đang phân tích...';
  document.getElementById('gmailAnalyzeBtn').disabled = true;

  try {
    // Lấy tất cả học sinh có gmail trong danh sách
    const batchSize = 50;
    let allStudents = [];
    for (let i = 0; i < _gmailSyncEmails.length; i += batchSize) {
      const batch = _gmailSyncEmails.slice(i, i + batchSize);
      const { data } = await db.from('students')
        .select('id, full_name, username, class_name')
        .in('username', batch);
      allStudents = allStudents.concat(data || []);
    }

    // Lấy student_classes để biết ai đã có lớp này
    const studentIds = allStudents.map(s => s.id);
    let existingClasses = [];
    if (studentIds.length) {
      const { data } = await db.from('student_classes')
        .select('student_id, class_name')
        .in('student_id', studentIds)
        .eq('class_name', cls);
      existingClasses = data || [];
    }
    const alreadyIds = new Set(existingClasses.map(x => x.student_id));

    // Phân loại
    const toAdd    = allStudents.filter(s => !alreadyIds.has(s.id)); // có tài khoản, chưa có lớp
    const alreadyHave = allStudents.filter(s => alreadyIds.has(s.id)); // đã có lớp này rồi
    const foundEmails = new Set(allStudents.map(s => s.username));
    const missing  = _gmailSyncEmails.filter(e => !foundEmails.has(e)); // gmail chưa có tài khoản

    _gmailSyncResult = toAdd;

    // Hiện kết quả
    document.getElementById('gmailSyncStep1').style.display = 'none';
    document.getElementById('gmailSyncStep2').style.display = 'block';

    // Stats
    document.getElementById('gmailSyncStats').innerHTML = [
      `<span style="background:#d1fae5;color:#065f46;border-radius:20px;padding:.2rem .7rem;font-size:.8rem;font-weight:800">✅ Cần thêm lớp: ${toAdd.length}</span>`,
      `<span style="background:#e0f2fe;color:#0369a1;border-radius:20px;padding:.2rem .7rem;font-size:.8rem;font-weight:800">ℹ️ Đã có lớp: ${alreadyHave.length}</span>`,
      `<span style="background:#fef3c7;color:#92400e;border-radius:20px;padding:.2rem .7rem;font-size:.8rem;font-weight:800">⚠️ Chưa có TK: ${missing.length}</span>`,
      `<span style="background:#eef2ff;color:#4338ca;border-radius:20px;padding:.2rem .7rem;font-size:.8rem;font-weight:800">Tổng Gmail: ${_gmailSyncEmails.length}</span>`,
    ].join('');

    // Danh sách cần thêm
    const addListEl = document.getElementById('gmailSyncAddList');
    if (toAdd.length) {
      addListEl.innerHTML = toAdd.map((s, i) => `
        <div style="display:flex;align-items:center;gap:.75rem;padding:.5rem .85rem;${i ? 'border-top:1px solid var(--border)' : ''}">
          <input type="checkbox" class="gmail-sync-check" data-id="${s.id}" data-name="${s.full_name}" checked
            style="width:16px;height:16px;accent-color:var(--primary);flex-shrink:0;cursor:pointer"/>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:.87rem">${s.full_name}</div>
            <div style="font-size:.73rem;color:var(--muted)">${s.username}</div>
          </div>
          <div style="font-size:.75rem;color:var(--muted)">${s.class_name || '—'}</div>
          <span style="background:#d1fae5;color:#065f46;border-radius:6px;padding:.1rem .5rem;font-size:.72rem;font-weight:700">+ ${cls}</span>
        </div>`).join('');
      // Thêm select all
      addListEl.insertAdjacentHTML('afterbegin', `
        <div style="display:flex;align-items:center;gap:.5rem;padding:.45rem .85rem;background:var(--primary-light);border-radius:10px 10px 0 0;border-bottom:1px solid var(--border)">
          <input type="checkbox" id="gmailSelectAll" checked onchange="document.querySelectorAll('.gmail-sync-check').forEach(cb=>cb.checked=this.checked)"
            style="width:15px;height:15px;accent-color:var(--primary);cursor:pointer"/>
          <label for="gmailSelectAll" style="font-size:.82rem;font-weight:700;cursor:pointer;color:var(--primary)">Chọn tất cả ${toAdd.length} học sinh</label>
        </div>`);
    } else {
      addListEl.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--muted);font-size:.88rem">Tất cả Gmail đã có lớp <b>' + cls + '</b> rồi.</div>';
      document.getElementById('gmailDoSyncBtn').disabled = true;
    }

    // Danh sách Gmail chưa có TK
    if (missing.length) {
      document.getElementById('gmailSyncMissingWrap').style.display = 'block';
      document.getElementById('gmailSyncMissingList').textContent = missing.join(', ');
    } else {
      document.getElementById('gmailSyncMissingWrap').style.display = 'none';
    }

    // Danh sách đã có
    if (alreadyHave.length) {
      document.getElementById('gmailSyncAlreadyWrap').style.display = 'block';
      document.getElementById('gmailSyncAlreadyList').textContent = alreadyHave.map(s => s.username).join(', ');
    } else {
      document.getElementById('gmailSyncAlreadyWrap').style.display = 'none';
    }

  } catch(e) {
    errEl.textContent = 'Lỗi phân tích: ' + e.message;
  } finally {
    document.getElementById('gmailAnalyzeBtn').textContent = '🔍 Phân tích danh sách';
    document.getElementById('gmailAnalyzeBtn').disabled = false;
  }
}

async function doGmailSync() {
  const cls    = document.getElementById('gmailSyncClass').value;
  const errEl  = document.getElementById('gmailSyncError2');
  const btn    = document.getElementById('gmailDoSyncBtn');
  errEl.textContent = '';

  // Lấy các checkbox được chọn
  const checked = [...document.querySelectorAll('.gmail-sync-check:checked')];
  if (!checked.length) { errEl.textContent = 'Không có học sinh nào được chọn.'; return; }

  btn.textContent = '⏳ Đang đồng bộ...';
  btn.disabled = true;

  let successCount = 0;
  let errorCount   = 0;
  const syncedUsernames = []; // username của những người được thêm thành công

  for (const cb of checked) {
    const studentId = parseInt(cb.dataset.id);
    const studentName = cb.dataset.name || '';
    try {
      // Kiểm tra trùng một lần nữa
      const { data: existing } = await db.from('student_classes')
        .select('id').eq('student_id', studentId).eq('class_name', cls).maybeSingle();
      if (existing) { successCount++; continue; }

      const { error } = await db.from('student_classes').insert({ student_id: studentId, class_name: cls });
      if (error) { errorCount++; console.warn('Sync error:', error.message); }
      else {
        successCount++;
        // Lấy username để gửi thông báo
        const s = _gmailSyncResult.find(x => x.id === studentId);
        if (s) syncedUsernames.push({ username: s.username, name: s.full_name });
      }
    } catch(e) { errorCount++; }
  }

  // Gửi thông báo tự động cho từng học sinh được thêm vào lớp
  if (syncedUsernames.length) {
    const adminName = sessionStorage.getItem('dh_name') || 'Giáo viên';
    const now = new Date();
    const dateStr = now.toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' });
    const timeStr = now.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' });

    // Gửi thông báo riêng cho từng học sinh (target_username)
    const notifRows = syncedUsernames.map(({ username }) => ({
      title: `🎉 Bạn đã được thêm vào lớp ${cls}`,
      content: `Xin chào!\n\nBạn vừa được thêm vào lớp "${cls}" vào lúc ${timeStr} ngày ${dateStr}.\n\nTừ bây giờ bạn có thể truy cập tài liệu, bài giảng và bài tập của lớp ${cls}.\n\nChúc bạn học tốt! 🚀`,
      class_name: null,
      target_username: username,
      pinned: false,
      expires_at: null
    }));

    // Insert từng batch 20 cái
    for (let i = 0; i < notifRows.length; i += 20) {
      await db.from('announcements').insert(notifRows.slice(i, i + 20));
    }

    // Gửi email thông báo thêm lớp (song song)
    syncedUsernames.forEach(({ username, name }) => {
      sendClassAddedEmail({ username, full_name: name }, cls).catch(() => {});
    });
  }

  btn.textContent = '✅ Đồng bộ tất cả';
  btn.disabled = false;

  document.getElementById('gmailSyncModal').classList.remove('open');
  await renderStudents();
  await populateClassFilters();

  if (errorCount) {
    showToast(`⚠️ Đồng bộ xong: ${successCount} thành công, ${errorCount} lỗi`, false);
  } else {
    showToast(`✅ Đã thêm lớp "${cls}" cho ${successCount} học sinh + gửi thông báo`);
  }
  logActivity('Học sinh', `Đồng bộ Gmail → Lớp ${cls}`, `${successCount} học sinh`, cls);
  logAccountActivity(`Đồng bộ Gmail → Lớp ${cls}`, { full_name: `${successCount} học sinh`, username: '', class_name: cls });
}


// ============================================================
// GỬI EMAIL TỰ ĐỘNG QUA EMAILJS
// ============================================================
// Cấu hình EmailJS — Thay bằng thông tin từ emailjs.com
const _EMAIL_CONFIG = {
  serviceId:             'service_wprta6m',   // ✅ Đã cấu hình
  templateId:            'template_lg0qcnp', // ✅ Template Welcome (tạo tài khoản mới)
  classAddedTemplateId:  'template_c0pnvxr', // ✅ Template thêm lớp phụ
  publicKey:             'WfqYtIxP9-UDBoO0E', // ✅ Đã cấu hình
};

// Khởi tạo EmailJS (chạy 1 lần)
let _emailJsReady = false;
function _initEmailJs() {
  if (_emailJsReady || !_EMAIL_CONFIG.publicKey || _EMAIL_CONFIG.publicKey === 'YOUR_PUBLIC_KEY') return;
  try {
    emailjs.init({ publicKey: _EMAIL_CONFIG.publicKey });
    _emailJsReady = true;
  } catch(e) { console.warn('EmailJS init failed:', e.message); }
}

/**
 * Gửi email thông tin tài khoản cho học sinh mới
 * @param {object} student - { full_name, username, password_raw, class_name, student_code }
 */
async function sendWelcomeEmail(student) {
  _initEmailJs();
  if (!_emailJsReady) {
    console.warn('[Email] EmailJS chưa được cấu hình. Bỏ qua gửi email.');
    return;
  }
  try {
    await emailjs.send(_EMAIL_CONFIG.serviceId, _EMAIL_CONFIG.templateId, {
      to_email:     student.username,           // Gmail học sinh
      to_name:      student.full_name,
      student_code: student.student_code || '—',
      login_email:  student.username,
      password:     student.password_raw,
      class_name:   student.class_name || 'Chưa có lớp',
      login_url:    window.location.origin + '/login.html',
      school_name:  'DHDT LMS',
      sent_by:      sessionStorage.getItem('dh_name') || 'Giáo viên',
    });
    console.info(`[Email] ✅ Đã gửi tài khoản cho ${student.username}`);
    return true;
  } catch(e) {
    console.warn(`[Email] ❌ Lỗi gửi email cho ${student.username}:`, e);
    return false;
  }
}

/**
 * Gửi email thông báo được thêm vào lớp mới
 * Template riêng: thông báo lớp phụ (khác với Welcome email)
 */
async function sendClassAddedEmail(student, className) {
  _initEmailJs();
  if (!_emailJsReady) return;
  try {
    await emailjs.send(_EMAIL_CONFIG.serviceId, _EMAIL_CONFIG.classAddedTemplateId, {
      to_email:    student.username,
      to_name:     student.full_name,
      class_name:  className,
      login_url:   window.location.origin + '/login.html',
      school_name: 'DHDT LMS',
      sent_by:     sessionStorage.getItem('dh_name') || 'Giáo viên',
    });
    console.info(`[Email] ✅ Đã gửi thông báo thêm lớp cho ${student.username}`);
    return true;
  } catch(e) {
    console.warn('[Email] Lỗi gửi email thêm lớp:', e);
    return false;
  }
}

// ============================================================
// TẠO TÀI KHOẢN HÀNG LOẠT
// ============================================================

let _bulkRows = []; // danh sách học sinh đã parse

// Mở modal tạo hàng loạt
async function openBulkCreateModal() {
  // Reset về bước 1
  _bulkRows = [];
  document.getElementById('bulkStep1').style.display = 'block';
  document.getElementById('bulkStep2').style.display = 'none';
  document.getElementById('bulkPasteBox').value = '';
  document.getElementById('bulkPasteInfo').textContent = '';
  document.getElementById('bulkFileInfo').style.display = 'none';
  document.getElementById('bulkStep1Error').textContent = '';
  document.getElementById('bulkPreviewBtn').disabled = true;
  document.getElementById('bulkDropZone').innerHTML = `
    <div style="font-size:2rem;margin-bottom:.35rem">📎</div>
    <div style="font-weight:700;color:var(--text)">Kéo thả hoặc bấm để chọn file</div>
    <div style="font-size:.8rem;color:var(--muted);margin-top:.2rem">Excel (.xlsx) hoặc CSV — cột: <b>Họ tên, Gmail</b> (bắt buộc), SĐT, Lớp, Ghi chú (tuỳ chọn)</div>
    <input type="file" id="bulkFileInput" accept=".xlsx,.csv,.xls" hidden onchange="parseBulkFile(this.files[0])"/>`;

  // Populate lớp mặc định
  const classes = await getClasses();
  const sel = document.getElementById('bulkDefaultClass');
  sel.innerHTML = '<option value="">-- Không gán lớp --</option>' +
    classes.map(c => `<option value="${c}">${c}</option>`).join('');

  document.getElementById('bulkCreateModal').classList.add('open');
}

// Kéo thả file
function handleBulkDrop(e) {
  e.preventDefault();
  document.getElementById('bulkDropZone').style.borderColor = 'var(--border)';
  const file = e.dataTransfer.files[0];
  if (file) parseBulkFile(file);
}

// Parse file Excel/CSV
async function parseBulkFile(file) {
  if (!file) return;
  const errEl = document.getElementById('bulkStep1Error');
  errEl.textContent = '';
  try {
    let rows = [];
    const name = file.name.toLowerCase();

    if (name.endsWith('.csv')) {
      const text = await file.text();
      rows = _parseBulkCsv(text);
    } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
      rows = _normalizeBulkRows(data);
    } else {
      errEl.textContent = 'Chỉ hỗ trợ .xlsx, .xls hoặc .csv';
      return;
    }

    if (!rows.length) { errEl.textContent = 'Không tìm thấy dữ liệu hợp lệ trong file.'; return; }

    _bulkRows = rows;
    document.getElementById('bulkFileInfo').style.display = 'block';
    document.getElementById('bulkFileInfo').innerHTML = `✅ Đã đọc <b>${rows.length}</b> dòng từ <b>${file.name}</b>`;
    document.getElementById('bulkDropZone').innerHTML = `
      <div style="font-size:1.5rem;margin-bottom:.25rem">✅</div>
      <div style="font-weight:700;color:#065f46">${file.name}</div>
      <div style="font-size:.78rem;color:var(--muted)">${rows.length} dòng dữ liệu</div>
      <input type="file" id="bulkFileInput" accept=".xlsx,.csv,.xls" hidden onchange="parseBulkFile(this.files[0])"/>`;
    document.getElementById('bulkDropZone').style.borderColor = '#10b981';
    document.getElementById('bulkDropZone').style.background = '#f0fdf4';
    document.getElementById('bulkPreviewBtn').disabled = false;
    // Xóa paste box
    document.getElementById('bulkPasteBox').value = '';
    document.getElementById('bulkPasteInfo').textContent = '';
  } catch(e) {
    errEl.textContent = 'Lỗi đọc file: ' + e.message;
  }
}

// Chuẩn hóa header từ Excel (tìm cột tên/gmail/sđt/lớp/ghi chú)
function _normalizeBulkRows(data) {
  // Map tên cột tiếng Việt → key chuẩn
  const colMap = {
    'họ tên': 'name', 'ho ten': 'name', 'tên': 'name', 'ten': 'name',
    'họ và tên': 'name', 'ho va ten': 'name', 'full name': 'name', 'fullname': 'name',
    'gmail': 'username', 'email': 'username', 'tên đăng nhập': 'username',
    'sdt': 'phone', 'số điện thoại': 'phone', 'so dien thoai': 'phone', 'phone': 'phone',
    'lớp': 'class_name', 'lop': 'class_name', 'class': 'class_name', 'lớp học': 'class_name',
    'ghi chú': 'notes', 'ghi chu': 'notes', 'notes': 'notes', 'note': 'notes',
  };
  return data.map(row => {
    const out = {};
    Object.entries(row).forEach(([k, v]) => {
      const norm = k.toLowerCase().trim().replace(/\s+/g, ' ');
      const mapped = colMap[norm];
      if (mapped) out[mapped] = String(v||'').trim();
    });
    return out;
  }).filter(r => r.name || r.username);
}

// Parse CSV text
function _parseBulkCsv(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  // Phát hiện header
  const header = lines[0].split(/[,;\t]/).map(h => h.trim().replace(/['"]/g,'').toLowerCase());
  const colMap = {
    'họ tên': 'name', 'ho ten': 'name', 'tên': 'name', 'ten': 'name',
    'họ và tên': 'name', 'full name': 'name', 'fullname': 'name',
    'gmail': 'username', 'email': 'username',
    'sdt': 'phone', 'số điện thoại': 'phone', 'phone': 'phone',
    'lớp': 'class_name', 'lop': 'class_name', 'class': 'class_name',
    'ghi chú': 'notes', 'ghi chu': 'notes', 'notes': 'notes',
  };
  const idxMap = {};
  header.forEach((h, i) => { if (colMap[h]) idxMap[colMap[h]] = i; });

  // Nếu không có header → thử auto-detect theo thứ tự: name, username, phone, class_name
  const hasHeader = Object.keys(idxMap).length >= 2;
  if (!hasHeader) {
    // Auto: cột 0=name, 1=username(gmail), 2=phone, 3=class_name
    return lines.map(line => {
      const cols = line.split(/[,;\t]/).map(c => c.trim().replace(/['"]/g,''));
      const username = cols.find(c => /^[^\s@]+@gmail\.com$/i.test(c)) || cols[1] || '';
      return { name: cols[0]||'', username, phone: cols[2]||'', class_name: cols[3]||'' };
    }).filter(r => r.name || r.username);
  }

  return lines.slice(1).map(line => {
    const cols = line.split(/[,;\t]/).map(c => c.trim().replace(/['"]/g,''));
    const out = {};
    Object.entries(idxMap).forEach(([key, idx]) => { out[key] = cols[idx] || ''; });
    return out;
  }).filter(r => r.name || r.username);
}

// Dán trực tiếp từ clipboard
function parseBulkPaste(text) {
  const infoEl = document.getElementById('bulkPasteInfo');
  const previewBtn = document.getElementById('bulkPreviewBtn');
  if (!text.trim()) {
    _bulkRows = [];
    infoEl.textContent = '';
    previewBtn.disabled = true;
    return;
  }
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  // Kiểm tra xem có header không (dòng đầu chứa @gmail → không phải header)
  const firstHasGmail = /gmail\.com/i.test(lines[0]);
  const rows = [];

  lines.forEach((line, idx) => {
    if (idx === 0 && !firstHasGmail) {
      // Có thể là header → bỏ qua nếu không có gmail
      const cols = line.split(/[\t,;]/).map(c => c.trim());
      if (!cols.some(c => /gmail\.com/i.test(c))) return;
    }
    const cols = line.split(/[\t,;]/).map(c => c.trim().replace(/['"]/g,''));
    const gmail = cols.find(c => /^[^\s@]+@gmail\.com$/i.test(c));
    if (!gmail && !cols[0]) return;
    // Tìm họ tên: cột đầu không phải gmail và không phải số điện thoại
    const name = cols.find(c => c && !/gmail\.com/i.test(c) && !/^\d{9,11}$/.test(c)) || '';
    const phone = cols.find(c => /^\d{9,11}$/.test(c)) || '';
    const cls = cols.find(c => c && c !== name && c !== gmail && c !== phone && c.length > 1) || '';
    rows.push({ name, username: gmail || '', phone, class_name: cls });
  });

  const valid = rows.filter(r => r.username && isValidGmail(r.username));
  if (!valid.length) {
    infoEl.innerHTML = '<span style="color:#92400e">⚠️ Không tìm thấy dòng hợp lệ (cần có Gmail)</span>';
    previewBtn.disabled = true;
    _bulkRows = [];
    return;
  }
  _bulkRows = rows;
  infoEl.innerHTML = `<span style="color:#065f46">✅ Nhận được <b>${valid.length}</b> dòng hợp lệ</span>`;
  previewBtn.disabled = false;
  // Reset file info
  document.getElementById('bulkFileInfo').style.display = 'none';
}

// Preview trước khi tạo
async function previewBulkCreate() {
  const errEl = document.getElementById('bulkStep1Error');
  errEl.textContent = '';
  if (!_bulkRows.length) { errEl.textContent = 'Không có dữ liệu.'; return; }

  const defaultClass = document.getElementById('bulkDefaultClass').value;

  // Lấy danh sách gmail đã có trong DB
  const allUsernames = _bulkRows.map(r => r.username).filter(Boolean).map(u => u.toLowerCase());
  const batchSize = 50;
  let existingSet = new Set();
  for (let i = 0; i < allUsernames.length; i += batchSize) {
    const batch = allUsernames.slice(i, i + batchSize);
    const { data } = await db.from('students').select('username').in('username', batch);
    (data||[]).forEach(s => existingSet.add(s.username.toLowerCase()));
  }

  const tbody = document.getElementById('bulkPreviewBody');
  tbody.innerHTML = '';
  let validCount = 0, skipCount = 0, errorCount = 0;

  _bulkRows.forEach((row, idx) => {
    const gmail = (row.username||'').trim().toLowerCase();
    const name  = (row.name||'').trim();
    const cls   = (row.class_name||'').trim() || defaultClass;

    let status = '', statusColor = '', skip = false;
    if (!gmail || !isValidGmail(gmail)) {
      status = '❌ Gmail không hợp lệ'; statusColor = '#ef4444'; skip = true; errorCount++;
    } else if (existingSet.has(gmail)) {
      status = '⚠️ Gmail đã tồn tại'; statusColor = '#f59e0b'; skip = true; skipCount++;
    } else if (!name) {
      status = '❌ Thiếu họ tên'; statusColor = '#ef4444'; skip = true; errorCount++;
    } else {
      // Heuristic check
      const h = checkGmailHeuristic(gmail);
      if (h.suspicious) {
        status = `⚠️ Có vẻ ảo (${h.reason})`; statusColor = '#f59e0b'; validCount++;
      } else {
        status = '✅ Sẽ tạo mới'; statusColor = '#10b981'; validCount++;
      }
    }
    // Đánh dấu row để doBulkCreate biết bỏ qua
    row._skip = skip;
    row._cls  = cls;
    row._gmail = gmail;

    const tr = document.createElement('tr');
    tr.style.background = skip ? (existingSet.has(gmail) ? '#fffbeb' : '#fff5f5') : '';
    tr.innerHTML = `
      <td style="padding:.45rem .75rem;border-bottom:1px solid var(--border)">${idx+1}</td>
      <td style="padding:.45rem .75rem;border-bottom:1px solid var(--border);font-weight:600">${name||'<span style="color:#94a3b8">—</span>'}</td>
      <td style="padding:.45rem .75rem;border-bottom:1px solid var(--border)">${gmail}</td>
      <td style="padding:.45rem .75rem;border-bottom:1px solid var(--border)">${row.phone||'—'}</td>
      <td style="padding:.45rem .75rem;border-bottom:1px solid var(--border)">${cls||'<span style="color:#94a3b8">Chưa có</span>'}</td>
      <td style="padding:.45rem .75rem;border-bottom:1px solid var(--border);font-weight:600;color:${statusColor}">${status}</td>`;
    tbody.appendChild(tr);
  });

  // Stats
  const statsEl = document.getElementById('bulkPreviewStats');
  statsEl.innerHTML = `
    <div style="background:#d1fae5;color:#065f46;padding:.45rem .9rem;border-radius:8px;font-weight:700;font-size:.83rem">✅ Tạo mới: ${validCount}</div>
    <div style="background:#fef3c7;color:#92400e;padding:.45rem .9rem;border-radius:8px;font-weight:700;font-size:.83rem">⚠️ Bỏ qua (đã có): ${skipCount}</div>
    <div style="background:#fee2e2;color:#991b1b;padding:.45rem .9rem;border-radius:8px;font-weight:700;font-size:.83rem">❌ Lỗi: ${errorCount}</div>`;

  document.getElementById('bulkDoCreateBtn').textContent = `✅ Tạo ${validCount} tài khoản`;
  document.getElementById('bulkDoCreateBtn').disabled = validCount === 0;

  document.getElementById('bulkStep1').style.display = 'none';
  document.getElementById('bulkStep2').style.display = 'block';
}

// Thực hiện tạo tài khoản hàng loạt
async function doBulkCreate() {
  const toCreate = _bulkRows.filter(r => !r._skip);
  if (!toCreate.length) return;

  const btn = document.getElementById('bulkDoCreateBtn');
  const backBtn = document.getElementById('bulkBackBtn');
  btn.disabled = true;
  backBtn.disabled = true;
  document.getElementById('bulkProgress').style.display = 'block';
  document.getElementById('bulkStep2Error').textContent = '';

  let done = 0, failed = 0;
  const total = toCreate.length;

  for (const row of toCreate) {
    try {
      // Tạo mã học viên unique
      const code = await genStudentCode();
      const password = code;
      const name  = row.name.trim();
      const gmail = row._gmail;
      const phone = (row.phone||'').replace(/\D/g,'').slice(0,10) || null;
      const cls   = row._cls || null;
      const notes = (row.notes||'').trim() || null;

      // Insert vào DB
      const { data: newStu, error } = await db.from('students').insert({
        student_code: code,
        full_name:    name,
        phone,
        username:     gmail,
        password:     await hashPw(password),
        class_name:   cls ? cls.split(',')[0].trim() : null,
        active:       true,
        notes
      }).select('id').single();

      if (error) { failed++; continue; }

      // Thêm vào student_classes
      if (cls && newStu?.id) {
        const clsList = cls.split(',').map(c => c.trim()).filter(Boolean);
        await Promise.all(clsList.map(c =>
          db.from('student_classes').insert({ student_id: newStu.id, class_name: c }).catch(() => {})
        ));
      }

      // Gửi email (không chặn vòng lặp)
      sendWelcomeEmail({
        full_name:    name,
        username:     gmail,
        password_raw: password,
        class_name:   cls || '',
        student_code: code
      }).catch(() => {});

      logAccountActivity('Tạo tài khoản', { full_name: name, username: gmail, class_name: cls||'' }).catch(() => {});

      done++;
    } catch(e) {
      failed++;
    }

    // Cập nhật progress bar
    const pct = Math.round(((done + failed) / total) * 100);
    document.getElementById('bulkProgressBar').style.width = pct + '%';
    document.getElementById('bulkProgressCount').textContent = `${done + failed} / ${total}`;
    document.getElementById('bulkProgressText').textContent = `Đang tạo... (${done} thành công, ${failed} lỗi)`;
  }

  // Hoàn tất
  document.getElementById('bulkProgressText').textContent = `✅ Hoàn tất! ${done} tài khoản đã tạo${failed ? `, ${failed} lỗi` : ''}.`;
  document.getElementById('bulkProgressBar').style.background = '#10b981';
  btn.textContent = '✅ Xong';
  btn.disabled = false;
  btn.onclick = () => {
    document.getElementById('bulkCreateModal').classList.remove('open');
    renderStudents();
    populateClassFilters();
  };
  backBtn.disabled = false;
  if (failed > 0) {
    document.getElementById('bulkStep2Error').textContent = `⚠️ ${failed} dòng tạo thất bại (có thể Gmail đã tồn tại hoặc lỗi mạng).`;
  }
  showToast(`📋 Đã tạo ${done} tài khoản hàng loạt`);
  logActivity('Học sinh', `Tạo hàng loạt ${done} tài khoản`, `${done} HS${failed ? ` (${failed} lỗi)` : ''}`);
}

// ============================================================
// KIỂM TRA GMAIL THẬT / ẢO
// ============================================================

// ⚠️ AbstractAPI Email Validation key — https://app.abstractapi.com/api/email-validation
const _ABSTRACT_EMAIL_KEY = '11ea460b7a2340ce82c50f41a8f5cb19';

// Cache kết quả tránh gọi API nhiều lần cùng 1 gmail
const _gmailCheckCache = {};

/**
 * Mức 1: Heuristic — phát hiện Gmail có vẻ ảo/random
 * Trả về: { suspicious: bool, reason: string }
 */
function checkGmailHeuristic(email) {
  const local = email.split('@')[0].toLowerCase();

  // Quá ngắn
  if (local.length < 4) return { suspicious: true, reason: 'Tên quá ngắn (< 4 ký tự)' };

  // Toàn số
  if (/^\d+$/.test(local)) return { suspicious: true, reason: 'Tên toàn số' };

  // Chuỗi lặp ký tự: aaaa, 1111
  if (/(.)\1{3,}/.test(local)) return { suspicious: true, reason: 'Ký tự lặp nhiều lần' };

  // Keyboard pattern
  const keyboards = ['qwerty','qwert','asdfg','asdf','zxcvb','zxcv','12345','23456','34567','45678','56789','abcde','abcd'];
  if (keyboards.some(p => local.includes(p))) return { suspicious: true, reason: 'Dãy bàn phím liên tiếp' };

  // Quá nhiều số liên tiếp (>= 6 số)
  if (/\d{6,}/.test(local)) return { suspicious: true, reason: 'Dãy số dài (>= 6 chữ số liên tiếp)' };

  // Chỉ có 1-2 từ + nhiều số ngẫu nhiên (VD: abc12847261)
  if (/^[a-z]{1,4}\d{5,}$/.test(local)) return { suspicious: true, reason: 'Tên ngắn + nhiều số ngẫu nhiên' };

  // Random string: tỉ lệ phụ âm liên tiếp cao (VD: xkqzjwpf)
  const vowels = (local.match(/[aeiou]/g)||[]).length;
  const letters = (local.match(/[a-z]/g)||[]).length;
  if (letters >= 6 && vowels / letters < 0.1) return { suspicious: true, reason: 'Chuỗi ký tự ngẫu nhiên (ít nguyên âm)' };

  return { suspicious: false, reason: '' };
}

/**
 * Mức 2: AbstractAPI — verify mailbox thật sự
 * Trả về: { valid: bool, quality: 'good'|'risky'|'bad', deliverable: bool, reason: string }
 */
async function checkGmailAbstractApi(email) {
  if (!_ABSTRACT_EMAIL_KEY || _ABSTRACT_EMAIL_KEY === 'YOUR_ABSTRACT_API_KEY') {
    return null; // Chưa cấu hình → bỏ qua
  }
  if (_gmailCheckCache[email]) return _gmailCheckCache[email];

  try {
    const res = await fetch(
      `https://emailvalidation.abstractapi.com/v1/?api_key=${_ABSTRACT_EMAIL_KEY}&email=${encodeURIComponent(email)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();

    const deliverable = data.deliverability === 'DELIVERABLE';
    const quality     = data.quality_score >= 0.8 ? 'good' : data.quality_score >= 0.5 ? 'risky' : 'bad';
    const isDisposable = data.is_disposable_email?.value === true;
    const isFree      = data.is_free_email?.value === true;

    let reason = '';
    if (isDisposable)        reason = 'Email dùng 1 lần (disposable)';
    else if (!deliverable)   reason = 'Hộp thư không tồn tại hoặc không nhận được email';
    else if (quality === 'risky') reason = 'Email có độ tin cậy thấp';

    const result = { valid: deliverable && !isDisposable, quality, deliverable, isDisposable, reason };
    _gmailCheckCache[email] = result;
    return result;
  } catch(e) {
    return null; // Timeout / lỗi mạng → bỏ qua
  }
}

/**
 * Kiểm tra tổng hợp: heuristic + AbstractAPI
 * Trả về object kết quả để hiển thị UI
 */
async function verifyGmail(email) {
  if (!email || !isValidGmail(email)) {
    return { status: 'invalid', label: '❌ Gmail không hợp lệ', color: '#ef4444' };
  }

  // Bước 1: Heuristic
  const h = checkGmailHeuristic(email);

  // Bước 2: AbstractAPI (song song hoặc nếu heuristic nghi ngờ)
  const api = await checkGmailAbstractApi(email);

  if (api) {
    // Có kết quả API → dùng kết quả API làm chính
    if (api.isDisposable) {
      return { status: 'fake', label: '🚫 Email dùng 1 lần (disposable)', color: '#ef4444', detail: api.reason };
    }
    if (!api.deliverable) {
      return { status: 'fake', label: '❌ Hộp thư không tồn tại', color: '#ef4444', detail: api.reason };
    }
    if (api.quality === 'risky' || h.suspicious) {
      return { status: 'risky', label: '⚠️ Email có vẻ không tin cậy', color: '#f59e0b', detail: h.reason || api.reason };
    }
    return { status: 'valid', label: '✅ Email hợp lệ & tồn tại', color: '#10b981', detail: '' };
  }

  // Không có API → chỉ dùng heuristic
  if (h.suspicious) {
    return { status: 'risky', label: '⚠️ Gmail có vẻ ảo', color: '#f59e0b', detail: h.reason };
  }
  return { status: 'valid', label: '✅ Gmail hợp lệ', color: '#10b981', detail: '(chưa xác minh hộp thư)' };
}

/**
 * Gắn nút kiểm tra vào input Gmail
 * Gọi: attachGmailVerifyBtn('csUsername')
 */
function attachGmailVerifyBtn(inputId) {
  const input = document.getElementById(inputId);
  if (!input || input.dataset.verifyAttached) return;
  input.dataset.verifyAttached = '1';

  // Tạo container bọc
  const wrap = input.parentElement;

  // Nút kiểm tra
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '🔍 Kiểm tra';
  btn.style.cssText = 'margin-top:.35rem;padding:.3rem .8rem;border:1.5px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);font-size:.78rem;cursor:pointer;font-weight:600;transition:all .2s';
  btn.title = 'Kiểm tra Gmail thật hay ảo';

  // Vùng hiển thị kết quả
  const result = document.createElement('div');
  result.style.cssText = 'font-size:.78rem;margin-top:.25rem;display:none;padding:.3rem .7rem;border-radius:8px;font-weight:600';

  input.insertAdjacentElement('afterend', result);
  input.insertAdjacentElement('afterend', btn);

  btn.addEventListener('click', async () => {
    const email = input.value.trim().toLowerCase();
    if (!email) return;
    btn.textContent = '⏳ Đang kiểm tra...';
    btn.disabled = true;
    result.style.display = 'none';

    const res = await verifyGmail(email);

    result.style.display = 'block';
    result.style.background = res.status === 'valid' ? '#d1fae5' : res.status === 'risky' ? '#fef3c7' : '#fee2e2';
    result.style.color = res.color;
    result.innerHTML = res.label + (res.detail ? `<span style="font-weight:400;margin-left:.4rem;opacity:.8">(${res.detail})</span>` : '');

    btn.textContent = '🔍 Kiểm tra lại';
    btn.disabled = false;
  });
}

// Gắn vào các field Gmail khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
  ['csUsername', 'esUsername', 'addUsername'].forEach(attachGmailVerifyBtn);
});

// ============================================================
// DỌN LỚP ẢO — normalize students.class_name
// ============================================================
async function cleanFakeClasses() {
  const btn = document.getElementById('cleanFakeClassesBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Đang dọn...';

  // Lấy danh sách lớp hợp lệ từ bảng classes
  const [{ data: clsData }, { data: scData }, { data: allLessons }, { data: allGroups }, { data: students }] = await Promise.all([
    db.from('classes').select('name'),
    db.from('student_classes').select('class_name'),
    db.from('lessons').select('id,class_name').not('class_name', 'is', null),
    db.from('lesson_groups').select('id,class_name').not('class_name', 'is', null),
    db.from('students').select('id,class_name').ilike('class_name', '%,%'),
  ]);

  const validClasses = new Set([
    ...(clsData||[]).map(c => c.name.trim()),
    ...(scData||[]).map(c => c.class_name.trim()),
  ]);

  let fixed = 0;

  // 1. Dọn students.class_name (lớp ghép)
  const studentUpdates = (students||[]).map(s => {
    const parts = (s.class_name||'').split(',').map(c=>c.trim()).filter(Boolean);
    const mainClass = parts.find(p => validClasses.has(p)) || parts[0] || null;
    if (mainClass === s.class_name) return null;
    return { id: s.id, class_name: mainClass, parts };
  }).filter(Boolean);

  await Promise.all(studentUpdates.map(async u => {
    await db.from('students').update({ class_name: u.class_name }).eq('id', u.id);
    for (const cls of u.parts) {
      await db.from('student_classes').upsert({ student_id: u.id, class_name: cls }, { onConflict: 'student_id,class_name' }).catch(()=>{});
    }
    fixed++;
  }));

  // 2. Dọn lessons.class_name — xóa các lớp không còn tồn tại
  const lessonUpdates = (allLessons||[]).map(l => {
    const parts = (l.class_name||'').split(',').map(c=>c.trim()).filter(Boolean);
    const valid = parts.filter(p => validClasses.has(p));
    const newVal = valid.join(',') || null;
    if (newVal === l.class_name) return null;
    return { id: l.id, class_name: newVal };
  }).filter(Boolean);
  await Promise.all(lessonUpdates.map(u => db.from('lessons').update({ class_name: u.class_name }).eq('id', u.id)));
  fixed += lessonUpdates.length;

  // 3. Dọn lesson_groups.class_name — xóa các lớp không còn tồn tại
  const groupUpdates = (allGroups||[]).map(g => {
    const parts = (g.class_name||'').split(',').map(c=>c.trim()).filter(Boolean);
    const valid = parts.filter(p => validClasses.has(p));
    const newVal = valid.join(',') || null;
    if (newVal === g.class_name) return null;
    return { id: g.id, class_name: newVal };
  }).filter(Boolean);
  await Promise.all(groupUpdates.map(u => db.from('lesson_groups').update({ class_name: u.class_name }).eq('id', u.id)));
  fixed += groupUpdates.length;

  btn.disabled = false;
  btn.textContent = '🧹 Dọn lớp ảo';
  if (fixed === 0) {
    showToast('✅ Không có gì cần dọn!');
  } else {
    showToast(`✅ Đã dọn ${fixed} mục (students, bài học, nhóm bài học)`);
  }
  renderClasses();
  renderGroups();
  populateClassFilters();
}

// ============================================================
// HƯỚNG DẪN SỬ DỤNG — trang admin
// ============================================================
const _ADMIN_GUIDE_DATA = [
  // ── HỌC SINH ──
  { cat:'student', icon:'➕', title:'Thêm học sinh mới', steps:[
    'Sidebar → <b>Thêm học viên mới</b>',
    'Nhập Gmail (bắt buộc), Họ tên, SĐT, chọn Lớp',
    'Mã học sinh tự động tạo — cũng là mật khẩu đăng nhập ban đầu',
    'Bấm <b>Lưu</b> — hệ thống tự gửi email thông tin tài khoản',
    '⚠️ Gmail phải là @gmail.com, không trùng tài khoản khác',
  ]},
  { cat:'student', icon:'📋', title:'Import hàng loạt từ Excel', steps:[
    'Thêm học viên → <b>Import hàng loạt</b>',
    'Chuẩn bị file Excel/CSV: cột <b>Họ tên, Gmail</b> bắt buộc',
    'Kéo thả file → preview → kiểm tra trùng Gmail',
    'Bấm <b>Tạo tất cả</b> — gửi email tự động cho từng học sinh',
  ]},
  { cat:'student', icon:'✏️', title:'Sửa thông tin học sinh', steps:[
    'Danh sách học sinh → nút <b>⋮</b> → <b>Sửa</b>',
    'Sửa: Họ tên, Gmail, SĐT, Mã HS, Ghi chú, Lớp phụ',
    '<b>Trợ lý không được sửa ngày hết hạn</b>',
  ]},
  { cat:'student', icon:'🔒', title:'Khóa / Mở khóa tài khoản', steps:[
    'Danh sách học sinh → nút <b>⋮</b> → Khóa/Mở khóa',
    'Học sinh bị khóa không đăng nhập được — hiện badge 🔒',
    'Tài khoản tự khóa khi nhập sai mật khẩu quá nhiều lần',
  ]},
  { cat:'student', icon:'🔄', title:'Đồng bộ Gmail → Lớp phụ', steps:[
    'Danh sách học sinh → <b>Công cụ → Đồng bộ Gmail → Lớp</b>',
    'Upload file Excel/CSV danh sách Gmail hoặc dán trực tiếp',
    'Chọn lớp → Phân tích → Bấm <b>Đồng bộ</b>',
    'Tự thêm lớp phụ và gửi thông báo cho học sinh',
  ]},
  // ── BÀI HỌC ──
  { cat:'lesson', icon:'📂', title:'Tạo nhóm bài học', steps:[
    'Sidebar → <b>Nhóm bài học → Thêm nhóm</b>',
    'Nhập tên nhóm, chọn lớp, giới hạn học sinh nếu cần',
    'Nhóm có thể có nhóm con (tối đa 3 cấp)',
    'Kéo thả để sắp xếp thứ tự nhóm',
  ]},
  { cat:'lesson', icon:'📚', title:'Thêm & quản lý bài học', steps:[
    'Nhóm bài học → click nhóm → <b>Thêm bài học</b>',
    'Nhập tên bài, mô tả, link video/tài liệu ngay khi tạo',
    'Click vào bài học → thêm video, tài liệu, bản viết tay',
    'Kéo thả để sắp xếp thứ tự bài trong nhóm',
  ]},
  { cat:'lesson', icon:'🎬', title:'Thêm video cho bài học', steps:[
    'Click vào bài học → tab <b>Video</b> → <b>Thêm video</b>',
    'Hỗ trợ: Link URL (Drive/YouTube), Mã nhúng iframe, Upload file',
    'Google Drive: chọn "Chia sẻ → Bất kỳ ai có link"',
  ]},
  { cat:'lesson', icon:'📄', title:'Thêm tài liệu cho bài học', steps:[
    'Click vào bài học → tab <b>Tài liệu</b> → <b>Tải lên</b>',
    'Hỗ trợ Link URL, file PDF/Word/Excel/ảnh',
    'Loại <b>Bản viết tay</b>: ảnh chụp tay — phân loại riêng',
  ]},
  // ── LỚP HỌC ──
  { cat:'class', icon:'🏫', title:'Tạo & quản lý lớp học', steps:[
    'Sidebar → <b>Lớp học → Tạo lớp</b>',
    'Nhập tên lớp, ngày khai giảng, ngày kết thúc',
    'Ngày kết thúc tự đặt làm ngày hết hạn tài khoản học sinh',
    'Click vào lớp để xem danh sách học sinh trong lớp',
  ]},
  { cat:'class', icon:'🗑️', title:'Xóa lớp học', steps:[
    'Lớp học → nút xóa bên cạnh tên lớp',
    'Chọn: <b>Giữ học sinh</b> hoặc <b>Xóa luôn tất cả</b>',
    '⚠️ Xóa luôn không thể hoàn tác',
  ]},
  // ── FILE ──
  { cat:'file', icon:'📁', title:'Quản lý thư mục tài liệu', steps:[
    'Sidebar → <b>Lưu trữ tài liệu → Tạo thư mục</b>',
    'Đặt tên, icon, màu sắc, chọn lớp học',
    'Thư mục có thể ghim lên đầu, tạo thư mục con',
  ]},
  { cat:'file', icon:'⬆️', title:'Upload file tài liệu', steps:[
    'Vào thư mục → bấm <b>⬆ Tải lên</b>',
    'Kéo thả nhiều file hoặc nhập link ngoài (Google Drive...)',
    'File lưu Supabase Storage — link tải vĩnh viễn',
    'Xem lịch sử tải, lượt tải của từng file',
  ]},
  // ── HỆ THỐNG ──
  { cat:'system', icon:'🔧', title:'Chế độ bảo trì', steps:[
    'Sidebar → <b>Chế độ bảo trì</b> (cuối sidebar)',
    'Bật: học sinh thấy trang thông báo bảo trì',
    'Nhập nội dung thông báo tùy chỉnh',
    'Tắt khi hoàn tất',
  ]},
  { cat:'system', icon:'📢', title:'Gửi thông báo', steps:[
    'Sidebar → <b>Thông báo → Tạo thông báo</b>',
    'Chọn đối tượng: Tất cả / Lớp / Học sinh cụ thể',
    'Có thể ghim, hết hạn 24h, lên lịch gửi',
    'Học sinh nhận thông báo khi đăng nhập',
  ]},
  { cat:'system', icon:'📅', title:'Lịch học', steps:[
    'Sidebar → <b>Lịch học</b>',
    'Xem theo tuần, thêm buổi học mới',
    'Chọn lớp, giờ bắt đầu/kết thúc, môn học',
    'Học sinh xem lịch trong trang của mình',
  ]},
  { cat:'system', icon:'⚙️', title:'Quản trị hệ thống', steps:[
    'Cuối sidebar → <b>⚙️ Quản trị hệ thống</b> (chỉ Teacher)',
    'Xem thống kê tổng quan, học sinh online, nhật ký trợ lý',
    'Quản lý tài khoản trợ lý & giáo viên',
    'Cài đặt bảo trì, đổi mật khẩu admin, dọn dẹp dữ liệu',
  ]},
  // ── TRỢ LÝ ──
  { cat:'assistant', icon:'🤝', title:'Tài khoản trợ lý', steps:[
    'Quản trị hệ thống → <b>Tài khoản trợ lý</b>',
    'Tạo tài khoản: nhập họ tên, username, mật khẩu',
    'Trợ lý đăng nhập tại login.html → vào trang Admin',
    '✅ Có thể: thêm/sửa học sinh, bài học, file, thông báo',
    '❌ Không thể: vào Quản trị hệ thống, đặt ngày hết hạn',
  ]},
];

let _adminGuideTab = 'all';

function adminRenderGuide() {
  _adminGuideTab = 'all';
  // Reset tabs
  const tabs = document.querySelectorAll('#adminGuideTabs button');
  tabs.forEach((b, i) => {
    if (i === 0) { b.className = 'btn-primary'; b.style.cssText = 'border-radius:10px;padding:.4rem .9rem;font-size:.82rem'; }
    else { b.className = 'btn-outline'; b.style.cssText = 'border-radius:10px;padding:.4rem .9rem;font-size:.82rem'; }
  });
  const searchEl = document.getElementById('adminGuideSearch');
  if (searchEl) searchEl.value = '';
  adminFilterGuide('');
}

function adminSetGuideTab(tab, btn) {
  _adminGuideTab = tab;
  document.querySelectorAll('#adminGuideTabs button').forEach(b => {
    b.className = 'btn-outline';
    b.style.cssText = 'border-radius:10px;padding:.4rem .9rem;font-size:.82rem';
  });
  if (btn) {
    btn.className = 'btn-primary';
    btn.style.cssText = 'border-radius:10px;padding:.4rem .9rem;font-size:.82rem';
  }
  adminFilterGuide(document.getElementById('adminGuideSearch')?.value || '');
}

function adminFilterGuide(q) {
  q = (q||'').toLowerCase().trim();
  const filtered = _ADMIN_GUIDE_DATA.filter(item => {
    if (_adminGuideTab !== 'all' && item.cat !== _adminGuideTab) return false;
    if (!q) return true;
    return item.title.toLowerCase().includes(q) ||
           item.steps.some(s => s.toLowerCase().includes(q));
  });

  const container = document.getElementById('adminGuideContent');
  if (!container) return;
  if (!filtered.length) {
    container.innerHTML = `<div style="text-align:center;color:var(--muted);padding:3rem">
      <div style="font-size:2.5rem;margin-bottom:.5rem">🔍</div>
      Không tìm thấy hướng dẫn phù hợp
    </div>`;
    return;
  }

  const catMeta = {
    student:   { label:'🎓 Học sinh',  color:'#eef2ff', border:'#6366f1' },
    lesson:    { label:'📚 Bài học',   color:'#fef3c7', border:'#f59e0b' },
    class:     { label:'🏫 Lớp học',  color:'#d1fae5', border:'#10b981' },
    file:      { label:'🗂️ File',     color:'#e0f2fe', border:'#0ea5e9' },
    system:    { label:'⚙️ Hệ thống', color:'#ede9fe', border:'#8b5cf6' },
    assistant: { label:'🤝 Trợ lý',   color:'#fce7f3', border:'#ec4899' },
  };

  const groups = {};
  filtered.forEach(item => {
    if (!groups[item.cat]) groups[item.cat] = [];
    groups[item.cat].push(item);
  });

  container.innerHTML = Object.entries(groups).map(([cat, items]) => {
    const meta = catMeta[cat] || { label:cat, color:'#f1f5f9', border:'#94a3b8' };
    return `
      <div style="margin-bottom:1.5rem">
        <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.85rem;
          padding:.5rem .9rem;background:${meta.color};border-radius:10px;border-left:3px solid ${meta.border}">
          <span style="font-size:.88rem;font-weight:800">${meta.label}</span>
          <span style="font-size:.72rem;color:#64748b;background:rgba(0,0,0,.07);padding:.1rem .45rem;border-radius:20px">${items.length} hướng dẫn</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:.85rem">
          ${items.map(item => `
            <div style="background:var(--card);border:1.5px solid var(--border);border-radius:14px;
              padding:1.1rem 1.25rem;border-left:3px solid ${meta.border}">
              <div style="display:flex;align-items:center;gap:.55rem;margin-bottom:.75rem">
                <span style="font-size:1.15rem">${item.icon}</span>
                <span style="font-size:.88rem;font-weight:800;color:var(--text)">${item.title}</span>
              </div>
              <ol style="margin:0;padding-left:1.2rem;display:flex;flex-direction:column;gap:.4rem">
                ${item.steps.map(s => `<li style="font-size:.81rem;color:var(--text);line-height:1.65">${s}</li>`).join('')}
              </ol>
            </div>`).join('')}
        </div>
      </div>`;
  }).join('');
}
