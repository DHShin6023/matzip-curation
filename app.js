/* =========================================================
   맛집 큐레이션 PWA — app.js
   Task 5: 앱 초기화, GPS, 뷰 전환
   ========================================================= */

// 상수
const KAKAO_API_KEY = '208febb5d7dc050bfc092d66725454eb';

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

/* ── 카테고리 매핑 ───────────────────────────────────── */
const CATEGORY_MAP = [
  { keywords: ['한식'], label: '한식', emoji: '🍚' },
  { keywords: ['패스트푸드', '버거', '햄버거', '피자', '치킨', '핫도그', '샌드위치', '도넛'], label: '패스트푸드', emoji: '🍔' },
];

function mapCategory(kakaoCategory) {
  const name = kakaoCategory || '';
  for (const c of CATEGORY_MAP) {
    if (c.keywords.some(k => name.includes(k))) {
      return { label: c.label, emoji: c.emoji };
    }
  }
  return { label: '기타', emoji: '🍽️' };
}

/* ── 점수 계산 ───────────────────────────────────────── */
// 거리 가까울수록, 카카오 accuracy 순서 앞일수록 높은 점수
function calcScore(distance, index, total) {
  const distScore = 1 - distance / 5000;           // 0~1 (가까울수록 높음)
  const accScore  = 1 - index / (total || 1);      // 0~1 (카카오 정확도 순서 반영)
  return distScore * 0.6 + accScore * 0.4;
}

/* ── 카카오 장소 검색 ────────────────────────────────── */
async function fetchPlaces() {
  if (!currentPos) return;
  showLoading(true);
  cardList.innerHTML = '';
  resultStatus.textContent = '맛집을 불러오는 중...';

  function buildCategoryUrl(code, page = 1) {
    const url = new URL('https://dapi.kakao.com/v2/local/search/category.json');
    url.searchParams.set('category_group_code', code);
    url.searchParams.set('x', currentPos.lng);
    url.searchParams.set('y', currentPos.lat);
    url.searchParams.set('radius', 5000);
    url.searchParams.set('sort', 'accuracy');
    url.searchParams.set('size', 15);
    url.searchParams.set('page', page);
    return url.toString();
  }

  function buildKeywordUrl(query) {
    const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
    url.searchParams.set('query', query);
    url.searchParams.set('x', currentPos.lng);
    url.searchParams.set('y', currentPos.lat);
    url.searchParams.set('radius', 5000);
    url.searchParams.set('sort', 'accuracy');
    url.searchParams.set('size', 15);
    return url.toString();
  }

  const headers = { Authorization: `KakaoAK ${KAKAO_API_KEY}` };

  try {
    // FD6 정확도순 2페이지(30개) + CE7 1페이지 + 패스트푸드 키워드 검색
    const responses = await Promise.all([
      fetch(buildCategoryUrl('FD6', 1), { headers }),
      fetch(buildCategoryUrl('FD6', 2), { headers }),
      fetch(buildCategoryUrl('CE7', 1), { headers }),
      fetch(buildKeywordUrl('패스트푸드'), { headers }),
    ]);

    for (const res of responses) {
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`API 오류: ${res.status} - ${body}`);
      }
    }

    const dataArr = await Promise.all(responses.map(r => r.json()));
    const documents = dataArr.flatMap(d => d.documents || []);
    // 중복 제거 (id 기준)
    const seen = new Set();
    const unique = documents.filter(d => seen.has(d.id) ? false : seen.add(d.id));

    allPlaces = unique.map((d, i) => ({
      name: d.place_name,
      category: mapCategory(d.category_name),
      distance: parseInt(d.distance, 10),
      score: calcScore(parseInt(d.distance, 10), i, unique.length),
      address: d.road_address_name || d.address_name,
      id: d.id
    }));

    showLoading(false);
    applyFilters();  // Task 7에서 구현

  } catch (err) {
    showLoading(false);
    resultStatus.textContent = '오류: ' + err.message;
    console.error(err);
  }
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

/* ── 네이버 블로그 링크 생성 ─────────────────────────── */
function naverBlogUrl(placeName) {
  const query = encodeURIComponent(`${placeName} 맛집`);
  return `https://search.naver.com/search.naver?where=blog&query=${query}`;
}

/* ── 카드 렌더링 ─────────────────────────────────────── */
function renderCards(places) {
  cardList.innerHTML = '';

  if (places.length === 0) {
    cardList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>이 반경에 맛집이 없어요.<br>거리를 넓혀보세요!</p>
      </div>`;
    return;
  }

  places.forEach((place, idx) => {
    const card = document.createElement('div');
    card.className = 'place-card';

    const distLabel = place.distance >= 1000
      ? `${(place.distance / 1000).toFixed(1)}km`
      : `${place.distance}m`;

    card.innerHTML = `
      <div class="card-top">
        <span class="card-rank">${idx + 1}</span>
        <span class="card-category">${place.category.emoji} ${place.category.label}</span>
      </div>
      <div class="card-name"></div>
      <div class="card-distance">📍 ${distLabel}</div>
      <div class="card-footer">
        <a class="btn-blog" href="${naverBlogUrl(place.name)}" target="_blank" rel="noopener">블로그 후기 →</a>
      </div>`;
    card.querySelector('.card-name').textContent = place.name;

    cardList.appendChild(card);
  });
}

/* ── 필터 적용 ───────────────────────────────────────── */
function applyFilters() {
  let filtered = allPlaces.filter(p => p.distance <= currentDist);

  if (currentCat !== '전체') {
    filtered = filtered.filter(p => p.category.label === currentCat);
  }

  // 점수 기준 내림차순 정렬 후 최대 30개
  filtered.sort((a, b) => b.score - a.score);
  filtered = filtered.slice(0, 30);

  const distLabel = currentDist >= 1000 ? `${(currentDist / 1000).toFixed(1)}km` : `${currentDist}m`;
  resultStatus.textContent = `📍 현위치 기준 ${distLabel} · ${filtered.length}곳`;

  renderCards(filtered);
}

/* ── 필터 버튼 이벤트 ────────────────────────────────── */
// 거리 필터
document.querySelectorAll('.dist-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.dist-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentDist = parseInt(btn.dataset.dist, 10);
    applyFilters();
  });
});

// 카테고리 필터
document.querySelectorAll('.cat-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCat = btn.dataset.cat;
    applyFilters();
  });
});
