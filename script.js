// 섹션 단위 스크롤 + 헤더 색 전환 + 컬럼 가이드(G 키) + 히어로 이미지 슬라이더

const HERO_AUTOPLAY_MS = 5000;   // 자동 재생 간격(밀리초). 5000 = 5초. 0이면 꺼짐

const sections = [...document.querySelectorAll('.screen')];
const header = document.querySelector('.header');

// .screen 이 하나도 없으면 안내만 하고 멈춰 (에러로 죽지 않게)
if (sections.length === 0) {
  console.warn('[GULA] .screen 섹션을 찾지 못했어. index.html이 최신 버전인지 확인해줘.');
} else {
  init();
}

function init() {
  let current = 0;      // 지금 보고 있는 섹션 번호
  let locked = false;   // 이동 애니메이션 중이면 true
  let lastWheel = 0;    // 마지막 휠 이벤트 시각

  history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  // 푸터가 반 장이라 맨 아래를 넘어갈 수 없어서, 그 이상은 잘라줘
  function targetY(i) {
    const maxY = document.documentElement.scrollHeight - window.innerHeight;
    return Math.min(sections[i].offsetTop, maxY);
  }

  // 현재 섹션 표시 + 헤더 색 바꾸기
  function setActive(i) {
    const target = sections[i];
    if (!target) return;
    sections.forEach((s, idx) => s.classList.toggle('is-active', idx === i));
    header.classList.toggle('header--dark', target.dataset.header === 'dark');
  }

  // 부드럽게 스크롤 (직접 만든 애니메이션)
  function animateScroll(to, duration, done) {
    const start = window.scrollY;
    const dist = to - start;
    const t0 = performance.now();

    function step(now) {
      const p = Math.min((now - t0) / duration, 1);
      const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; // easeInOutCubic
      window.scrollTo(0, start + dist * ease);
      if (p < 1) requestAnimationFrame(step);
      else done();
    }
    requestAnimationFrame(step);
  }

  // i번째 섹션으로 이동
  function goTo(i, instant = false) {
    i = Math.max(0, Math.min(sections.length - 1, i));
    current = i;
    setActive(i);

    if (instant) {
      window.scrollTo(0, targetY(i));
      return;
    }
    locked = true;
    animateScroll(targetY(i), 1000, () => { locked = false; });
  }

  // 마우스 휠 / 트랙패드: 한 번에 한 섹션씩
  window.addEventListener('wheel', (e) => {
    e.preventDefault();

    // 좌우로 쓰는 동작은 히어로 슬라이더가 처리하니까, 섹션 이동은 하지 않아
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

    const now = performance.now();
    const gap = now - lastWheel;
    lastWheel = now;

    // 이동 중이거나, 트랙패드 관성 스크롤(이벤트가 계속 이어지는 중)이면 무시
    if (locked || gap < 80 || e.deltaY === 0) return;

    goTo(current + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });

  // 키보드
  window.addEventListener('keydown', (e) => {
    if (e.key === 'g' || e.key === 'G') {
      document.body.classList.toggle('show-grid');
      return;
    }
    if (locked) return;
    if (['ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); goTo(current + 1); }
    if (['ArrowUp', 'PageUp'].includes(e.key))          { e.preventDefault(); goTo(current - 1); }
    if (e.key === 'Home') goTo(0);
    if (e.key === 'End')  goTo(sections.length - 1);
  });

  // 터치 스와이프 (태블릿/모바일)
  let touchY = 0;
  window.addEventListener('touchstart', (e) => { touchY = e.touches[0].clientY; }, { passive: true });
  window.addEventListener('touchend', (e) => {
    const d = touchY - e.changedTouches[0].clientY;
    if (!locked && Math.abs(d) > 50) goTo(current + (d > 0 ? 1 : -1));
  });

  // 헤더 메뉴 클릭 → 해당 섹션으로
  document.querySelectorAll('[data-goto]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (locked) return;
      const key = link.dataset.goto;
      const idx = key === '0' ? 0 : sections.findIndex((s) => s.id === key);
      if (idx >= 0) goTo(idx);
    });
  });

  // 창 크기가 바뀌면 현재 섹션 위치에 다시 맞추기
  window.addEventListener('resize', () => goTo(current, true));

  setActive(0);
}

/* =========================================================
   히어로 이미지 슬라이더
   - 이미지 추가: index.html 에 .hero__slide 한 줄만 더 넣으면 돼. 하단 바는 자동으로 늘어나.
   - 넘기기: 화면 좌/우 절반 클릭, 드래그/스와이프, ← → 키, 트랙패드 좌우 스와이프, 하단 바 클릭
   ========================================================= */
(function heroSlider() {
  const heroSection = document.querySelector('.hero');
  const slider = document.querySelector('.hero__slider');
  if (!heroSection || !slider) return;

  const track = slider.querySelector('.hero__track');
  const slides = [...slider.querySelectorAll('.hero__slide')];
  const bar = slider.querySelector('.hero__bar');
  const TRANSITION_MS = 800;   // style.css 의 .hero__track transition 시간과 맞춰줘

  let index = 0;
  let busy = false;     // 넘어가는 중이면 true (연속 입력 방지)
  let timer = null;

  // 이미지가 1장뿐이면 바와 넘기기 기능은 필요 없어
  if (slides.length <= 1) {
    if (bar) bar.style.display = 'none';
    return;
  }

  // 하단 바: 이미지 개수만큼 칸 만들기
  const items = slides.map((_, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hero__bar-item';
    b.setAttribute('aria-label', `${i + 1}번째 이미지`);
    b.addEventListener('click', () => show(i));
    bar.appendChild(b);
    return b;
  });

  // i번째 이미지 보여주기 (끝에서 다음을 누르면 처음으로 돌아가)
  function show(i) {
    i = (i + slides.length) % slides.length;
    if (busy || i === index) return;

    index = i;
    track.style.transform = `translateX(${-100 * index}%)`;
    items.forEach((el, n) => el.classList.toggle('is-on', n === index));

    busy = true;
    setTimeout(() => { busy = false; }, TRANSITION_MS);
    startAuto();   // 직접 넘기면 5초를 처음부터 다시 세
  }

  // 자동 재생 (히어로 화면을 보고 있을 때만 넘어가)
  function startAuto() {
    clearInterval(timer);
    if (!HERO_AUTOPLAY_MS) return;
    timer = setInterval(() => {
      if (heroSection.classList.contains('is-active')) show(index + 1);
    }, HERO_AUTOPLAY_MS);
  }

  // 클릭(좌/우 절반) + 드래그/스와이프
  let down = false;
  let startX = 0;

  slider.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.hero__bar')) return;   // 하단 바 클릭은 따로 처리돼
    down = true;
    startX = e.clientX;
  });
  window.addEventListener('pointercancel', () => { down = false; });
  window.addEventListener('pointerup', (e) => {
    if (!down) return;
    down = false;

    const dx = e.clientX - startX;
    if (Math.abs(dx) > 50) {
      show(index + (dx < 0 ? 1 : -1));            // 왼쪽으로 끌면 다음, 오른쪽으로 끌면 이전
    } else if (Math.abs(dx) < 10) {
      const rect = slider.getBoundingClientRect();
      const isLeftHalf = e.clientX < rect.left + rect.width / 2;
      show(index + (isLeftHalf ? -1 : 1));        // 클릭: 왼쪽 절반 이전, 오른쪽 절반 다음
    }
  });

  // 키보드 ← →
  window.addEventListener('keydown', (e) => {
    if (!heroSection.classList.contains('is-active')) return;
    if (e.key === 'ArrowLeft')  show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });

  // 트랙패드 좌우 스와이프
  let lastWheelX = 0;
  window.addEventListener('wheel', (e) => {
    if (!heroSection.classList.contains('is-active')) return;
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;   // 세로 스크롤이면 무시

    const now = performance.now();
    const gap = now - lastWheelX;
    lastWheelX = now;
    if (gap < 80 || Math.abs(e.deltaX) < 10) return;        // 관성 스크롤로 여러 장 넘어가는 것 방지

    show(index + (e.deltaX > 0 ? 1 : -1));
  }, { passive: true });

  // 처음 상태
  items[0].classList.add('is-on');
  startAuto();
})();