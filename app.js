/* =========================================================
   맛집 큐레이션 PWA — app.js
   Task 5: 앱 초기화, GPS, 뷰 전환
   ========================================================= */

// 상수
const KAKAO_API_KEY = 'YOUR_KAKAO_REST_API_KEY'; // 카카오 개발자콘솔에서 발급

// 상태
let currentPos = null;
let allPlaces = [];
let currentDist = 1000;
let currentCat = '전체';

// DOM 참조
const viewHome = document.getElementById('view-home');
const viewResult = document.getElementById('view-result');
const btnFind = document.getElementById('btn-find');
const btnBack = document.getElementById('btn-back');
const btnRefresh = document.getElementById('btn-refresh');
const homeError = document.getElementById('home-error');
const loading = document.getElementById('loading');
const cardList = document.getElementById('card-list');
const resultStatus = document.getElementById('result-status');
const toast = document.getElementById('toast');

/* ── 뷰 전환 ─────────────────────────────────────────── */
function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.classList.add('hidden');
  });
  const target = document.getElementById(viewId);
  target.classList.remove('hidden');
  target.classList.add('active');
}

/* ── 토스트 ──────────────────────────────────────────── */
let toastTimer = null;
function showToast(msg, duration = 2500) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
}

/* ── 로딩 토글 ───────────────────────────────────────── */
function showLoading(bool) {
  loading.classList.toggle('hidden', !bool);
  cardList.classList.toggle('hidden', bool);
}

/* ── 카카오 장소 검색 (Task 6에서 구현) ──────────────── */
function fetchPlaces() {
  // Task 6에서 구현 예정
}

/* ── GPS 현위치 요청 ─────────────────────────────────── */
function getLocation() {
  homeError.classList.add('hidden');
  homeError.textContent = '';

  if (!navigator.geolocation) {
    homeError.textContent = '이 브라우저는 위치 서비스를 지원하지 않습니다.';
    homeError.classList.remove('hidden');
    return;
  }

  btnFind.disabled = true;
  btnFind.textContent = '위치 확인 중...';

  navigator.geolocation.getCurrentPosition(
    pos => {
      currentPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      btnFind.disabled = false;
      btnFind.textContent = '내 주변 맛집 찾기';
      showView('view-result');
      fetchPlaces();
    },
    err => {
      btnFind.disabled = false;
      btnFind.textContent = '내 주변 맛집 찾기';
      const messages = {
        1: '위치 권한을 허용해주세요. (설정 > Safari > 위치)',
        2: '위치를 가져올 수 없습니다. 다시 시도해주세요.',
        3: '위치 요청 시간이 초과됐습니다.'
      };
      homeError.textContent = messages[err.code] || '위치 오류가 발생했습니다.';
      homeError.classList.remove('hidden');
    },
    { timeout: 10000, maximumAge: 60000 }
  );
}

/* ── 이벤트 연결 ─────────────────────────────────────── */
btnFind.addEventListener('click', getLocation);
btnBack.addEventListener('click', () => showView('view-home'));
btnRefresh.addEventListener('click', () => {
  allPlaces = [];
  fetchPlaces();
});

/* ── 서비스 워커 등록 ────────────────────────────────── */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/matzip-curation/sw.js');
}
