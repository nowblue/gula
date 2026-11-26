// 3D 시그니처 뷰어 (three.js)
// - models/signature.stl 을 불러와서 3번 Signature 섹션에 보여줘
// - 마우스로 드래그해서 자유롭게 돌려볼 수 있고, 놓으면 다시 바로 서서 천천히 돌아가며 위아래로 살짝 떠 있어
// - 로딩 전이나 실패했을 때는 index.html 에 있는 3d.png 가 그대로 보여

import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ---------- 여기 숫자와 색만 바꾸면 돼 ---------- */
const STL_URL       = 'models/signature.stl'; // STL 파일 경로 (파일 이름이 바뀌면 여기만 고쳐줘)

// 색: 위는 빨강, 아래는 흰색으로 이어지는 그라데이션
const COLOR_TOP     = '#91000f';              // 위쪽 색 (우리 브랜드 빨강 · 더 어둡게 하고 싶으면 숫자를 낮춰)
const COLOR_BOTTOM  = '#f6f1ec';              // 아래쪽 색 (흰 도자기)
const GRADIENT_FROM = 0.05;                   // 높이 0(맨 아래)~1(맨 위). 이 높이까지는 아래쪽 색 그대로
const GRADIENT_TO   = 0.75;                    // 이 높이부터는 위쪽 색 그대로. 둘 사이가 그라데이션
const GLOSS         = 0.28;                   // 낮을수록 반짝여 (0.1 ~ 0.6 추천)

// 윗부분 진주(체리 돔 아래 링)는 그라데이션과 상관없이 흰색으로 칠해
const COLOR_PEARL      = '#91000f';           // 진주 색 (위 진주 링 + 아래 진주 링 둘 다)
const COLOR_DOME       = '#f6f1ec';           // 맨 위 돔(소스) 색 — 흰색
const PEARL_BAND       = [0.75, 0.9];         // 이 높이 범위(0~1)에 중심이 있는 작은 덩어리를 위쪽 진주로 봐
const BASE_PEARL_MAX   = 0.2;                 // 이 높이(0~1) 아래에 중심이 있는 덩어리(맨 아래 링)도 진주로 봐
const DOME_MIN         = 0.9;                 // 이 높이 위에 중심이 있는 작은 덩어리는 돔으로 봐
const PEARL_MAX_WIDTH  = 0.5;                 // 모델 전체 너비의 이 비율보다 작은 덩어리만 (몸통은 제외)

// 움직임
const FREE_TILT    = true;                    // true: 위아래로도 제한 없이 돌려볼 수 있어 / false: 살짝만 기울어져
const TILT_LIMIT   = 0.5;                     // FREE_TILT 가 false 일 때만 쓰는 최대 기울기(라디안)
const AUTO_SPEED    = 0.35;                   // 자동 회전 속도 (초당 라디안). 0이면 안 돌아
const IDLE_MS       = 1500;                   // 드래그를 놓고 이 시간이 지나면 자동 회전 재개
const FLOAT_AMOUNT  = 0.02;                   // 위아래로 떠다니는 폭. 0이면 고정
const CREASE_DEG    = 40;                     // 이 각도보다 완만한 면은 부드럽게, 날카로운 모서리는 살려

// 바닥 그림자(붉은 빛). 배경이 검정이라 어두운 그림자 대신 은은한 빛으로 표현해
const GLOW_STRENGTH = 0.9;                    // 진하기. 0이면 그림자를 아예 없애
const GLOW_RGB      = '140, 16, 26';          // 빛 색
const GLOW_SIZE     = 1.5;                    // 타원 크기 (모델 높이가 1일 때 기준)

// 캔버스를 보이는 영역(78x80rem)보다 이만큼(비율) 더 키워서, 그림자가 사각형으로 잘려 보이지 않게 해
const CANVAS_PAD_X  = 0.25;                   // 좌우로 각각 25%
const CANVAS_PAD_Y  = 0.10;                   // 위아래로 각각 10%

const viewer = document.querySelector('.sig1__viewer');
if (viewer) init();

/* 몸통과 떨어져 있는 작은 덩어리(진주 링)를 찾아서, 그 꼭짓점마다 1(흰색) / 0 을 돌려줘.
   STL 은 삼각형이 따로따로라서, 같은 위치의 꼭짓점끼리 이어 붙여 "덩어리"를 구해. */
function findPearlFlags(geo) {
  const pos = geo.attributes.position;
  const count = pos.count;
  const flags = new Float32Array(count);
  if (geo.index) return flags; // STLLoader 결과는 보통 인덱스가 없어

  const arr = pos.array;
  const ids = new Map();
  const vid = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    const key = Math.round(arr[i * 3] * 1000) + ',' + Math.round(arr[i * 3 + 1] * 1000) + ',' + Math.round(arr[i * 3 + 2] * 1000);
    let id = ids.get(key);
    if (id === undefined) { id = ids.size; ids.set(key, id); }
    vid[i] = id;
  }

  const parent = new Int32Array(ids.size);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  const find = (a) => {
    while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; }
    return a;
  };
  for (let t = 0; t < count; t += 3) {
    const a = find(vid[t]);
    for (let j = 1; j < 3; j++) {
      const b = find(vid[t + j]);
      if (a !== b) parent[b] = a;
    }
  }

  // 덩어리마다 경계 상자(최소/최대 x, y, z)
  const boxes = new Map();
  for (let i = 0; i < count; i++) {
    const root = find(vid[i]);
    let b = boxes.get(root);
    if (!b) { b = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity]; boxes.set(root, b); }
    const x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
    if (x < b[0]) b[0] = x; if (x > b[1]) b[1] = x;
    if (y < b[2]) b[2] = y; if (y > b[3]) b[3] = y;
    if (z < b[4]) b[4] = z; if (z > b[5]) b[5] = z;
  }

  // 모델 전체 크기 (라이노 STL 이라 Z 가 위쪽)
  let minZ = Infinity, maxZ = -Infinity, maxW = 0;
  for (const b of boxes.values()) {
    minZ = Math.min(minZ, b[4]); maxZ = Math.max(maxZ, b[5]);
    maxW = Math.max(maxW, b[1] - b[0], b[3] - b[2]);
  }

  // 높이 범위와 너비 조건에 맞는 덩어리를 진주로 선택
  const chosen = new Map();
  for (const [root, b] of boxes) {
    const centerT = ((b[4] + b[5]) / 2 - minZ) / (maxZ - minZ);
    const widthRatio = Math.max(b[1] - b[0], b[3] - b[2]) / maxW;
    if (centerT >= PEARL_BAND[0] && centerT <= PEARL_BAND[1] && widthRatio < PEARL_MAX_WIDTH) chosen.set(root, 1);   // 위쪽 진주
    else if (centerT < BASE_PEARL_MAX) chosen.set(root, 1);                                                          // 아래쪽 진주
    else if (centerT > DOME_MIN && widthRatio < PEARL_MAX_WIDTH) chosen.set(root, 2);                                // 돔
  }
  for (let i = 0; i < count; i++) flags[i] = chosen.get(find(vid[i])) || 0;   // 0 몸통 / 1 진주 / 2 돔

  console.info(`[GULA] STL 덩어리 ${boxes.size}개 중 ${chosen.size}개를 진주/돔으로 칠했어.`);
  return flags;
}

function init() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----- 렌더러 ----- */
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (err) {
    console.warn('[GULA] WebGL을 시작하지 못해서 3d.png를 그대로 보여줘.', err);
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0); // 투명 배경: 섹션의 검정이 그대로 보여
  renderer.autoClear = false;          // 그림자(뒤) → 모델(앞) 순서로 직접 겹쳐 그릴 거라서 자동 지우기는 꺼

  const canvas = renderer.domElement;
  canvas.className = 'sig1__canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'RUBY CARNE 3D 모델');
  // 보이는 영역보다 사방으로 살짝 크게 깔아 (그림자가 가장자리에서 잘리지 않게)
  Object.assign(canvas.style, {
    inset: 'auto',
    left: `${-CANVAS_PAD_X * 100}%`,
    top: `${-CANVAS_PAD_Y * 100}%`,
    width: `${(1 + 2 * CANVAS_PAD_X) * 100}%`,
    height: `${(1 + 2 * CANVAS_PAD_Y) * 100}%`,
  });
  viewer.prepend(canvas);

  /* ----- 장면, 카메라, 조명 ----- */
  const scene = new THREE.Scene();
  const glowScene = new THREE.Scene(); // 그림자만 따로 담아서, 항상 모델 "뒤"에 그려
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);

  // 스튜디오 같은 부드러운 반사광 (도자기 광택을 만들어줘)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(-2, 3, 3);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xa81c28, 1.1); // 뒤쪽에서 가장자리를 살짝 붉게 비춰 (너무 밝아 보이지 않게 낮춤)
  rim.position.set(3, 1.5, -3);
  scene.add(rim);

  /* ----- 바닥 그림자(타원형 붉은 빛) : 가장자리로 갈수록 완전히 투명해져서 경계가 안 보여 ----- */
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 256;
  const gctx = glowCanvas.getContext('2d');
  const grad = gctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0,    `rgba(${GLOW_RGB}, 0.80)`);
  grad.addColorStop(0.3,  `rgba(${GLOW_RGB}, 0.42)`);
  grad.addColorStop(0.6,  `rgba(${GLOW_RGB}, 0.12)`);
  grad.addColorStop(0.85, `rgba(${GLOW_RGB}, 0.02)`);
  grad.addColorStop(1,    `rgba(${GLOW_RGB}, 0)`);
  gctx.fillStyle = grad;
  gctx.fillRect(0, 0, 256, 256);
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  glowTex.colorSpace = THREE.SRGBColorSpace;

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(GLOW_SIZE, GLOW_SIZE),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false })
  );
  glow.rotation.x = -Math.PI / 2; // 바닥에 눕혀서, 비스듬히 보면 납작한 타원이 돼
  glow.position.y = -0.62;
  glow.visible = GLOW_STRENGTH > 0;
  glowScene.add(glow);

  /* ----- 재질: 광택 도자기 + 높이에 따른 그라데이션(위 빨강 → 아래 흰색) + 흰 진주 ----- */
  const gradUniforms = {
    uTop:    { value: new THREE.Color(COLOR_TOP) },
    uBottom: { value: new THREE.Color(COLOR_BOTTOM) },
    uPearl:  { value: new THREE.Color(COLOR_PEARL) },
    uDome:   { value: new THREE.Color(COLOR_DOME) },
    uFrom:   { value: GRADIENT_FROM },
    uTo:     { value: GRADIENT_TO },
    uMinY:   { value: -0.5 },
    uMaxY:   { value: 0.5 },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: GLOSS,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 0.75,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, gradUniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aWhite;
        varying float vGulaH;
        varying float vGulaWhite;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vGulaH = position.y;
        vGulaWhite = aWhite;`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vGulaH;
        varying float vGulaWhite;
        uniform vec3 uTop;
        uniform vec3 uBottom;
        uniform vec3 uPearl;
        uniform vec3 uDome;
        uniform float uFrom;
        uniform float uTo;
        uniform float uMinY;
        uniform float uMaxY;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float gulaT = clamp((vGulaH - uMinY) / (uMaxY - uMinY), 0.0, 1.0);
        vec3 gulaColor = mix(uBottom, uTop, smoothstep(uFrom, uTo, gulaT));
        float gulaDome = step(1.5, vGulaWhite);
        float gulaPearl = step(0.5, vGulaWhite) - gulaDome;
        vec3 gulaOut = mix(gulaColor, uPearl, gulaPearl);
        diffuseColor.rgb = mix(gulaOut, uDome, gulaDome);`);
  };
  material.customProgramCacheKey = () => 'gula-gradient-pearl';

  /* ----- 모델이 들어갈 그룹: 떠다니기(floater) > 회전(pivot) > 메시 ----- */
  const floater = new THREE.Group();
  const pivot = new THREE.Group();
  floater.add(pivot);
  scene.add(floater);

  /* ----- 크기 맞추기 : 모델은 "보이는 영역" 기준으로 맞추고, 캔버스는 그보다 크게 ----- */
  const ELEV = 0.16;        // 카메라가 모델을 내려다보는 각도(라디안)
  const FIT_HALF_H = 0.68;  // 보이는 영역에 들어와야 하는 세로 반폭 (모델 높이 1 + 그림자 여유)
  const FIT_HALF_W = 0.62;  // 가로 반폭 (돌릴 때 가장 넓어지는 폭)

  function resize() {
    const vw = viewer.clientWidth;
    const vh = viewer.clientHeight;
    if (!vw || !vh) return;

    const cw = Math.round(vw * (1 + 2 * CANVAS_PAD_X));
    const ch = Math.round(vh * (1 + 2 * CANVAS_PAD_Y));
    renderer.setSize(cw, ch, false);
    camera.aspect = cw / ch;

    const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = 1.05 * Math.max(
      (FIT_HALF_H * (ch / vh)) / tanHalf,
      (FIT_HALF_W * (ch / vw)) / tanHalf
    );
    camera.position.set(0, Math.sin(ELEV) * dist, Math.cos(ELEV) * dist);
    camera.lookAt(0, -0.03, 0);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(viewer);
  resize();

  /* ----- STL 불러오기 ----- */
  new STLLoader().load(
    STL_URL,
    (loaded) => {
      // 1) 진주 덩어리 찾기 (삼각형 순서가 바뀌기 전, 원래 좌표에서)
      const pearlFlags = findPearlFlags(loaded);

      // 2) 법선(면의 방향)을 부드럽게 다시 계산. 크기를 줄이기 전에 해야 정확해
      let geo = loaded;
      if (typeof BufferGeometryUtils.toCreaseNormals === 'function') {
        geo = BufferGeometryUtils.toCreaseNormals(loaded, THREE.MathUtils.degToRad(CREASE_DEG));
      } else {
        loaded.deleteAttribute('normal');
        geo = BufferGeometryUtils.mergeVertices(loaded, 1e-3);
        geo.computeVertexNormals();
        geo = geo.toNonIndexed();
      }

      // 진주 표시를 꼭짓점 정보로 붙여. (꼭짓점 개수가 같을 때만)
      const hasPearls = geo.attributes.position.count === pearlFlags.length;
      geo.setAttribute('aWhite', new THREE.BufferAttribute(hasPearls ? pearlFlags : new Float32Array(geo.attributes.position.count), 1));

      // 3) 라이노(Z가 위) → three.js(Y가 위)로 눕혀 세우고, 중심을 맞추고, 높이를 1로 정규화
      geo.rotateX(-Math.PI / 2);
      geo.computeBoundingBox();
      const center = geo.boundingBox.getCenter(new THREE.Vector3());
      const size = geo.boundingBox.getSize(new THREE.Vector3());
      geo.translate(-center.x, -center.y, -center.z);
      const s = 1 / size.y;
      geo.scale(s, s, s);

      gradUniforms.uMinY.value = -0.5;
      gradUniforms.uMaxY.value = 0.5;

      pivot.add(new THREE.Mesh(geo, material));
      viewer.classList.add('is-ready'); // PNG는 사라지고 3D가 부드럽게 나타나
    },
    undefined,
    (err) => console.warn(`[GULA] ${STL_URL} 을 불러오지 못해서 3d.png를 그대로 보여줘.`, err)
  );

  /* ----- 마우스/터치 드래그로 돌리기 ----- */
  const TWO_PI = Math.PI * 2;
  let rotY = 0.4;
  let rotX = 0;
  let velY = 0;            // 회전 속도 (라디안/초)
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let lastInteract = -Infinity;

  viewer.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    velY = 0;
    lastInteract = performance.now();
    viewer.setPointerCapture(e.pointerId);
    viewer.classList.add('is-drag');
  });
  viewer.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    // 거꾸로 뒤집힌 상태에서는 좌우 방향이 반대로 느껴지니까 뒤집어줘
    const flip = Math.cos(rotX) < 0 ? -1 : 1;
    rotY += (e.clientX - lastX) * 0.008 * flip;
    rotX += (e.clientY - lastY) * 0.005;
    if (!FREE_TILT) rotX = THREE.MathUtils.clamp(rotX, -TILT_LIMIT, TILT_LIMIT);
    lastX = e.clientX;
    lastY = e.clientY;
    lastInteract = performance.now();
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    lastInteract = performance.now();
    viewer.classList.remove('is-drag');
    // 여러 바퀴 돌려놨어도 되감기지 않고, 가장 가까운 "바로 선 자세"로 돌아오게 -π ~ π 로 맞춰
    rotX -= Math.round(rotX / TWO_PI) * TWO_PI;
  };
  viewer.addEventListener('pointerup', endDrag);
  viewer.addEventListener('pointercancel', endDrag);
  viewer.addEventListener('lostpointercapture', endDrag);

  // 모델을 위아래로 끄는 터치가 섹션 이동(script.js)으로 넘어가지 않게 막아
  viewer.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  viewer.addEventListener('touchend', (e) => e.stopPropagation());

  /* ----- 애니메이션 루프 (화면에 보일 때만 돌려서 GPU를 아껴) ----- */
  let running = false;
  let lastTime = 0;
  let prevRotY = rotY;

  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (dragging) {
      // 드래그 중의 회전 속도를 기억해뒀다가, 놓았을 때 관성으로 이어줘
      if (dt > 0) velY += ((rotY - prevRotY) / dt - velY) * 0.3;
    } else {
      const idle = performance.now() - lastInteract > IDLE_MS;
      const target = idle && !reduceMotion ? AUTO_SPEED : 0;
      velY += (target - velY) * (1 - Math.exp(-dt * (idle ? 1.5 : 2.5)));
      rotY += velY * dt;
      rotX += (0 - rotX) * (1 - Math.exp(-dt * 2)); // 기울였다면 천천히 바로 서
    }
    prevRotY = rotY;

    pivot.rotation.set(rotX, rotY, 0);

    const f = reduceMotion ? 0 : Math.sin(now / 1000 * 1.1);
    floater.position.y = f * FLOAT_AMOUNT;
    glow.scale.setScalar(1 - f * 0.06);                        // 떠오르면 그림자는 살짝 작아지고
    glow.material.opacity = GLOW_STRENGTH * (1 - f * 0.1);     // 옅어져

    // 1) 그림자를 먼저 깔고  2) 깊이 정보를 지운 뒤  3) 모델을 그 위에 그려 → 모델이 항상 그림자 앞에 보여
    renderer.clear();
    renderer.render(glowScene, camera);
    renderer.clearDepth();
    renderer.render(scene, camera);

    requestAnimationFrame(frame);
  }

  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !running) {
      running = true;
      lastTime = performance.now();
      requestAnimationFrame(frame);
    } else if (!entry.isIntersecting) {
      running = false;
    }
  }, { threshold: 0.05 }).observe(viewer);
}