/* Ritual 궤도: 사진 3장이 타원 궤도를 따라 돌아. 앞(아래)쪽일수록 크고 또렷, 뒤(위)쪽은 작고 흐려.
   사진을 클릭하면 돌기를 멈추고 그 사진이 앞으로 오면서 단계 설명이 열려. 같은 사진/빈 곳을 다시 누르면 계속 돌아. */
(() => {
  const root = document.getElementById('orbit');
  if (!root) return;
  const items = [...root.querySelectorAll('.orbit__item')];
  const panel = root.querySelector('.orbit__panel');
  const section = root.closest('.screen');
  const el = (c) => panel.querySelector(c);

  const CX = 128, CY = 66, RX = 84, RY = 26;      // 궤도 (rem, 스테이지 256x144 기준)
  const TILT = -6 * Math.PI / 180;                 // 궤도 기울기
  const SPEED = (Math.PI * 2) / 40;                // 한 바퀴 40초
  const N = items.length;
  const TWO = Math.PI * 2;

  let base = Math.PI * 0.5 - 0.0;                  // 첫 사진이 앞에 오도록 시작
  let sel = -1;
  let last = performance.now();
  const boost = items.map(() => 1);                // 선택됐을 때 커지는 정도
  const dim = items.map(() => 1);                  // 선택 안 된 사진은 흐리게

  const wrap = (a) => { a = (a + Math.PI) % TWO; if (a < 0) a += TWO; return a - Math.PI; };

  function select(i) {
    sel = i;
    root.classList.toggle('is-sel', i >= 0);
    panel.classList.toggle('is-on', i >= 0);
    if (i >= 0) {
      const d = items[i].dataset;
      el('.orbit__no').textContent = d.no;
      el('.orbit__name').textContent = d.title;
      el('.orbit__text').textContent = d.text;
      el('.orbit__sub').innerHTML = d.sub;
    }
  }

  items.forEach((it, i) => {
    it.addEventListener('click', (e) => { e.stopPropagation(); select(sel === i ? -1 : i); });
  });
  section.addEventListener('click', () => { if (sel >= 0) select(-1); });

  function frame(now) {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;

    if (sel >= 0) {
      // 선택한 사진이 정면(각도 90°)으로 오도록 가장 가까운 쪽으로 돌려
      const target = Math.PI / 2 + (sel * TWO) / N;
      base += wrap(target - base) * Math.min(1, dt * 4);
    } else {
      base += SPEED * dt;
    }

    items.forEach((it, i) => {
      const a = base - (i * TWO) / N;
      let x = RX * Math.cos(a), y = RY * Math.sin(a);
      const rx = x * Math.cos(TILT) - y * Math.sin(TILT);
      const ry = x * Math.sin(TILT) + y * Math.cos(TILT);
      const depth = (Math.sin(a) + 1) / 2;         // 0(뒤) ~ 1(앞)
      const tb = sel === i ? 1.22 : 1, td = sel >= 0 && sel !== i ? 0.28 : 1;
      boost[i] += (tb - boost[i]) * Math.min(1, dt * 5);
      dim[i] += (td - dim[i]) * Math.min(1, dt * 5);
      const scale = (0.52 + 0.48 * depth) * boost[i];
      it.style.transform = `translate(${CX + rx}rem, ${CY + ry}rem) translate(-50%, -50%) scale(${scale.toFixed(4)})`;
      it.style.opacity = ((0.35 + 0.65 * depth) * dim[i]).toFixed(3);
      it.style.zIndex = Math.round(depth * 100) + (sel === i ? 100 : 0);
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
