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
const POINTS_PER_LESSON_VIEW = 20;
const POINTS_PER_ACCESS_LOG = 5;
const POINTS_PER_ACTIVE_DAY = 10;
const POINTS_PER_STUDY_HOUR = 30; // +30 điểm mỗi giờ học
// Mốc mở thi đua: trước giờ này sẽ chưa tính gì.
const COMPETITION_LAUNCH_AT = new Date('2025-01-01T00:00:00+07:00');

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

function _toDateKey(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _calcCurrentStreak(dateKeys) {
  if (!dateKeys.length) return 0;
  const set = new Set(dateKeys);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const todayKey = _toDateKey(now.toISOString());
  const y = new Date(now); y.setDate(y.getDate() - 1);
  const yKey = _toDateKey(y.toISOString());
  if (!set.has(todayKey) && !set.has(yKey)) return 0;

  let streak = 0;
  const cursor = set.has(todayKey) ? now : y;
  while (true) {
    const key = _toDateKey(cursor.toISOString());
    if (!set.has(key)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Chu kỳ reset: tuần (T2) cho điểm/huy chương; tháng cho streak
function _startOfWeek(d = new Date()) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const diff = day === 0 ? 6 : day - 1;
  date.setDate(date.getDate() - diff);
  return date;
}

function _startOfMonth(d = new Date()) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(1);
  return date;
}

function _nextWeekStart(from = new Date()) {
  const s = _startOfWeek(from);
  s.setDate(s.getDate() + 7);
  return s;
}

function _nextMonthStart(from = new Date()) {
  const s = _startOfMonth(from);
  s.setMonth(s.getMonth() + 1);
  return s;
}

function _isOnOrAfter(ts, startDate) {
  const t = new Date(ts).getTime();
  return !Number.isNaN(t) && t >= startDate.getTime();
}

function _filterLogsByPeriod(logs, field, startDate) {
  return (logs || []).filter(x => x?.[field] && _isOnOrAfter(x[field], startDate));
}

function _collectActivityDateKeys(loginLogs, accessLogs, lessonViews) {
  return [...new Set([
    ...loginLogs.map(x => _toDateKey(x.logged_in_at)),
    ...accessLogs.map(x => _toDateKey(x.accessed_at)),
    ...lessonViews.map(x => _toDateKey(x.viewed_at)),
  ].filter(Boolean))].sort();
}

function _isCompetitionStarted() {
  return Date.now() >= COMPETITION_LAUNCH_AT.getTime();
}

function _maxDate(a, b) {
  return a.getTime() >= b.getTime() ? a : b;
}

function _escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function _buildUserAchievementStats({ loginLogs = [], accessLogs = [], lessonViews = [] }) {
  const now = new Date();
  const weekStart = _maxDate(_startOfWeek(now), COMPETITION_LAUNCH_AT);
  const monthStart = _maxDate(_startOfMonth(now), COMPETITION_LAUNCH_AT);

  if (!_isCompetitionStarted()) {
    return {
      activityDateKeys: [],
      loginDays: 0, streak: 0,
      hasLateNight: false, hasEarlyBird: false,
      studyHours: 0, maxDayHours: 0, longestSessionMinutes: 0,
      points: 0, weekStart, monthStart,
    };
  }

  const wLogin = _filterLogsByPeriod(loginLogs, 'logged_in_at', weekStart);
  const wAccess = _filterLogsByPeriod(accessLogs, 'accessed_at', weekStart);
  const wViews = _filterLogsByPeriod(lessonViews, 'viewed_at', weekStart);

  const mLogin = _filterLogsByPeriod(loginLogs, 'logged_in_at', monthStart);
  const mAccess = _filterLogsByPeriod(accessLogs, 'accessed_at', monthStart);
  const mViews = _filterLogsByPeriod(lessonViews, 'viewed_at', monthStart);

  const weeklyActivityDateKeys = _collectActivityDateKeys(wLogin, wAccess, wViews);
  const monthlyActivityDateKeys = _collectActivityDateKeys(mLogin, mAccess, mViews);

  const loginDays = weeklyActivityDateKeys.length;
  const streak = _calcCurrentStreak(monthlyActivityDateKeys);

  const allTimeSamples = [
    ...wLogin.map(x => new Date(x.logged_in_at)).filter(x => !Number.isNaN(x.getTime())),
    ...wAccess.map(x => new Date(x.accessed_at)).filter(x => !Number.isNaN(x.getTime())),
  ];
  const hasLateNight = allTimeSamples.some(d => d.getHours() >= 23);
  const hasEarlyBird = allTimeSamples.some(d => d.getHours() < 6);

  const accessTimes = wAccess
    .map(x => new Date(x.accessed_at).getTime())
    .filter(x => !Number.isNaN(x))
    .sort((a, b) => a - b);
  let totalMinutes = 0;
  let longestSessionMinutes = 0;
  const perDayMinutes = {};
  let sessionStart = null;
  let prev = null;
  for (const t of accessTimes) {
    if (sessionStart === null) {
      sessionStart = t;
      prev = t;
      continue;
    }
    const gapMin = (t - prev) / 60000;
    if (gapMin <= 20) {
      prev = t;
    } else {
      const mins = Math.max(6, (prev - sessionStart) / 60000 + 6);
      totalMinutes += mins;
      longestSessionMinutes = Math.max(longestSessionMinutes, mins);
      const dayKey = _toDateKey(new Date(sessionStart).toISOString());
      perDayMinutes[dayKey] = (perDayMinutes[dayKey] || 0) + mins;
      sessionStart = t;
      prev = t;
    }
  }
  if (sessionStart !== null && prev !== null) {
    const mins = Math.max(6, (prev - sessionStart) / 60000 + 6);
    totalMinutes += mins;
    longestSessionMinutes = Math.max(longestSessionMinutes, mins);
    const dayKey = _toDateKey(new Date(sessionStart).toISOString());
    perDayMinutes[dayKey] = (perDayMinutes[dayKey] || 0) + mins;
  }
  const studyHours = totalMinutes / 60;
  const maxDayHours = Math.max(0, ...Object.values(perDayMinutes).map(m => m / 60));
  const points = Math.round(
    (wViews.length * POINTS_PER_LESSON_VIEW) +
    (wAccess.length * POINTS_PER_ACCESS_LOG) +
    (loginDays * POINTS_PER_ACTIVE_DAY) +
    (studyHours * POINTS_PER_STUDY_HOUR)
  );

  return {
    activityDateKeys: weeklyActivityDateKeys,
    loginDays,
    streak,
    hasLateNight,
    hasEarlyBird,
    studyHours,
    maxDayHours,
    longestSessionMinutes,
    points,
    weekStart,
    monthStart,
  };
}

async function renderClassLeaderboard() {
  const listEl = document.getElementById('profileLeaderboardList');
  const summaryEl = document.getElementById('profileLeaderboardSummary');
  if (!listEl || !summaryEl || !myClasses.length) return;

  if (!_isCompetitionStarted()) {
    summaryEl.textContent = 'Chưa mở thi đua';
    listEl.innerHTML = `
      <div style="border:1.5px dashed rgba(148,163,184,.45);background:rgba(15,23,42,.18);border-radius:12px;padding:.9rem .95rem">
        <div style="font-size:.9rem;font-weight:800;color:#fff">🚧 Bảng thi đua chưa mở</div>
        <div style="font-size:.78rem;color:rgba(255,255,255,.7);margin-top:.25rem;line-height:1.6">
          Tuần đầu tiên sẽ mở lúc <b>13:00 hôm nay</b>. Trước thời điểm này, bảng xếp hạng chưa có dữ liệu.
        </div>
      </div>`;
    return;
  }

  summaryEl.textContent = 'Đang tải xếp hạng...';
  listEl.innerHTML = '<div style="font-size:.82rem;color:rgba(255,255,255,.75)">Đang tính điểm thi đua...</div>';
  try {
    const { data: students } = await db
      .from('students')
      .select('username,full_name,class_name,active')
      .eq('active', true)
      .limit(10000);
    const classmates = (students || []).filter(s => {
      const cls = parseClassList(s.class_name);
      return cls.some(c => myClasses.includes(c));
    });
    const usernames = classmates.map(s => s.username).filter(Boolean);
    if (!usernames.length) {
      summaryEl.textContent = 'Chưa có xếp hạng';
      listEl.innerHTML = '<div style="font-size:.82rem;color:rgba(255,255,255,.75)">Chưa có học viên trong lớp để xếp hạng.</div>';
      return;
    }

    const [{ data: lg }, { data: ac }, { data: lv }] = await Promise.all([
      db.from('login_logs').select('username,logged_in_at').in('username', usernames).order('logged_in_at', { ascending: true }).limit(50000),
      db.from('access_logs').select('username,accessed_at').in('username', usernames).order('accessed_at', { ascending: true }).limit(100000),
      db.from('lesson_views').select('username,viewed_at').in('username', usernames).order('viewed_at', { ascending: true }).limit(100000),
    ]);

    const bucket = {};
    usernames.forEach(u => { bucket[u] = { loginLogs: [], accessLogs: [], lessonViews: [] }; });
    (lg || []).forEach(x => { if (bucket[x.username]) bucket[x.username].loginLogs.push(x); });
    (ac || []).forEach(x => { if (bucket[x.username]) bucket[x.username].accessLogs.push(x); });
    (lv || []).forEach(x => { if (bucket[x.username]) bucket[x.username].lessonViews.push(x); });

    const ranked = classmates.map(s => {
      const logs = bucket[s.username] || { loginLogs: [], accessLogs: [], lessonViews: [] };
      const st = _buildUserAchievementStats(logs);
      return {
        username: s.username,
        name: s.full_name || s.username,
        points: st.points,
        weeklyPoints: st.points,
        streak: st.streak,
        hours: st.studyHours
      };
    }).sort((a, b) => b.points - a.points || b.weeklyPoints - a.weeklyPoints || b.streak - a.streak || b.hours - a.hours || a.name.localeCompare(b.name));

    const myRank = ranked.findIndex(x => x.username === currentUser) + 1;
    const top = ranked.slice(0, 10);
    summaryEl.textContent = `${ranked.length} học viên • Hạng của bạn: #${myRank || '-'} • Xếp theo tổng điểm`;
    listEl.innerHTML = top.map((u, i) => {
      const rank = i + 1;
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
      const isMe = u.username === currentUser;
      const bg = rank === 1
        ? 'linear-gradient(135deg,#fef3c7,#fde68a)'
        : rank === 2
          ? 'linear-gradient(135deg,#f1f5f9,#e2e8f0)'
          : rank === 3
            ? 'linear-gradient(135deg,#ffedd5,#fed7aa)'
            : isMe
              ? 'linear-gradient(135deg,#eef2ff,#e0e7ff)'
              : 'rgba(255,255,255,.06)';
      const bd = isMe ? '#818cf8' : 'rgba(148,163,184,.35)';
      return `
        <div style="display:flex;align-items:center;gap:.7rem;padding:.62rem .72rem;border-radius:12px;background:${bg};border:1.5px solid ${bd}">
          <div style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.08);font-size:.92rem;font-weight:900;flex-shrink:0">${medal}</div>
          <div style="min-width:0;flex:1">
            <div style="font-size:.85rem;font-weight:800;color:${rank <= 3 ? '#111827' : '#fff'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escapeHtml(u.name)}${isMe ? ' <span style="color:#6366f1">(Bạn)</span>' : ''}</div>
            <div style="font-size:.72rem;color:${rank <= 3 ? '#475569' : 'rgba(226,232,240,.8)'};margin-top:.15rem">Tuần này: ${u.weeklyPoints} điểm • ${u.streak} ngày streak • ${u.hours.toFixed(1)}h học</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:.92rem;font-weight:900;color:${rank <= 3 ? '#111827' : '#fff'}">${Math.round(u.points)}</div>
            <div style="font-size:.67rem;color:${rank <= 3 ? '#64748b' : 'rgba(226,232,240,.75)'}">điểm</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (_) {
    summaryEl.textContent = 'Lỗi tải dữ liệu';
    listEl.innerHTML = '<div style="font-size:.82rem;color:#fecaca">Không tải được bảng xếp hạng. Vui lòng thử lại.</div>';
  }
}

async function renderProfileAchievements() {
  const grid = document.getElementById('profileAchievementsGrid');
  const summary = document.getElementById('profileAchievementSummary');
  const rulesEl = document.getElementById('profilePointRules');
  if (!grid || !summary || !currentUser) return;

  let loginLogs = [];
  let accessLogs = [];
  let lessonViews = [];
  try {
    const [{ data: lg }, { data: ac }, { data: lv }] = await Promise.all([
      db.from('login_logs').select('logged_in_at').eq('username', currentUser).order('logged_in_at', { ascending: true }).limit(5000),
      db.from('access_logs').select('accessed_at').eq('username', currentUser).order('accessed_at', { ascending: true }).limit(10000),
      db.from('lesson_views').select('viewed_at').eq('username', currentUser).order('viewed_at', { ascending: true }).limit(10000),
    ]);
    loginLogs = lg || [];
    accessLogs = ac || [];
    lessonViews = lv || [];
  } catch (_) {
    // Bảng chưa tồn tại hoặc lỗi query: giữ số liệu mặc định
  }

  const stats = _buildUserAchievementStats({ loginLogs, accessLogs, lessonViews });
  const { loginDays, streak, hasLateNight, hasEarlyBird, studyHours, maxDayHours, longestSessionMinutes, points, weekStart, monthStart } = stats;
  const fmtDate = d => d.toLocaleDateString('vi-VN');
  const fmtTime = d => d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const nextWeekReset = _nextWeekStart();
  const nextMonthReset = _nextMonthStart();
  if (rulesEl) {
    const launchNote = _isCompetitionStarted()
      ? `<div style="font-size:.73rem;color:#166534;line-height:1.6;background:#ecfdf5;border:1px solid #86efac;border-radius:8px;padding:.45rem .55rem;margin-bottom:.45rem">
          ✅ Thi đua đã mở từ <b>${fmtTime(COMPETITION_LAUNCH_AT)} ${fmtDate(COMPETITION_LAUNCH_AT)}</b>.
        </div>`
      : `<div style="font-size:.73rem;color:#92400e;line-height:1.6;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:.45rem .55rem;margin-bottom:.45rem">
          ⏳ Chưa mở thi đua. Tuần đầu tiên sẽ bắt đầu lúc <b>${fmtTime(COMPETITION_LAUNCH_AT)} hôm nay</b>.
        </div>`;
    rulesEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:.45rem;font-size:.83rem;font-weight:800;color:#3730a3;margin-bottom:.5rem">
        <span style="display:inline-flex;width:22px;height:22px;border-radius:7px;background:#4f46e5;color:#fff;align-items:center;justify-content:center;font-size:.72rem">∑</span>
        Cách tính điểm thi đua
      </div>
      ${launchNote}
      <div style="display:flex;flex-wrap:wrap;gap:.45rem;margin-bottom:.55rem">
        <span style="background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;padding:.18rem .5rem;border-radius:999px;font-size:.72rem;font-weight:700">+${POINTS_PER_LESSON_VIEW} điểm / lượt xem bài</span>
        <span style="background:#ecfeff;color:#155e75;border:1px solid #a5f3fc;padding:.18rem .5rem;border-radius:999px;font-size:.72rem;font-weight:700">+${POINTS_PER_ACCESS_LOG} điểm / lượt truy cập</span>
        <span style="background:#ecfdf5;color:#166534;border:1px solid #86efac;padding:.18rem .5rem;border-radius:999px;font-size:.72rem;font-weight:700">+${POINTS_PER_ACTIVE_DAY} điểm / ngày hoạt động</span>
        <span style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;padding:.18rem .5rem;border-radius:999px;font-size:.72rem;font-weight:700">+${POINTS_PER_STUDY_HOUR} điểm / giờ học</span>
      </div>
      <div style="font-size:.74rem;color:#475569;line-height:1.65;margin-bottom:.45rem">
        Công thức: <b style="color:#1e293b">Điểm = (Lượt xem × ${POINTS_PER_LESSON_VIEW}) + (Lượt truy cập × ${POINTS_PER_ACCESS_LOG}) + (Ngày hoạt động × ${POINTS_PER_ACTIVE_DAY}) + (Giờ học × ${POINTS_PER_STUDY_HOUR})</b>
      </div>
      <div style="font-size:.73rem;color:#334155;line-height:1.6;background:#fff;border:1px solid #dbeafe;border-radius:8px;padding:.45rem .55rem">
        <b>🔄 Chu kỳ reset</b><br/>
        • Điểm, giờ học, huy chương: reset mỗi tuần (từ <b>Thứ 2</b>) — tuần này: <b>${fmtDate(weekStart)} → ${fmtDate(new Date())}</b>, reset tiếp: <b>${fmtDate(nextWeekReset)}</b><br/>
        • Streak lửa: reset mỗi tháng — tháng này từ <b>${fmtDate(monthStart)}</b>, reset tiếp: <b>${fmtDate(nextMonthReset)}</b>
      </div>`;
  }
  const streakValueEl = document.getElementById('profileStreakValue');
  const streakStatusEl = document.getElementById('profileStreakStatus');
  const streakBarEl = document.getElementById('profileStreakBar');
  if (streakValueEl) streakValueEl.textContent = `${streak} ngày`;
  if (streakStatusEl) {
    const monthHint = ` (tháng ${monthStart.getMonth() + 1}/${monthStart.getFullYear()})`;
    if (streak >= 30) streakStatusEl.textContent = `Đỉnh cao phong độ! Streak tháng này đang cháy.${monthHint}`;
    else if (streak >= 14) streakStatusEl.textContent = `Phong độ rất ổn, cố thêm để chạm 30 ngày trong tháng.${monthHint}`;
    else if (streak >= 7) streakStatusEl.textContent = `Chuỗi học đang nóng, giữ nhịp đều trong tháng.${monthHint}`;
    else if (streak >= 1) streakStatusEl.textContent = `Khởi động tốt! Duy trì mỗi ngày để tăng streak tháng.${monthHint}`;
    else streakStatusEl.textContent = `Bắt đầu streak tháng mới — reset vào ${fmtDate(nextMonthReset)}.`;
  }
  if (streakBarEl) streakBarEl.style.width = `${Math.min(100, Math.round((streak / 30) * 100))}%`;

  const defs = [
    { n:'Mầm non 🌱', c:'Cơ bản', ok: points >= 50, d:'Đạt 50 điểm' },
    { n:'Khởi đầu 🚀', c:'Cơ bản', ok: studyHours >= 1, d:'Học đủ 1 giờ' },
    { n:'Chăm chỉ 📘', c:'Cơ bản', ok: studyHours >= 5, d:'Học đủ 5 giờ' },
    { n:'Siêng năng ✨', c:'Cơ bản', ok: loginDays >= 7, d:'Đăng nhập 7 ngày' },

    { n:'Bắt đầu bùng 🔥', c:'Streak', ok: streak >= 3, d:'3 ngày' },
    { n:'Tuần lửa 🔥🔥', c:'Streak', ok: streak >= 7, d:'7 ngày' },
    { n:'Núi lửa 🌋', c:'Streak', ok: streak >= 14, d:'14 ngày' },
    { n:'Cháy máy ☄️', c:'Streak', ok: streak >= 30, d:'30 ngày' },
    { n:'Hỏa thần 👑', c:'Streak', ok: streak >= 100, d:'100 ngày' },

    { n:'Khởi động ⏱️', c:'Thời gian học', ok: studyHours >= 10, d:'10 giờ' },
    { n:'Chăm học 📚', c:'Thời gian học', ok: studyHours >= 50, d:'50 giờ' },
    { n:'Học bá 🎓', c:'Thời gian học', ok: studyHours >= 100, d:'100 giờ' },
    { n:'Máy cày 🤖', c:'Thời gian học', ok: studyHours >= 250, d:'250 giờ' },
    { n:'Quái vật học tập ☠️', c:'Thời gian học', ok: studyHours >= 500, d:'500 giờ' },

    { n:'Học sinh giỏi ⭐', c:'Điểm số', ok: points >= 200, d:'200 điểm' },
    { n:'Xuất sắc 🌟', c:'Điểm số', ok: points >= 500, d:'500 điểm' },
    { n:'Kim cương 💎', c:'Điểm số', ok: points >= 1000, d:'1.000 điểm' },
    { n:'Cao thủ 🏆', c:'Điểm số', ok: points >= 3000, d:'3.000 điểm' },
    { n:'Vô địch 👑', c:'Điểm số', ok: points >= 5000, d:'5.000 điểm' },
    { n:'Huyền thoại 🔥', c:'Điểm số', ok: points >= 10000, d:'10.000 điểm' },

    { n:'Cú đêm 🌙', c:'Đặc biệt', ok: hasLateNight, d:'Học sau 23h' },
    { n:'Dậy sớm ☀️', c:'Đặc biệt', ok: hasEarlyBird, d:'Học trước 6h' },
    { n:'Chuyên cần 📅', c:'Đặc biệt', ok: streak >= 14, d:'Không nghỉ 14 ngày' },
    { n:'Bền bỉ 💪', c:'Đặc biệt', ok: longestSessionMinutes >= 180, d:'Online liên tục 3 giờ' },
    { n:'Tăng tốc ⚡', c:'Đặc biệt', ok: maxDayHours >= 5, d:'Học 5 giờ/ngày' },

    { n:'Thành viên VIP 💠', c:'VIP', ok: streak >= 30, d:'Duy trì streak 30 ngày' },
    { n:'Bá chủ BXH 🥇', c:'VIP', ok: false, d:'Top 1 tuần (đang chờ tính năng BXH)' },
  ];

  const unlockedNow = defs.filter(x => x.ok).length;
  const totalNow = defs.length;
  const percent = Math.round((unlockedNow / totalNow) * 100);
  defs.push(
    { n:'Huyền thoại LMS 👑', c:'VIP', ok: percent >= 70, d:'Mở khóa 70% huy hiệu' },
    { n:'Truyền thuyết 📜', c:'VIP', ok: unlockedNow === totalNow, d:'Mở khóa toàn bộ huy hiệu' },
  );

  const unlocked = defs.filter(x => x.ok).length;
  summary.textContent = `Tuần ${fmtDate(weekStart)}–${fmtDate(new Date())} • ${unlocked}/${defs.length} huy chương • ${Math.round(points)} điểm • ${studyHours.toFixed(1)} giờ`;
  const quickPointsEl = document.getElementById('profileQuickPoints');
  const quickHoursEl = document.getElementById('profileQuickHours');
  const quickStreakEl = document.getElementById('profileQuickStreak');
  const quickBadgesEl = document.getElementById('profileQuickBadges');
  if (quickPointsEl) quickPointsEl.textContent = `${Math.round(points)}`;
  if (quickHoursEl) quickHoursEl.textContent = `${studyHours.toFixed(1)}h`;
  if (quickStreakEl) quickStreakEl.textContent = `${streak} ngày`;
  if (quickBadgesEl) quickBadgesEl.textContent = `${unlocked}/${defs.length}`;

  grid.innerHTML = defs.map(x => {
    const title = _escapeHtml(x.n);
    const meta = _escapeHtml(`${x.c} • ${x.d}`);
    return `
      <div class="ach-card ${x.ok ? 'ach-unlocked' : 'ach-locked'}">
        <div class="ach-row">
          <div class="ach-title">${title}</div>
          <span class="ach-pill ${x.ok ? 'ok' : 'no'}">${x.ok ? 'Đã mở' : 'Khóa'}</span>
        </div>
        <div class="ach-meta">${meta}</div>
        <div class="ach-bar">
          <div class="ach-bar-fill" style="width:${x.ok ? 100 : 0}%"></div>
        </div>
      </div>
    `;
  }).join('');
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
  await renderProfileAchievements();
  await renderClassLeaderboard();
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
// ============================================================
// QUÀ ĐIỂM HẰNG NGÀY
// ============================================================
async function checkDailyReward() {
  if (!currentUser) return;
  const today = new Date().toISOString().split('T')[0];

  // Kiểm tra localStorage trước (nhanh, tránh hiện 2 lần)
  const lsKey = `dr_claimed_${currentUser}`;
  if (localStorage.getItem(lsKey) === today) return;

  // Kiểm tra DB
  const { data: existing } = await db.from('daily_rewards')
    .select('id').eq('username', currentUser).eq('reward_date', today).maybeSingle();
  if (existing) {
    // Đã nhận rồi → lưu localStorage để lần sau không cần query DB
    localStorage.setItem(lsKey, today);
    return;
  }

  // Tính streak: đếm ngày liên tiếp trước hôm nay
  const { data: recentRewards } = await db.from('daily_rewards')
    .select('reward_date').eq('username', currentUser)
    .order('reward_date', { ascending: false }).limit(60);

  let streak = 1;
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  let checkDate = yesterday;
  for (const r of (recentRewards||[])) {
    const d = r.reward_date;
    const check = checkDate.toISOString().split('T')[0];
    if (d === check) {
      streak++;
      checkDate = new Date(checkDate); checkDate.setDate(checkDate.getDate() - 1);
    } else break;
  }

  // Tính điểm theo streak
  let points = 10;
  if (streak >= 30) points = 50;
  else if (streak >= 14) points = 35;
  else if (streak >= 7)  points = 25;
  else if (streak >= 3)  points = 15;

  // Hiện popup
  const overlay = document.getElementById('dailyRewardOverlay');
  if (!overlay) return;
  document.getElementById('drPoints').textContent = `+${points}`;
  document.getElementById('drStreakNum').textContent = streak;
  const pct = Math.min(100, Math.round((streak / 30) * 100));
  setTimeout(() => { const bar = document.getElementById('drStreakBar'); if (bar) bar.style.width = pct + '%'; }, 300);
  if (streak >= 3) document.getElementById('drBonusInfo').style.display = 'block';
  // Emoji lửa theo streak
  const fire = document.getElementById('drStreakFire');
  if (fire) fire.textContent = streak >= 30 ? '🔥🔥🔥' : streak >= 7 ? '🔥🔥' : '🔥';

  overlay.style.display = 'flex';

  document.getElementById('drClaimBtn').addEventListener('click', async () => {
    overlay.style.display = 'none';
    // Lưu localStorage ngay lập tức — tránh nhận 2 lần nếu click nhanh
    localStorage.setItem(lsKey, today);
    // Lưu vào DB
    await db.from('daily_rewards').insert({ username: currentUser, reward_date: today, points, streak_day: streak });
    // Cộng điểm vào access_logs (dùng như 1 lượt hoạt động để tính điểm thi đua)
    for (let i = 0; i < Math.round(points / 5); i++) {
      await db.from('access_logs').insert({
        username: currentUser,
        student_name: sessionStorage.getItem('dh_name') || currentUser,
        class_name: myClass || '',
        lesson_name: `[Quà hằng ngày - Ngày ${streak}]`,
        content_type: 'daily_reward',
        accessed_at: new Date().toISOString()
      });
    }
    // Toast thông báo
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(20px);background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;padding:.65rem 1.25rem;border-radius:20px;font-size:.88rem;font-weight:700;z-index:99999;box-shadow:0 8px 24px rgba(245,158,11,.4);opacity:0;transition:all .3s';
    toast.textContent = `🎁 +${points} điểm! Streak ${streak} ngày 🔥`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(-50%) translateY(0)'; });
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
  }, { once: true });
}

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
  // Hiện quà hằng ngày sau 1.5s (sau khi trang đã load xong)
  setTimeout(() => checkDailyReward(), 1500);
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
// LỊCH HỌC
// ============================================================
async function renderStudentSchedule() {
  let query = db.from('schedules').select('*').order('created_at', { ascending: false });
  if (myClasses.length === 1) query = query.or(`class_name.eq.${myClasses[0]},class_name.is.null`);
  else if (myClasses.length > 1) query = query.or(`class_name.in.(${myClasses.join(',')}),class_name.is.null`);
  const { data: list } = await query;
  const grid = document.getElementById('sScheduleGrid');
  grid.innerHTML = '';
  document.getElementById('sEmptySchedule').style.display = (list||[]).length ? 'none' : 'block';
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:.75rem';
  (list||[]).forEach(s => {
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--card);border-radius:12px;overflow:hidden;box-shadow:var(--shadow);border:1.5px solid var(--border);cursor:pointer;transition:transform .15s';
    card.innerHTML = `
      <div style="position:relative;padding-bottom:75%;overflow:hidden">
        <img src="${s.image_url}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"/>
      </div>
      <div style="padding:.5rem .75rem">
        <div style="font-weight:700;font-size:.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.title}</div>
        ${s.class_name ? `<span class="class-tag" style="font-size:.68rem">${s.class_name}</span>` : ''}
      </div>`;
    card.addEventListener('mouseenter', () => card.style.transform = 'translateY(-2px)');
    card.addEventListener('mouseleave', () => card.style.transform = '');
    card.addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;cursor:zoom-out';
      overlay.innerHTML = `
        <img src="${s.image_url}" style="max-width:100%;max-height:100%;border-radius:10px;object-fit:contain"/>
        <button id="rotateBtn" style="position:fixed;bottom:1.5rem;right:1.5rem;background:rgba(255,255,255,.2);border:none;color:#fff;width:48px;height:48px;border-radius:50%;font-size:1.3rem;cursor:pointer;z-index:10000" title="Xoay ngang">🔄</button>
        <button style="position:fixed;top:1rem;right:1rem;background:rgba(255,255,255,.2);border:none;color:#fff;width:36px;height:36px;border-radius:50%;font-size:1.1rem;cursor:pointer;z-index:10000" id="closeOverlay">✕</button>`;
      let rotated = false;
      overlay.querySelector('#rotateBtn').addEventListener('click', e => {
        e.stopPropagation();
        rotated = !rotated;
        const img = overlay.querySelector('img');
        if (rotated) {
          img.style.transform = 'rotate(90deg)';
          img.style.maxWidth = '100vh';
          img.style.maxHeight = '100vw';
          img.style.width = 'auto';
          img.style.height = 'auto';
        } else {
          img.style.transform = '';
          img.style.maxWidth = '100%';
          img.style.maxHeight = '100%';
        }
      });
      overlay.querySelector('#closeOverlay').addEventListener('click', e => { e.stopPropagation(); overlay.remove(); });
      overlay.addEventListener('click', () => overlay.remove());
      document.body.appendChild(overlay);
    });
    grid.appendChild(card);
  });
}

function openScheduleViewer(s) {
  let modal = document.getElementById('scheduleViewerModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'scheduleViewerModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1rem';
    modal.innerHTML = `
      <div style="width:100%;max-width:700px;position:relative">
        <button id="closeScheduleViewer" style="position:absolute;top:-40px;right:0;background:rgba(255,255,255,.15);border:none;color:#fff;width:36px;height:36px;border-radius:10px;cursor:pointer;font-size:1.1rem">✕</button>
        <div id="scheduleViewerTitle" style="color:#fff;font-weight:700;font-size:1rem;margin-bottom:.75rem;text-align:center"></div>
        <img id="scheduleViewerImg" style="width:100%;border-radius:14px;max-height:80vh;object-fit:contain"/>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('closeScheduleViewer').addEventListener('click', () => { modal.style.display = 'none'; });
    modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
  }
  document.getElementById('scheduleViewerTitle').textContent = s.title;
  document.getElementById('scheduleViewerImg').src = s.image_url;
  modal.style.display = 'flex';
}
