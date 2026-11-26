// 로고 섹션: 휠로 효과를 고르고, 로고에 효과를 입혀서 체험해보는 인터랙션
// - 오른쪽 휠 (기본 / 스퀴즈 / 메탈릭 / 스티커 / 네온 / 크림) : 스크롤, 드래그, 위아래 방향키, 클릭으로 돌려
// - 가운데 로고 : 고른 효과에 따라 canvas 에 그려
// - 로고 SVG 의 색과 상관없이 "모양(투명도)"만 읽어서 새로 칠하니까, 로고가 검정이든 흰색이든 상관없어

(() => {
  'use strict';

  /* ---------- 여기 숫자와 색만 바꾸면 돼 ---------- */
  const LOGO_SRC      = 'images/logo.svg'; // 로고 파일 (다른 파일을 쓰려면 여기만 고쳐줘)
  const LOGO_FRAC     = 0.57;              // 캔버스 가로에서 로고가 차지하는 비율 (156rem 의 57% ≈ 89rem)
  const AREA_PAD_Y    = 0.215;             // 캔버스 가로의 이 비율만큼 로고 위아래로 여유 공간 (스티커를 끌고 다닐 수 있는 높이)
  const LOGO_COLOR    = '#0a0a0a';         // 기본 / 네온 모드 로고 색
  const BRAND_RED     = '#981B27';         // 브랜드 빨강
  const BALLOON_COLOR = BRAND_RED;         // 스퀴즈(벌룬) 모드 로고 색
  const STICKER_COLOR = BRAND_RED;         // 스티커 모드 로고 색
  const CREAM_BASE    = BRAND_RED;         // 크림 모드: 크림 아래 로고 색
  const CREAM_FAT     = 0.007;             // 크림이 발린 곳에서 로고가 바깥으로 두툼해지는 정도 (캔버스 가로의 비율, 0이면 로고 모양 안에만)
  const CREAM_COLOR   = [255, 249, 238];   // 크림 색 (아이보리)
const BALLOON_FAT   = 0.0018;            // 스퀴즈에서 로고를 통통하게 만드는 정도 (0이면 원래 두께, 0.01이 넘으면 모양이 뭉개져)
const TILT_DEG      = 25;                // 마우스를 따라 로고가 기우는 최대 각도 (0이면 안 기울어)

  const MODES = [
    { id: 'basic',   label: '기본',   hint: '로고의 기본 모습이에요' },
    { id: 'squeeze', label: '스퀴즈', hint: '마우스를 올리면 일렁이며 눌리고,\n잡아서 당기면 띠용 늘어났다 돌아와요' },
    { id: 'metal',   label: '메탈릭', hint: '마우스를 움직이면 빛이 따라오고 로고가 기울어요.\n누르면 물결이 퍼져요' },
    { id: 'sticker', label: '스티커', hint: '모서리에 마우스를 가져가 보세요.\n잡은 곳에 매달려 대롱대롱 흔들리고,\n놓으면 그 자리에 붙어요' },
    { id: 'neon',    label: '네온',   hint: '마우스가 지나간 자리에 불이 켜지고,\n누르면 번쩍여요' },
    { id: 'cream',   label: '크림',   hint: '마우스를 문질러 크림을 치덕치덕 발라보세요.\n꾹 누르면 듬뿍 올라가고,\n크림은 천천히 녹아내려요' },
  ];

  const root    = document.querySelector('.brand__fx');
  const wheelEl = document.querySelector('.brand__wheel');
  if (!root || !wheelEl) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'brand__canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'GULA 로고');
  // 마우스를 따라 기울이는 건 이 상자(tiltEl)를 통째로 기울여서 만들어 (포인터 좌표는 안 기울어진 root 기준으로 읽어)
  const tiltEl = document.createElement('div');
  tiltEl.className = 'brand__tilt';
  tiltEl.appendChild(canvas);
  root.appendChild(tiltEl);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const mk = (w, h) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const hexRgb = (hex) => {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  /* =====================================================================
     1. 로고 불러오기 + 크기 계산
     ===================================================================== */
  let logoImg = null;
  let aspect = 0.3;          // 로고 세로/가로 비율 (불러오면 진짜 값으로 바뀌어)
  let W = 0, H = 0;          // 캔버스 내부 크기(px)
  let lx = 0, ly = 0, lw = 0, lh = 0; // 캔버스 안에서 로고가 놓인 사각형
  let maskC = null;          // 로고 모양 (검정, 투명도만 중요)
  let tintC = null;          // LOGO_COLOR 로 칠한 로고
  let fields = null;         // 메탈릭 / 네온용 계산 결과
  let balloonC = null;       // 풍선처럼 입체감을 입힌 로고
  let stickerData = null;
  let mesh = null;
  let creamBaseC = null, creamTmp = null, creamOut = null, creamFat = null;

  async function loadLogo() {
    // SVG 에 width/height 가 없으면 브라우저(특히 Safari)가 크기를 못 읽어서, viewBox 로 크기를 직접 넣어줘
    try {
      const txt = await (await fetch(LOGO_SRC)).text();
      const svg = new DOMParser().parseFromString(txt, 'image/svg+xml').documentElement;
      const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
      let w = parseFloat(svg.getAttribute('width'));
      let h = parseFloat(svg.getAttribute('height'));
      if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) { w = vb[2]; h = vb[3]; }
      if (!(w > 0 && h > 0)) throw new Error('로고 크기를 못 읽었어');
      svg.setAttribute('width', 2000);
      svg.setAttribute('height', Math.round(2000 * h / w));
      const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      logoImg = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = url;
      });
      aspect = h / w;
    } catch (err) {
      // 위 방법이 안 되면 그냥 이미지로 시도
      logoImg = await new Promise((res) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => res(null);
        im.src = LOGO_SRC;
      });
      if (logoImg && logoImg.naturalWidth) aspect = logoImg.naturalHeight / logoImg.naturalWidth;
      if (!logoImg) console.warn(`[GULA] ${LOGO_SRC} 를 불러오지 못했어.`, err);
    }
  }

  function tinted(color, src = maskC) {
    const c = mk(W, H);
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, W, H);
    return c;
  }

  function layout() {
    if (!logoImg) return;
    const cssW = root.clientWidth || 1240;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(clamp(cssW * dpr, 900, 1800));
    lw = W * LOGO_FRAC;
    lh = lw * aspect;
    H = Math.round(lh + W * AREA_PAD_Y * 2);   // 위아래 여백: 글로우/그림자, 스티커를 끌고 다닐 공간
    lx = (W - lw) / 2;
    ly = (H - lh) / 2;
    canvas.width = W;
    canvas.height = H;
    root.style.aspectRatio = `${W} / ${H}`;

    maskC = mk(W, H);
    const m = maskC.getContext('2d');
    m.drawImage(logoImg, lx, ly, lw, lh);
    // 어떤 색이든 "있는 곳 / 없는 곳"만 남기고 검정으로 통일
    m.globalCompositeOperation = 'source-in';
    m.fillStyle = '#000';
    m.fillRect(0, 0, W, H);

    tintC = tinted(LOGO_COLOR);
    fields = null;
    balloonC = null;
    stickerData = null;
    mesh = null;
    creamBaseC = null; creamTmp = null; creamOut = null; creamFat = null;
    resetSticker();
    needDraw = true;
  }

  /* =====================================================================
     2. 마우스 / 터치
     ===================================================================== */
  const ptr = { x: 0, y: 0, sx: 0, sy: 0, vx: 0, vy: 0, act: 0, inside: false, down: false };
  const ripples = [];                 // 메탈릭: 누른 자리에서 퍼지는 물결
  let neonSurge = 0;                  // 네온: 누르면 번쩍
  let creamDollop = false;            // 크림: 누르는 순간 듬뿍 올리기

  function toCanvas(e) {
    const r = root.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
  }

  root.addEventListener('pointerenter', (e) => {
    [ptr.x, ptr.y] = toCanvas(e);
    if (ptr.act < 0.05) { ptr.sx = ptr.x; ptr.sy = ptr.y; }
    ptr.inside = true;
    needDraw = true;
  });
  root.addEventListener('pointermove', (e) => {
    [ptr.x, ptr.y] = toCanvas(e);
    ptr.inside = true;
    needDraw = true;
  });
  root.addEventListener('pointerleave', () => { ptr.inside = false; needDraw = true; });
  root.addEventListener('pointerdown', (e) => {
    [ptr.x, ptr.y] = toCanvas(e);
    ptr.sx = ptr.x; ptr.sy = ptr.y;
    ptr.down = true;
    ptr.inside = true;
    needDraw = true;
    try { root.setPointerCapture(e.pointerId); } catch (_) { /* 무시 */ }
    if (mode === 'sticker') stickerGrab();
    if (mode === 'squeeze') meshGrab();
    if (mode === 'metal') {
      ripples.push({ x: ptr.x, y: ptr.y, t0: performance.now() / 1000 });
      if (ripples.length > 4) ripples.shift();
    }
    if (mode === 'neon') neonSurge = 1;
    if (mode === 'cream') creamDollop = true;
  });
  const release = () => {
    if (!ptr.down) return;
    ptr.down = false;
    needDraw = true;
    if (mode === 'sticker') stickerRelease();
    if (mode === 'squeeze' && mesh) mesh.grab = null;
  };
  root.addEventListener('pointerup', release);
  root.addEventListener('pointercancel', release);
  root.addEventListener('lostpointercapture', release);
  // 터치로 만질 때 섹션 이동(script.js)이 같이 일어나지 않게
  ['touchstart', 'touchend'].forEach((n) => root.addEventListener(n, (e) => e.stopPropagation(), { passive: true }));

  /* =====================================================================
     3. 흐림(블러) 도구 : 풍선 / 메탈릭 / 네온이 쓰는 "거리 정보" 를 만들어
     ===================================================================== */
  const PW = 700;                   // 효과 계산용 작은 화면의 가로 (작을수록 가벼워)
  let PH = 200;
  let FR = { x: 0, y: 0, w: 1, h: 1 }; // 메탈릭/네온은 로고 주변만 계산해서 가볍게 (캔버스 안의 위치)

  function boxPass(src, dst, w, h, r, horiz) {
    const n = horiz ? w : h;
    const m = horiz ? h : w;
    const step = horiz ? 1 : w;
    const inv = 1 / (2 * r + 1);
    for (let j = 0; j < m; j++) {
      const base = horiz ? j * w : j;
      let acc = 0;
      for (let k = -r; k <= r; k++) if (k >= 0 && k < n) acc += src[base + k * step];
      for (let i = 0; i < n; i++) {
        dst[base + i * step] = acc * inv;
        const add = i + r + 1;
        const rem = i - r;
        if (add < n) acc += src[base + add * step];
        if (rem >= 0) acc -= src[base + rem * step];
      }
    }
  }
  function blur(src, w, h, sigma) {
    const r = Math.max(1, Math.round(sigma / 1.15));
    let a = Float32Array.from(src);
    let b = new Float32Array(src.length);
    for (let p = 0; p < 3; p++) {
      boxPass(a, b, w, h, r, true);
      boxPass(b, a, w, h, r, false);
    }
    return a;
  }

  function makeTex(n) {                      // 크림 표면의 오돌토돌한 결 (고정된 잔물결)
    const r = new Float32Array(n);
    for (let i = 0; i < n; i++) r[i] = Math.random() * 2 - 1;
    const b = blur(r, PW, PH, 3.4);
    let m = 1e-6;
    for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(b[i]));
    for (let i = 0; i < n; i++) b[i] /= m;
    return b;
  }

  function buildFields() {
    const fw = Math.min(W, lw + W * 0.2), fh = Math.min(H, lh + W * 0.26);
    FR = { x: clamp(lx - (fw - lw) / 2, 0, W - fw), y: clamp(ly - (fh - lh) / 2, 0, H - fh), w: fw, h: fh };
    PH = Math.round(PW * FR.h / FR.w);
    const c = mk(PW, PH);
    const x = c.getContext('2d');
    x.drawImage(maskC, FR.x, FR.y, FR.w, FR.h, 0, 0, PW, PH);
    const d = x.getImageData(0, 0, PW, PH).data;
    const A = new Float32Array(PW * PH);
    for (let i = 0; i < A.length; i++) A[i] = d[i * 4 + 3] / 255;

    const g1 = blur(A, PW, PH, 2.2);
    const g2 = blur(A, PW, PH, 8);
    const g3 = blur(A, PW, PH, 22);

    // 메탈릭 : 부드러운 "높이" 지도에서 면의 기울기(법선)를 구해
    const h1 = blur(A, PW, PH, 3.5);
    const h2 = blur(A, PW, PH, 11);
    const hh = new Float32Array(A.length);
    for (let i = 0; i < hh.length; i++) hh[i] = 0.55 * h1[i] + 0.45 * h2[i];
    const nx = new Float32Array(A.length);
    const ny = new Float32Array(A.length);
    for (let y = 1; y < PH - 1; y++) {
      for (let xx = 1; xx < PW - 1; xx++) {
        const i = y * PW + xx;
        nx[i] = (hh[i - 1] - hh[i + 1]) * 9;
        ny[i] = (hh[i - PW] - hh[i + PW]) * 9;
      }
    }

    const img = new ImageData(PW, PH);
    const px = mk(PW, PH);
    // trail : 네온에서 마우스가 지나간 자리가 천천히 식어가는 기록
    fields = { A, g1, g2, g3, hh, nx, ny, img, px, pxCtx: px.getContext('2d'), trail: new Float32Array(A.length), cream: new Float32Array(A.length), cLast: null, tex: makeTex(A.length) };
  }

  /* =====================================================================
     4. 효과들
     ===================================================================== */
  let mode = 'basic';
  let needDraw = true;

  /* ----- 기본 ----- */
  function drawBasic() {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(tintC, 0, 0);
  }

  /* ----- 스퀴즈(벌룬) : 풍선처럼 입체감을 입힌 로고를 격자로 쪼개 용수철로 이어놓고, 마우스가 눌러 ----- */
  function buildBalloon() {
    // 먼저 로고를 사방으로 조금 통통하게 만들어 (가는 선이 너무 얇아 보이지 않게). 모양은 그대로 두고 두께만 늘려
    const fat = mk(W, H);
    const fx = fat.getContext('2d');
    const br = W * BALLOON_FAT;
    if (br > 0.2) {
      for (let k = 0; k < 24; k++) {
        const a = k / 24 * Math.PI * 2;
        fx.drawImage(maskC, Math.cos(a) * br, Math.sin(a) * br);
        fx.drawImage(maskC, Math.cos(a) * br * 0.5, Math.sin(a) * br * 0.5);
      }
    }
    fx.drawImage(maskC, 0, 0);
    const d = fx.getImageData(0, 0, W, H).data;
    const n = W * H;
    const A = new Float32Array(n);
    for (let i = 0; i < n; i++) A[i] = d[i * 4 + 3] / 255;
    const hA = blur(A, W, H, W * 0.005);
    const hB = blur(A, W, H, W * 0.013);
    const hh = new Float32Array(n);
    for (let i = 0; i < n; i++) hh[i] = 0.4 * hA[i] + 0.6 * hB[i];

    const out = new ImageData(W, H);
    const o = out.data;
    const base = hexRgb(BALLOON_COLOR);
    const S = W * 0.018;                                  // 클수록 더 볼록해 보여
    const norm = (a, b, c) => { const l = Math.hypot(a, b, c); return [a / l, b / l, c / l]; };
    const L1 = norm(-0.45, -0.65, 0.62);                  // 왼쪽 위에서 오는 주 조명
    const H1 = norm(L1[0], L1[1], L1[2] + 1);
    const L2 = norm(0.7, 0.45, 0.55);                     // 오른쪽 아래의 작은 반사광
    const H2 = norm(L2[0], L2[1], L2[2] + 1);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const a = A[i];
        if (a < 0.01) continue;
        const gx = (hh[i + 1] - hh[i - 1]) * S;
        const gy = (hh[i + W] - hh[i - W]) * S;
        const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
        const nx = -gx * inv, ny = -gy * inv, nz = inv;
        const diff = Math.max(0, nx * L1[0] + ny * L1[1] + nz * L1[2]);
        const s1 = Math.pow(Math.max(0, nx * H1[0] + ny * H1[1] + nz * H1[2]), 48);
        const s2 = Math.pow(Math.max(0, nx * H2[0] + ny * H2[1] + nz * H2[2]), 36) * 0.4;
        const rim = Math.pow(1 - nz, 2.2);
        const edgeT = clamp((hA[i] - 0.1) / 0.65, 0, 1);
        const edge = 0.55 + 0.45 * edgeT * edgeT * (3 - 2 * edgeT);
        const shade = (0.4 + 0.72 * diff) * edge;
        const spec = (s1 * 0.95 + s2) * 255;
        const p = i * 4;
        o[p]     = clamp(base[0] * shade + spec + rim * 50, 0, 255);
        o[p + 1] = clamp(base[1] * shade + spec + rim * 18, 0, 255);
        o[p + 2] = clamp(base[2] * shade + spec + rim * 22, 0, 255);
        o[p + 3] = a * 255;
      }
    }
    balloonC = mk(W, H);
    balloonC.getContext('2d').putImageData(out, 0, 0);
  }

  function buildMesh() {
    const pad = W * 0.05;
    const x0 = Math.max(0, lx - pad), y0 = Math.max(0, ly - pad);
    const x1 = Math.min(W, lx + lw + pad), y1 = Math.min(H, ly + lh + pad);
    const cols = 48;
    const cw = (x1 - x0) / cols;
    const rows = Math.max(6, Math.round((y1 - y0) / cw));
    const ch = (y1 - y0) / rows;
    const n = (cols + 1) * (rows + 1);
    const m = {
      cols, rows, cw, ch, x0, y0, energy: 1, layer: mk(W, H), grab: null,
      rx: new Float32Array(n), ry: new Float32Array(n), x: new Float32Array(n), y: new Float32Array(n),
      vx: new Float32Array(n), vy: new Float32Array(n), wgt: new Float32Array(n),
    };
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const k = j * (cols + 1) + i;
        m.rx[k] = m.x[k] = x0 + i * cw;
        m.ry[k] = m.y[k] = y0 + j * ch;
      }
    }
    mesh = m;
  }

  // 잡기: 누른 자리 근처 격자점에 "얼마나 따라올지(가중치)"를 정해둬. 가까울수록 많이 따라오고, 멀수록 고무줄처럼 늘어나
  function meshGrab() {
    const m = mesh;
    if (!m) return;
    const Rg = W * 0.105;
    let sum = 0;
    for (let k = 0; k < m.x.length; k++) {
      const dx = ptr.sx - m.x[k], dy = ptr.sy - m.y[k];
      m.wgt[k] = Math.exp(-(dx * dx + dy * dy) / (Rg * Rg));
      sum += m.wgt[k];
    }
    // 로고 위가 아니면(근처에 격자점이 거의 없으면) 잡지 않아
    const [ix, iy] = [Math.round(ptr.sx), Math.round(ptr.sy)];
    const onInk = ix >= 0 && iy >= 0 && ix < W && iy < H && balloonC &&
      balloonC.getContext('2d').getImageData(ix, iy, 1, 1).data[3] > 20;
    if (sum > 0.5 && (onInk || sum > 6)) m.grab = { x: ptr.sx, y: ptr.sy };
  }

  function stepMesh(t) {
    const m = mesh;
    const R = W * 0.045;
    const tt = t * 0.001;
    const grab = m.grab;
    // 잡고 있을 땐 빠르게 따라오고, 놓으면 느슨한 용수철이라 "띠용" 하고 출렁이다 돌아와
    const K = grab ? 0.22 : 0.07, DAMP = grab ? 0.78 : 0.9;
    let gdx = 0, gdy = 0;
    if (grab) {
      const dx = ptr.sx - grab.x, dy = ptr.sy - grab.y;
      const l = Math.hypot(dx, dy) || 1;
      const k2 = 0.45 / (1 + l / (W * 0.4));            // 많이 당길수록 점점 안 늘어나는 고무줄
      gdx = dx * k2; gdy = dy * k2;
    }
    const MAXD = W * 0.15;
    let energy = 0;
    for (let k = 0; k < m.x.length; k++) {
      let vx = m.vx[k], vy = m.vy[k];
      let tx = m.rx[k], ty = m.ry[k];
      if (grab) {
        tx += gdx * m.wgt[k];
        ty += gdy * m.wgt[k];
      } else if (ptr.act > 0.01) {
        // 마우스를 올리면: 살짝 눌러 들어가고, 눌린 자리에서 물결이 일렁여
        const dx = ptr.sx - m.x[k], dy = ptr.sy - m.y[k];
        const d2 = dx * dx + dy * dy;
        const f = Math.exp(-d2 / (R * R)) * ptr.act;
        const d = Math.sqrt(d2) || 1;
        const wob = Math.sin(d * 0.045 - tt * 7) * f * 0.12;
        vx += -dx * f * 0.012 + (dx / d) * wob;
        vy += -dy * f * 0.012 + (dy / d) * wob;
      }
      vx += (tx - m.x[k]) * K;
      vy += (ty - m.y[k]) * K;
      vx *= DAMP; vy *= DAMP;
      m.x[k] += vx; m.y[k] += vy;
      const ex = m.x[k] - m.rx[k], ey = m.y[k] - m.ry[k];       // 제자리에서 너무 멀리 가지 못하게
      const el = Math.hypot(ex, ey);
      if (el > MAXD) { m.x[k] = m.rx[k] + ex / el * MAXD; m.y[k] = m.ry[k] + ey / el * MAXD; }
      m.vx[k] = vx; m.vy[k] = vy;
      energy += Math.abs(vx) + Math.abs(vy) + Math.abs(tx - m.x[k]) + Math.abs(ty - m.y[k]);
    }
    m.energy = energy / m.x.length;
  }

  function drawTri(c, src, sx0, sy0, sx1, sy1, sx2, sy2, u0, v0, u1, v1, u2, v2, bx, by, bw, bh) {
    const a1 = sx1 - sx0, b1 = sy1 - sy0, a2 = sx2 - sx0, b2 = sy2 - sy0;
    const det = a1 * b2 - a2 * b1;
    if (!det) return;
    const du1 = u1 - u0, dv1 = v1 - v0, du2 = u2 - u0, dv2 = v2 - v0;
    const a = (du1 * b2 - du2 * b1) / det;
    const cc = (du2 * a1 - du1 * a2) / det;
    const b = (dv1 * b2 - dv2 * b1) / det;
    const d = (dv2 * a1 - dv1 * a2) / det;
    const e = u0 - a * sx0 - cc * sy0;
    const f = v0 - b * sx0 - d * sy0;
    // 삼각형 사이에 실금이 안 보이게 바깥쪽으로 살짝 키워서 오려
    const mx = (u0 + u1 + u2) / 3, my = (v0 + v1 + v2) / 3;
    const g = (u, v) => { const l = Math.hypot(u - mx, v - my) || 1; return [u + (u - mx) / l * 0.8, v + (v - my) / l * 0.8]; };
    const p0 = g(u0, v0), p1 = g(u1, v1), p2 = g(u2, v2);
    c.save();
    c.beginPath();
    c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]);
    c.closePath();
    c.clip();
    c.setTransform(a, b, cc, d, e, f);
    c.drawImage(src, bx, by, bw, bh, bx, by, bw, bh);
    c.restore();
  }

  function drawSqueeze(t) {
    if (!balloonC) buildBalloon();
    if (!mesh) buildMesh();
    stepMesh(t);
    const m = mesh;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.shadowColor = 'rgba(30, 10, 10, 0.30)';     // 풍선 아래에 부드러운 그림자
    ctx.shadowBlur = W * 0.014;
    ctx.shadowOffsetY = W * 0.011;
    const still = m.energy < 0.02 && ptr.act < 0.01 && !m.grab;
    if (still) {
      ctx.drawImage(balloonC, 0, 0);
    } else {
      const lc = m.layer.getContext('2d');
      lc.clearRect(0, 0, W, H);
      const w1 = m.cols + 1;
      for (let j = 0; j < m.rows; j++) {
        for (let i = 0; i < m.cols; i++) {
          const k00 = j * w1 + i, k10 = k00 + 1, k01 = k00 + w1, k11 = k01 + 1;
          const bx = m.rx[k00] - 1, by = m.ry[k00] - 1, bw = m.cw + 2, bh = m.ch + 2;
          drawTri(lc, balloonC, m.rx[k00], m.ry[k00], m.rx[k10], m.ry[k10], m.rx[k01], m.ry[k01],
            m.x[k00], m.y[k00], m.x[k10], m.y[k10], m.x[k01], m.y[k01], bx, by, bw, bh);
          drawTri(lc, balloonC, m.rx[k10], m.ry[k10], m.rx[k11], m.ry[k11], m.rx[k01], m.ry[k01],
            m.x[k10], m.y[k10], m.x[k11], m.y[k11], m.x[k01], m.y[k01], bx, by, bw, bh);
        }
      }
      ctx.drawImage(m.layer, 0, 0);
    }
    ctx.restore();
    needDraw = !still;       // 흔들리는 동안은 계속 그려
  }

  /* ----- 메탈릭 : 로고 모양에서 만든 입체감 위에 은빛 줄무늬가 흐르고, 마우스가 빛을 비춰 ----- */
  function drawMetal(t) {
    if (!fields) buildFields();
    const { A, nx, ny, hh, img, px, pxCtx } = fields;
    const o = img.data;
    const mx = (ptr.sx - FR.x) / FR.w * PW, my = (ptr.sy - FR.y) / FR.h * PH;
    const R = PW * 0.17;
    const act = ptr.act;
    const tt = t * 0.001;
    while (ripples.length && tt - ripples[0].t0 > 3) ripples.shift();
    const rp = ripples.map((r) => ({ x: (r.x - FR.x) / FR.w * PW, y: (r.y - FR.y) / FR.h * PH, age: tt - r.t0 }));
    for (let y = 0; y < PH; y++) {
      for (let x = 0; x < PW; x++) {
        const i = y * PW + x;
        const a = A[i];
        const p = i * 4;
        if (a < 0.02) { o[p + 3] = 0; continue; }
        const dx = x - mx, dy = y - my;
        const d2 = dx * dx + dy * dy;
        const dist = Math.sqrt(d2);
        const near = Math.exp(-d2 / (R * R)) * act;
        let u = nx[i] * 1.1 + ny[i] * 0.9 + x / PW * 0.9 + y / PH * 0.5 + tt * 0.07 + hh[i] * 0.8;
        u += near * 0.55 * Math.sin(dist * 0.07 - tt * 3);   // 마우스 주변에 물결
        for (let q = 0; q < rp.length; q++) {                // 누른 자리에서 퍼지는 물결
          const rx = x - rp[q].x, ry = y - rp[q].y;
          const off = Math.sqrt(rx * rx + ry * ry) - rp[q].age * 190;
          u += 0.9 * Math.sin(off * 0.09) * Math.exp(-(off * off) / 1800) * Math.exp(-rp[q].age * 0.9);
        }
        let v = 0.5 + 0.5 * Math.sin(u * 6.2);
        v = v * v * (3 - 2 * v);
        const c = (0.07 + v * 0.83) * (0.6 + 0.4 * a * a);   // 가장자리는 살짝 어둡게 해서 흰 배경에서도 윤곽이 보여
        const slope = Math.min(1, Math.hypot(nx[i], ny[i]) * 2);
        const spec = Math.pow(Math.max(0, 1 - dist / (R * 1.25)), 2) * act * (0.22 + slope * 0.55);
        const r = c + 0.05 * Math.sin(u * 7) + spec;
        const g = c + 0.05 * Math.sin(u * 7 + 2.1) + spec;
        const b = c + 0.08 * Math.sin(u * 7 + 4.2) + 0.03 + spec;
        o[p]     = clamp(r, 0, 1) * 255;
        o[p + 1] = clamp(g, 0, 1) * 255;
        o[p + 2] = clamp(b, 0, 1) * 255;
        o[p + 3] = 255;
      }
    }
    pxCtx.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(px, FR.x, FR.y, FR.w, FR.h);
    // 가장자리는 원래 로고 모양으로 또렷하게 다시 오려
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(maskC, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    needDraw = true;
  }

  /* ----- 네온 : 검은 로고 위에 윤곽선이 빛나고, 마우스가 지나간 자리는 안쪽까지 달아올라 ----- */
  const HEAT = (() => {
    const stops = [
      [0.00, 152, 27, 39], [0.30, 184, 32, 44], [0.55, 232, 58, 44],
      [0.85, 255, 140, 66], [1.20, 255, 212, 150], [1.70, 255, 248, 228],
    ];
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const v = i / 255 * 1.7;
      let k = 0;
      while (k < stops.length - 2 && v > stops[k + 1][0]) k++;
      const a = stops[k], b = stops[k + 1];
      const f = clamp((v - a[0]) / (b[0] - a[0]), 0, 1);
      for (let c = 0; c < 3; c++) lut[i * 3 + c] = a[c + 1] + (b[c + 1] - a[c + 1]) * f;
    }
    return lut;
  })();

  function drawNeon(t) {
    if (!fields) buildFields();
    const { A, g1, g2, g3, img, px, pxCtx, trail } = fields;
    const o = img.data;
    const mx = (ptr.sx - FR.x) / FR.w * PW, my = (ptr.sy - FR.y) / FR.h * PH;
    neonSurge *= 0.972;
    if (neonSurge < 0.01) neonSurge = 0;
    const R = PW * 0.17 * (1 + neonSurge * 0.8);
    const act = ptr.act;
    const flick = (0.97 + 0.03 * Math.sin(t * 0.011) * Math.sin(t * 0.0037)) * (1 + neonSurge * 0.5);

    // 마우스가 지나간 자리를 기록 (천천히 식어가면서 흔적이 남아)
    if (act > 0.05) {
      const rs = PW * 0.075;
      const x0 = Math.max(0, Math.floor(mx - rs * 2.2)), x1 = Math.min(PW - 1, Math.ceil(mx + rs * 2.2));
      const y0 = Math.max(0, Math.floor(my - rs * 2.2)), y1 = Math.min(PH - 1, Math.ceil(my + rs * 2.2));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - mx, dy = y - my;
          const i = y * PW + x;
          trail[i] = Math.min(1, trail[i] + 0.3 * act * Math.exp(-(dx * dx + dy * dy) / (rs * rs)));
        }
      }
    }

    for (let y = 0; y < PH; y++) {
      for (let x = 0; x < PW; x++) {
        const i = y * PW + x;
        const a = A[i];
        const dx = x - mx, dy = y - my;
        const tr = trail[i];
        trail[i] = tr * 0.955;
        const near = Math.max(Math.exp(-(dx * dx + dy * dy) / (R * R)) * act * 0.75, tr);
        const d = (g1[i] - 0.5) / 0.13;
        const tube = Math.exp(-d * d);                                  // 윤곽선(네온관)
        const halo = (g2[i] * 0.55 + g3[i] * 0.5) * (1 - a * 0.85);    // 바깥으로 번지는 빛
        let I = tube * 1.05 + halo * (1 + near * 0.9) + a * near * 0.95; // 마우스 근처는 안쪽도 달아올라
        I *= flick;
        const p = i * 4;
        if (I < 0.01) { o[p + 3] = 0; continue; }
        const idx = clamp(Math.round(I / 1.7 * 255), 0, 255) * 3;
        o[p] = HEAT[idx]; o[p + 1] = HEAT[idx + 1]; o[p + 2] = HEAT[idx + 2];
        o[p + 3] = Math.min(255, I * 1.25 * 255);
      }
    }
    pxCtx.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(tintC, 0, 0);                  // 먼저 검은 로고를 깔고
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(px, FR.x, FR.y, FR.w, FR.h);   // 그 위에 빛을 올려
    needDraw = true;
  }


  /* ----- 크림 : 빨간 로고 위에 마우스로 크림을 치덕치덕 바르면, 쌓인 높이만큼 도톰하게 빛나 ----- */
  function drawCream() {
    if (!fields) buildFields();
    const { cream, img, px, pxCtx, A, tex } = fields;
    const o = img.data;
    const mx = (ptr.sx - FR.x) / FR.w * PW, my = (ptr.sy - FR.y) / FR.h * PH;
    const rs = PW * 0.034;                      // 붓(주걱) 반지름
    const paint = (cx, cy, r, amt, dx, dy) => {
      const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(PW - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(PH - 1, Math.ceil(cy + r));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const ox = x - cx, oy = y - cy;
          const d2 = (ox * ox + oy * oy) / (r * r);
          if (d2 >= 1) continue;
          const k = (1 - d2) * (1 - d2);
          const side = ox * -dy + oy * dx;                       // 움직인 방향에 수직인 거리 → 주걱 자국 결
          const rib = 0.88 + 0.12 * Math.cos(side * 0.32);
          const i = y * PW + x;
          cream[i] = Math.min(1.2, cream[i] + amt * k * rib);
        }
      }
    };
    if (creamDollop) {
      creamDollop = false;
      paint(mx, my, rs * 3.2, 0.85, 1, 0);
    }
    if (ptr.act > 0.3 && A) {
      const last = fields.cLast;
      if (last) {
        const sx = mx - last[0], sy = my - last[1];
        const len = Math.hypot(sx, sy);
        if (len > 0.5) {
          const dx = sx / len, dy = sy / len;
          const step = rs * 0.35;
          const n = Math.max(1, Math.ceil(len / step));
          const amt = (ptr.down ? 0.34 : 0.22) * Math.min(1, 0.4 + 6 / (len + 4));
          for (let s = 1; s <= n; s++) paint(last[0] + sx * s / n, last[1] + sy * s / n, rs * (ptr.down ? 1.5 : 1.1), amt, dx, dy);
          fields.cLast = [mx, my];
        }
      } else fields.cLast = [mx, my];
    } else fields.cLast = null;

    // 높이 → 빛 (왼쪽 위에서 비추는 조명으로 도톰한 크림 느낌)
    const Lx = -0.5, Ly = -0.6, Lz = 0.62;
    const ll = Math.hypot(Lx, Ly, Lz);
    const lx_ = Lx / ll, ly_ = Ly / ll, lz_ = Lz / ll;
    let hx = lx_, hy = ly_, hz = lz_ + 1;
    const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;
    const K = 16;
    const hs = (i) => cream[i] * (1 + 0.14 * tex[i]);   // 결이 입혀진 높이
    let alive = false;
    for (let y = 0; y < PH; y++) {
      for (let x = 0; x < PW; x++) {
        const i = y * PW + x;
        let h = cream[i];
        const p = i * 4;
        if (h < 0.02) { cream[i] = 0; o[p + 3] = 0; continue; }
        alive = true;
        h = Math.max(0, h * 0.9975 - 0.0004);      // 발린 크림은 서서히 녹아 내려서, 로고가 계속 덮여 있지 않아
        cream[i] = h;
        const gx = (x > 0 && x < PW - 1) ? (hs(i + 1) - hs(i - 1)) * 0.5 : 0;
        const gy = (y > 0 && y < PH - 1) ? (hs(i + PW) - hs(i - PW)) * 0.5 : 0;
        let nx_ = -gx * K, ny_ = -gy * K, nz_ = 1;
        const nl = Math.hypot(nx_, ny_, nz_); nx_ /= nl; ny_ /= nl; nz_ /= nl;
        const diff = Math.max(0, nx_ * lx_ + ny_ * ly_ + nz_ * lz_);
        const spec = Math.pow(Math.max(0, nx_ * hx + ny_ * hy + nz_ * hz), 60) * 0.5;
        const shade = 0.8 + 0.3 * diff;
        o[p]     = Math.min(255, CREAM_COLOR[0] * shade + spec * 255);
        o[p + 1] = Math.min(255, CREAM_COLOR[1] * (shade - 0.015) + spec * 255);
        o[p + 2] = Math.min(255, CREAM_COLOR[2] * (shade - 0.04) + spec * 255);
        o[p + 3] = Math.min(255, h * 3.4 * 255);
      }
    }
    pxCtx.putImageData(img, 0, 0);
    if (!creamBaseC) creamBaseC = tinted(CREAM_BASE);
    if (!creamTmp) creamTmp = mk(W, H);
    if (!creamFat) {                               // 크림이 얹힌 곳은 로고가 두툼해지도록, 로고 모양을 사방으로 살짝 키운 틀
      creamFat = mk(W, H);
      const fx = creamFat.getContext('2d');
      const rr = W * CREAM_FAT;
      for (let ring = 1; ring <= 2; ring++) {
        for (let k = 0; k < 20; k++) {
          const a = k / 20 * Math.PI * 2;
          fx.drawImage(maskC, Math.cos(a) * rr * ring / 2, Math.sin(a) * rr * ring / 2);
        }
      }
      fx.drawImage(maskC, 0, 0);
    }
    const tx = creamTmp.getContext('2d');
    tx.clearRect(0, 0, W, H);
    tx.imageSmoothingEnabled = true;
    tx.imageSmoothingQuality = 'high';
    tx.drawImage(px, FR.x, FR.y, FR.w, FR.h);
    tx.globalCompositeOperation = 'destination-in';   // 크림은 로고 모양(+ 두툼해진 가장자리) 안에만 남겨
    tx.drawImage(creamFat, 0, 0);
    tx.globalCompositeOperation = 'source-over';
    // 크림이 로고 위에 도톰하게 얹힌 느낌: 아래에 부드러운 그림자를 깔아
    if (!creamOut) creamOut = mk(W, H);
    const ox2 = creamOut.getContext('2d');
    ox2.clearRect(0, 0, W, H);
    ox2.drawImage(creamBaseC, 0, 0);
    ox2.save();
    ox2.shadowColor = 'rgba(30, 0, 6, 0.6)';
    ox2.shadowBlur = W * 0.012;
    ox2.shadowOffsetX = W * 0.004;
    ox2.shadowOffsetY = W * 0.007;
    ox2.drawImage(creamTmp, 0, 0);
    ox2.restore();
    ox2.globalCompositeOperation = 'destination-in';   // 그림자도 로고 안에만
    ox2.drawImage(creamFat, 0, 0);
    ox2.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(creamOut, 0, 0);
    needDraw = ptr.act > 0.01 || ptr.down || alive;
  }

  /* ----- 스티커 : 모서리가 떼어지려 하고, 잡아서 옮기고 던질 수 있어 ----- */
  const TILT = -2.2 * Math.PI / 180;     // 스티커가 살짝 기울어져 붙어 있어
  const stk = { ox: 0, oy: 0, vx: 0, vy: 0, lift: 0, ang: TILT, av: 0, grab: false, gl: [0, 0], curl: 0 };
  const peel = { cx: 0, cy: 0, nx: 0, ny: 0, len: 0, target: 0 };

  function resetSticker() {
    stk.ox = stk.oy = stk.vx = stk.vy = stk.lift = 0;
    stk.ang = TILT;
    stk.av = 0;
    stk.grab = false;
    peel.len = peel.target = 0;
    root.classList.remove('is-grab');
  }

  function buildSticker() {
    const br = W * 0.011;                 // 흰 테두리 두께
    const sil = mk(W, H);
    const sx = sil.getContext('2d');
    for (let k = 0; k < 32; k++) {
      const a = k / 32 * Math.PI * 2;
      sx.drawImage(maskC, Math.cos(a) * br, Math.sin(a) * br);
      sx.drawImage(maskC, Math.cos(a) * br * 0.55, Math.sin(a) * br * 0.55);
    }
    sx.drawImage(maskC, 0, 0);
    // 앞면: 흰 테두리 + 빨간 로고 + 윤기
    const front = tinted('#ffffff', sil);
    const red = tinted(STICKER_COLOR);
    const rx = red.getContext('2d');
    rx.globalCompositeOperation = 'source-atop';
    const gl = rx.createLinearGradient(lx, ly, lx + lw, ly + lh * 2.2);
    gl.addColorStop(0.0, 'rgba(255,255,255,0)');
    gl.addColorStop(0.38, 'rgba(255,255,255,0)');
    gl.addColorStop(0.5, 'rgba(255,255,255,0.32)');
    gl.addColorStop(0.62, 'rgba(255,255,255,0)');
    gl.addColorStop(1.0, 'rgba(255,255,255,0)');
    rx.fillStyle = gl;
    rx.fillRect(0, 0, W, H);
    const fx = front.getContext('2d');
    fx.drawImage(red, 0, 0);
    // 흰 테두리가 흰 배경에서도 보이게 아주 연한 회색 윤곽을 둘러줘
    const edge = tinted('rgba(0,0,0,0.10)', sil);
    const edgeIn = edge.getContext('2d');
    edgeIn.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2;
      edgeIn.drawImage(sil, Math.cos(a) * 1.6, Math.sin(a) * 1.6);
    }
    const frontOut = mk(W, H);
    const fo = frontOut.getContext('2d');
    fo.drawImage(front, 0, 0);
    fo.drawImage(edge, 0, 0);
    // 뒷면: 연한 종이색
    const back = tinted('#e7e4dc', sil);
    const bx = back.getContext('2d');
    bx.globalCompositeOperation = 'source-atop';
    const bg = bx.createLinearGradient(0, ly, 0, ly + lh);
    bg.addColorStop(0, 'rgba(255,255,255,0.65)');
    bg.addColorStop(1, 'rgba(255,255,255,0)');
    bx.fillStyle = bg;
    bx.fillRect(0, 0, W, H);

    // 실제로 잉크가 있는 영역(모서리를 찾는 용도)
    const sc = mk(PW, Math.round(PW * H / W));
    const scx = sc.getContext('2d');
    scx.drawImage(sil, 0, 0, sc.width, sc.height);
    const d = scx.getImageData(0, 0, sc.width, sc.height).data;
    let minX = sc.width, minY = sc.height, maxX = 0, maxY = 0;
    for (let y = 0; y < sc.height; y++) {
      for (let x = 0; x < sc.width; x++) {
        if (d[(y * sc.width + x) * 4 + 3] > 40) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    const k = W / sc.width;
    const box = { x0: minX * k, y0: minY * k, x1: (maxX + 1) * k, y1: (maxY + 1) * k };
    // 스티커 가장자리(칼선) 점들: 어디에 마우스를 올려도 가장 가까운 가장자리가 들리게 하려고 모아둬
    const rim = [];
    const sw = sc.width, sh = sc.height;
    const solid = (x, y) => x >= 0 && y >= 0 && x < sw && y < sh && d[(y * sw + x) * 4 + 3] > 40;
    for (let y = 0; y < sh; y += 2) {
      for (let x = 0; x < sw; x += 2) {
        if (solid(x, y) && (!solid(x - 3, y) || !solid(x + 3, y) || !solid(x, y - 3) || !solid(x, y + 3))) rim.push(x * k, y * k);
      }
    }
    stickerData = { front: frontOut, back, box, edge: rim, inside: (X, Y) => solid(Math.round(X / k), Math.round(Y / k)), kk: k, diag: Math.hypot(box.x1 - box.x0, box.y1 - box.y0) };
  }

  function toLocal(x, y) {                // 화면 좌표 → 스티커 자체 좌표 (옮겨지고 기울어지기 전)
    const cx = W / 2 + stk.ox, cy = H / 2 + stk.oy;
    const c = Math.cos(-stk.ang), s = Math.sin(-stk.ang);
    const dx = x - cx, dy = y - cy;
    return [W / 2 + dx * c - dy * s, H / 2 + dx * s + dy * c];
  }

  function overSticker(x, y) {
    const [lxp, lyp] = toLocal(x, y);
    const b = stickerData.box;
    const pad = W * 0.02;
    return lxp > b.x0 - pad && lxp < b.x1 + pad && lyp > b.y0 - pad && lyp < b.y1 + pad;
  }

  function stickerGrab() {
    if (!stickerData || !overSticker(ptr.x, ptr.y)) return;
    // 잡은 "그 점"을 마우스가 쥐고 있어서, 스티커는 그 점에 매달려 대롱대롱 흔들려
    stk.gl = toLocal(ptr.x, ptr.y);
    stk.grab = true;
    stk.vx = stk.vy = 0;
    stk.av = 0;
    // 잡은 자리에서 가장 가까운 모서리는 계속 말려 올라가 있어
    const b = stickerData.box;
    const corners = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]];
    let best = corners[0], bd = Infinity;
    for (const c of corners) {
      const dd = Math.hypot(c[0] - stk.gl[0], c[1] - stk.gl[1]);
      if (dd < bd) { bd = dd; best = c; }
    }
    peel.cx = best[0]; peel.cy = best[1];
    const mx = (b.x0 + b.x1) / 2 - peel.cx, my = (b.y0 + b.y1) / 2 - peel.cy;
    const ml = Math.hypot(mx, my) || 1;
    peel.nx = mx / ml; peel.ny = my / ml;
    stk.curl = 14 + (1 - clamp(bd / (stickerData.diag * 0.45), 0, 1)) * Math.min(stickerData.diag * 0.2, 150);
    root.classList.add('is-grab');
  }
  function stickerRelease() {
    if (!stk.grab) return;
    stk.grab = false;                    // 마지막 속도가 남아서, 놓으면 미끄러지다 멈춰 (절반으로 줄여서 덜 튀어)
    stk.vx *= 0.5; stk.vy *= 0.5; stk.av *= 0.5;
    root.classList.remove('is-grab');
  }

  function drawSticker() {
    if (!stickerData) buildSticker();
    const { front, back, box, diag } = stickerData;

    /* --- 옮기기 / 던지기 --- */
    const m = W * 0.012;
    const minX = m - box.x0, maxX = W - m - box.x1, minY = m - box.y0, maxY = H - m - box.y1;
    if (stk.grab) {
      const px0 = stk.ox, py0 = stk.oy;
      // 잡은 점이 마우스 위치에 오도록 스티커 중심을 계산해 (기울어진 만큼 반영)
      const sc0 = 1 + 0.035 * stk.lift;
      const vxl = stk.gl[0] - W / 2, vyl = stk.gl[1] - H / 2;
      const ca = Math.cos(stk.ang), sa = Math.sin(stk.ang);
      const tox = ptr.sx - (vxl * ca - vyl * sa) * sc0 - W / 2;
      const toy = ptr.sy - (vxl * sa + vyl * ca) * sc0 - H / 2;
      stk.ox += (tox - stk.ox) * 0.6;
      stk.oy += (toy - stk.oy) * 0.6;
      stk.ox = clamp(stk.ox, minX, maxX);
      stk.oy = clamp(stk.oy, minY, maxY);
      stk.vx = stk.ox - px0;
      stk.vy = stk.oy - py0;
      stk.lift += (1 - stk.lift) * 0.22;
    } else {
      stk.ox += stk.vx; stk.oy += stk.vy;
      stk.vx *= 0.9; stk.vy *= 0.9;
      if (Math.abs(stk.vx) < 0.05) stk.vx = 0;
      if (Math.abs(stk.vy) < 0.05) stk.vy = 0;
      if (stk.ox < minX) { stk.ox = minX; stk.vx = Math.abs(stk.vx) * 0.25; }
      if (stk.ox > maxX) { stk.ox = maxX; stk.vx = -Math.abs(stk.vx) * 0.25; }
      if (stk.oy < minY) { stk.oy = minY; stk.vy = Math.abs(stk.vy) * 0.25; }
      if (stk.oy > maxY) { stk.oy = maxY; stk.vy = -Math.abs(stk.vy) * 0.25; }
      stk.lift += (0 - stk.lift) * 0.12;
      if (stk.lift < 0.01) stk.lift = 0;
    }
    // 흔들림(진자): 잡은 점이 움직이면 스티커 몸통은 뒤처지며 돌고, 놓으면 출렁이다 원래 각도로
    if (stk.grab) {
      const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
      const l1 = clamp((H / 2 - stk.gl[1]) / (bh / 2), -1.3, 1.3);   // 잡은 점이 중심보다 위일수록 +
      const l2 = clamp((stk.gl[0] - W / 2) / (bw / 2), -1.3, 1.3);   // 잡은 점이 중심보다 오른쪽일수록 +
      stk.av += (ptr.vx * l1 + ptr.vy * l2) * 0.00075;
    }
    stk.av += -(stk.ang - TILT) * (stk.grab ? 0.03 : 0.06);
    stk.av *= stk.grab ? 0.9 : 0.84;
    stk.ang = clamp(stk.ang + stk.av, TILT - 0.9, TILT + 0.9);
    if (!stk.grab && Math.abs(stk.av) < 0.0003 && Math.abs(stk.ang - TILT) < 0.001) { stk.ang = TILT; stk.av = 0; }

    /* --- 모서리가 들썩이는 모션 (잡고 있지 않고, 가만히 붙어 있을 때) --- */
    const resting = !stk.grab && stk.lift < 0.02 && Math.abs(stk.vx) + Math.abs(stk.vy) < 0.3 && Math.abs(stk.ang - TILT) < 0.05;
    if (resting) {
      const [lxp, lyp] = toLocal(ptr.sx, ptr.sy);
      const corners = [[box.x0, box.y0], [box.x1, box.y0], [box.x0, box.y1], [box.x1, box.y1]];
      let best = corners[0], bd = Infinity;
      for (const c of corners) {
        const dd = Math.hypot(c[0] - lxp, c[1] - lyp);
        if (dd < bd) { bd = dd; best = c; }
      }
      const hover = ptr.act > 0.5 && overSticker(ptr.sx, ptr.sy);
      if (hover || peel.len < 2) {
        peel.cx = best[0]; peel.cy = best[1];
        const mx = (box.x0 + box.x1) / 2 - peel.cx, my = (box.y0 + box.y1) / 2 - peel.cy;
        const l = Math.hypot(mx, my) || 1;
        peel.nx = mx / l; peel.ny = my / l;
      }
      const closeness = 1 - clamp(bd / (diag * 0.4), 0, 1);       // 모서리에 가까울수록 더 많이 들려
      peel.target = hover ? 16 + closeness * Math.min(diag * 0.13, 100) : 0;
    } else {
      peel.target = stk.grab ? stk.curl : 0;
    }
    peel.len += (peel.target - peel.len) * (resting ? 0.16 : 0.35);
    if (Math.abs(peel.target - peel.len) < 0.1) peel.len = peel.target;

    /* --- 그리기 --- */
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 + stk.ox, H / 2 + stk.oy);
    ctx.rotate(stk.ang);
    const sc = 1 + 0.035 * stk.lift;
    ctx.scale(sc, sc);
    ctx.translate(-W / 2, -H / 2);

    const shadowOn = () => {              // 들어올릴수록 그림자가 크고 멀어져
      ctx.shadowColor = `rgba(40,25,15,${0.28 + 0.1 * stk.lift})`;
      ctx.shadowBlur = W * (0.02 + 0.03 * stk.lift);
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = W * (0.008 + 0.02 * stk.lift);
    };
    const shadowOff = () => { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; };

    if (peel.len < 0.8) {
      shadowOn();
      ctx.drawImage(front, 0, 0);
      shadowOff();
    } else {
      // 접히는 선: 모서리(C)와 끌고 있는 점(P)의 정확히 가운데를 지나고, C→P 방향에 수직
      const nx = peel.nx, ny = peel.ny;
      const px = peel.cx + nx * peel.len, py = peel.cy + ny * peel.len;
      const mx = (peel.cx + px) / 2, my = (peel.cy + py) / 2;
      const tx = -ny, ty = nx, BIG = W * 3;
      const clipPos = () => {            // 접히는 선의 "안쪽"(P 쪽) 반평면
        ctx.beginPath();
        ctx.moveTo(mx + tx * BIG, my + ty * BIG);
        ctx.lineTo(mx - tx * BIG, my - ty * BIG);
        ctx.lineTo(mx - tx * BIG + nx * BIG, my - ty * BIG + ny * BIG);
        ctx.lineTo(mx + tx * BIG + nx * BIG, my + ty * BIG + ny * BIG);
        ctx.closePath();
        ctx.clip();
      };
      // 1) 아직 붙어 있는 부분
      ctx.save();
      clipPos();
      shadowOn();
      ctx.drawImage(front, 0, 0);
      ctx.restore();
      shadowOff();
      // 2) 접혀 올라온 부분(뒷면): 접는 선을 기준으로 뒤집어서 그려
      ctx.save();
      clipPos();
      ctx.shadowColor = 'rgba(40,25,15,0.38)';
      ctx.shadowBlur = W * 0.022;
      ctx.shadowOffsetY = W * 0.007;
      const d = 2 * (mx * nx + my * ny);
      ctx.transform(1 - 2 * nx * nx, -2 * nx * ny, -2 * nx * ny, 1 - 2 * ny * ny, d * nx, d * ny);
      ctx.drawImage(back, 0, 0);
      ctx.restore();
    }
    ctx.restore();
    needDraw = stk.grab || stk.lift > 0 || peel.len > 0.1 || ptr.act > 0.01 ||
      Math.abs(peel.target - peel.len) > 0.1 || Math.abs(stk.vx) + Math.abs(stk.vy) > 0 || Math.abs(stk.ang - TILT) > 0.0005 || Math.abs(stk.av) > 0.0003;
  }

  /* =====================================================================
     5. 그리기 루프 (화면에 보일 때만)
     ===================================================================== */
  let visible = false;
  let running = false;
  const tilt = { x: 0, y: 0, on: false };

  function frame(t) {
    if (!visible) { running = false; return; }
    // 마우스 값 부드럽게 따라가기
    const target = ptr.inside ? 1 : 0;
    ptr.act += (target - ptr.act) * 0.12;
    if (ptr.act < 0.003) ptr.act = 0;
    const px0 = ptr.sx, py0 = ptr.sy;
    ptr.sx += (ptr.x - ptr.sx) * (ptr.down ? 0.5 : 0.22);
    ptr.sy += (ptr.y - ptr.sy) * (ptr.down ? 0.5 : 0.22);
    ptr.vx = ptr.sx - px0;
    ptr.vy = ptr.sy - py0;

    // 마우스를 따라 로고가 입체적으로 기울어져 (스티커는 직접 끌고 다니니까 제외)
    const tOn = ptr.inside && mode !== 'sticker' && mode !== 'squeeze' && mode !== 'cream' && W > 0;
    const ttx = tOn ? clamp((ptr.sx - W / 2) / (lw * 0.75), -1, 1) : 0;
    const tty = tOn ? clamp((ptr.sy - H / 2) / (lh * 1.6), -1, 1) : 0;
    tilt.x += (ttx - tilt.x) * 0.09;
    tilt.y += (tty - tilt.y) * 0.09;
    if (Math.abs(tilt.x) > 0.0005 || Math.abs(tilt.y) > 0.0005 || tilt.on) {
      tilt.on = Math.abs(tilt.x) > 0.0005 || Math.abs(tilt.y) > 0.0005;
      tiltEl.style.transform = tilt.on
        ? `perspective(1500px) rotateX(${(-tilt.y * TILT_DEG).toFixed(3)}deg) rotateY(${(tilt.x * TILT_DEG).toFixed(3)}deg)`
        : '';
    }

    if (logoImg && maskC && canvas.width && (needDraw || mode === 'metal' || mode === 'neon')) {
      needDraw = false;
      if (mode === 'basic') drawBasic();
      else if (mode === 'squeeze') drawSqueeze(t);
      else if (mode === 'metal') drawMetal(t);
      else if (mode === 'sticker') drawSticker();
      else if (mode === 'neon') drawNeon(t);
      else if (mode === 'cream') drawCream();
    }
    requestAnimationFrame(frame);
  }
  function start() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) start();
  }, { threshold: 0.05 }).observe(root);

  let resizeT = 0;
  new ResizeObserver(() => {
    clearTimeout(resizeT);
    resizeT = setTimeout(layout, 120);
  }).observe(root);

  /* =====================================================================
     6. 모드 바꾸기
     ===================================================================== */
  const hintEl = document.createElement('p');
  hintEl.className = 'wheel__hint';
  let switchT = 0;

  function setMode(id, instant) {
    if (id === mode && !instant) return;
    clearTimeout(switchT);
    const apply = () => {
      mode = id;
      root.dataset.mode = id;
      if (mesh) { mesh.grab = null; mesh.x.set(mesh.rx); mesh.y.set(mesh.ry); mesh.vx.fill(0); mesh.vy.fill(0); }
      resetSticker();
      ripples.length = 0;
      neonSurge = 0;
      if (fields) { fields.trail.fill(0); fields.cream.fill(0); fields.cLast = null; }
      creamDollop = false;
      needDraw = true;
      canvas.style.opacity = 1;
      canvas.style.transform = 'scale(1)';
    };
    hintEl.textContent = MODES.find((m) => m.id === id).hint;
    if (instant) { apply(); return; }
    canvas.style.opacity = 0;               // 잠깐 작아지며 사라졌다가, 새 효과가 통통 튀며 나타나
    canvas.style.transform = 'scale(0.94)';
    switchT = setTimeout(apply, 220);
  }

  /* =====================================================================
     7. 휠 UI (3D 로 휘어진 목록)
     ===================================================================== */
  const N = MODES.length;
  const STEP = 26;                          // 항목 사이 각도(도)
  const WHEEL_R = 21;                       // 휠 반지름(rem)
  const PITCH = 9;                          // 항목 한 칸 간격(rem), 드래그 계산용

  const view = document.createElement('div');
  view.className = 'wheel__view';
  const items = MODES.map((m, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wheel__item';
    b.setAttribute('role', 'option');
    b.innerHTML = `<span class="wheel__no">${String(i + 1).padStart(2, '0')}</span><span class="wheel__label">${m.label}</span>`;
    view.appendChild(b);
    return b;
  });
  wheelEl.append(view, hintEl);

  const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;
  let pos = 0, target = 0, selected = 0;
  let wheelRun = false, wheelLast = 0;

  function renderWheel() {
    const r = rem();
    items.forEach((el, i) => {
      const k = i - pos;
      const a = k * STEP * Math.PI / 180;
      const y = Math.sin(a) * WHEEL_R * r;
      const z = (Math.cos(a) - 1) * WHEEL_R * r;
      el.style.transform = `translate3d(0, ${y}px, ${z}px) rotateX(${-k * STEP}deg)`;
      el.style.opacity = String(Math.max(0, 1 - Math.abs(k) * 0.42));
      el.style.pointerEvents = Math.abs(k) > 2.4 ? 'none' : 'auto';
      el.style.zIndex = String(10 - Math.round(Math.abs(k) * 2));
      const on = Math.abs(k) < 0.5;
      el.classList.toggle('is-on', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
  function wheelLoop(now) {
    const dt = Math.min((now - wheelLast) / 1000, 0.05);
    wheelLast = now;
    if (!dragging) pos += (target - pos) * (1 - Math.exp(-dt * 11));
    if (Math.abs(target - pos) < 0.001 && !dragging) pos = target;
    renderWheel();
    if (dragging || pos !== target) requestAnimationFrame(wheelLoop);
    else wheelRun = false;
  }
  function kickWheel() {
    if (wheelRun) return;
    wheelRun = true;
    wheelLast = performance.now();
    requestAnimationFrame(wheelLoop);
  }
  function select(i) {
    i = clamp(Math.round(i), 0, N - 1);
    target = i;
    if (i !== selected) { selected = i; setMode(MODES[i].id); }
    kickWheel();
  }

  // 마우스 휠 / 트랙패드
  let acc = 0, accT = 0, lastStep = 0, lastWheelTs = 0;
  wheelEl.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const dy = e.deltaY;
    if (!dy) return;
    const now = performance.now();
    const atEnd = (selected <= 0 && dy < 0) || (selected >= N - 1 && dy > 0);
    // 맨 위/아래에서 더 굴리면 섹션 스크롤로 넘겨줘 (바로 직전까지 굴리던 중이면 관성이니까 삼켜)
    if (atEnd && now - lastWheelTs > 350) return;
    e.preventDefault();
    e.stopPropagation();
    lastWheelTs = now;
    acc += dy;
    clearTimeout(accT);
    accT = setTimeout(() => { acc = 0; }, 160);
    if (Math.abs(acc) >= 50 && now - lastStep > 130) {
      select(selected + Math.sign(acc));
      acc = 0;
      lastStep = now;
    }
  }, { passive: false });

  // 드래그
  let dragging = false, dragY = 0, dragPos = 0, dragMoved = 0;
  wheelEl.addEventListener('pointerdown', (e) => {
    dragging = true;
    dragY = e.clientY;
    dragPos = pos;
    dragMoved = 0;
    wheelEl.classList.add('is-drag');
    kickWheel();
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = e.clientY - dragY;
    dragMoved = Math.max(dragMoved, Math.abs(dy));
    pos = clamp(dragPos - dy / (PITCH * rem()), -0.3, N - 0.7);
    const near = clamp(Math.round(pos), 0, N - 1);
    if (near !== selected) { selected = near; setMode(MODES[near].id); }
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    wheelEl.classList.remove('is-drag');
    select(pos);
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // 클릭으로 고르기
  items.forEach((el, i) => el.addEventListener('click', () => { if (dragMoved < 6) select(i); }));

  // 키보드 (휠에 포커스가 있을 때)
  wheelEl.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    e.stopPropagation();
    select(selected + (e.key === 'ArrowDown' ? 1 : -1));
  });

  // 터치할 때 섹션 이동이 같이 일어나지 않게
  ['touchstart', 'touchend'].forEach((n) => wheelEl.addEventListener(n, (e) => e.stopPropagation(), { passive: true }));

  window.addEventListener('resize', renderWheel);

  /* ----- 시작 ----- */
  setMode('basic', true);
  renderWheel();
  loadLogo().then(() => {
    layout();
    needDraw = true;
  });
})();
