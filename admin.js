//// Khởi tạo Supabase client (CDN đã load sẵn qua script tag)
const db = supabase.createClient(
  'https://gojpmogjretoxplydjvg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvanBtb2dqcmV0b3hwbHlkanZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0Nzg4ODEsImV4cCI6MjA5MzA1NDg4MX0.iLCNd2VRMiZoFp6_KclZlFsOenUNoM041tl1fobHKDA'
);

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
  // Kiểm tra Gmail
  if (username) {
    let q = db.from('students').select('id,full_name').eq('username', username);
    if (excludeId) q = q.neq('id', excludeId);
    const { data } = await q;
    if (data?.length) warnings.push(`Gmail <b>${username}</b> đã được dùng bởi <b>${data[0].full_name}</b>.`);
  }
  // Kiểm tra SĐT
  if (phone) {
    let q = db.from('students').select('id,full_name').eq('phone', phone);
    if (excludeId) q = q.neq('id', excludeId);
    const { data } = await q;
    if (data?.length) warnings.push(`SĐT <b>${phone}</b> đã được dùng bởi <b>${data[0].full_name}</b>.`);
  }
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
            const csClassSelect = document.getElementById('csClassSelect');
            csClassSelect.value = '';
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
if (_role !== 'teacher' && _role !== 'assistant') location.href = 'index.html';
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

const displayName = sessionStorage.getItem('dh_name') || 'Admin';
const displayRole = isTeacher ? 'Admin' : 'Trợ lý';
document.getElementById('teacherName').textContent = displayName;
document.getElementById('profileName').textContent  = displayName;
document.querySelector('.av-role').textContent      = displayRole;

if (!isTeacher) {
  document.querySelectorAll('[data-page="create-student"]').forEach(el => el.style.display = 'none');
  // Ẩn tất cả các phần liên quan đến duy trì tài khoản (expiry/gia hạn)
  const _hideForAssistant = [
    'expiryReminderPanel',   // Panel nhắc nhở sắp hết hạn (tổng quan)
    'classExpiryNotices',    // Thông báo lớp hết hạn (tổng quan)
    'syncExpiryBtn',         // Nút đồng bộ hết hạn (danh sách học sinh)
    'studentFilterExpiry',   // Filter lọc theo hết hạn (danh sách học sinh)
    'csExpiryGroup',         // Trường ngày hết hạn (form tạo học viên)
    'esExpiryGroup',         // Trường ngày hết hạn (modal sửa học viên)
    'addExpiryGroup',        // Trường ngày hết hạn (modal thêm học viên)
  ];
  _hideForAssistant.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}
document.getElementById('logoutBtn').addEventListener('click', e => { e.preventDefault(); sessionStorage.clear(); location.href='index.html'; });
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
  if (name === 'devices')        renderDeviceAlerts();
  if (name === 'access-stats')   renderAccessStats();
  if (name === 'login-history')  renderLoginHistory();
  if (name === 'announcements')  { populateClassFilters(); renderAnnouncements(); }
  if (name === 'classes')        renderClasses();
  if (name === 'schedule')       { populateClassFilters(); renderSchedule(); }
}
document.querySelectorAll('.slink[data-page]').forEach(l => {
  l.addEventListener('click', e => { e.preventDefault(); showPage(l.dataset.page); document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarBackdrop').classList.remove('show'); });
});
document.querySelectorAll('[data-goto]').forEach(l => {
  l.addEventListener('click', e => { e.preventDefault(); showPage(l.dataset.goto); });
});


// ---- Class filters ----
async function getClasses() {
  const [{ data: cls }, { data: sts }, { data: sc }] = await Promise.all([
    db.from('classes').select('name').order('name'),
    db.from('students').select('class_name'),
    db.from('student_classes').select('class_name'),
  ]);
  const fromClasses  = (cls||[]).map(c => c.name);
  const fromStudents = (sts||[]).map(s => s.class_name).filter(Boolean);
  const fromSC       = (sc||[]).map(s => s.class_name).filter(Boolean);
  return [...new Set([...fromClasses, ...fromStudents, ...fromSC])].sort();
}

async function populateClassFilters() {
  const classes = await getClasses();
  const filterOpts = '<option value="">Tất cả lớp</option>' + classes.map(c=>`<option value="${c}">${c}</option>`).join('');
  const modalOpts  = '<option value="">-- Tất cả lớp --</option>' + classes.map(c=>`<option value="${c}">${c}</option>`).join('');
  ['studentFilterClass','lessonFilterClass','accessFilterClass','loginHistoryFilterClass','annClass','scheduleFilterClass'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    const cur = el.value; el.innerHTML = filterOpts; el.value = cur;
  });
  const lcs = document.getElementById('lClassSelect'); if (lcs) { const cur=lcs.value; lcs.innerHTML=modalOpts; lcs.value=cur; }
  ['addClass','esClass','groupClassSelect','scheduleClass'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    const cur = el.value; el.innerHTML = modalOpts; el.value = cur;
  });
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

  const { data: allLessons } = await db.from('lessons').select('id,name,class_name,description,group_id,group_name').order('created_at', {ascending: false});
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
    // Ưu tiên group_id, fallback group_name cho dữ liệu cũ
    const g = (list||[]).find(x => x.id === gId);
    return (allLessons||[]).filter(l => {
      if (l.group_id) return l.group_id === gId;
      return g && l.group_name === g.name;
    });
  }

  function buildLessonItem(l, idx, onOpen, onEdit, onDel) {
    const item = document.createElement('div');
    item.className = 'group-lesson-item';
    const num = document.createElement('div'); num.className = 'group-lesson-num'; num.textContent = idx + 1;
    const info = document.createElement('div'); info.className = 'group-lesson-info';
    info.innerHTML = `<div class="group-lesson-title"><span style="margin-right:.35rem">📚</span>${l.name}</div>
      <div class="group-lesson-stats"><span>${vcMap[l.id]||0} video</span><span>${dcMap[l.id]||0} tài liệu</span>${l.class_name?`<span class="class-tag" style="font-size:.68rem">${l.class_name}</span>`:''}</div>`;
    const acts = document.createElement('div'); acts.className = 'group-lesson-item-actions';
    const openBtn = document.createElement('button'); openBtn.className = 'group-lesson-open'; openBtn.textContent = '→';
    openBtn.addEventListener('click', e => { e.stopPropagation(); onOpen(); });
    acts.appendChild(openBtn);
    if (onEdit) { const eb = document.createElement('button'); eb.className = 'btn-sm'; eb.textContent = '✏️'; eb.addEventListener('click', e => { e.stopPropagation(); onEdit(); }); acts.appendChild(eb); }
    if (onDel)  { const db2 = document.createElement('button'); db2.className = 'btn-sm btn-danger'; db2.textContent = '🗑'; db2.addEventListener('click', e => { e.stopPropagation(); onDel(); }); acts.appendChild(db2); }
    item.appendChild(num); item.appendChild(info); item.appendChild(acts);
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
            () => showConfirm(`Xóa bài học "${l.name}"?`, async () => { await db.from('lessons').delete().eq('id', l.id); renderGroups(); })
          ));
        });
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

  populateClassFilters().then(() => {
    // Reset select về mặc định
    const sel = document.getElementById('groupClassSelect');
    if (sel) sel.value = '';
    renderGroupClassTags(_groupSelectedClasses);
  });
  document.getElementById('groupModal').classList.add('open');
}

// Khi chọn lớp từ dropdown → thêm vào tags
document.getElementById('groupClassSelect').addEventListener('change', function() {
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
  const err = document.getElementById('groupError');
  if (!name) { err.textContent = 'Vui lòng nhập tên nhóm.'; return; }

  if (editingGroupId) {
    await db.from('lesson_groups').update({ name, class_name: cls }).eq('id', editingGroupId);
    if (oldName && oldName !== name) await db.from('lessons').update({ group_name: name }).eq('group_name', oldName);
    // Đồng bộ toàn bộ bài học trong nhóm theo class_name mới của nhóm
    const [{ data: byId }, { data: byName }] = await Promise.all([
      db.from('lessons').select('id').eq('group_id', editingGroupId),
      name ? db.from('lessons').select('id').eq('group_name', name) : { data: [] },
    ]);
    const allLessonIds = [...new Set([...(byId||[]), ...(byName||[])].map(l => l.id))];
    for (const lessonId of allLessonIds) {
      await db.from('lessons').update({ class_name: cls }).eq('id', lessonId);
    }
  } else {
    const { error } = await db.from('lesson_groups').insert({
      name,
      class_name: cls,
      parent_id: parentId ? parseInt(parentId) : null
    });
    if (error) { err.textContent = 'Tên nhóm đã tồn tại.'; return; }
  }
  document.getElementById('groupModal').classList.remove('open');
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
  const el = document.getElementById('csClassSelect');
  if (!el) return;
  const cur = el.value;
  el.innerHTML = '<option value="">-- Chon lop --</option>' + classes.map(c=>`<option value="${c}">${c}</option>`).join('');
  el.value = cur;
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

// Khi chọn lớp → tự điền ngày hết hạn theo lớp
document.getElementById('csClassSelect').addEventListener('change', async () => {
  const cls = document.getElementById('csClassSelect').value;
  if (!cls) return;
  const { data } = await db.from('classes').select('end_date').eq('name', cls).single();
  if (data?.end_date) {
    document.getElementById('csExpiry').value = data.end_date;
  }
});

// Tự động tạo mã học viên 5 ký tự unique
async function genStudentCode() {
  const { data: existing } = await db.from('students').select('student_code');
  const usedCodes = new Set((existing||[]).map(s => s.student_code).filter(Boolean));
  // Loại bỏ ký tự dễ nhầm: i, l, I, O, o, 0, 1
  const upper  = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const lower  = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all    = upper + lower + digits;
  let code;
  do {
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
    code = arr.join('');
  } while (usedCodes.has(code));
  return code;
}

document.getElementById('csSaveBtn').addEventListener('click', async () => {
  const code     = document.getElementById('csCode').value.trim();
  const name     = document.getElementById('csName').value.trim();
  const phone    = document.getElementById('csPhone').value.trim();
  const username = document.getElementById('csUsername').value.trim();
  let   password = document.getElementById('csPassword').value.trim();
  const cls      = document.getElementById('csClassSelect').value;
  const expiry   = document.getElementById('csExpiry').value || null;
  const notes    = document.getElementById('csNotes').value.trim() || null;
  const err = document.getElementById('csError');
  const suc = document.getElementById('csSuccess');
  err.textContent = ''; suc.textContent = '';

  if (!name)     { err.textContent = 'Vui long nhap ho va ten.'; return; }
  if (!username) { err.textContent = 'Vui long nhap Gmail.'; return; }
  if (!isValidGmail(username)) { err.textContent = 'Gmail không hợp lệ. VD: hocsinh@gmail.com'; return; }
  if (!cls)      { err.textContent = 'Vui lòng chọn lớp.'; return; }

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
    document.getElementById('csClassSelect').value = '';
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
    class_name: cls || null,
    active: true, expiry_date: isTeacher ? expiry : null, notes
  }).select('id').single();

  if (error) { err.textContent = error.message.includes('unique') ? 'Gmail nay da ton tai.' : error.message; return; }
  // Thêm vào student_classes
  if (cls && newStudent?.id) {
    await db.from('student_classes').insert({ student_id: newStudent.id, class_name: cls });
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
    const { data: clsInfo } = await db.from('classes').select('start_date,end_date').eq('name', cls).single();
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
  document.getElementById('csClassSelect').value = '';
  err.textContent = ''; suc.textContent = '';

  // Tao ma moi cho lan tiep theo
  genStudentCode().then(c => {
    document.getElementById('csCode').value = c;
    document.getElementById('csPassword').value = c;
  });

  logAccountActivity('Tạo tài khoản', { full_name: name, username, class_name: cls });
  await renderMiniStudents();
  await populateClassFilters();
});

document.getElementById('csResetBtn').addEventListener('click', () => {
  ['csCode','csName','csPhone','csUsername','csPassword'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('csExpiry').value = '';
  document.getElementById('csNotes').value = '';
  document.getElementById('csClassSelect').value = '';
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
  // Không filter theo lớp ở DB vì class_name có thể chứa nhiều lớp
  const { data: list } = await query;

  const today = new Date(); today.setHours(0,0,0,0);
  const { data: allClasses } = await db.from('classes').select('name,end_date');
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
  const updates={ student_code:code, full_name:name, username, class_name:cls||null, notes };
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
document.getElementById('pwSaveBtn').addEventListener('click', async () => {
  const old=document.getElementById('pwOld').value, nw=document.getElementById('pwNew').value, cf=document.getElementById('pwConfirm').value;
  const err=document.getElementById('pwError'), ok=document.getElementById('pwSuccess');
  err.textContent=''; ok.textContent='';
  const t=JSON.parse(localStorage.getItem('dh_teacher'));

  const oldHash = await hashPw(old);
  if (oldHash !== t.passwordHash) { err.textContent='Mật khẩu hiện tại không đúng.'; return; }
  if (!nw) { err.textContent='Vui lòng nhập mật khẩu mới.'; return; }
  if (nw!==cf) { err.textContent='Mật khẩu xác nhận không khớp.'; return; }
  const newHash = await hashPw(nw);
  localStorage.setItem('dh_teacher', JSON.stringify({...t, passwordHash: newHash, hashed: true }));
  ok.textContent='Đổi mật khẩu thành công!';
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
  let query = db.from('lessons').select('*').order('group_name',{ascending:true}).order('created_at',{ascending:false});
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
          const num = document.createElement('div'); num.className = 'group-lesson-num'; num.textContent = idx+1;
          const info = document.createElement('div'); info.className = 'group-lesson-info';
          info.innerHTML = `<div class="group-lesson-title"><span style="margin-right:.35rem">\uD83D\uDCDA</span>${l.name}</div><div class="group-lesson-stats"><span>\uD83C\uDFAC ${vc}</span><span>\uD83D\uDCC4 ${dc}</span>${l.class_name?`<span class="class-tag" style="font-size:.68rem">${l.class_name}</span>`:''}</div>`;
          const acts = document.createElement('div'); acts.className = 'group-lesson-item-actions';
          const openBtn = document.createElement('button'); openBtn.className = 'group-lesson-open'; openBtn.textContent = String.fromCharCode(8594);
          openBtn.addEventListener('click', e => { e.stopPropagation(); openLessonDetail(l.id); });
          const eb = document.createElement('button'); eb.className = 'btn-sm'; eb.textContent = String.fromCharCode(9999,65039);
          eb.addEventListener('click', e => { e.stopPropagation(); openLessonModal(l); });
          const db2 = document.createElement('button'); db2.className = 'btn-sm btn-danger'; db2.textContent = String.fromCharCode(128465);
          db2.addEventListener('click', e => { e.stopPropagation(); showConfirm(`Xoa bai hoc "${l.name}"?`, async () => { await db.from('lessons').delete().eq('id',l.id); renderLessons(); }); });
          acts.appendChild(openBtn); acts.appendChild(eb); acts.appendChild(db2);
          item.appendChild(num); item.appendChild(info); item.appendChild(acts);
          item.addEventListener('click', () => openLessonDetail(l.id));
          inner.appendChild(item);
        });
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
    document.getElementById('lInlineDocLinks').value = '';
    document.getElementById('lInlineHwLinks').value = '';
  }
  // Truyền group_id nếu có, fallback group_name cũ
  populateGroupSelect('lGroupInput', l ? (l.group_id || l.group_name || '') : '');
  document.getElementById('lessonModal').classList.add('open');
}
document.getElementById('openAddLessonBtn').addEventListener('click', () => openLessonModal());
document.getElementById('lCancelBtn').addEventListener('click', () => document.getElementById('lessonModal').classList.remove('open'));
document.getElementById('lSaveBtn').addEventListener('click', async () => {
  const name = document.getElementById('lNameInput').value.trim(), err = document.getElementById('lError');
  if (!name) { err.textContent = 'Vui lòng nhập tên bài học.'; return; }
  const desc  = document.getElementById('lDescInput').value.trim();
  const groupId = document.getElementById('lGroupInput').value || null;
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
    await db.from('lessons').update({ name, class_name: cls, description: desc, group_id: groupId ? parseInt(groupId) : null, group_name: groupName }).eq('id', editingLessonId);
  } else {
    const { data: newLesson } = await db.from('lessons').insert({ name, class_name: cls, description: desc, group_id: groupId ? parseInt(groupId) : null, group_name: groupName }).select('id').single();
    lessonId = newLesson?.id;

    // Lưu video links inline
    if (lessonId) {
      const rawVideo = document.getElementById('lInlineVideoLinks').value.trim();
      if (rawVideo) {
        const videoLinks = rawVideo.split('\n').map(l=>l.trim()).filter(Boolean);
        for (const url of videoLinks) {
          await db.from('lesson_videos').insert({ lesson_id: lessonId, title: 'Video bài học', video_url: await encryptUrl(url), storage_path: null, file_name: null });
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
  await renderLessons();
});

async function openLessonDetail(id) {
  currentLessonId = id;
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
document.getElementById('backToLessonsBtn').addEventListener('click', renderLessons);

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
  const title = 'Video bài học';
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
    // Lấy học viên từ student_classes (bao gồm cả lớp phụ)
    const studentIds = scMap[cls] ? [...scMap[cls]] : [];
    const students = studentIds.map(id => studentMap[id]).filter(Boolean);
    // Fallback: học viên có class_name = cls nhưng chưa có trong student_classes
    const fallback = (allStudentsFull||[]).filter(s => s.class_name === cls && !scMap[cls]?.has(s.id));
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
  // Fallback: học viên có class_name = cls nhưng chưa có trong student_classes
  const { data: fallbackList } = await db.from('students').select('*').eq('class_name', cls).limit(10000);
  const fallbackIds = (fallbackList||[]).map(s => s.id).filter(id => !scIds.includes(id));
  const allIds = [...new Set([...scIds, ...fallbackIds])];
  let list = [];
  if (allIds.length) {
    const { data } = await db.from('students').select('*').in('id', allIds).limit(10000);
    list = data || [];
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

let editingClassName=null;
// ---- Xóa lớp: 3 chức năng ----
function openDeleteClassModal(cls, allIds, studentCount) {
  document.getElementById('deleteClassTitle').textContent = `Xóa lớp "${cls}"`;
  document.getElementById('deleteClassDesc').textContent = `Lớp có ${studentCount} học viên. Chọn hành động:`;
  document.getElementById('deleteClassModal').classList.add('open');

  // Helper: xóa lớp khỏi students.class_name
  async function removeClassFromStudents(className) {
    const { data: affected } = await db.from('students').select('id,class_name').ilike('class_name', `%${className}%`);
    for (const s of (affected||[])) {
      const classes = (s.class_name||'').split(',').map(c=>c.trim());
      if (!classes.includes(className)) continue;
      const updated = classes.filter(c => c !== className);
      await db.from('students').update({ class_name: updated.join(',') || null }).eq('id', s.id);
    }
  }

  // Helper: xóa bảng lớp + student_classes
  async function deleteClassRecord(className) {
    await db.from('classes').delete().eq('name', className);
    await db.from('student_classes').delete().eq('class_name', className);
  }

  const closeModal = () => document.getElementById('deleteClassModal').classList.remove('open');

  // Gán sự kiện — clone để tránh listener chồng
  ['delCls_keepAll','delCls_delAll','delCls_selective','deleteClassCancelBtn'].forEach(id => {
    const el = document.getElementById(id);
    const clone = el.cloneNode(true);
    el.replaceWith(clone);
  });

  // Nút Hủy
  document.getElementById('deleteClassCancelBtn').addEventListener('click', closeModal, { once: true });

  // Option 1: Xóa lớp, giữ học viên
  document.getElementById('delCls_keepAll').addEventListener('click', async () => {
    closeModal();
    await deleteClassRecord(cls);
    await removeClassFromStudents(cls);
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
  renderClasses(); populateClassFilters();
});

// ============================================================
// DEVICE ALERTS
// ============================================================
async function renderDeviceAlerts() {
  const q = (document.getElementById('deviceAlertSearch').value || '').toLowerCase();
  const { data: list } = await db.from('alerts').select('*')
    .or(`reason.eq.Đăng nhập thiết bị mới — thiết bị cũ bị đăng xuất,reason.eq.Đăng nhập từ thiết bị khác trong vòng 5 phút,reason.eq.Đăng nhập sai mật khẩu 5 lần liên tiếp,reason.like.%Admin%`)
    .order('created_at', { ascending: false });
  const filtered = (list||[]).filter(a => !q || (a.student_name||'').toLowerCase().includes(q));
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
          <span class="alert-badge">Đăng nhập thiết bị mới</span>
          • ${fmtTime(a.created_at)}
        </div>
      </div>`;
    el.appendChild(row);
  });
}
document.getElementById('deviceAlertSearch').addEventListener('input', renderDeviceAlerts);
document.getElementById('clearDeviceAlertsBtn').addEventListener('click', async () => {
  showConfirm('Xóa toàn bộ cảnh báo thiết bị?', async () => {
    await db.from('alerts').delete().in('reason', [
      'Đăng nhập thiết bị mới — thiết bị cũ bị đăng xuất',
      'Đăng nhập từ thiết bị khác trong vòng 5 phút',
      'Đăng nhập sai mật khẩu 5 lần liên tiếp'
    ]);
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
const _validPages = ['overview','lessons','lesson-groups','create-student','students','classes','security','devices','access-stats','login-history','announcements','schedule','profile'];
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

async function renderAnnouncements() {
  const { data: list } = await db.from('announcements').select('*').order('created_at', {ascending:false});
  const el = document.getElementById('annList');
  el.innerHTML = '';
  document.getElementById('emptyAnn').style.display = (list||[]).length ? 'none' : 'block';
  (list||[]).forEach(a => {
    const row = document.createElement('div');
    row.className = 'content-row';
    row.style.flexDirection = 'column';
    row.style.alignItems = 'flex-start';
    row.style.gap = '.4rem';
    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:.5rem;width:100%">
        ${a.pinned ? '<span style="color:#f59e0b;font-size:1rem">📌</span>' : '<span style="font-size:1rem">📢</span>'}
        <div style="flex:1;font-weight:700;font-size:.92rem">${a.title}</div>
        ${a.class_name ? `<span class="class-tag">${a.class_name}</span>` : a.target_username ? `<span class="class-tag" style="background:#d1fae5;color:#065f46">👤 Cá nhân</span>` : '<span class="class-tag" style="background:#e0f2fe;color:#0369a1">Tất cả</span>'}
        <div style="display:flex;gap:.3rem">
          <button class="btn-sm" data-action="edit">✏️</button>
          <button class="btn-sm btn-danger" data-action="delete">🗑</button>
        </div>
      </div>
      <div style="font-size:.83rem;color:var(--muted);padding-left:1.75rem;line-height:1.6;white-space:pre-line">${a.content}</div>
      ${a.link_url ? `<div style="padding-left:1.75rem;margin-top:.4rem"><a href="${a.link_url}" target="_blank" style="color:#6366f1;font-size:.82rem;font-weight:600;text-decoration:none">🔗 ${a.link_text||a.link_url}</a></div>` : ''}
      <div style="font-size:.75rem;color:#94a3b8;padding-left:1.75rem">${new Date(a.created_at).toLocaleString('vi-VN')}${a.expires_at ? ` • ⏱ Hết hạn: ${new Date(a.expires_at).toLocaleString('vi-VN')}` : ''}</div>
    `;
    row.querySelector('[data-action="edit"]').addEventListener('click', () => {
      editingAnnId = a.id;
      document.getElementById('annFormTitle').textContent = '✏️ Sửa thông báo';
      document.getElementById('annTitle').value = a.title;
      document.getElementById('annContent').value = a.content;
      document.getElementById('annClass').value = a.class_name || '';
      document.getElementById('annPinned').checked = a.pinned;
    });
    row.querySelector('[data-action="delete"]').addEventListener('click', () => {
      showConfirm(`Xóa thông báo "${a.title}"?`, async () => {
        await db.from('announcements').delete().eq('id', a.id);
        renderAnnouncements();
      });
    });
    el.appendChild(row);
  });
}

document.getElementById('annSaveBtn').addEventListener('click', async () => {
  const title   = document.getElementById('annTitle').value.trim();
  const content = document.getElementById('annContent').value.trim();
  const cls     = document.getElementById('annClass').value;
  const pinned  = document.getElementById('annPinned').checked;
  const expire24h = document.getElementById('annExpire24h')?.checked;
  const link_url  = document.getElementById('annLink')?.value.trim() || null;
  const link_text = document.getElementById('annLinkText')?.value.trim() || null;
  const err     = document.getElementById('annError');
  err.textContent = '';
  if (!title)   { err.textContent = 'Vui lòng nhập tiêu đề.'; return; }
  if (!content) { err.textContent = 'Vui lòng nhập nội dung.'; return; }

  const expires_at = expire24h ? new Date(Date.now() + 24*60*60*1000).toISOString() : null;
  const selectedUsername = document.getElementById('annStudentSearch')?.dataset.selectedUsername || '';
  const finalClass = selectedUsername ? null : (cls || null);
  const target_username = selectedUsername || null;

  if (editingAnnId) {
    await db.from('announcements').update({ title, content, class_name: finalClass, pinned, expires_at, target_username, link_url, link_text }).eq('id', editingAnnId);
  } else {
    await db.from('announcements').insert({ title, content, class_name: finalClass, pinned, expires_at, target_username, link_url, link_text });
  }
  editingAnnId = null;
  document.getElementById('annFormTitle').textContent = '✏️ Tạo thông báo mới';
  document.getElementById('annTitle').value = '';
  document.getElementById('annContent').value = '';
  document.getElementById('annLink').value = '';
  document.getElementById('annLinkText').value = '';
  document.getElementById('annClass').value = '';
  document.getElementById('annPinned').checked = false;
  if (document.getElementById('annExpire24h')) document.getElementById('annExpire24h').checked = false;
  const annSearch = document.getElementById('annStudentSearch');
  if (annSearch) { annSearch.value = ''; annSearch.dataset.selectedUsername = ''; }
  document.getElementById('annStudentSelected').style.display = 'none';
  renderAnnouncements();
});

document.getElementById('annCancelBtn').addEventListener('click', () => {
  editingAnnId = null;
  document.getElementById('annFormTitle').textContent = '✏️ Tạo thông báo mới';
  document.getElementById('annTitle').value = '';
  document.getElementById('annContent').value = '';
  document.getElementById('annClass').value = '';
  document.getElementById('annPinned').checked = false;
  document.getElementById('annError').textContent = '';
  const annSearch = document.getElementById('annStudentSearch');
  if (annSearch) { annSearch.value = ''; annSearch.dataset.selectedUsername = ''; }
  document.getElementById('annStudentSelected').style.display = 'none';
});

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
  }, 10000);
}
function stopStudentAutoRefresh() {
  if (_studentRefreshTimer) { clearInterval(_studentRefreshTimer); _studentRefreshTimer = null; }
}

// Auto-refresh online panel trên tổng quan mỗi 20s (fallback)
setInterval(() => {
  if (document.getElementById('pageOverview')?.classList.contains('active')) {
    renderOnlineStudents();
  }
}, 15000);

// ── Realtime: online students ──
db.channel('realtime-online')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, () => {
    if (document.getElementById('pageOverview')?.classList.contains('active')) {
      renderOnlineStudents();
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
    if (document.getElementById('pageLessons')?.classList.contains('active')) renderLessons();
  })
  .on('postgres_changes', { event: '*', schema: 'public', table: 'lesson_docs' }, () => {
    if (currentLessonId && document.getElementById('lessonDetailView')?.style.display !== 'none') {
      renderLessonDocs(currentLessonId);
    }
    if (document.getElementById('pageLessons')?.classList.contains('active')) renderLessons();
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

// ============================================================
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
if (isDark) { document.body.classList.add('dark-mode'); darkBtn.textContent = '☀️'; }

darkBtn?.addEventListener('click', () => {
  const on = document.body.classList.toggle('dark-mode');
  darkBtn.textContent = on ? '☀️' : '🌙';
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
    location.href = 'index.html';
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
// LỊCH HỌC
// ============================================================
let pendingScheduleFile = null;

async function renderSchedule() {
  const cls = document.getElementById('scheduleFilterClass')?.value || '';
  let query = db.from('schedules').select('*').order('created_at', { ascending: false });
  if (cls) query = query.eq('class_name', cls);
  const { data: list } = await query;
  const grid = document.getElementById('scheduleGrid');
  grid.innerHTML = '';
  document.getElementById('emptySchedule').style.display = (list||[]).length ? 'none' : 'block';
  (list||[]).forEach(s => {
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--card);border-radius:14px;overflow:hidden;box-shadow:var(--shadow);border:1.5px solid var(--border)';
    card.innerHTML = `
      <img src="${s.image_url}" style="width:100%;max-height:220px;object-fit:cover;cursor:pointer" onclick="window.open('${s.image_url}','_blank')"/>
      <div style="padding:.75rem 1rem;display:flex;align-items:center;justify-content:space-between;gap:.5rem">
        <div>
          <div style="font-weight:700;font-size:.9rem">${s.title}</div>
          <div style="font-size:.75rem;color:var(--muted);margin-top:.15rem">${s.class_name ? `<span class="class-tag">${s.class_name}</span>` : 'Tất cả lớp'} • ${fmtTime(s.created_at)}</div>
        </div>
        <button class="btn-sm btn-danger" data-del="${s.id}">🗑</button>
      </div>`;
    card.querySelector('[data-del]').addEventListener('click', () => {
      showConfirm(`Xóa lịch học "${s.title}"?`, async () => {
        // Xóa file storage nếu có
        if (s.image_url?.includes('supabase')) {
          const path = s.image_url.split('/schedules/')[1];
          if (path) await db.storage.from('schedules').remove([path]);
        }
        await db.from('schedules').delete().eq('id', s.id);
        renderSchedule();
      });
    });
    grid.appendChild(card);
  });
}

document.getElementById('scheduleFilterClass')?.addEventListener('change', renderSchedule);

document.getElementById('openAddScheduleBtn')?.addEventListener('click', async () => {
  pendingScheduleFile = null;
  document.getElementById('scheduleTitle').value = '';
  document.getElementById('scheduleFileInfo').textContent = '';
  document.getElementById('schedulePreview').style.display = 'none';
  document.getElementById('scheduleError').textContent = '';
  await populateClassFilters();
  document.getElementById('scheduleClass').value = '';
  document.getElementById('addScheduleModal').classList.add('open');
});

document.getElementById('scheduleCancelBtn')?.addEventListener('click', () => {
  document.getElementById('addScheduleModal').classList.remove('open');
  pendingScheduleFile = null;
});

document.getElementById('scheduleFileInput')?.addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  pendingScheduleFile = f;
  document.getElementById('scheduleFileInfo').textContent = `📎 ${f.name}`;
  const reader = new FileReader();
  reader.onload = ev => {
    document.getElementById('schedulePreviewImg').src = ev.target.result;
    document.getElementById('schedulePreview').style.display = '';
  };
  reader.readAsDataURL(f);
});

// Drag & drop
const dropZone = document.getElementById('scheduleDropZone');
dropZone?.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor = 'var(--primary)'; });
dropZone?.addEventListener('dragleave', () => { dropZone.style.borderColor = 'var(--border)'; });
dropZone?.addEventListener('drop', e => {
  e.preventDefault(); dropZone.style.borderColor = 'var(--border)';
  const f = e.dataTransfer.files[0]; if (!f || !f.type.startsWith('image/')) return;
  pendingScheduleFile = f;
  document.getElementById('scheduleFileInfo').textContent = `📎 ${f.name}`;
  const reader = new FileReader();
  reader.onload = ev => { document.getElementById('schedulePreviewImg').src = ev.target.result; document.getElementById('schedulePreview').style.display = ''; };
  reader.readAsDataURL(f);
});

document.getElementById('scheduleSaveBtn')?.addEventListener('click', async () => {
  const title = document.getElementById('scheduleTitle').value.trim();
  const cls   = document.getElementById('scheduleClass').value;
  const err   = document.getElementById('scheduleError');
  const btn   = document.getElementById('scheduleSaveBtn');
  if (!title) { err.textContent = 'Vui lòng nhập tiêu đề.'; return; }
  if (!pendingScheduleFile) { err.textContent = 'Vui lòng chọn hình ảnh.'; return; }
  btn.textContent = '⏳ Đang lưu...'; btn.disabled = true;
  const safeName = `${Date.now()}_${pendingScheduleFile.name.replace(/[^a-zA-Z0-9.\-_]/g,'_')}`;
  const { error: upErr } = await db.storage.from('schedules').upload(safeName, pendingScheduleFile, { cacheControl: '3600', upsert: false });
  if (upErr) { err.textContent = 'Lỗi upload: ' + upErr.message; btn.textContent = '💾 Lưu'; btn.disabled = false; return; }
  const { data: urlData } = db.storage.from('schedules').getPublicUrl(safeName);
  await db.from('schedules').insert({ title, class_name: cls || null, image_url: urlData.publicUrl });
  btn.textContent = '💾 Lưu'; btn.disabled = false;
  document.getElementById('addScheduleModal').classList.remove('open');
  pendingScheduleFile = null;
  renderSchedule();
});
