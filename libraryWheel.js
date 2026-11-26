/* Gula's library : 사진이 세로로 둥글게 도는 갤러리 (reactbits 의 원형 갤러리를 세로로 돌린 버전)
   - 마우스 휠 / 트랙패드 : 한 칸씩 돌아가
   - 위아래로 끌기 : 끄는 만큼 돌다가 가까운 사진에 딱 멈춰
   - 사진이나 왼쪽 단어를 클릭 : 그 사진이 가운데로 와
   - 키보드 위/아래 화살표 (갤러리에 포커스가 있을 때)
   사진을 바꾸고 싶으면 아래 PHOTOS 의 src 만 바꾸면 돼 (label 은 사진 아래와 왼쪽 단어에 같이 쓰여) */
(() => {
  'use strict';
  // label : 왼쪽 단어(7개, index.html 의 library__list)와 같은 이름을 써. 같은 단어에 사진이 여러 장이면 사진 아래에는 자동으로 Model 01, Model 02 … 처럼 번호가 붙어.
  // fit   : 'contain' 이면 사진을 자르지 않고 통째로 보여줘 (글자가 있는 포스터용). bg 는 남는 빈칸 색
  // pos   : 사진이 카드(세로 직사각형)보다 가로로 길 때 어느 부분을 보여줄지 (x% y%). 인물이 잘리면 이 숫자만 바꿔줘
  const PHOTOS = [
    { label: 'Main Signature', src: 'images/gallery/poster13.jpg' },
    { label: 'Main Signature', src: 'images/gallery/mainImg.jpg', pos: '50% 50%' },
    { label: 'brand',          src: 'images/poster12.png', pos: '50% 50%' },
    { label: 'Mood',           src: 'images/gallery/poster5.jpg' },
    { label: 'Mood',           src: 'images/gallery/poster6.jpg', pos: '55% 50%' },
    { label: 'Mood',           src: 'images/gallery/poster7.jpg' },
    { label: 'Model',          src: 'images/poster2.png', pos: '45% 50%' },
    { label: 'Model',          src: 'images/gallery/poster8.jpg' },
    { label: 'Model',          src: 'images/gallery/poster9.png', pos: '62% 50%' },
    { label: 'Model',          src: 'images/gallery/poster10.jpg' },
    { label: 'Model',          src: 'images/gallery/poster11.png' },
    { label: 'Graphic',        src: 'images/poster14.png', fit: 'contain', bg: '#fff' },
    { label: 'Graphic',        src: 'images/poster15.png', fit: 'contain', bg: '#040707' },
    { label: 'Graphic',        src: 'images/poster16.png', fit: 'contain', bg: '#fff' },
    { label: 'Graphic',        src: 'images/poster17.png', fit: 'contain', bg: '#fff' },
    { label: 'Spoon',          src: 'images/gallery/spoon2.jpg' },
    { label: 'Typography',     src: 'images/gallery/poster18.png', fit: 'contain', bg: '#000' },
  ];
  // ")" 모양: 가운데 사진이 가장 오른쪽으로 튀어나오고, 위아래 사진은 원을 따라 왼쪽으로 물러나며 기울어져
  const RADIUS = 210;       // 원의 반지름(rem): 작을수록 ")" 가 더 깊게 휘어
  const STEP = 17;          // 사진 한 장마다 원 위에서 움직이는 각도(도): 클수록 사진 사이가 멀어
  const TILT = 0.6;         // 위아래 사진이 기울어지는 정도(1이면 원의 접선만큼 그대로, 0이면 안 기울어)
  const BIG_SCALE = 1.5;    // 사진을 눌렀을 때 그 자리에서 커지는 배율

  const root = document.querySelector('.library__gallery');
  if (!root) return;
  const listItems = Array.from(document.querySelectorAll('.library__list li'));
  const N = PHOTOS.length;
  const wordOf = PHOTOS.map((p) => listItems.findIndex((li) => li.textContent.trim() === p.label));   // 사진마다 왼쪽 단어 번호
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const mod = (v) => ((v % N) + N) % N;
  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;

  const view = document.createElement('div');
  view.className = 'lgal__view';
  const total = {}, seen = {};
  PHOTOS.forEach((p) => { total[p.label] = (total[p.label] || 0) + 1; });
  const cards = PHOTOS.map((p, i) => {
    seen[p.label] = (seen[p.label] || 0) + 1;
    const st = [p.pos && `object-position:${p.pos}`, p.fit && `object-fit:${p.fit}`, p.bg && `background:${p.bg}`].filter(Boolean).join(';');
    const caption = total[p.label] > 1 ? `${p.label} ${String(seen[p.label]).padStart(2, '0')}` : p.label;   // 여러 장이면 01, 02 …
    const el = document.createElement('figure');
    el.className = 'lgal__card';
    el.innerHTML = `<img src="${p.src}" alt="${caption}" draggable="false"${st ? ` style="${st}"` : ''}><figcaption>${caption}</figcaption>`;
    view.appendChild(el);
    return el;
  });
  root.appendChild(view);
  root.tabIndex = 0;
  root.setAttribute('aria-label', '라이브러리 사진 갤러리');

  let pos = 0, target = 0, run = false, last = 0;
  let big = false, bigAmt = 0;
  let dragging = false, dragY = 0, dragPos = 0, dragMoved = 0, vel = 0, lastY = 0, lastT = 0;
  const current = () => mod(Math.round(target));

  function render() {
    const r = rem();
    cards.forEach((el, i) => {
      let k = i - pos;
      k -= N * Math.round(k / N);                 // 원처럼 이어지게: 가장 가까운 방향으로 계산
      const a = k * STEP * Math.PI / 180;
      const x = (Math.cos(a) - 1) * RADIUS * r;        // 가운데에서 멀수록 왼쪽으로
      const y = Math.sin(a) * RADIUS * r;
      const ak = Math.abs(k);
      const sc = 1 + bigAmt * (BIG_SCALE - 1) * clamp(1 - ak, 0, 1);          // 눌렀을 때 가운데 사진만 그 자리에서 커져
      el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${(k * STEP * TILT).toFixed(2)}deg)`;
      el.style.setProperty('--s', sc.toFixed(4));
      el.style.opacity = String(clamp((1 - ak * 0.22) * (1 - bigAmt * 0.88 * clamp(ak * 1.6, 0, 1)), 0, 1));   // 나머지 사진은 흐려져
      el.style.zIndex = String(20 - Math.round(ak * 4));
      el.style.pointerEvents = ak > 2.4 ? 'none' : 'auto';
      el.classList.toggle('is-on', ak < 0.5);
    });
    const cur = mod(Math.round(pos));
    listItems.forEach((li, i) => li.classList.toggle('is-on', i === wordOf[cur]));
  }
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!dragging) pos += (target - pos) * (1 - Math.exp(-dt * 6.2));
    if (!dragging && Math.abs(target - pos) < 0.0008) pos = target;
    const goal = big ? 1 : 0;
    bigAmt += (goal - bigAmt) * (1 - Math.exp(-dt * 8));
    if (Math.abs(goal - bigAmt) < 0.002) bigAmt = goal;
    render();
    if (dragging || pos !== target || bigAmt !== goal) requestAnimationFrame(loop); else run = false;
  }
  function kick() {
    if (run) return;
    run = true; last = performance.now();
    requestAnimationFrame(loop);
  }
  function go(i) { target = Math.round(i); kick(); }
  // 이미 있는 위치에서 가장 가까운 방향으로 i 번 사진을 가운데로
  function goTo(i) {
    let d = i - mod(Math.round(target));
    d -= N * Math.round(d / N);
    go(Math.round(target) + d);
  }

  // 마우스 휠 / 트랙패드 : 첫 사진에서 위로, 마지막 사진에서 아래로 굴리면 섹션 스크롤로 넘겨줘
  let acc = 0, accT = 0, lastStep = 0, lastWheelTs = 0;
  root.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const dy = e.deltaY;
    if (!dy) return;
    if (big) { e.preventDefault(); e.stopPropagation(); setBig(false); return; }     // 커진 상태에서 굴리면 닫혀
    const now = performance.now();
    const c = current();
    const atEnd = (c <= 0 && dy < 0) || (c >= N - 1 && dy > 0);
    if (atEnd && now - lastWheelTs > 350) return;
    e.preventDefault();
    e.stopPropagation();
    lastWheelTs = now;
    acc += dy;
    clearTimeout(accT);
    accT = setTimeout(() => { acc = 0; }, 160);
    if (Math.abs(acc) >= 70 && now - lastStep > 280) {
      go(Math.round(target) + Math.sign(acc));
      acc = 0; lastStep = now;
    }
  }, { passive: false });

  // 위아래로 끌기
  const PITCH = 40;   // 끄는 거리(rem) 당 한 칸
  root.addEventListener('pointerdown', (e) => {
    dragMoved = 0;
    if (big) return;                                   // 커진 상태에서는 끌기 대신 클릭으로 닫아
    dragging = true; vel = 0;
    dragY = lastY = e.clientY; dragPos = pos; lastT = performance.now();
    root.classList.add('is-drag');
    kick();
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = e.clientY - dragY;
    dragMoved = Math.max(dragMoved, Math.abs(dy));
    pos = dragPos - dy / (PITCH * rem() / 1.6);
    const now = performance.now();
    const dt = Math.max(1, now - lastT);
    vel = vel * 0.7 + ((lastY - e.clientY) / dt) * 0.3;   // 위로 끌면 +
    lastY = e.clientY; lastT = now;
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    root.classList.remove('is-drag');
    const flick = clamp(vel * 120 / (PITCH * rem() / 1.6), -2, 2);   // 빠르게 튕기면 조금 더 굴러가
    go(pos + flick);
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // 클릭: 가운데 사진을 누르면 그 자리에서 커지고, 옆 사진을 누르면 가운데로 와. 커진 상태에서 아무 데나 누르면 닫혀
  function setBig(v) {
    if (big === v) return;
    big = v;
    if (v) window.addEventListener('keydown', bigKey, true); else window.removeEventListener('keydown', bigKey, true);
    kick();
  }
  function bigKey(e) {
    e.stopPropagation();                               // 커진 동안 뒤 화면(섹션 스크롤)은 움직이지 않게
    if (e.key === 'Escape') { e.preventDefault(); setBig(false); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      go(Math.round(target) + (e.key === 'ArrowDown' ? 1 : -1));   // 커진 채로 다음 사진으로
    }
  }
  root.addEventListener('click', (e) => {
    if (dragMoved >= 6) return;
    if (big) { setBig(false); return; }
    const card = e.target.closest('.lgal__card');
    if (!card) return;
    const i = cards.indexOf(card);
    if (i === current() && Math.abs(pos - Math.round(pos)) < 0.15) setBig(true); else goTo(i);
  });
  // 단어를 누르면, 그 단어에 묶인 사진 중 지금 가장 가까운 사진으로
  listItems.forEach((li, i) => {
    li.addEventListener('click', () => {
      setBig(false);
      const here = mod(Math.round(target));
      let best = -1, bd = 1e9;
      wordOf.forEach((w, k) => {
        if (w !== i) return;
        let d = k - here; d -= N * Math.round(d / N);
        if (Math.abs(d) < bd) { bd = Math.abs(d); best = k; }
      });
      if (best >= 0) goTo(best);
    });
  });

  root.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault(); e.stopPropagation();
    go(Math.round(target) + (e.key === 'ArrowDown' ? 1 : -1));
  });
  ['touchstart', 'touchend'].forEach((n) => root.addEventListener(n, (e) => e.stopPropagation(), { passive: true }));
  window.addEventListener('resize', render);
  render();
})();
