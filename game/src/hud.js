// The HUD and menus: health, cash, wanted stars, the game clock, the mission
// objective, a live minimap, the speedometer, briefings and the title, pause
// and end screens. All DOM, styled in index.html; this module only writes
// text, colours and the minimap canvas.

import { CITY, FONT } from './config.js';

export function createHud(root) {
  const el = (tag, className, parent) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    (parent || root).appendChild(node);
    return node;
  };

  const hud = el('div', 'hud');
  const topLeft = el('div', 'panel topleft', hud);
  const healthBar = el('div', 'bar', topLeft);
  const healthFill = el('div', 'fill health', healthBar);
  const ammoText = el('div', 'ammo', topLeft);
  const moneyText = el('div', 'money', topLeft);
  const wantedText = el('div', 'wanted', topLeft);
  const clockText = el('div', 'clock', topLeft);

  const objectiveBox = el('div', 'panel objective', hud);
  const objectiveTitle = el('div', 'obj-title', objectiveBox);
  const objectiveText = el('div', 'obj-text', objectiveBox);
  const timerText = el('div', 'obj-timer', objectiveBox);

  const minimap = el('canvas', 'minimap', hud);
  minimap.width = 180;
  minimap.height = 180;
  const mapCtx = minimap.getContext('2d');

  const speedBox = el('div', 'panel speed', hud);
  const speedText = el('div', 'speed-num', speedBox);
  el('div', 'speed-unit', speedBox).textContent = 'km/h';

  const crosshair = el('div', 'crosshair', hud);
  const vignette = el('div', 'vignette', hud);
  const toast = el('div', 'toast', hud);
  const briefing = el('div', 'briefing', hud);
  const briefingTitle = el('div', 'brief-title', briefing);
  const briefingText = el('div', 'brief-text', briefing);
  const interactHint = el('div', 'hint', hud);

  // --- Menus -----------------------------------------------------------------
  const title = el('div', 'menu title-screen');
  el('div', 'game-title', title).textContent = 'PALM VERGE';
  el('div', 'game-sub', title).textContent = 'NEON HEAT';
  el('div', 'game-tag', title).textContent = 'An original open-world crime story in Verge City';
  const titleButtons = el('div', 'buttons', title);
  const startBtn = el('button', 'btn primary', titleButtons);
  startBtn.textContent = 'Start new story';
  const continueBtn = el('button', 'btn', titleButtons);
  continueBtn.textContent = 'Continue';
  el('div', 'controls', title).innerHTML =
    'WASD drive &amp; walk &nbsp;·&nbsp; Mouse look &nbsp;·&nbsp; Shift run &nbsp;·&nbsp; Space jump<br>' +
    'E enter car / interact &nbsp;·&nbsp; F punch &nbsp;·&nbsp; Click shoot &nbsp;·&nbsp; R reload<br>' +
    'Esc pause &nbsp;·&nbsp; M mute &nbsp;·&nbsp; Follow the gold marker. Lose the heat. Get paid.';

  const pause = el('div', 'menu pause-screen');
  el('div', 'menu-title', pause).textContent = 'PAUSED';
  const pauseButtons = el('div', 'buttons', pause);
  const resumeBtn = el('button', 'btn primary', pauseButtons);
  resumeBtn.textContent = 'Resume';
  const saveBtn = el('button', 'btn', pauseButtons);
  saveBtn.textContent = 'Save game';
  const quitBtn = el('button', 'btn', pauseButtons);
  quitBtn.textContent = 'Quit to title';

  const end = el('div', 'menu end-screen');
  const endTitle = el('div', 'menu-title', end);
  const endText = el('div', 'menu-text', end);
  const endButtons = el('div', 'buttons', end);
  const respawnBtn = el('button', 'btn primary', endButtons);
  respawnBtn.textContent = 'Respawn';

  let toastTimer = 0;
  let briefingTimer = 0;

  function showToast(text, seconds = 3) {
    toast.textContent = text;
    toast.classList.add('show');
    toastTimer = seconds;
  }

  function showBriefing(title, text, seconds = 7) {
    briefingTitle.textContent = title;
    briefingText.textContent = text;
    briefing.classList.add('show');
    briefingTimer = seconds;
  }

  function drawMinimap(state) {
    const size = minimap.width;
    const scale = size / CITY.size;
    const toMap = (v) => (v + CITY.half) * scale;
    mapCtx.fillStyle = '#10141c';
    mapCtx.fillRect(0, 0, size, size);
    // Roads.
    mapCtx.fillStyle = '#3a4150';
    for (const c of state.centres) {
      const p = toMap(c);
      mapCtx.fillRect(p - (CITY.road / 2) * scale, 0, CITY.road * scale, size);
      mapCtx.fillRect(0, p - (CITY.road / 2) * scale, size, CITY.road * scale);
    }
    // Water border.
    mapCtx.strokeStyle = '#1b6f8e';
    mapCtx.lineWidth = 4;
    mapCtx.strokeRect(2, 2, size - 4, size - 4);
    // Mission marker.
    if (state.marker) {
      const mx = toMap(state.marker.x);
      const mz = toMap(state.marker.z);
      const pulse = 5 + Math.sin(state.time * 5) * 1.5;
      mapCtx.fillStyle = '#ffd23d';
      mapCtx.beginPath();
      mapCtx.arc(mx, mz, pulse, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // Shops.
    mapCtx.fillStyle = '#2fe8ff';
    for (const shop of state.shops) {
      mapCtx.fillRect(toMap(shop.x) - 2, toMap(shop.z) - 2, 4, 4);
    }
    // Police.
    mapCtx.fillStyle = '#4d8dff';
    for (const cop of state.police) {
      mapCtx.beginPath();
      mapCtx.arc(toMap(cop.x), toMap(cop.z), 3, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // Player arrow.
    const px = toMap(state.player.x);
    const pz = toMap(state.player.z);
    mapCtx.save();
    mapCtx.translate(px, pz);
    mapCtx.rotate(state.player.heading);
    mapCtx.fillStyle = '#ff3d8a';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -7);
    mapCtx.lineTo(5, 6);
    mapCtx.lineTo(-5, 6);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
    void FONT;
  }

  function update(state, dt) {
    healthFill.style.width = `${Math.max(0, Math.min(100, state.health))}%`;
    healthFill.style.background = state.health < 30 ? '#e5534b' : '#4fc36b';
    ammoText.textContent = `Ammo ${state.ammo} / ${state.magazine}`;
    moneyText.textContent = `$${state.money}`;
    wantedText.textContent = '★'.repeat(state.wanted) + '☆'.repeat(Math.max(0, 5 - state.wanted));
    wantedText.style.color = state.wanted > 0 ? '#ffd23d' : '#5a6474';
    const hours = Math.floor(state.clock) % 24;
    const minutes = Math.floor((state.clock % 1) * 60);
    clockText.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    objectiveTitle.textContent = state.missionTitle;
    objectiveText.textContent = state.objective;
    timerText.textContent = state.timer > 0 ? `⏱ ${Math.ceil(state.timer)}s` : '';
    speedBox.style.display = state.inCar ? 'block' : 'none';
    speedText.textContent = String(Math.round(Math.abs(state.speed) * 3.6));
    crosshair.style.display = state.inCar ? 'none' : 'block';
    interactHint.textContent = state.hint || '';
    interactHint.style.display = state.hint ? 'block' : 'none';
    vignette.style.opacity = state.damageFlash > 0 ? String(Math.min(0.55, state.damageFlash)) : '0';
    drawMinimap(state);
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) toast.classList.remove('show');
    }
    if (briefingTimer > 0) {
      briefingTimer -= dt;
      if (briefingTimer <= 0) briefing.classList.remove('show');
    }
  }

  return {
    update,
    showToast,
    /** Hide any toast/briefing left over from a simulated run (used by shots). */
    clearToasts() {
      toast.classList.remove('show');
      toastTimer = 0;
    },
    showBriefing,
    setTitleVisible(v) { title.style.display = v ? 'flex' : 'none'; },
    setPauseVisible(v) { pause.style.display = v ? 'flex' : 'none'; },
    setEndVisible(v, heading, text) {
      end.style.display = v ? 'flex' : 'none';
      if (v) { endTitle.textContent = heading; endText.textContent = text; }
    },
    setHudVisible(v) { hud.style.display = v ? 'block' : 'none'; },
    onStart: (fn) => startBtn.addEventListener('click', fn),
    onContinue: (fn) => continueBtn.addEventListener('click', fn),
    onResume: (fn) => resumeBtn.addEventListener('click', fn),
    onSave: (fn) => saveBtn.addEventListener('click', fn),
    onQuit: (fn) => quitBtn.addEventListener('click', fn),
    onRespawn: (fn) => respawnBtn.addEventListener('click', fn),
    setContinueEnabled(v) { continueBtn.disabled = !v; },
  };
}
