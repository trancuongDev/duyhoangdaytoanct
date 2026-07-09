// Auth guard
if (!sessionStorage.getItem('dh_role')) {
  window.location.href = 'login.html';
}

document.getElementById('welcomeText').textContent =
  'Xin chào, ' + (sessionStorage.getItem('dh_name') || sessionStorage.getItem('dh_user'));

document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.clear();
  window.location.href = 'login.html';
});

const subjectLabels = {
  'dai-so': 'Đại Số', 'hinh-hoc': 'Hình Học',
  'giai-tich': 'Giải Tích', 'luong-giac': 'Lượng Giác', 'on-thi': 'Ôn Thi'
};

function formatDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

let currentFilter = 'all';
let currentSection = 'videos';

// ---- Section switching ----
document.querySelectorAll('[data-section]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    currentSection = link.dataset.section;
    document.querySelectorAll('[data-section]').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    document.getElementById('sectionVideos').classList.toggle('active', currentSection === 'videos');
    document.getElementById('sectionExams').classList.toggle('active', currentSection === 'exams');
    document.getElementById('filterPills').style.display = currentSection === 'videos' ? 'flex' : 'none';
    if (currentSection === 'exams') renderExams();
    else renderVideos();
  });
});

// ---- Filter pills ----
document.querySelectorAll('.pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderVideos();
  });
});

// ---- Search ----
document.getElementById('searchInput').addEventListener('input', () => {
  if (currentSection === 'videos') renderVideos();
  else renderExams();
});

// ---- Render Videos ----
function renderVideos() {
  const videos = JSON.parse(localStorage.getItem('dh_videos') || '[]');
  const query = document.getElementById('searchInput').value.toLowerCase().trim();
  const filtered = videos.filter(v => {
    const matchFilter = currentFilter === 'all' || v.subject === currentFilter;
    const matchSearch = !query || v.title.toLowerCase().includes(query) ||
      subjectLabels[v.subject].toLowerCase().includes(query);
    return matchFilter && matchSearch;
  });

  document.getElementById('totalCount').textContent = `${filtered.length} video`;
  const grid = document.getElementById('videoGrid');
  grid.innerHTML = '';
  document.getElementById('emptyVideos').style.display = filtered.length ? 'none' : 'block';

  filtered.forEach(v => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-thumb">
        <video src="${v.dataUrl}" preload="metadata"></video>
        <span class="play-icon">▶️</span>
        <span class="subject-badge badge-${v.subject}">${subjectLabels[v.subject]}</span>
      </div>
      <div class="card-body">
        <div class="card-title" title="${v.title}">${v.title}</div>
        <div class="card-meta"><span>📅 ${formatDate(v.date)}</span></div>
      </div>`;
    card.querySelector('.card-thumb').addEventListener('click', () => openPlayer(v));
    grid.appendChild(card);
  });
}

// ---- Render Exams ----
function renderExams() {
  const exams = JSON.parse(localStorage.getItem('dh_exams') || '[]');
  const query = document.getElementById('searchInput').value.toLowerCase().trim();
  const filtered = exams.filter(ex =>
    !query || ex.title.toLowerCase().includes(query) ||
    subjectLabels[ex.subject].toLowerCase().includes(query)
  );

  const list = document.getElementById('examList');
  list.innerHTML = '';
  document.getElementById('emptyExams').style.display = filtered.length ? 'none' : 'block';

  filtered.forEach(ex => {
    const row = document.createElement('div');
    row.className = 'exam-row clickable';
    row.innerHTML = `
      <div class="exam-icon">📄</div>
      <div class="exam-info">
        <div class="exam-title">${ex.title}</div>
        <div class="exam-meta">${subjectLabels[ex.subject]} • ${formatDate(ex.date)}</div>
      </div>
      <div class="exam-actions">
        <span class="btn-sm">👁 Xem</span>
        <a href="${ex.dataUrl}" download="${ex.fileName}" class="btn-sm" onclick="event.stopPropagation()">⬇ Tải</a>
      </div>`;
    row.addEventListener('click', () => openExamViewer(ex));
    list.appendChild(row);
  });
}

// ---- Exam Viewer ----
function openExamViewer(ex) {
  document.getElementById('examViewerTitle').textContent = ex.title;
  const body = document.getElementById('examViewerBody');
  const dlBtn = document.getElementById('examDownloadBtn');
  dlBtn.href = ex.dataUrl;
  dlBtn.download = ex.fileName;

  if (ex.fileType === 'application/pdf') {
    body.innerHTML = `<iframe src="${ex.dataUrl}" class="exam-iframe"></iframe>`;
  } else if (ex.fileType.startsWith('image/')) {
    body.innerHTML = `<img src="${ex.dataUrl}" class="exam-img" alt="${ex.title}" />`;
  } else {
    body.innerHTML = `<p class="exam-no-preview">⚠️ Định dạng <strong>${ex.fileName.split('.').pop().toUpperCase()}</strong> không xem trực tiếp được. Vui lòng tải xuống để xem.</p>`;
  }

  document.getElementById('examOverlay').classList.add('open');
}

document.getElementById('closeExam').addEventListener('click', () => {
  document.getElementById('examOverlay').classList.remove('open');
  document.getElementById('examViewerBody').innerHTML = '';
});

document.getElementById('examOverlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('examOverlay')) {
    document.getElementById('examOverlay').classList.remove('open');
    document.getElementById('examViewerBody').innerHTML = '';
  }
});

// ---- Player ----
function openPlayer(v) {
  document.getElementById('playerTitle').textContent = v.title;
  document.getElementById('playerVideo').src = v.dataUrl;
  document.getElementById('playerMeta').textContent =
    `📚 ${subjectLabels[v.subject]}  •  📅 ${formatDate(v.date)}`;
  document.getElementById('playerOverlay').classList.add('open');
  document.getElementById('playerVideo').play();
}

document.getElementById('closePlayer').addEventListener('click', closePlayer);
document.getElementById('playerOverlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('playerOverlay')) closePlayer();
});

function closePlayer() {
  document.getElementById('playerOverlay').classList.remove('open');
  const vid = document.getElementById('playerVideo');
  vid.pause(); vid.src = '';
}

// ---- Init ----
renderVideos();
