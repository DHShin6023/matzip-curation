const KAKAO_API_KEY = '208febb5d7dc050bfc092d66725454eb';

let currentPos = null;
let allPlaces = [];
let currentDist = 1000;
let currentCat = '전체';

const btnFind      = document.getElementById('btn-find');
const btnBack      = document.getElementById('btn-back');
const btnRefresh   = document.getElementById('btn-refresh');
const homeError    = document.getElementById('home-error');
const loading      = document.getElementById('loading');
const cardList     = document.getElementById('card-list');
const resultStatus = document.getElementById('result-status');
const toast        = document.getElementById('toast');
const sheet        = document.getElementById('detail-sheet');
const sheetBackdrop = document.getElementById('sheet-backdrop');

/* ── 유틸 ────────────────────────────────────────────── */
function distLabel(meters) {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)}km`
    : `${meters}m`;
}

function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.classList.add('hidden');
  });
  const target = document.getElementById(viewId);
  target.classList.remove('hidden');
  target.classList.add('active');
}

let toastTimer = null;
function showToast(msg, duration = 2500) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), duration);
}

function showLoading(bool) {
  loading.classList.toggle('hidden', !bool);
  cardList.classList.toggle('hidden', bool);
}

/* ── 카테고리 매핑 ───────────────────────────────────── */
const CATEGORY_MAP = [
  { keywords: ['한식'], label: '한식', emoji: '🍚' },
  {
    keywords: ['패스트푸드', '버거', '햄버거', '피자', '치킨', '핫도그', '샌드위치', '도넛'],
    label: '패스트푸드', emoji: '🍔'
  },
];

function mapCategory(kakaoCategory) {
  const name = kakaoCategory || '';
  for (const c of CATEGORY_MAP) {
    if (c.keywords.some(k => name.includes(k))) return { label: c.label, emoji: c.emoji };
  }
  return { label: '기타', emoji: '🍽️' };
}

/* ── 점수 계산 (소스 내 상대 순위 기반) ──────────────── */
function calcScore(distance, rankInBatch, batchSize) {
  const distScore = 1 - distance / 5000;
  const accScore  = 1 - rankInBatch / Math.max(batchSize, 1);
  return distScore * 0.55 + accScore * 0.45;
}

/* ── 카카오 API URL 빌더 ─────────────────────────────── */
function buildCategoryUrl(code, page) {
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

/* ── 맛집 데이터 수집 ────────────────────────────────── */
async function fetchPlaces() {
  if (!currentPos) return;
  showLoading(true);
  cardList.innerHTML = '';
  resultStatus.textContent = '맛집을 불러오는 중...';

  const headers = { Authorization: `KakaoAK ${KAKAO_API_KEY}` };

  try {
    // FD6 정확도순 3페이지(45개) + CE7 1페이지(15개) + 패스트푸드 키워드(15개)
    const responses = await Promise.all([
      fetch(buildCategoryUrl('FD6', 1), { headers }),
      fetch(buildCategoryUrl('FD6', 2), { headers }),
      fetch(buildCategoryUrl('FD6', 3), { headers }),
      fetch(buildCategoryUrl('CE7', 1), { headers }),
      fetch(buildKeywordUrl('패스트푸드'),  { headers }),
    ]);

    for (const res of responses) {
      if (!res.ok) throw new Error(`카카오 API 오류 (${res.status})`);
    }

    const [d1, d2, d3, dCE7, dFF] = await Promise.all(responses.map(r => r.json()));

    const seenIds = new Set();
    const places  = [];

    function addBatch(docs) {
      const size = docs.length;
      docs.forEach((d, i) => {
        if (seenIds.has(d.id)) return;
        seenIds.add(d.id);
        const dist = parseInt(d.distance, 10);
        places.push({
          name:     d.place_name,
          category: mapCategory(d.category_name),
          distance: dist,
          score:    calcScore(dist, i, size),
          address:  d.road_address_name || d.address_name || '',
          phone:    d.phone    || '',
          placeUrl: d.place_url || '',
          id:       d.id,
        });
      });
    }

    // FD6 3페이지를 하나의 글로벌 랭킹 풀로 취급 (페이지 순서 = 카카오 정확도 순)
    addBatch([...(d1.documents||[]), ...(d2.documents||[]), ...(d3.documents||[])]);
    // CE7(카페)는 별도 풀로 점수 계산
    addBatch(dCE7.documents || []);
    // 패스트푸드 키워드 결과도 별도 풀
    addBatch(dFF.documents  || []);

    allPlaces = places;
    showLoading(false);
    applyFilters();

  } catch (err) {
    showLoading(false);
    resultStatus.textContent = '맛집 정보를 불러오지 못했습니다.';
    showToast('잠시 후 다시 시도해주세요.');
    console.error(err);
  }
}

/* ── GPS ─────────────────────────────────────────────── */
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
        3: '위치 요청 시간이 초과됐습니다.',
      };
      homeError.textContent = messages[err.code] || '위치 오류가 발생했습니다.';
      homeError.classList.remove('hidden');
    },
    { timeout: 10000, maximumAge: 60000 }
  );
}

/* ── 이벤트 ──────────────────────────────────────────── */
btnFind.addEventListener('click', getLocation);
btnBack.addEventListener('click', () => showView('view-home'));
btnRefresh.addEventListener('click', () => { allPlaces = []; fetchPlaces(); });

/* ── 서비스 워커 ─────────────────────────────────────── */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/matzip-curation/sw.js');
}

/* ── 네이버 블로그 링크 ──────────────────────────────── */
function naverBlogUrl(name) {
  return `https://search.naver.com/search.naver?where=blog&query=${encodeURIComponent(name + ' 맛집')}`;
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
    card.innerHTML = `
      <div class="card-top">
        <span class="card-rank">${idx + 1}</span>
        <span class="card-category">${place.category.emoji} ${place.category.label}</span>
      </div>
      <div class="card-name"></div>
      <div class="card-distance">📍 ${distLabel(place.distance)}</div>
      <div class="card-footer">
        <a class="btn-blog" href="${naverBlogUrl(place.name)}" target="_blank" rel="noopener">블로그 후기 →</a>
      </div>`;
    card.querySelector('.card-name').textContent = place.name;
    card.addEventListener('click', e => {
      if (e.target.closest('.btn-blog')) return;
      openSheet(place);
    });
    cardList.appendChild(card);
  });
}

/* ── 바텀시트 ────────────────────────────────────────── */
function openSheet(place) {
  document.getElementById('sheet-category').textContent = `${place.category.emoji} ${place.category.label}`;
  document.getElementById('sheet-name').textContent     = place.name;
  document.getElementById('sheet-distance').textContent = `📍 ${distLabel(place.distance)}`;

  const addrRow = document.getElementById('sheet-address').parentElement;
  document.getElementById('sheet-address').textContent = place.address;
  addrRow.classList.toggle('hidden', !place.address);

  const phoneRow = document.getElementById('sheet-phone').parentElement;
  const phoneEl  = document.getElementById('sheet-phone');
  if (place.phone) {
    phoneEl.href        = `tel:${place.phone}`;
    phoneEl.textContent = place.phone;
    phoneRow.classList.remove('hidden');
  } else {
    phoneRow.classList.add('hidden');
  }

  const kakaoBtn = document.getElementById('sheet-kakao');
  if (place.placeUrl) {
    kakaoBtn.href = place.placeUrl;
    kakaoBtn.classList.remove('hidden');
  } else {
    kakaoBtn.classList.add('hidden');
  }

  document.getElementById('sheet-blog').href = naverBlogUrl(place.name);

  sheet.classList.remove('hidden');
  sheetBackdrop.classList.remove('hidden');
  requestAnimationFrame(() => sheet.classList.add('open'));
}

function closeSheet() {
  sheet.classList.remove('open');
  setTimeout(() => {
    sheet.classList.add('hidden');
    sheetBackdrop.classList.add('hidden');
  }, 280);
}

document.getElementById('sheet-close').addEventListener('click', closeSheet);
sheetBackdrop.addEventListener('click', closeSheet);

/* ── 필터 적용 ───────────────────────────────────────── */
function applyFilters() {
  let filtered = allPlaces.filter(p => p.distance <= currentDist);

  if (currentCat !== '전체') {
    filtered = filtered.filter(p => p.category.label === currentCat);
  }

  filtered.sort((a, b) => b.score - a.score);
  filtered = filtered.slice(0, 30);

  const label = currentDist >= 1000
    ? `${(currentDist / 1000).toFixed(1)}km`
    : `${currentDist}m`;
  resultStatus.textContent = `📍 현위치 기준 ${label} · ${filtered.length}곳`;

  renderCards(filtered);
}

/* ── 필터 버튼 이벤트 ────────────────────────────────── */
document.querySelectorAll('.dist-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.dist-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentDist = parseInt(btn.dataset.dist, 10);
    applyFilters();
  });
});

document.querySelectorAll('.cat-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCat = btn.dataset.cat;
    applyFilters();
  });
});
