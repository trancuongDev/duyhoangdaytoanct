const CACHE = 'DHDT-lms-v1.4.5';
const BASE = '/duyhoangdaytaon-cantho.1.1';
const STATIC = [
  `${BASE}/login.html`,
  `${BASE}/admin.html`,
  `${BASE}/student.html`,
  `${BASE}/style.css`,
  `${BASE}/app.js`,
  `${BASE}/admin.js`,
  `${BASE}/student.js`,
  `${BASE}/supabase.js`,
  `${BASE}/manifest.json`,
  `${BASE}/icons/icon-192.png`,
  `${BASE}/icons/icon-512.png`
];

// Cài đặt: cache file tĩnh, skipWaiting để kích hoạt ngay
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(STATIC))
      .then(() => self.skipWaiting())
      .catch(err => {
        // Nếu cache 1 file lỗi thì vẫn tiếp tục install
        console.warn('[SW] Cache install warning:', err);
        return self.skipWaiting();
      })
  );
});

// Kích hoạt: xóa cache cũ, claim clients, rồi mới báo reload
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => {
        // Đợi claim xong mới gửi message reload
        return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      })
      .then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_UPDATED' }));
      })
  );
});

// Fetch: network-first với timeout 4s, fallback cache
self.addEventListener('fetch', e => {
  // Bỏ qua Supabase API và các request không phải GET
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('supabase.co')) return;
  if (e.request.url.includes('unpkg.com')) return;
  if (e.request.url.includes('cdn.')) return;

  e.respondWith(
    Promise.race([
      // Network với timeout 4 giây
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), 4000);
        fetch(e.request)
          .then(res => {
            clearTimeout(timer);
            // Cập nhật cache nếu response hợp lệ
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE).then(c => c.put(e.request, clone));
            }
            resolve(res);
          })
          .catch(err => { clearTimeout(timer); reject(err); });
      }),
    ])
    .catch(() => caches.match(e.request))
  );
});

// ── Proxy bảo mật: intercept request có header X-Secure-Proxy ──
// Map tạm lưu token → url thật (xóa sau 60s)
const _proxyMap = new Map();
self.addEventListener('message', e => {
  if (e.data?.type === 'REGISTER_PROXY') {
    const { token, url } = e.data;
    _proxyMap.set(token, url);
    setTimeout(() => _proxyMap.delete(token), 60000);
  }
});
