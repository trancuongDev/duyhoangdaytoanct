// Khởi tạo Supabase client
const db = supabase.createClient(
  'https://gojpmogjretoxplydjvg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvanBtb2dqcmV0b3hwbHlkanZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0Nzg4ODEsImV4cCI6MjA5MzA1NDg4MX0.iLCNd2VRMiZoFp6_KclZlFsOenUNoM041tl1fobHKDA'
);

// ---- Giải mã link AES-GCM ----
const _ENC_KEY = 'DHDTCT-LMS-2025-SECURE-KEY-32BYT'; // 32 ký tự
async function _getKey() {
  const raw = new TextEncoder().encode(_ENC_KEY.slice(0,32).padEnd(32,'0'));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt','decrypt']);
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

// Auth guard
if (sessionStorage.getItem('dh_role') !== 'student') location.href = 'index.html';

// ── Xác thực session token với DB ngay khi load ──
(async () => {
  const username = sessionStorage.getItem('dh_user');
  const token    = sessionStorage.getItem('dh_token');
  if (!username || !token) { sessionStorage.clear(); location.href = 'index.html'; return; }
  try {
    const { data: s } = await db.from('students').select('session_token,active').eq('username', username).single();
    if (!s || s.session_token !== token || s.active === false) {
      sessionStorage.clear();
      location.href = 'index.html';
    }
  } catch(e) { /* network error — cho qua */ }
})();

// Kiểm tra bảo trì
(async () => {
  try {
    const { data } = await db.from('app_settings').select('value').eq('key', 'maintenance').maybeSingle();
    if (data?.value === 'true') {
      if (typeof _wmDestroyed !== 'undefined') _wmDestroyed = true;
      document.body.style.cssText = 'margin:0;padding:0;overflow:hidden';
      document.body.innerHTML = `
        <div style="min-height:100vh;width:100vw;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1e1b4b,#312e81);padding:2rem;box-sizing:border-box">
          <div style="background:#fff;border-radius:20px;padding:2.5rem 2rem;text-align:center;max-width:420px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.3)">
            <img src="btht.png" alt="Bảo trì" style="width:100%;border-radius:12px;margin-bottom:1.25rem"/>
            <div style="font-size:1.3rem;font-weight:800;color:#1e1b4b;margin-bottom:.75rem">Hệ thống đang bảo trì</div>
            <div style="font-size:.9rem;color:#64748b;line-height:1.7;margin-bottom:1.5rem">
              Chúng tôi đang nâng cấp hệ thống để phục vụ bạn tốt hơn.<br/>
              Vui lòng quay lại sau ít phút.
            </div>
            <div style="font-size:.82rem;color:#94a3b8">trợ lý và giáo viên ko hổ trợ duy trì tài khoản.</div>
          </div>
        </div>`;
    }
  } catch(e) { /* Bảng chưa tạo hoặc lỗi — bỏ qua */ }
})();

const currentUser = sessionStorage.getItem('dh_user');
const currentName = sessionStorage.getItem('dh_name') || currentUser;

document.getElementById('studentName').textContent  = currentName;
document.getElementById('welcomeTitle').textContent = `Xin chào, ${currentName}! 👋`;
document.getElementById('profileName').textContent  = currentName;

let myClass = '';
let myClasses = []; // Hỗ trợ nhiều lớp — load từ student_classes

function parseClassList(raw) {
  return (raw || '')
    .split(',')
    .map(c => c.trim())
    .filter(Boolean);
}

function lessonMatchesStudentClasses(lesson, classes) {
  const lessonClasses = (lesson?.class_name || '')
    .split(',')
    .map(c => c.trim())
    .filter(Boolean);
  if (!lessonClasses.length) return true; // null/empty = tất cả lớp
  return classes.some(cls => lessonClasses.includes(cls));
}


// Debounce helper
function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function loadMe() {
  const { data } = await db.from('students').select('id, class_name, student_code, expiry_date, created_at, username, active').eq('username', currentUser).single();
  myClass = data?.class_name || '';
  // Load tất cả lớp từ student_classes
  if (data?.id) {
    const { data: scData } = await db.from('student_classes').select('class_name').eq('student_id', data.id);
    myClasses = (scData||[]).length > 0
      ? (scData||[]).flatMap(sc => parseClassList(sc.class_name))
      : parseClassList(myClass);
  } else {
    myClasses = parseClassList(myClass);
  }
  myClasses = [...new Set(myClasses)];
  myClass = myClasses[0] || ''; // giữ tương thích chỗ cũ dùng myClass
  sessionStorage.setItem('dh_code', data?.student_code || '');

  const today = new Date(); today.setHours(0,0,0,0);
  const WARN_DAYS = 7;
  const fmt = d => d ? new Date(d).toLocaleDateString('vi-VN') : '—';

  // Điền hồ sơ cơ bản
  const av = document.getElementById('profileAvatar');
  if (av) av.textContent = (currentName||'?')[0].toUpperCase();
  const el = id => document.getElementById(id);
  if (el('profileClass'))    el('profileClass').textContent    = myClasses.length ? `🎓 Lớp: ${myClasses.join(', ')}` : '';
  if (el('profileCode'))     el('profileCode').textContent     = data?.student_code ? `Mã HV: ${data.student_code}` : '';
  if (el('profileUsername')) el('profileUsername').textContent = data?.username || '—';
  if (el('profileCreated'))  el('profileCreated').textContent  = data?.created_at ? fmt(data.created_at) : '—';

  // Lấy thông tin tất cả lớp học
  let clsData = null;
  let allClsData = [];
  if (myClasses.length) {
    const { data: clsList } = await db.from('classes').select('name,start_date,end_date').in('name', myClasses);
    allClsData = clsList || [];
    // Lấy lớp đầu tiên để hiển thị profile (hoặc lớp sắp hết hạn nhất)
    clsData = allClsData[0] || null;
  }

  if (el('profileStartDate')) el('profileStartDate').textContent = clsData?.start_date ? fmt(clsData.start_date) : '—';
  if (el('profileEndDate')) {
    if (clsData?.end_date) {
      const end = new Date(clsData.end_date); end.setHours(0,0,0,0);
      const daysLeft = Math.round((end - today) / 86400000);
      let badge = '';
      if (daysLeft < 0)        badge = `<span style="margin-left:.4rem;font-size:.72rem;background:#fee2e2;color:#991b1b;padding:.15rem .5rem;border-radius:6px;font-weight:700">Đã kết thúc</span>`;
      else if (daysLeft === 0) badge = `<span style="margin-left:.4rem;font-size:.72rem;background:#fef3c7;color:#92400e;padding:.15rem .5rem;border-radius:6px;font-weight:700">Hôm nay</span>`;
      else if (daysLeft <= 7)  badge = `<span style="margin-left:.4rem;font-size:.72rem;background:#fef3c7;color:#92400e;padding:.15rem .5rem;border-radius:6px;font-weight:700">Còn ${daysLeft} ngày</span>`;
      else                     badge = `<span style="margin-left:.4rem;font-size:.72rem;background:#d1fae5;color:#065f46;padding:.15rem .5rem;border-radius:6px;font-weight:700">Còn ${daysLeft} ngày</span>`;
      el('profileEndDate').innerHTML = `${fmt(clsData.end_date)}${badge}`;
    } else {
      el('profileEndDate').textContent = '—';
    }
  }

  // Kiểm tra hết hạn và tự khóa
  const banner = document.getElementById('expiryBanner');
  let locked = false;

  function showExpiryBanner(daysLeft, dateStr, type) {
    banner.style.display = 'block';
    const isUrgent = daysLeft <= 3;
    const color = daysLeft === 0 ? '#dc2626' : isUrgent ? '#d97706' : '#2563eb';
    const bg    = daysLeft === 0 ? '#fee2e2' : isUrgent ? '#fef3c7' : '#eff6ff';
    const icon  = daysLeft === 0 ? '🔴' : isUrgent ? '⚠️' : '📅';
    const msg   = daysLeft === 0
      ? `Tài khoản hết hạn <b>hôm nay</b>! trợ lý và giáo viên ko hổ trợ duy trì tài khoản.`
      : daysLeft < 0
      ? `Tài khoản đã hết hạn vào <b>${dateStr}</b>. trợ lý và giáo viên ko hổ trợ duy trì tài khoản.`
      : `${type === 'class' ? `Khóa học <b>${myClass}</b>` : 'Tài khoản'} sẽ hết hạn vào <b>${dateStr}</b> — còn <b>${daysLeft} ngày</b>. trợ lý và giáo viên ko hổ trợ duy trì tài khoản.`;
    banner.style.cssText = `display:block;background:${bg};border-left:4px solid ${color};border-radius:10px;padding:.75rem 1rem;margin-bottom:1rem;font-size:.88rem;color:${color};font-weight:600`;
    banner.innerHTML = `${icon} ${msg}`;
  }

  // Hết hạn lớp học — kiểm tra tất cả lớp
  if (!locked) {
    const today0 = new Date(); today0.setHours(0,0,0,0);

    // Phân loại lớp còn hạn và lớp đã hết hạn
    const activeCls  = allClsData.filter(c => !c.end_date || new Date(c.end_date) >= today0);
    const expiredCls = allClsData.filter(c => c.end_date && new Date(c.end_date) < today0);

    if (activeCls.length === 0 && expiredCls.length > 0) {
      // Tất cả lớp đều hết hạn → khóa tài khoản
      await db.from('students').update({ active: false }).eq('username', currentUser);
      locked = true;
    } else {
      // Còn ít nhất 1 lớp hợp lệ → chỉ hiện banner nếu lớp sắp hết hạn
      const soonCls = activeCls
        .filter(c => c.end_date)
        .map(c => { const end = new Date(c.end_date); end.setHours(0,0,0,0); return { ...c, daysLeft: Math.round((end - today0) / 86400000) }; })
        .filter(c => c.daysLeft <= WARN_DAYS)
        .sort((a,b) => a.daysLeft - b.daysLeft)[0];
      if (soonCls) {
        const end = new Date(soonCls.end_date);
        showExpiryBanner(soonCls.daysLeft, end.toLocaleDateString('vi-VN'), 'class');
      }
    }
  }

  // Nếu bị khóa → đăng xuất ngay
  if (locked) {
    alert('Khóa học của bạn đã kết thúc. Tài khoản đã bị khóa. trợ lý và giáo viên ko hổ trợ duy trì tài khoản.');
    sessionStorage.clear();
    location.href = 'index.html';
    return;
  }

  // Trạng thái
  if (el('profileStatus')) {
    const endDate = clsData?.end_date ? new Date(clsData.end_date) : null;
    const daysLeft = endDate ? Math.round((endDate - today) / 86400000) : null;
    if (daysLeft !== null && daysLeft <= 7 && daysLeft >= 0) {
      el('profileStatus').innerHTML = `<span style="color:var(--warning);font-weight:700">⚠️ Sắp kết thúc (${daysLeft} ngày)</span>`;
    } else {
      el('profileStatus').innerHTML = `<span style="color:var(--success);font-weight:700">✅ Đang hoạt động</span>`;
    }
  }
}

async function setOffline() {
  await db.from('students').update({ is_online: false, last_seen: new Date().toISOString() }).eq('username', currentUser);
}

document.getElementById('logoutBtn').addEventListener('click', async e => {
  e.preventDefault();
  await setOffline();
  sessionStorage.clear();
  location.href = 'index.html';
});

// Set offline khi đóng tab/thoát
window.addEventListener('beforeunload', () => {
  db.from('students').update({ is_online: false, last_seen: new Date().toISOString() }).eq('username', currentUser);
});
// Mobile: ẩn tab cũng set offline — xử lý trong block viewer bên dưới

// Heartbeat + kiểm tra bảo trì gộp vào 1 interval 60s
db.from('students').update({ is_online: true, last_seen: new Date().toISOString() }).eq('username', currentUser);
setInterval(async () => {
  if (document.visibilityState === 'hidden') return;
  try {
    // Heartbeat online
    db.from('students').update({ is_online: true, last_seen: new Date().toISOString() }).eq('username', currentUser);
    // Kiểm tra bảo trì
    const { data: mt } = await db.from('app_settings').select('value').eq('key', 'maintenance').maybeSingle();
    if (mt?.value === 'true') _showMaintenanceScreen();
  } catch(e) {}
}, 60000);
document.getElementById('menuToggle').addEventListener('click', () => {
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarBackdrop').classList.toggle('show');
  } else {
    document.body.classList.remove('sidebar-collapsed');
  }
});
document.getElementById('sidebarBackdrop').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('show');
});
document.getElementById('sidebarClose').addEventListener('click', () => {
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarBackdrop').classList.remove('show');
  } else {
    const isMini = document.body.classList.toggle('sidebar-mini');
    sessionStorage.setItem('st_sidebar_mini', isMini ? '1' : '');
  }
});
// Khôi phục trạng thái mini
if (sessionStorage.getItem('st_sidebar_mini') === '1') document.body.classList.add('sidebar-mini');

// Nút ▶ mở lại sidebar (chỉ bind nút trong sidebar-mini-reopen)
document.querySelector('.sidebar-mini-reopen button')?.addEventListener('click', () => {
  document.body.classList.remove('sidebar-mini');
  sessionStorage.setItem('st_sidebar_mini', '');
});

// ---- Sidebar nav ----
let currentSection = 'home';
function showPage(pg) {
  currentSection = pg;
  sessionStorage.setItem('st_page', pg);
  sessionStorage.removeItem('st_lesson_id'); // reset bài khi chuyển trang
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.slink').forEach(l => l.classList.remove('active'));
  const map = { home:'Home', lessons:'Lessons', profile:'Profile', guide:'Guide', notifications:'Notifications' };
  const el = document.getElementById('page' + (map[pg] || pg.charAt(0).toUpperCase()+pg.slice(1)));
  if (el) el.classList.add('active');
  document.querySelectorAll(`[data-page="${pg}"]`).forEach(l => l.classList.add('active'));
  if (pg === 'home')          renderHome();
  if (pg === 'lessons')       renderLessonList();
  if (pg === 'notifications') renderNotifications();
  if (pg === 'schedule')      renderStudentSchedule();
}
document.querySelectorAll('.slink[data-page]').forEach(l => {
  l.addEventListener('click', e => { e.preventDefault(); showPage(l.dataset.page); document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarBackdrop').classList.remove('show'); });
});
document.querySelectorAll('[data-goto]').forEach(l => {
  l.addEventListener('click', e => { e.preventDefault(); showPage(l.dataset.goto); });
});

// ---- Trang chủ ----
async function renderHome() {
  // Avatar + thông tin học viên
  const avatarEl = document.getElementById('homeAvatar');
  const nameEl   = document.getElementById('homeStudentName');
  const classEl  = document.getElementById('homeStudentClass');
  const codeEl   = document.getElementById('homeStudentCode');
  if (avatarEl) avatarEl.textContent = (currentName||'?')[0].toUpperCase();
  if (nameEl)   nameEl.textContent   = currentName;
  if (classEl)  classEl.textContent  = myClasses.length ? `Lớp: ${myClasses.join(', ')}` : '';
  const code = sessionStorage.getItem('dh_code');
  if (codeEl)   codeEl.textContent   = code ? `Mã HV: ${code}` : '';

  // Load thông báo + bài học song song
  const [{ data: allRecentLessons }, { data: anns }] = await Promise.all([
    db.from('lessons').select('id,name,class_name').order('created_at',{ascending:false}).limit(200),
    db.from('announcements').select('*').order('created_at',{ascending:false}).limit(200)
  ]);
  const list = (allRecentLessons || []).filter(l => lessonMatchesStudentClasses(l, myClasses)).slice(0, 4);

  // Thông báo
  const annSection = document.getElementById('announcementSection');
  const annList    = document.getElementById('announcementList');
  if (annSection && annList) {
    const now = new Date();
    const myAnns = (anns||[]).filter(a =>
      (!a.expires_at || new Date(a.expires_at) > now) &&
      (a.target_username ? a.target_username === currentUser : (!a.class_name || a.class_name === myClass))
    );
    if (myAnns.length) {
      annSection.style.display = '';
      annList.innerHTML = myAnns.map(a => `
        <div style="padding:.65rem .75rem;background:${a.pinned?'#fef9c3':'#fff'};border-radius:10px;border-left:3px solid ${a.pinned?'#f59e0b':'#e2e8f0'}">
          <div style="font-weight:700;font-size:.88rem;margin-bottom:.2rem">${a.pinned?'📌 ':''}${a.title}${a.class_name?` <span class="class-tag">${a.class_name}</span>`:''}</div>
          <div style="font-size:.82rem;color:var(--muted);line-height:1.6;white-space:pre-line">${a.content}</div>
          ${a.link_url ? `<a href="${a.link_url}" target="_blank" style="display:inline-block;margin-top:.35rem;color:#6366f1;font-size:.8rem;font-weight:600;text-decoration:none">🔗 ${a.link_text||a.link_url}</a>` : ''}
          <div style="font-size:.72rem;color:#94a3b8;margin-top:.25rem">${new Date(a.created_at).toLocaleDateString('vi-VN')}</div>
        </div>`).join('');
    } else {
      annSection.style.display = 'none';
    }
  }

  // Bài học mới nhất
  const el = document.getElementById('homeRecentLessons');
  el.innerHTML = '';
  if (!(list||[]).length) { el.innerHTML = '<p class="muted-sm">Chưa có bài học nào.</p>'; return; }

  const ids = list.map(l=>l.id);
  const [{ data: vids }, { data: docs }] = await Promise.all([
    db.from('lesson_videos').select('lesson_id').in('lesson_id', ids),
    db.from('lesson_docs').select('lesson_id').in('lesson_id', ids),
  ]);
  const vcMap = {}, dcMap = {};
  (vids||[]).forEach(v => { vcMap[v.lesson_id] = (vcMap[v.lesson_id]||0)+1; });
  (docs||[]).forEach(d => { dcMap[d.lesson_id] = (dcMap[d.lesson_id]||0)+1; });

  const colors = [
    { bg: 'linear-gradient(135deg,#6366f1,#4f46e5)', light: '#eef2ff', icon: '📐' },
    { bg: 'linear-gradient(135deg,#0ea5e9,#0284c7)', light: '#e0f2fe', icon: '📊' },
    { bg: 'linear-gradient(135deg,#10b981,#059669)', light: '#d1fae5', icon: '📝' },
    { bg: 'linear-gradient(135deg,#f59e0b,#d97706)', light: '#fef3c7', icon: '🔢' },
  ];

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.85rem;';
  el.appendChild(grid);

  list.forEach((l, i) => {
    const c = colors[i % colors.length];
    const vc = vcMap[l.id] || 0;
    const dc = dcMap[l.id] || 0;
    const card = document.createElement('div');
    card.style.cssText = `background:var(--card);border:1.5px solid var(--border);border-radius:16px;overflow:hidden;cursor:pointer;transition:transform .18s,box-shadow .18s;box-shadow:var(--shadow)`;
    card.innerHTML = `
      <div style="background:${c.bg};padding:1rem 1.1rem 1.1rem;position:relative;overflow:hidden">
        <div style="position:absolute;top:-18px;right:-18px;width:72px;height:72px;background:rgba(255,255,255,.1);border-radius:50%"></div>
        <div style="position:absolute;bottom:-12px;left:30%;width:48px;height:48px;background:rgba(255,255,255,.08);border-radius:50%"></div>
        <div style="width:38px;height:38px;background:rgba(255,255,255,.18);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;margin-bottom:.6rem;position:relative">${c.icon}</div>
        <div style="color:#fff;font-weight:800;font-size:.92rem;line-height:1.35;position:relative;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${l.name}</div>
      </div>
      <div style="padding:.75rem 1rem;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;gap:.6rem">
          <span style="display:flex;align-items:center;gap:.3rem;background:${c.light};color:var(--text);font-size:.75rem;font-weight:700;padding:.25rem .6rem;border-radius:8px">🎬 ${vc}</span>
          <span style="display:flex;align-items:center;gap:.3rem;background:${c.light};color:var(--text);font-size:.75rem;font-weight:700;padding:.25rem .6rem;border-radius:8px">📄 ${dc}</span>
        </div>
        <span style="font-size:.8rem;color:var(--primary);font-weight:700">Xem →</span>
      </div>`;
    card.addEventListener('mouseenter', () => { card.style.transform = 'translateY(-3px)'; card.style.boxShadow = '0 8px 24px rgba(0,0,0,.12)'; });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; card.style.boxShadow = 'var(--shadow)'; });
    card.addEventListener('click', () => { showPage('lessons'); openLessonDetail(l.id); });
    grid.appendChild(card);
  });
}

// ---- Danh sách bài học ----
let _lessonCache = null; // Cache data để tìm kiếm realtime

async function renderLessonList(forceRefresh = false) {
  document.getElementById('sLessonListView').style.display = '';
  document.getElementById('sLessonDetailView').style.display = 'none';

  if (!_lessonCache || forceRefresh) {
    // 1. Fetch tất cả nhóm
    const { data: allGroups } = await db.from('lesson_groups').select('*').order('name');

    // 2. Tìm group_id được chia sẻ cho lớp học viên
    const sharedGroupIds = (allGroups||[])
      .filter(g => {
        if (!g.class_name) return false;
        const gc = g.class_name.split(',').map(c => c.trim()).filter(Boolean);
        return myClasses.some(mc => gc.includes(mc));
      })
      .map(g => g.id);

    // 3. Fetch bài học thuộc lớp học viên
    const { data: allLessonsRaw } = await db
      .from('lessons')
      .select('*')
      .order('group_name',{ascending:true})
      .order('created_at',{ascending:false})
      .limit(5000);
    const ownLessons = (allLessonsRaw || []).filter(l => lessonMatchesStudentClasses(l, myClasses));

    // 4. Fetch bài học thuộc nhóm được chia sẻ (nếu có)
    let sharedLessons = [];
    if (sharedGroupIds.length) {
      const { data: sl } = await db.from('lessons').select('*').in('group_id', sharedGroupIds);
      sharedLessons = sl || [];
    }

    // 5. Merge, loại trùng theo id
    const allIds = new Set((ownLessons||[]).map(l => l.id));
    const merged = [...(ownLessons||[])];
    for (const l of sharedLessons) {
      if (!allIds.has(l.id)) { merged.push(l); allIds.add(l.id); }
    }

    const lessonIds = merged.map(l => l.id);
    const [{ data: allVids }, { data: allDocs }] = await Promise.all([
      lessonIds.length ? db.from('lesson_videos').select('lesson_id').in('lesson_id', lessonIds) : { data: [] },
      lessonIds.length ? db.from('lesson_docs').select('lesson_id').in('lesson_id', lessonIds) : { data: [] },
    ]);
    _lessonCache = { list: merged, allVids: allVids||[], allDocs: allDocs||[], allGroups: allGroups||[] };
  }

  renderLessonListFromCache();
}

function renderLessonListFromCache() {
  const { list, allVids, allDocs, allGroups } = _lessonCache;
  const el = document.getElementById('sLessonList');
  el.innerHTML = '';
  const normalizedGroups = [];
  const seenGroupIds = new Set();
  const seenGroupKeys = new Set();
  (allGroups || []).forEach(g => {
    if (g?.id != null && seenGroupIds.has(g.id)) return;
    const groupKey = `${g?.name || ''}__${g?.parent_id || ''}__${g?.class_name || ''}`;
    if (seenGroupKeys.has(groupKey)) return;
    if (g?.id != null) seenGroupIds.add(g.id);
    seenGroupKeys.add(groupKey);
    normalizedGroups.push(g);
  });

  // Lọc theo search
  const q = (document.getElementById('sLessonSearch')?.value||'').toLowerCase().trim();
  const filtered = q ? list.filter(l => l.name.toLowerCase().includes(q) || (l.description||'').toLowerCase().includes(q)) : list;

  document.getElementById('sEmptyLessons').style.display = filtered.length?'none':'block';
  if (!filtered.length) return;
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
  el.appendChild(grid);

  // Lấy bài học theo nhóm — ưu tiên group_id, fallback group_name cho dữ liệu cũ
  function getLessonsForGroup(gId, gName) {
    return filtered.filter(l => {
      if (l.group_id) return l.group_id === gId;
      return l.group_name === gName;
    });
  }

  // Lấy yêu thích 1 lần
  let favSet = new Set();
  db.from('lesson_favorites').select('lesson_id').eq('username', currentUser)
    .then(({ data }) => { favSet = new Set((data||[]).map(f => f.lesson_id)); });

  function buildLessonItem(l, idx) {
    const vc = vcMap[l.id]||0, dc = dcMap[l.id]||0;
    const item = document.createElement('div');
    item.className = 'group-lesson-item';
    const num = document.createElement('div'); num.className = 'group-lesson-num'; num.textContent = idx + 1;
    const info = document.createElement('div'); info.className = 'group-lesson-info';
    info.innerHTML = `<div class="group-lesson-title"><span style="margin-right:.35rem">📚</span>${l.name}</div>
      <div class="group-lesson-stats"><span>🎬 ${vc}</span><span>📄 ${dc}</span></div>`;
    const favBtn = document.createElement('button');
    favBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:1.1rem;padding:.2rem .3rem;flex-shrink:0;line-height:1;transition:transform .15s';
    favBtn.textContent = favSet.has(l.id) ? '❤️' : '🤍';
    favBtn.addEventListener('click', async e => {
      e.stopPropagation();
      const nowFav = favBtn.textContent === '❤️';
      favBtn.style.transform = 'scale(1.4)';
      setTimeout(() => { favBtn.style.transform = ''; }, 200);
      if (nowFav) {
        favBtn.textContent = '🤍';
        await db.from('lesson_favorites').delete().eq('username', currentUser).eq('lesson_id', l.id);
      } else {
        favBtn.textContent = '❤️';
        await db.from('lesson_favorites').insert({ username: currentUser, lesson_id: l.id });
      }
    });
    const openBtn = document.createElement('button');
    openBtn.className = 'group-lesson-open'; openBtn.textContent = '→';
    openBtn.addEventListener('click', e => { e.stopPropagation(); openLessonDetail(l.id); });
    item.appendChild(num); item.appendChild(info); item.appendChild(favBtn); item.appendChild(openBtn);
    item.addEventListener('click', () => openLessonDetail(l.id));
    return item;
  }

  function buildGroupCard(g, depth, colorIdx) {
    const c = colors[colorIdx % colors.length];
    // Nhóm con: filter theo lớp học viên
    const children = (normalizedGroups||[]).filter(x => {
      if (x.parent_id !== g.id) return false;
      if (!x.class_name) return true;
      const gc = x.class_name.split(',').map(s => s.trim()).filter(Boolean);
      return myClasses.some(mc => gc.includes(mc));
    });
    const directLessons = getLessonsForGroup(g.id, g.name);
    // Bỏ qua nhóm không có nội dung gì
    if (!directLessons.length && !children.length) return null;

    const card = document.createElement('div');
    card.className = 'group-card';
    card.dataset.groupId = String(g.id);
    card.style.setProperty('--gc', c.gc);
    card.style.setProperty('--gc-light', c.gcLight);
    card.style.setProperty('--gc-glow', c.gcGlow);
    if (depth > 0) card.style.marginLeft = (depth * 16) + 'px';
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
      <div class="group-card-meta"><span class="group-card-count">${children.length ? children.length + ' nhóm con • ' : ''}${directLessons.length} bài học</span></div>`;
    const chevron = document.createElement('div');
    chevron.className = 'group-card-chevron'; chevron.textContent = '▼';
    const header = document.createElement('div');
    header.className = 'group-card-header';
    header.appendChild(iconEl); header.appendChild(bodyEl); header.appendChild(chevron);

    const lessonList = document.createElement('div');
    lessonList.className = 'group-lesson-list';
    const inner = document.createElement('div');
    inner.className = 'group-lesson-list-inner';
    lessonList.appendChild(inner);

    let expanded = !!q;
    if (expanded) { card.classList.add('open'); lessonList.classList.add('open'); }

    function loadContent() {
      if (inner.dataset.loaded) return;
      inner.dataset.loaded = '1';
      // Nhóm con trước
      if (children.length && depth < 2) {
        children.forEach((ch, ci) => {
          const childCard = buildGroupCard(ch, depth + 1, colorIdx + ci + 1);
          if (childCard) inner.appendChild(childCard);
        });
      }
      // Bài học trực tiếp
      directLessons.forEach((l, idx) => inner.appendChild(buildLessonItem(l, idx)));
      if (!children.length && !directLessons.length) {
        const msg = document.createElement('div'); msg.className = 'group-empty-msg'; msg.textContent = 'Chưa có nội dung.';
        inner.appendChild(msg);
      }
    }

    if (expanded) loadContent();
    header.addEventListener('click', () => {
      expanded = !expanded;
      card.classList.toggle('open', expanded);
      lessonList.classList.toggle('open', expanded);
      if (expanded) loadContent();
    });

    card.appendChild(header); card.appendChild(lessonList);
    return card;
  }

  // Bài học không thuộc nhóm nào
  const ungrouped = filtered.filter(l => !l.group_id && !l.group_name);

  // Render nhóm gốc — chỉ hiển thị nhóm không có class_name HOẶC class_name chứa lớp của học viên
  const roots = (normalizedGroups||[]).filter(g => {
    if (g.parent_id) return false; // chỉ lấy root
    if (!g.class_name) return true; // không giới hạn lớp → hiển thị tất cả
    const groupClasses = g.class_name.split(',').map(c => c.trim()).filter(Boolean);
    return myClasses.some(mc => groupClasses.includes(mc));
  });
  const seenRootRenderKeys = new Set();
  roots.forEach((g, gi) => {
    const renderKey = `${g.name || ''}__${g.class_name || ''}`;
    if (seenRootRenderKeys.has(renderKey)) return;
    seenRootRenderKeys.add(renderKey);
    const card = buildGroupCard(g, 0, gi);
    if (card) grid.appendChild(card);
  });

  // Render bài học không nhóm
  if (ungrouped.length) {
    const c = colors[roots.length % colors.length];
    const card = document.createElement('div');
    card.className = 'group-card';
    card.style.setProperty('--gc', c.gc);
    card.style.setProperty('--gc-light', c.gcLight);
    card.style.setProperty('--gc-glow', c.gcGlow);
    const header = document.createElement('div'); header.className = 'group-card-header';
    const iconEl = document.createElement('div'); iconEl.className = 'group-card-icon'; iconEl.textContent = '📋';
    const bodyEl = document.createElement('div'); bodyEl.className = 'group-card-body';
    bodyEl.innerHTML = `<div class="group-card-name">Bài học khác</div><div class="group-card-meta"><span class="group-card-count">${ungrouped.length} bài học</span></div>`;
    const chevron = document.createElement('div'); chevron.className = 'group-card-chevron'; chevron.textContent = '▼';
    header.appendChild(iconEl); header.appendChild(bodyEl); header.appendChild(chevron);
    const lessonList = document.createElement('div'); lessonList.className = 'group-lesson-list';
    const inner = document.createElement('div'); inner.className = 'group-lesson-list-inner';
    lessonList.appendChild(inner);
    let expanded = !!q;
    if (expanded) { card.classList.add('open'); lessonList.classList.add('open'); inner.dataset.loaded = '1'; ungrouped.forEach((l, i) => inner.appendChild(buildLessonItem(l, i))); }
    header.addEventListener('click', () => {
      expanded = !expanded;
      card.classList.toggle('open', expanded);
      lessonList.classList.toggle('open', expanded);
      if (expanded && !inner.dataset.loaded) { inner.dataset.loaded = '1'; ungrouped.forEach((l, i) => inner.appendChild(buildLessonItem(l, i))); }
    });
    card.appendChild(header); card.appendChild(lessonList);
    grid.appendChild(card);
  }

  // Khôi phục scroll và nhóm đang mở khi quay lại từ bài học
  const savedScroll = sessionStorage.getItem('st_lesson_scroll');
  const savedGroups = JSON.parse(sessionStorage.getItem('st_open_groups') || '[]');
  if (savedGroups.length || savedScroll) {
    requestAnimationFrame(() => {
      // Click vào header để mở lại nhóm
      savedGroups.forEach(gid => {
        const card = document.querySelector(`.group-card[data-group-id="${gid}"]`);
        if (card && !card.classList.contains('open')) {
          const header = card.querySelector('.group-card-header');
          if (header) header.click();
        }
      });
      // Khôi phục scroll
      if (savedScroll) {
        setTimeout(() => {
          const page = document.getElementById('pageLessons');
          if (page) page.scrollTop = parseInt(savedScroll);
        }, 80);
      }
      sessionStorage.removeItem('st_lesson_scroll');
      sessionStorage.removeItem('st_open_groups');
    });
  }
}

function getEmbedUrl(url) {
  if (!url) return null;
  // YouTube watch link
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  // YouTube embed URL đã có sẵn (youtube.com/embed hoặc youtube-nocookie.com/embed)
  const ytEmbed = url.match(/(?:youtube(?:-nocookie)?\.com\/embed\/)([^?&\s]+)/);
  if (ytEmbed) return `https://www.youtube.com/embed/${ytEmbed[1]}`;
  // Google Drive
  const gd = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (gd) return `https://drive.google.com/file/d/${gd[1]}/preview`;
  return null;
}

// Helper: lấy link download từ Google Drive
function getDownloadUrl(url) {
  if (!url) return null;
  const gd = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (gd) return `https://drive.google.com/uc?export=download&id=${gd[1]}`;
  return null;
}

// ---- Chi tiết bài học ----
// ---- Ghi log truy cap ----
function logAccess(lessonId, lessonName, contentId, contentTitle, contentType) {
  db.from('access_logs').insert({
    username: currentUser,
    student_name: currentName,
    class_name: myClasses[0] || myClass || '',
    lesson_id: lessonId,
    lesson_name: lessonName,
    content_id: contentId,
    content_title: contentTitle,
    content_type: contentType
  }).then(() => {}).catch(() => {});
}
async function openLessonDetail(id) {
  sessionStorage.setItem('st_lesson_id', id);
  // Lưu scroll position và nhóm đang mở
  const page = document.getElementById('pageLessons');
  if (page) sessionStorage.setItem('st_lesson_scroll', page.scrollTop);
  const openGroups = [...document.querySelectorAll('.group-card.open')].map(c => c.dataset.groupId).filter(Boolean);
  sessionStorage.setItem('st_open_groups', JSON.stringify(openGroups));
  // Hiện view ngay, load song song
  document.getElementById('sLessonListView').style.display = 'none';
  document.getElementById('sLessonDetailView').style.display = '';
  document.getElementById('sLessonDetailTitle').textContent = '...';
  document.getElementById('sLessonDetailDesc').textContent  = '';

  // 3 query song song
  const [{ data:l }, { data:vids }, { data:docs }] = await Promise.all([
    db.from('lessons').select('*').eq('id',id).single(),
    db.from('lesson_videos').select('*').eq('lesson_id',id).order('created_at'),
    db.from('lesson_docs').select('*').eq('lesson_id',id).order('created_at'),
  ]);

  if (!l) return;
  document.getElementById('sLessonDetailTitle').textContent = l.name;
  document.getElementById('sLessonDetailDesc').textContent  = l.description||'';

  // Render video — decrypt song song
  const vGrid = document.getElementById('sLessonVideoGrid');
  vGrid.innerHTML = '';
  document.getElementById('sEmptyLessonVideos').style.display = (vids||[]).length?'none':'block';
  const vidUrls = await Promise.all((vids||[]).map(v =>
    v.video_url ? decryptUrl(v.video_url) : Promise.resolve(db.storage.from('lessons').getPublicUrl(v.storage_path).data.publicUrl)
  ));
  (vids||[]).forEach((v, idx) => {
    const isLink = !!v.video_url;
    const url = vidUrls[idx];
    const card = document.createElement('div');
    card.className = 'video-card';
    if (isLink && getEmbedUrl(url)) {
      card.innerHTML = `
        <div class="video-thumb" style="background:linear-gradient(135deg,#1e1b4b,#312e81);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:.5rem;position:relative">
          <div style="width:52px;height:52px;background:rgba(255,255,255,.15);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.5rem;border:2px solid rgba(255,255,255,.3)">▶</div>
          <span style="color:rgba(255,255,255,.8);font-size:.75rem;font-weight:600">Nhấn để xem</span>
          <div style="position:absolute;top:8px;left:8px;background:#ef4444;color:#fff;font-size:.65rem;font-weight:700;padding:.2rem .5rem;border-radius:6px">VIDEO</div>
        </div>
        <div class="video-info">
          <div class="video-title">${v.title}</div>
          <div style="font-size:.75rem;color:var(--muted);margin-top:.2rem">Bài ${idx+1}</div>
        </div>`;
    } else {
      card.innerHTML = `
        <div class="video-thumb" style="position:relative">
          <video src="${url}" preload="none"></video>
          <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.6) 0%,transparent 50%);display:flex;align-items:center;justify-content:center">
            <div style="width:52px;height:52px;background:rgba(255,255,255,.2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.4rem;border:2px solid rgba(255,255,255,.4);backdrop-filter:blur(4px)">▶</div>
          </div>
          <div style="position:absolute;top:8px;left:8px;background:#ef4444;color:#fff;font-size:.65rem;font-weight:700;padding:.2rem .5rem;border-radius:6px">VIDEO</div>
        </div>
        <div class="video-info">
          <div class="video-title">${v.title}</div>
          <div style="font-size:.75rem;color:var(--muted);margin-top:.2rem">Bài ${idx+1}</div>
        </div>`;
    }
    card.querySelector('.video-thumb').addEventListener('click', () => {
      logAccess(id, l.name, v.id, v.title, 'video');
      _currentLessonGroup = l.group_name || '';
      openViewer(v.title, url, v.file_name, isLink ? 'link' : 'video');
    });
    vGrid.appendChild(card);
  });

  // Render tài liệu — decrypt song song
  const dList = document.getElementById('sLessonDocList');
  dList.innerHTML = '';
  document.getElementById('sEmptyLessonDocs').style.display = (docs||[]).length?'none':'block';
  const docUrls = await Promise.all((docs||[]).map(d =>
    (d.file_type==='link'||d.file_type==='handwritten') ? decryptUrl(d.doc_url) : Promise.resolve(db.storage.from('lessons').getPublicUrl(d.storage_path).data.publicUrl)
  ));
  (docs||[]).forEach((d, di) => {
    const isLink = d.file_type==='link';
    const isHandwritten = d.file_type==='handwritten';
    const url = docUrls[di];

    const icon  = isHandwritten ? '✍️' : isLink ? '🔗' : '📄';
    const color = isHandwritten ? '#8b5cf6' : isLink ? '#0ea5e9' : '#f59e0b';
    const bg    = isHandwritten ? '#ede9fe' : isLink ? '#e0f2fe' : '#fef3c7';
    const label = isHandwritten ? 'Bản viết tay' : isLink ? 'Tài liệu online' : 'File tài liệu';

    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:.85rem;padding:.85rem 1rem;background:var(--card);border:1.5px solid var(--border);border-radius:12px;cursor:pointer;transition:all .15s;box-shadow:var(--shadow)`;
    row.innerHTML = `
      <div style="width:42px;height:42px;background:${bg};border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0">${icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.title}</div>
        <div style="font-size:.75rem;color:${color};font-weight:600;margin-top:.15rem">${label}</div>
      </div>
      <div style="background:${bg};color:${color};padding:.35rem .75rem;border-radius:8px;font-size:.78rem;font-weight:700;flex-shrink:0">Xem →</div>
    `;
    row.addEventListener('mouseenter', () => { row.style.borderColor = color; row.style.transform = 'translateX(3px)'; });
    row.addEventListener('mouseleave', () => { row.style.borderColor = 'var(--border)'; row.style.transform = ''; });
    row.addEventListener('click', () => {
      logAccess(id, l.name, d.id, d.title, 'doc');
      openViewer(d.title, url, d.file_name, isHandwritten?'handwritten-link':isLink?'doc-link':d.file_type);
    });
    dList.appendChild(row);
  });
}
document.getElementById('sBackToLessonsBtn').addEventListener('click', () => {
  sessionStorage.removeItem('st_lesson_id');
  _lessonCache = null; // Reset cache để fetch mới
  renderLessonList();
});
document.getElementById('sLessonSearch').addEventListener('input', debounce(renderLessonListFromCache, 200));

// ---- Viewer ----
// ── Biến theo dõi trạng thái viewer ──
let _viewerActive = false;      // đang mở viewer
let _viewerIsVideo = false;     // đang xem video (cần chặn chuyển tab)
let _activeVideoEl = null;      // element <video> đang phát (nếu có)
let _tabWarnShown = false;      // đã hiện cảnh báo chuyển tab chưa
let _currentLessonGroup = '';   // group_name của bài học đang xem

// Các nhóm bài học TẮT overlay grid (video Drive bị lỗi quota — cần dùng nút Tải xuống)
// Thêm tên nhóm vào đây nếu cần tắt overlay cho nhóm đó
const _NO_OVERLAY_GROUPS = ['Đợt 4', 'dot 4', 'Dot 4'];

// ── Cập nhật trạng thái online khi chuyển tab ──
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    db.from('students').update({ is_online: false, last_seen: new Date().toISOString() }).eq('username', currentUser);
  } else {
    db.from('students').update({ is_online: true, last_seen: new Date().toISOString() }).eq('username', currentUser);
  }
});

function _showTabWarning() { /* đã tắt */ }
function _hideTabWarning() {
  const overlay = document.getElementById('_tabWarnOverlay');
  if (overlay) overlay.style.display = 'none';
}

function openViewer(title, url, fileName, fileType) {
  const isVideo = fileType==='video'||(fileType||'').startsWith('video/');
  const isLink = fileType==='link';
  const isDocLink = fileType==='doc-link';
  const isHandwrittenLink = fileType==='handwritten-link';

  _viewerActive = true;
  _viewerIsVideo = isVideo || isLink;
  _activeVideoEl = null;
  _hideTabWarning();

  let displayTitle = title;
  if (isVideo || isLink) displayTitle = 'Video bài học';
  else if (isHandwrittenLink) displayTitle = 'Bản viết tay';
  else if (isDocLink || fileType==='application/pdf' || (fileType||'').startsWith('image/')) displayTitle = 'Tài liệu';

  document.getElementById('viewerTitle').textContent = displayTitle;
  const body = document.getElementById('viewerBody');
  const dl = document.getElementById('viewerDownload');
  dl.style.display = 'none';
  body.innerHTML = '';

  // Loading spinner
  const loading = document.createElement('div');
  loading.id = 'viewerLoading';
  loading.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.75rem;background:#0f172a;z-index:10;border-radius:10px';
  loading.innerHTML = `<div style="width:40px;height:40px;border:3px solid rgba(99,102,241,.3);border-top-color:#6366f1;border-radius:50%;animation:spin .8s linear infinite"></div><div style="color:rgba(255,255,255,.7);font-size:.88rem;font-weight:600">${isVideo||isLink?'⏳ Đang tải video...':'⏳ Đang tải tài liệu...'}</div>`;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;flex:1;min-height:0;display:flex;flex-direction:column';
  wrap.appendChild(loading);
  body.appendChild(wrap);

  const hideLoading = () => { const ld = document.getElementById('viewerLoading'); if(ld) ld.remove(); };

  if (isLink) {
    // Video (YouTube/Drive/Embed) — set src qua JS
    const embed = getEmbedUrl(url) || url; // nếu là embed URL thì dùng thẳng
    if (embed) {
      // ── Kiểm tra có phải Drive bị lỗi quota không ──
      // Nếu thuộc nhóm tắt overlay (_NO_OVERLAY_GROUPS) VÀ là Google Drive → hiện banner tải xuống
      const isDrive = url && url.includes('drive.google.com');
      const isMobileDevice = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      // Tắt overlay nếu: đang dùng điện thoại HOẶC thuộc nhóm _NO_OVERLAY_GROUPS
      const _skipOverlay = isMobileDevice || _NO_OVERLAY_GROUPS.some(g =>
        _currentLessonGroup.toLowerCase().includes(g.toLowerCase())
      );
      const dlUrl = isDrive ? getDownloadUrl(url) : null;

      if (_skipOverlay && dlUrl) {
        // Banner tải xuống dự phòng cho video Drive bị lỗi quota
        const dlBanner = document.createElement('div');
        dlBanner.style.cssText = 'background:#eff6ff;border-left:3px solid #3b82f6;padding:.6rem .85rem;border-radius:8px;margin-bottom:.5rem;font-size:.82rem;color:#1e40af;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:.75rem;flex-wrap:wrap';
        dlBanner.innerHTML = `
          <span>📥 Video không phát được? Nhấn tải xuống để xem offline.</span>
          <a href="${dlUrl}" target="_blank" rel="noopener"
             style="background:#3b82f6;color:#fff;padding:.35rem .9rem;border-radius:7px;font-size:.8rem;font-weight:700;text-decoration:none;white-space:nowrap;flex-shrink:0">
            ⬇ Tải xuống
          </a>`;
        body.insertBefore(dlBanner, wrap);
      } else {
        // Tip chất lượng (chỉ hiện khi không phải Drive lỗi quota)
        body.insertBefore(Object.assign(document.createElement('div'), {
          style: 'background:#fffbeb;border-left:3px solid #f59e0b;padding:.5rem .85rem;border-radius:8px;margin-bottom:.5rem;font-size:.8rem;color:#92400e;flex-shrink:0',
          innerHTML: '💡 Video bị mờ? Nhấn ⚙️ → <b>Chất lượng</b> → tăng lên <b>720p hoặc 1080p</b>'
        }), wrap);
      }
      const iframeWrap = document.createElement('div');
      iframeWrap.style.cssText = 'position:relative;flex:1;min-height:0;overflow:hidden';
      const iframe = document.createElement('iframe');
      iframe.id = '_ytIframe_' + Date.now();
      iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;border:none';
      iframe.allowFullscreen = true;
      iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
      iframe.onload = hideLoading;
      iframeWrap.appendChild(iframe);



      // Chặn window.open toàn trang khi viewer đang mở
      // Ngoại lệ: cho phép link tải xuống Google Drive đi qua
      const _origOpen = window.open;
      window._ytOpenBlocked = true;
      window.open = function(...args) {
        if (window._ytOpenBlocked) {
          const targetUrl = args[0] || '';
          // Cho phép link tải xuống Drive
          if (typeof targetUrl === 'string' && (
            targetUrl.includes('drive.google.com/uc') ||
            targetUrl.includes('drive.google.com/file') ||
            targetUrl.includes('export=download')
          )) {
            return _origOpen.apply(window, args);
          }
          return null;
        }
        return _origOpen.apply(window, args);
      };

      // ── Phím F → fullscreen iframe ──
      const _onKeyF = (e) => {
        if ((e.key === 'f' || e.key === 'F') && document.getElementById('viewerModal')?.classList.contains('open')) {
          e.preventDefault(); e.stopImmediatePropagation();
          if (iframe.requestFullscreen)            iframe.requestFullscreen();
          else if (iframe.webkitRequestFullscreen) iframe.webkitRequestFullscreen();
          else if (iframe.mozRequestFullScreen)    iframe.mozRequestFullScreen();
          else if (iframe.msRequestFullscreen)     iframe.msRequestFullscreen();
        }
      };
      document.addEventListener('keydown', _onKeyF, true);

      // Dọn tất cả khi đóng viewer
      iframe._cleanupF = () => {
        document.removeEventListener('keydown', _onKeyF, true);
        // Restore window.open
        window._ytOpenBlocked = false;
        window.open = _origOpen;
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      };

      wrap.appendChild(iframeWrap);

      // Params: tắt logo, related, annotations, bật fullscreen
      const embedClean = embed.includes('?')
        ? embed + `&modestbranding=1&rel=0&iv_load_policy=3&fs=1&playsinline=1`
        : embed + `?modestbranding=1&rel=0&iv_load_policy=3&fs=1&playsinline=1`;
      setTimeout(() => { iframe.src = embedClean; }, 0);
    } else {
      // URL không phải YouTube — có thể là Google Drive video
      // Khi Drive bị lỗi quota "đạt giới hạn người xem", iframe vẫn load nhưng hiện thông báo lỗi
      // → Hiện nút tải xuống dự phòng ngay từ đầu để học viên có thể tải về xem offline
      const dlUrl = getDownloadUrl(url);
      if (dlUrl) {
        // Banner thông báo tải xuống dự phòng
        const dlBanner = document.createElement('div');
        dlBanner.style.cssText = 'background:#eff6ff;border-left:3px solid #3b82f6;padding:.5rem .85rem;border-radius:8px;margin-bottom:.5rem;font-size:.8rem;color:#1e40af;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:.75rem';
        dlBanner.innerHTML = `
          <span>📥 Nếu video không phát được (giới hạn người xem), hãy tải xuống để xem.</span>
          <a href="${dlUrl}" target="_blank" rel="noopener"
             style="background:#3b82f6;color:#fff;padding:.3rem .85rem;border-radius:7px;font-size:.78rem;font-weight:700;text-decoration:none;white-space:nowrap;flex-shrink:0">
            ⬇ Tải xuống
          </a>`;
        body.insertBefore(dlBanner, wrap);
      }
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'flex:1;width:100%;height:100%;border:none;border-radius:8px';
      iframe.onload = hideLoading;
      wrap.appendChild(iframe);
      setTimeout(() => { iframe.src = url; }, 0);
    }
  } else if (isDocLink || isHandwrittenLink) {
    const dlUrl = getDownloadUrl(url);
    if (dlUrl) { dl.style.display=''; dl.href=dlUrl; dl.removeAttribute('download'); dl.target='_blank'; }
    const embed = getEmbedUrl(url);
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'flex:1;width:100%;height:100%;border:none;border-radius:8px';
    iframe.allowFullscreen = true;
    iframe.onload = hideLoading;
    wrap.appendChild(iframe);
    setTimeout(() => { iframe.src = embed || url; }, 0);
  } else if (isVideo) {
    const video = document.createElement('video');
    video.controls = true;
    video.setAttribute('playsinline', '');
    video.style.cssText = 'flex:1;width:100%;background:#000;position:relative;z-index:1';
    video.oncanplay = hideLoading;
    video.addEventListener('play', () => { _activeVideoEl = video; });
    video.addEventListener('pause', () => { if (_activeVideoEl === video) _activeVideoEl = null; });
    wrap.appendChild(video);
    setTimeout(() => { video.src = url; }, 0);
    if (window.innerWidth < 768 && window.innerHeight > window.innerWidth) {
      const tip = document.createElement('div');
      tip.style.cssText = 'background:#fff3cd;color:#856404;padding:.6rem 1rem;border-radius:8px;margin-bottom:.5rem;font-size:.85rem;text-align:center;flex-shrink:0';
      tip.textContent = '📱 Vui lòng chuyển điện thoại sang ngang để có trải nghiệm học tốt nhất';
      body.insertBefore(tip, wrap);
      const onOrient = () => { if (window.innerWidth > window.innerHeight) { tip.remove(); window.removeEventListener('resize', onOrient); } };
      window.addEventListener('resize', onOrient);
    }
  } else if (fileType==='application/pdf') {
    dl.style.display = '';
    const iframe = document.createElement('iframe');
    iframe.className = 'viewer-iframe';
    iframe.onload = hideLoading;
    wrap.appendChild(iframe);
    setTimeout(() => { iframe.src = url; }, 0);
  } else if ((fileType||'').startsWith('image/')) {
    dl.style.display = '';
    const img = document.createElement('img');
    img.className = 'viewer-img';
    img.alt = title;
    img.onload = hideLoading;
    wrap.appendChild(img);
    setTimeout(() => { img.src = url; }, 0);
  } else {
    dl.style.display = '';
    body.innerHTML = '<p class="muted-center">⚠️ Không xem trực tiếp được. Vui lòng tải xuống.</p>';
  }
  document.getElementById('viewerModal').classList.add('open');
  // Tạm tắt DevTools detection khi modal mở
  if (typeof _dtPaused !== 'undefined') _dtPaused = true;
  // Hiện nút xoay trên mobile
  const rotateBtn = document.getElementById('viewerRotateBtn');
  if (rotateBtn) {
    rotateBtn.style.display = window.innerWidth <= 768 ? '' : 'none';
    rotateBtn.textContent = '🔄 Xoay ngang';
    _viewerRotated = false;
  }
}
document.getElementById('closeViewer').addEventListener('click', closeViewer);
document.getElementById('viewerModal').addEventListener('click', e => { if(e.target===document.getElementById('viewerModal')) closeViewer(); });
function closeViewer() { 
  _viewerActive = false;
  _viewerIsVideo = false;
  _activeVideoEl = null;
  _hideTabWarning();
  // Dọn listener phím F của iframe nếu có
  const body = document.getElementById('viewerBody');
  body.querySelectorAll('iframe').forEach(fr => { if (fr._cleanupF) fr._cleanupF(); });
  document.getElementById('viewerModal').classList.remove('open'); 
  body.innerHTML='';
  document.getElementById('viewerRotateBtn').style.display = 'none';
  _viewerRotated = false;
  if (document.fullscreenElement) document.exitFullscreen().catch(()=>{});
  // Resume DevTools detection
  if (typeof _dtPaused !== 'undefined') {
    _dtPaused = false;
    if (typeof _dtOpen !== 'undefined') _dtOpen = false;
    document.body.style.filter = '';
    document.body.style.pointerEvents = '';
  }
}

// Xoay viewer
let _viewerRotated = false;
document.getElementById('viewerRotateBtn')?.addEventListener('click', () => {
  _viewerRotated = !_viewerRotated;
  const body = document.getElementById('viewerBody');
  const modal = document.querySelector('.viewer-modal');
  if (_viewerRotated) {
    body.style.transform = 'rotate(90deg)';
    body.style.transformOrigin = 'center center';
    body.style.width = '80vh';
    body.style.height = '80vw';
    body.style.margin = 'auto';
    document.getElementById('viewerRotateBtn').textContent = '🔄 Xoay dọc';
  } else {
    body.style.transform = '';
    body.style.width = '';
    body.style.height = '';
    body.style.margin = '';
    document.getElementById('viewerRotateBtn').textContent = '🔄 Xoay ngang';
  }
});

// ---- Init ----

loadMe().then(async () => {
  const savedPage = sessionStorage.getItem('st_page') || 'home';
  const savedLesson = sessionStorage.getItem('st_lesson_id');
  if (savedPage === 'lessons' && savedLesson) {
    currentSection = 'lessons';
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.slink').forEach(l => l.classList.remove('active'));
    const el = document.getElementById('pageLessons');
    if (el) el.classList.add('active');
    document.querySelectorAll('[data-page="lessons"]').forEach(l => l.classList.add('active'));
    openLessonDetail(parseInt(savedLesson));
  } else {
    showPage(savedPage);
  }
  checkNewNotifications(true);
});

// ── Helper hiện màn hình bị đăng xuất do thiết bị mới ──
function _showKickedScreen() {
  if (typeof _wmDestroyed !== 'undefined') _wmDestroyed = true;
  // Đóng viewer nếu đang mở
  try { document.getElementById('viewerModal')?.classList.remove('open'); document.getElementById('viewerBody').innerHTML = ''; } catch(e) {}
  setOffline().catch(() => {});
  sessionStorage.clear();
  document.body.innerHTML = `
    <div style="position:fixed;inset:0;background:#0f172a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.25rem;text-align:center;padding:2rem;z-index:99999">
      <div style="font-size:3.5rem">📱</div>
      <div style="color:#f59e0b;font-size:1.2rem;font-weight:800">Đăng nhập từ thiết bị khác</div>
      <div style="color:rgba(255,255,255,.75);font-size:.92rem;max-width:340px;line-height:1.7">
        Tài khoản vừa được đăng nhập từ một thiết bị khác.<br/>
        Phiên này đã bị <b style="color:#ef4444">đăng xuất tự động</b>.
      </div>
      <div id="_kickCountdown" style="color:rgba(255,255,255,.5);font-size:.85rem">Tự động chuyển về đăng nhập sau <b style="color:#fff">5</b> giây...</div>
      <button onclick="location.href='index.html'" style="background:#6366f1;color:#fff;border:none;padding:.75rem 2rem;border-radius:10px;font-size:1rem;font-weight:700;cursor:pointer">
        Đăng nhập lại
      </button>
    </div>`;
  let _c = 5;
  const _t = setInterval(() => {
    _c--;
    const el = document.getElementById('_kickCountdown');
    if (el) el.innerHTML = `Tự động chuyển về đăng nhập sau <b style="color:#fff">${_c}</b> giây...`;
    if (_c <= 0) { clearInterval(_t); location.href = 'index.html'; }
  }, 1000);
}

// Realtime: lắng nghe thay đổi active VÀ session_token của tài khoản này
// → đăng xuất tức thì khi thiết bị mới đăng nhập (không cần chờ polling 2 phút)
db.channel('student-lock-' + currentUser)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'students',
    filter: `username=eq.${currentUser}`
  }, async (payload) => {
    const s = payload.new;
    const localToken = sessionStorage.getItem('dh_token');

    // Thiết bị mới đăng nhập → session_token trong DB đổi, không khớp local
    if (s.session_token && localToken && s.session_token !== localToken) {
      _showKickedScreen();
      return;
    }

    // Admin khóa tài khoản
    if (!s.active) {
      if (typeof _wmDestroyed !== 'undefined') _wmDestroyed = true;
      try { document.getElementById('viewerModal')?.classList.remove('open'); document.getElementById('viewerBody').innerHTML = ''; } catch(e) {}
      await setOffline();
      sessionStorage.clear();
      document.body.innerHTML = `
        <div style="position:fixed;inset:0;background:#0f172a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.25rem;text-align:center;padding:2rem;z-index:99999">
          <div style="font-size:3.5rem">🔒</div>
          <div style="color:#ef4444;font-size:1.3rem;font-weight:800">Tài khoản đã bị khóa</div>
          <div style="color:rgba(255,255,255,.75);font-size:.95rem;max-width:320px;line-height:1.7">
            Tài khoản của bạn vừa bị khóa bởi quản trị viên.<br/>
            trợ lý và giáo viên ko hổ trợ duy trì tài khoản.
          </div>
          <div id="_lockCountdown" style="color:rgba(255,255,255,.5);font-size:.85rem">Tự động chuyển về đăng nhập sau <b style="color:#fff">3</b> giây...</div>
          <button onclick="location.href='index.html'" style="margin-top:.5rem;background:#6366f1;color:#fff;border:none;padding:.75rem 2rem;border-radius:10px;font-size:1rem;font-weight:700;cursor:pointer">
            Về trang đăng nhập
          </button>
        </div>`;
      let _c = 3;
      const _t = setInterval(() => {
        _c--;
        const el = document.getElementById('_lockCountdown');
        if (el) el.innerHTML = `Tự động chuyển về đăng nhập sau <b style="color:#fff">${_c}</b> giây...`;
        if (_c <= 0) { clearInterval(_t); location.href = 'index.html'; }
      }, 1000);
    }
  })
  .subscribe();

// Realtime: lắng nghe bảo trì — out ngay không cần reload
db.channel('maintenance-watch')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'app_settings',
    filter: 'key=eq.maintenance'
  }, async (payload) => {
    const val = payload.new?.value;
    if (val === 'true') _showMaintenanceScreen();
  })
  .subscribe();

// Polling backup mỗi 10 giây — đảm bảo hoạt động dù Realtime chưa bật
let _maintenanceShown = false;
function _showMaintenanceScreen() {
  if (_maintenanceShown) return;
  _maintenanceShown = true;
  if (typeof _wmDestroyed !== 'undefined') _wmDestroyed = true;
  setOffline().catch(()=>{});
  sessionStorage.clear();
  document.body.style.cssText = 'margin:0;padding:0;overflow:hidden';
  document.body.innerHTML = `
    <div style="min-height:100vh;width:100vw;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1e1b4b,#312e81);padding:2rem;box-sizing:border-box">
      <div style="background:#fff;border-radius:20px;padding:2.5rem 2rem;text-align:center;max-width:420px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.3)">
        <img src="btht.png" alt="Bảo trì" style="width:100%;border-radius:12px;margin-bottom:1.25rem"/>
        <div style="font-size:1.3rem;font-weight:800;color:#1e1b4b;margin-bottom:.75rem">Hệ thống đang bảo trì</div>
        <div style="font-size:.9rem;color:#64748b;line-height:1.7;margin-bottom:1.5rem">
          Chúng tôi đang nâng cấp hệ thống để phục vụ bạn tốt hơn.<br/>
          Vui lòng quay lại sau ít phút.
        </div>
        <div style="font-size:.82rem;color:#94a3b8">trợ lý và giáo viên ko hổ trợ duy trì tài khoản.</div>
      </div>
    </div>`;
}

// Realtime: lắng nghe thông báo mới từ admin
// ============================================================
// THÔNG BÁO RIÊNG
// ============================================================

async function renderNotifications() {
  const [{ data: anns }, { data: reads }] = await Promise.all([
    db.from('announcements').select('*').order('created_at', { ascending: false }),
    db.from('notification_reads').select('announcement_id').eq('username', currentUser)
  ]);

  const readSet = new Set((reads || []).map(r => r.announcement_id));
  const now = new Date();
  const myAnns = (anns || []).filter(a =>
    (!a.expires_at || new Date(a.expires_at) > now) &&
    (a.target_username ? a.target_username === currentUser : (!a.class_name || a.class_name === myClass))
  );
  const list = document.getElementById('notiPageList');
  const empty = document.getElementById('notiPageEmpty');
  if (!list) return;

  if (!myAnns.length) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  list.innerHTML = '';

  myAnns.forEach(a => {
    const isRead = readSet.has(a.id);
    const card = document.createElement('div');
    card.style.cssText = `background:${isRead ? 'var(--card)' : (a.pinned ? '#fffbeb' : '#f0f4ff')};border:1.5px solid ${isRead ? 'var(--border)' : (a.pinned ? '#f59e0b' : '#6366f1')};border-radius:14px;padding:1rem 1.1rem;box-shadow:${isRead ? 'var(--shadow)' : '0 4px 20px rgba(99,102,241,.2)'};cursor:pointer;transition:all .2s;opacity:${isRead ? '.7' : '1'}${!isRead ? ';transform:scale(1.01)' : ''}`;
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem">
        ${a.pinned ? '<span style="background:#fef3c7;color:#d97706;font-size:.7rem;font-weight:700;padding:.15rem .5rem;border-radius:6px">📌 Ghim</span>' : ''}
        ${a.class_name ? `<span class="class-tag" style="font-size:.72rem">${a.class_name}</span>` : '<span style="background:#e0f2fe;color:#0369a1;font-size:.7rem;font-weight:700;padding:.15rem .5rem;border-radius:6px">Tất cả lớp</span>'}
        ${!isRead ? '<span style="width:8px;height:8px;background:#ef4444;border-radius:50%;flex-shrink:0;margin-left:2px"></span>' : ''}
        <span style="margin-left:auto;font-size:.72rem;color:var(--muted)">${new Date(a.created_at).toLocaleDateString('vi-VN')}</span>
      </div>
      <div style="font-weight:${isRead ? '600' : '800'};font-size:.95rem;margin-bottom:.35rem;color:${isRead ? 'var(--muted)' : 'var(--text)'}">${a.title}</div>
      <div style="font-size:.85rem;color:var(--text);line-height:1.7;white-space:pre-line">${a.content}</div>
      ${a.link_url ? `<a href="${a.link_url}" target="_blank" style="display:inline-block;margin-top:.5rem;background:#eef2ff;color:#6366f1;padding:.35rem .85rem;border-radius:8px;font-size:.82rem;font-weight:700;text-decoration:none">🔗 ${a.link_text||'Xem tại đây'}</a>` : ''}
      ${!isRead ? '<div style="margin-top:.6rem;font-size:.75rem;color:#6366f1;font-weight:600">Nhấn để đánh dấu đã đọc ✓</div>' : '<div style="margin-top:.4rem;font-size:.72rem;color:var(--muted)">✓ Đã đọc</div>'}
    `;
    if (!isRead) {
      card.addEventListener('click', async () => {
        await db.from('notification_reads').upsert({ username: currentUser, announcement_id: a.id }, { onConflict: 'username,announcement_id' });
        readSet.add(a.id);
        renderNotifications();
        checkNewNotifications();
      });
    }
    list.appendChild(card);
  });

  updateNotiBadge(false);
}

function updateNotiBadge(hasNew) {
  const badge = document.getElementById('notiBadge');
  const dot = document.getElementById('sidebarNotiDot');
  if (badge) badge.style.display = hasNew ? 'block' : 'none';
  if (dot) dot.style.display = hasNew ? 'block' : 'none';
}

async function checkNewNotifications(showPopupIfUnread = false) {
  const { data: anns } = await db.from('announcements')
    .select('id, class_name, expires_at, target_username').order('created_at', { ascending: false });
  const myAnns = (anns || []).filter(a =>
    (!a.expires_at || new Date(a.expires_at) > new Date()) &&
    (a.target_username ? a.target_username === currentUser : (!a.class_name || a.class_name === myClass))
  );

  const { data: reads } = await db.from('notification_reads')
    .select('announcement_id').eq('username', currentUser);
  const readSet = new Set((reads || []).map(r => r.announcement_id));
  const hasUnread = myAnns.some(a => !readSet.has(a.id));
  updateNotiBadge(hasUnread);

  if (showPopupIfUnread && hasUnread) {
    showAnnouncementToast();
  }
}

// Nút chuông trên topbar
document.getElementById('notiBtn').addEventListener('click', () => showPage('notifications'));

// Dark mode học viên
const studentDarkBtn = document.getElementById('studentDarkBtn');
if (localStorage.getItem('st_dark') === '1') { document.body.classList.add('dark-mode'); studentDarkBtn.textContent = '☀️'; }
studentDarkBtn?.addEventListener('click', () => {
  const on = document.body.classList.toggle('dark-mode');
  studentDarkBtn.textContent = on ? '☀️' : '🌙';
  localStorage.setItem('st_dark', on ? '1' : '0');
});

// Realtime thông báo
db.channel('announcements-realtime')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
    if (document.getElementById('pageHome')?.classList.contains('active')) renderHome();
    if (document.getElementById('pageNotifications')?.classList.contains('active')) renderNotifications();
    else {
      updateNotiBadge(true);
      showAnnouncementToast();
    }
  })
  .subscribe();

async function showAnnouncementToast(ann = null) {
  // Nếu không truyền ann thì lấy thông báo mới nhất chưa đọc
  if (!ann) {
    const { data: anns } = await db.from('announcements')
      .select('*').order('created_at', { ascending: false }).limit(20);
    const { data: reads } = await db.from('notification_reads')
      .select('announcement_id').eq('username', currentUser);
    const readSet = new Set((reads||[]).map(r => r.announcement_id));
    const now = new Date();
    ann = (anns||[]).find(a =>
      !readSet.has(a.id) &&
      (!a.expires_at || new Date(a.expires_at) > now) &&
      (a.target_username ? a.target_username === currentUser : (!a.class_name || myClasses.includes(a.class_name)))
    );
    if (!ann) return;
  }

  const existing = document.getElementById('annToast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'annToast';
  toast.style.cssText = `
    position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%) translateY(80px);
    z-index:9999;background:linear-gradient(135deg,#1e1b4b,#4338ca);color:#fff;
    padding:1rem 1.5rem;border-radius:16px;font-size:.9rem;font-weight:600;
    box-shadow:0 12px 40px rgba(0,0,0,.35);display:flex;align-items:center;gap:.85rem;
    max-width:360px;width:90%;cursor:pointer;
    transition:transform .4s cubic-bezier(.34,1.56,.64,1),opacity .3s;
    border:1px solid rgba(255,255,255,.15)`;
  toast.innerHTML = `
    <div style="width:40px;height:40px;background:rgba(255,255,255,.15);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0">📢</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:.78rem;opacity:.75;margin-bottom:.15rem">Thông báo mới từ giáo viên</div>
      <div style="font-size:.88rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ann.title}</div>
    </div>
    <button style="background:rgba(255,255,255,.15);border:none;color:#fff;width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:.9rem;flex-shrink:0" id="annToastClose">✕</button>`;

  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.transform = 'translateX(-50%) translateY(0)'; });

  toast.addEventListener('click', async e => {
    if (e.target.id === 'annToastClose') { dismissToast(); return; }
    // Đánh dấu đã đọc
    await db.from('notification_reads').upsert(
      { username: currentUser, announcement_id: ann.id },
      { onConflict: 'username,announcement_id' }
    );
    showPage('notifications');
    dismissToast();
    checkNewNotifications();
  });

  function dismissToast() {
    toast.style.transform = 'translateX(-50%) translateY(80px)';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }

  setTimeout(dismissToast, 8000);
}

// Kiểm tra session token + trạng thái tài khoản mỗi 2 phút
setInterval(async () => {
  const token = sessionStorage.getItem('dh_token');
  if (!token) return;

  const { data } = await db.from('students').select('session_token, active, class_name, expiry_date, manually_unlocked').eq('username', currentUser).single();
  if (!data) return;

  // Bị đăng nhập thiết bị khác — token không khớp → đăng xuất
  if (data.session_token && data.session_token !== token) {
    _showKickedScreen();
    return;
  }

  // Tài khoản bị khóa thủ công
  if (!data.active) {
    alert('Tài khoản của bạn đã bị khóa. trợ lý và giáo viên ko hổ trợ duy trì tài khoản.');
    await setOffline();
    sessionStorage.clear();
    location.href = 'index.html';
    return;
  }

  // Lớp học hết hạn — chỉ khóa khi TẤT CẢ lớp đều hết hạn
  if (data.class_name && !data.manually_unlocked) {
    const classes = data.class_name.split(',').map(c=>c.trim()).filter(Boolean);
    const { data: clsList } = await db.from('classes').select('name,end_date').in('name', classes);
    const today = new Date(); today.setHours(0,0,0,0);
    const hasActive = (clsList||[]).some(c => !c.end_date || new Date(c.end_date) >= today);
    const allExpired = (clsList||[]).filter(c=>c.end_date).every(c => new Date(c.end_date) < today);
    if (!hasActive && allExpired && (clsList||[]).some(c=>c.end_date)) {
      await db.from('students').update({ active: false }).eq('username', currentUser);
      alert(`Tất cả khóa học đã kết thúc. Tài khoản đã bị khóa. trợ lý và giáo viên ko hổ trợ duy trì tài khoản.`);
      await setOffline();
      sessionStorage.clear();
      location.href = 'index.html';
      return;
    }
  }
}, 120000);






// ============================================================
// TỰ ĐỘNG ĐĂNG XUẤT SAU 30 PHÚT KHÔNG THAO TÁC
// ============================================================
// TỰ ĐỘNG ĐĂNG XUẤT SAU 30 PHÚT KHÔNG THAO TÁC
// ============================================================
(function autoLogout() {
  const TIMEOUT = 30 * 60 * 1000; // 30 phút
  const WARN    = 60 * 1000;       // cảnh báo trước 60 giây
  let timer, warnTimer;

  const overlay = document.createElement('div');
  overlay.id = 'autoLogoutOverlay';
  overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;align-items:center;justify-content:center;backdrop-filter:blur(4px)';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:2rem 2.5rem;text-align:center;max-width:340px;box-shadow:0 24px 64px rgba(0,0,0,.3)">
      <div style="font-size:2.5rem;margin-bottom:.75rem">⏱️</div>
      <div style="font-weight:800;font-size:1.1rem;margin-bottom:.5rem;color:#0f172a">Phiên sắp hết hạn</div>
      <div style="font-size:.88rem;color:#64748b;margin-bottom:1.25rem">Bạn không hoạt động trong 30 phút.<br>Tự động đăng xuất sau <b id="alCountdown" style="color:#ef4444">60</b> giây.</div>
      <button id="alStayBtn" style="width:100%;padding:.75rem;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:none;border-radius:12px;font-size:.92rem;font-weight:700;cursor:pointer">Tiếp tục học</button>
    </div>`;
  document.body.appendChild(overlay);

  let countdown;
  function showWarning() {
    // Nếu đang xem video thì tự reset, không hiện cảnh báo
    if (_viewerActive && _viewerIsVideo) { reset(); return; }
    overlay.style.display = 'flex';
    let secs = 60;
    document.getElementById('alCountdown').textContent = secs;
    countdown = setInterval(() => {
      secs--;
      const el = document.getElementById('alCountdown');
      if (el) el.textContent = secs;
      // Nếu đang xem video thì reset thay vì logout
      if (_viewerActive && _viewerIsVideo) { clearInterval(countdown); reset(); return; }
      if (secs <= 0) { clearInterval(countdown); logout(); }
    }, 1000);
  }

  async function logout() {
    clearInterval(countdown);
    overlay.style.display = 'none';
    await db.from('students').update({ is_online: false, last_seen: new Date().toISOString() }).eq('username', currentUser);
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
// GREETING TRANG CHỦ (chỉ tablet/laptop)
// ============================================================
(function initStudentGreeting() {
  function update() {
    const now  = new Date();
    const h    = now.getHours();
    const name = sessionStorage.getItem('dh_name') || 'bạn';
    const greet = h < 12 ? '☀️ Chào buổi sáng' : h < 18 ? '🌤 Chào buổi chiều' : '🌙 Chào buổi tối';
    const days  = ['Chủ nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'];
    const dateStr = `${days[now.getDay()]}, ${now.toLocaleDateString('vi-VN')}`;
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const gt = document.getElementById('studentGreetingText');
    const gd = document.getElementById('studentGreetingDate');
    const gtime = document.getElementById('studentGreetingTime');
    if (gt) gt.textContent = `${greet}, ${name}!`;
    if (gd) gd.textContent = dateStr;
    if (gtime) gtime.textContent = timeStr;
  }
  update();
  setInterval(update, 1000);
})();


// ── Realtime: thông báo bài học mới ──
let _lessonReloadTimer = null;
function _scheduleLessonReload() {
  _lessonCache = null;
  clearTimeout(_lessonReloadTimer);
  _lessonReloadTimer = setTimeout(() => {
    const lessonPage = document.getElementById('pageLessons');
    if (lessonPage && lessonPage.classList.contains('active')) renderLessonList(true);
  }, 800); // chờ 800ms sau event cuối cùng mới render
}

db.channel('student-new-lesson')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lessons' }, async (payload) => {
    const lesson = payload.new;
    if (lesson.class_name && !myClasses.some(mc => lesson.class_name.split(',').map(c=>c.trim()).includes(mc))) return;
    showNewLessonToast(lesson.name);
    _scheduleLessonReload();
  })
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lessons' }, async () => {
    _scheduleLessonReload();
  })
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lesson_groups' }, async () => {
    _scheduleLessonReload();
  })
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lesson_videos' }, async () => {
    _scheduleLessonReload();
  })
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lesson_docs' }, async () => {
    _scheduleLessonReload();
  })
  .subscribe();

function showNewLessonToast(lessonName) {
  const existing = document.getElementById('newLessonToast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'newLessonToast';
  toast.style.cssText = `
    position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%) translateY(80px);
    z-index:9999;background:linear-gradient(135deg,#059669,#047857);color:#fff;
    padding:1rem 1.5rem;border-radius:16px;font-size:.9rem;font-weight:600;
    box-shadow:0 12px 40px rgba(0,0,0,.3);display:flex;align-items:center;gap:.85rem;
    max-width:340px;width:90%;cursor:pointer;
    transition:transform .4s cubic-bezier(.34,1.56,.64,1),opacity .3s;
    border:1px solid rgba(255,255,255,.2)`;
  toast.innerHTML = `
    <div style="width:40px;height:40px;background:rgba(255,255,255,.2);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0">📚</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:.75rem;opacity:.85;margin-bottom:.15rem">Bài học mới vừa được đăng!</div>
      <div style="font-size:.88rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${lessonName}</div>
    </div>
    <button id="newLessonToastClose" style="background:rgba(255,255,255,.15);border:none;color:#fff;width:28px;height:28px;border-radius:8px;cursor:pointer;font-size:.9rem;flex-shrink:0">✕</button>`;

  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.transform = 'translateX(-50%) translateY(0)'; });

  function dismiss() {
    toast.style.transform = 'translateX(-50%) translateY(80px)';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }

  toast.addEventListener('click', e => {
    if (e.target.id === 'newLessonToastClose') { dismiss(); return; }
    showPage('lessons');
    dismiss();
  });
  document.getElementById('newLessonToastClose').addEventListener('click', dismiss);
  setTimeout(dismiss, 7000);
}

// ============================================================
// LỊCH HỌC V2 — Theo tuần, màu sắc theo trạng thái giờ học
// ============================================================

const _S_DAY_LABELS = ['','','T2','T3','T4','T5','T6','T7','CN'];
const _S_SESSION_ICON = { 'sáng':'☀️','chiều':'🌤','tối':'🌙' };

function _sGetMonday(d) {
  // Dùng local date để tránh UTC offset
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = dt.getDay(); // 0=CN,1=T2...
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return dt;
}
function _sAddDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function _sToDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function _sFmtDateVN(d) { return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`; }

let _sCurrentWeekStart = _sGetMonday(new Date());

// ---- Tính trạng thái slot ----
// returns: 'upcoming3h' | 'live' | 'done' | 'normal'
function _sSlotStatus(slot) {
  const now = new Date();
  // Lấy ngày thực của slot
  const ws = new Date(slot.week_start + 'T00:00:00');
  const slotDate = _sAddDays(ws, slot.day_of_week - 2);
  const [sh,sm] = slot.start_time.split(':').map(Number);
  const [eh,em] = slot.end_time.split(':').map(Number);
  const startDt = new Date(slotDate); startDt.setHours(sh,sm,0,0);
  const endDt   = new Date(slotDate); endDt.setHours(eh,em,0,0);
  const diffMs  = startDt - now;

  if (now >= startDt && now <= endDt) return 'live';
  if (now > endDt) return 'done';
  if (diffMs > 0 && diffMs <= 3 * 3600 * 1000) return 'upcoming3h';
  return 'normal';
}

// ---- Màu theo trạng thái ----
function _sSlotStyle(status) {
  switch(status) {
    case 'live':       return { bg:'#fee2e2', border:'#ef4444', text:'#991b1b',  badge:'🔴 Đang học',  badgeBg:'#ef4444' };
    case 'upcoming3h': return { bg:'#fef3c7', border:'#f59e0b', text:'#78350f',  badge:'⏰ Sắp học',   badgeBg:'#f59e0b' };
    case 'done':       return { bg:'#f1f5f9', border:'#cbd5e1', text:'#94a3b8',  badge:'✅ Xong',       badgeBg:'#94a3b8' };
    default:           return { bg:'var(--card)', border:'var(--border)', text:'var(--text)', badge:null, badgeBg:null };
  }
}

// ---- Render lịch học học sinh ----
async function renderStudentSchedule() {
  const ws = _sToDateStr(_sCurrentWeekStart);

  // Label tuần
  const now = _sGetMonday(new Date());
  const diff = Math.round((_sCurrentWeekStart - now) / 86400000 / 7);
  const wlEl = document.getElementById('sWeekLabel');
  const wrEl = document.getElementById('sWeekRange');
  if (wlEl) wlEl.textContent = diff === 0 ? '📅 Tuần này' : diff === 1 ? '📅 Tuần sau' : diff === -1 ? '📅 Tuần trước' : `📅 Tuần ${diff > 0 ? '+'+diff : diff}`;
  if (wrEl) wrEl.textContent = `${_sFmtDateVN(_sCurrentWeekStart)} – ${_sFmtDateVN(_sAddDays(_sCurrentWeekStart,6))}`;

  // Query theo lớp học viên
  let query = db.from('schedule_slots').select('*')
    .eq('week_start', ws)
    .order('day_of_week').order('start_time');

  if (myClasses.length > 0) {
    const classFilters = myClasses.map(c => `class_name.eq.${c}`).join(',');
    query = query.or(`${classFilters},class_name.is.null`);
  }

  const { data: slots } = await query;
  const list = slots || [];

  const container = document.getElementById('sScheduleTable');
  const emptyEl   = document.getElementById('sEmptySchedule');
  if (!container) return;

  if (!list.length) {
    container.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  // Group theo ngày
  const byDay = {};
  for (let i=2; i<=8; i++) byDay[i] = [];
  list.forEach(s => { if (byDay[s.day_of_week]) byDay[s.day_of_week].push(s); });

  const today = new Date(); today.setHours(0,0,0,0);

  const DAY_FULL = ['','','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy','Chủ Nhật'];

  let html = '<div style="display:flex;flex-direction:column;gap:1rem">';
  for (let dow=2; dow<=8; dow++) {
    const daySlots = byDay[dow];
    if (!daySlots.length) continue; // Bỏ qua ngày không có lịch

    const dayDate = _sAddDays(_sCurrentWeekStart, dow - 2);
    const isToday = dayDate.toDateString() === today.toDateString();
    const isSun   = dow === 8;

    const headerBg     = isToday ? 'linear-gradient(135deg,#4f46e5,#7c3aed)' : isSun ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg,#1e1b4b,#312e81)';
    const dateLabel    = _sFmtDateVN(dayDate);
    const todayBadge   = isToday ? `<span style="background:rgba(255,255,255,.25);color:#fff;font-size:.68rem;font-weight:800;padding:.15rem .55rem;border-radius:20px;margin-left:.5rem">Hôm nay</span>` : '';

    html += `
      <div style="border-radius:18px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);border:1.5px solid ${isToday?'#6366f1':isSun?'#f59e0b':'var(--border)'}">
        <!-- Header ngày -->
        <div style="background:${headerBg};padding:.75rem 1.1rem;display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:.6rem">
            <div style="width:36px;height:36px;background:rgba(255,255,255,.18);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1rem;font-weight:900;color:#fff">${dow===8?'CN':String(dow-1)}</div>
            <div>
              <div style="font-weight:800;font-size:.95rem;color:#fff">${DAY_FULL[dow]}${todayBadge}</div>
              <div style="font-size:.75rem;color:rgba(255,255,255,.7);margin-top:.05rem">📆 ${dateLabel}</div>
            </div>
          </div>
          <div style="background:rgba(255,255,255,.2);color:#fff;font-size:.75rem;font-weight:800;padding:.25rem .7rem;border-radius:20px">${daySlots.length} buổi</div>
        </div>
        <!-- Slots -->
        <div style="background:var(--bg);padding:.75rem;display:flex;flex-direction:column;gap:.6rem">
          ${daySlots.map(s => _sSlotCard(s)).join('')}
        </div>
      </div>`;
  }
  html += '</div>';
  container.innerHTML = html;
}

// ---- Render card slot ----
function _sSlotCard(s) {
  const icon = _S_SESSION_ICON[s.session] || '📅';

  // Tính trạng thái — parse an toàn không phụ thuộc timezone
  const now = new Date();
  // Tách week_start thành y/m/d rồi tính ngày của slot
  const [wy, wm, wd] = s.week_start.split('-').map(Number);
  const weekMonday = new Date(wy, wm - 1, wd); // local date, không bị timezone
  const slotDayOffset = s.day_of_week - 2; // T2=0, T3=1, ..., CN=6
  const slotD = new Date(wy, wm - 1, wd + slotDayOffset);
  const [sh, sm] = s.start_time.slice(0, 5).split(':').map(Number);
  const [eh, em] = s.end_time.slice(0, 5).split(':').map(Number);
  const startDt = new Date(slotD.getFullYear(), slotD.getMonth(), slotD.getDate(), sh, sm, 0);
  const endDt   = new Date(slotD.getFullYear(), slotD.getMonth(), slotD.getDate(), eh, em, 0);

  let status = 'upcoming'; // chưa tới
  if (now >= startDt && now <= endDt) status = 'live';    // đang học
  else if (now > endDt)               status = 'done';    // hết giờ

  const styles = {
    upcoming: {
      accent: '#10b981', bg: 'linear-gradient(135deg,#f0fdf4,#dcfce7)',
      border: '#86efac', text: 'var(--text)', opacity: '1',
      badge: null
    },
    live: {
      accent: '#ef4444', bg: 'linear-gradient(135deg,#fff1f2,#fee2e2)',
      border: '#fca5a5', text: '#991b1b', opacity: '1',
      badge: `<span style="display:flex;align-items:center;gap:.3rem;font-size:.7rem;font-weight:800;color:#fff;background:#ef4444;padding:.18rem .65rem;border-radius:20px">
        <span style="width:7px;height:7px;background:#fff;border-radius:50%;animation:monitorBlink 1s ease-in-out infinite;flex-shrink:0"></span>Đang học
      </span>`
    },
    done: {
      accent: '#94a3b8', bg: 'linear-gradient(135deg,#f8fafc,#f1f5f9)',
      border: '#e2e8f0', text: '#94a3b8', opacity: '.55',
      badge: `<span style="font-size:.7rem;font-weight:700;color:#94a3b8;background:#f1f5f9;border:1px solid #e2e8f0;padding:.18rem .6rem;border-radius:20px">✅ Đã xong</span>`
    }
  };
  const c = styles[status];

  return `
    <div style="background:${c.bg};border-radius:16px;border:1.5px solid ${c.border};overflow:hidden;transition:transform .18s,box-shadow .18s;box-shadow:0 2px 10px rgba(0,0,0,.05);opacity:${c.opacity}">
      <div style="display:flex">
        <div style="width:4px;background:${c.accent};flex-shrink:0"></div>
        <div style="flex:1;padding:.8rem 1rem">

          <!-- Buổi + badge trạng thái -->
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.4rem">
            <span style="font-size:.76rem;font-weight:700;color:${c.accent};background:${c.accent}22;padding:.18rem .6rem;border-radius:20px">
              ${icon} ${s.session.charAt(0).toUpperCase()+s.session.slice(1)}
            </span>
            ${c.badge || ''}
          </div>

          <!-- Nội dung -->
          <div style="font-weight:800;font-size:.93rem;color:${c.text};line-height:1.35;margin-bottom:.4rem">${s.subject}</div>

          <!-- Giờ -->
          <div style="display:flex;align-items:center;gap:.4rem;font-size:.81rem;font-weight:700;color:${c.accent}">
            <span style="background:${c.accent}18;border-radius:8px;padding:.18rem .5rem">⏰ ${s.start_time.slice(0,5)}</span>
            <span style="color:var(--muted)">→</span>
            <span style="background:${c.accent}18;border-radius:8px;padding:.18rem .5rem">${s.end_time.slice(0,5)}</span>
          </div>

          <!-- Lớp + ghi chú -->
          ${s.class_name || s.notes ? `
          <div style="margin-top:.4rem;display:flex;flex-wrap:wrap;gap:.3rem;align-items:center">
            ${s.class_name ? `<span style="font-size:.69rem;font-weight:700;background:#eef2ff;color:#4f46e5;padding:.12rem .45rem;border-radius:7px">🏫 ${s.class_name}</span>` : ''}
            ${s.notes ? `<span style="font-size:.71rem;color:var(--muted);font-style:italic">📌 ${s.notes}</span>` : ''}
          </div>` : ''}

          <!-- Zalo — ẩn khi đã xong -->
          ${status !== 'done' ? `
          <div style="margin-top:.55rem;background:linear-gradient(135deg,#ecfdf5,#d1fae5);border:1px solid #6ee7b7;border-radius:9px;padding:.38rem .7rem;font-size:.75rem;font-weight:700;color:#065f46;display:flex;align-items:center;gap:.4rem">
            💬 Link học gửi qua <b>nhóm Zalo</b>
          </div>` : ''}

        </div>
      </div>
    </div>`;
}

// ---- Auto-refresh mỗi phút để cập nhật slot đã xong ----
setInterval(() => {
  if (currentSection === 'schedule') renderStudentSchedule();
}, 60000);

// ---- Điều hướng tuần ----
document.getElementById('sPrevWeek')?.addEventListener('click', () => {
  _sCurrentWeekStart = _sAddDays(_sCurrentWeekStart, -7);
  renderStudentSchedule();
});
document.getElementById('sNextWeek')?.addEventListener('click', () => {
  _sCurrentWeekStart = _sAddDays(_sCurrentWeekStart, 7);
  renderStudentSchedule();
});

function openScheduleViewer(s) {
  // legacy — không dùng nữa nhưng giữ để không lỗi nếu còn ref cũ
}
