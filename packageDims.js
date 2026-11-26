/* Package : 도면의 치수선과 숫자는 평소에 안 보이고, 마우스가 가까이 가면 나타나 (부드럽게 떠올라)
   - 도면 본체는 images/package-clean.svg (치수 없는 도면), 치수선+숫자는 images/package-dim/ 안의 조각 그림들이야
   - 아래 좌표는 원래 도면(2311 x 721) 기준 숫자야. near 는 "이 숫자 근처에 마우스가 오면 나타나" 하는 기준 영역 */
(() => {
  'use strict';
  const FIG_W = 2311, FIG_H = 721;     // 도면 전체 크기
  const REACH = 150;                   // 마우스가 이 거리(도면 기준 숫자) 안에 들어오면 나타나기 시작해
  const FULL = 45;                     // 이 거리 안이면 완전히 보여
  const GROUPS = [
    { src: 'images/package-dim/g1.png', x: 0.0, y: 104.0, w: 210.3, h: 558.7, near: [[0,370,18,391],[29,104,390,660]] },
    { src: 'images/package-dim/g2.png', x: 27.3, y: 658.3, w: 358.0, h: 37.0, near: [[194,670,217,692],[29,104,390,660]] },
    { src: 'images/package-dim/g3.png', x: 833.7, y: 83.0, w: 142.7, h: 192.0, near: [[940,140,985,165],[860,252,905,274],[833,83,1140,278]] },
    { src: 'images/package-dim/g4.png', x: 1846.3, y: 237.3, w: 464.7, h: 217.3, near: [[1840,316,1880,340],[2075,420,2120,445],[1846,237,2311,455]] },
    { src: 'images/package-dim/g5.png', x: 1861.3, y: 482.7, w: 212.7, h: 213.7, near: [[1850,560,1890,585],[1955,662,2000,688],[1861,482,2075,697]] },
    { src: 'images/package-dim/g6.png', x: 2100.0, y: 522.3, w: 211.0, h: 174.0, near: [[2170,530,2210,555],[2260,620,2300,645],[2170,662,2215,688],[2100,522,2311,697]] },
  ];

  const fig = document.querySelector('.package__fig');
  if (!fig) return;
  const area = fig.parentElement;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const items = GROUPS.map((g) => {
    const img = document.createElement('img');
    img.className = 'pdim';
    img.src = g.src; img.alt = ''; img.draggable = false;
    img.style.left = (g.x / FIG_W * 100) + '%';
    img.style.top = (g.y / FIG_H * 100) + '%';
    img.style.width = (g.w / FIG_W * 100) + '%';
    img.style.height = (g.h / FIG_H * 100) + '%';
    img.style.setProperty('--v', '0');
    fig.appendChild(img);
    return { g, img, v: 0, goal: 0 };
  });

  let mx = -1e4, my = -1e4, run = false, last = 0;
  function aim() {
    items.forEach((it) => {
      let d = Infinity;
      for (const [x0, y0, x1, y1] of it.g.near) {
        const dx = Math.max(x0 - mx, 0, mx - x1), dy = Math.max(y0 - my, 0, my - y1);
        d = Math.min(d, Math.hypot(dx, dy));
      }
      const t = clamp(1 - (d - FULL) / (REACH - FULL), 0, 1);
      it.goal = t * t * (3 - 2 * t);                   // 가까울수록 또렷하게 (부드러운 곡선)
    });
  }
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    let moving = false;
    items.forEach((it) => {
      it.v += (it.goal - it.v) * (1 - Math.exp(-dt * 9));
      if (Math.abs(it.goal - it.v) < 0.003) it.v = it.goal; else moving = true;
      it.img.style.setProperty('--v', it.v.toFixed(3));
    });
    if (moving) requestAnimationFrame(loop); else run = false;
  }
  function kick() {
    if (run) return;
    run = true; last = performance.now();
    requestAnimationFrame(loop);
  }
  area.addEventListener('pointermove', (e) => {
    const r = fig.getBoundingClientRect();
    mx = (e.clientX - r.left) / r.width * FIG_W;
    my = (e.clientY - r.top) / r.height * FIG_H;
    aim(); kick();
  });
  area.addEventListener('pointerleave', () => { mx = my = -1e4; aim(); kick(); });
})();
