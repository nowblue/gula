/* 안내 문구 : 느리게 깜빡이는 문구가, 사용자가 직접 해보는 동안에는 사라지고 잠시 뒤 다시 나타나
   index.html 의 <p class="hint" data-hint-target="대상 선택자" data-hint-hide="drag hover wheel click"> 마다 동작을 골라줘
   - drag  : 대상을 누르고 있는 동안 숨김 (놓고 1.6초 뒤 다시)
   - hover : 대상 위에 마우스가 있는 동안 숨김
   - wheel : 대상 위에서 휠을 돌리면 2.4초 숨김
   - click : 대상을 클릭하면 2.4초 숨김 */
(() => {
  'use strict';
  document.querySelectorAll('.hint[data-hint-target]').forEach((hint) => {
    const targets = Array.from(document.querySelectorAll(hint.dataset.hintTarget));
    if (!targets.length) return;
    const modes = (hint.dataset.hintHide || 'drag').split(/\s+/);
    let timer = 0, holding = 0, hovering = 0;
    const hide = () => { clearTimeout(timer); hint.classList.add('is-hidden'); };
    const showLater = (ms) => { clearTimeout(timer); timer = setTimeout(() => { if (!holding && !hovering) hint.classList.remove('is-hidden'); }, ms); };
    targets.forEach((el) => {
      if (modes.includes('drag')) {
        el.addEventListener('pointerdown', () => { holding++; hide(); });
      }
      if (modes.includes('hover')) {
        el.addEventListener('pointerenter', () => { hovering++; hide(); });
        el.addEventListener('pointerleave', () => { hovering = Math.max(0, hovering - 1); showLater(700); });
      }
      if (modes.includes('wheel')) el.addEventListener('wheel', () => { hide(); showLater(2400); }, { passive: true });
      if (modes.includes('click')) el.addEventListener('click', () => { hide(); showLater(2400); });
    });
    const release = () => { if (holding) { holding = 0; showLater(1600); } };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  });
})();
