// Screenshot scenes behind ?shot=start|play|drive|mission (with &seed=N).
// Each one stages the real game — the same city, traffic, pedestrians, HUD and
// renderer a player sees — at a chosen moment, then paints the frame twice and
// sets window.__shotReady for the capture. Same seed, same frame.

import { createCar } from './vehicles.js';
import { createRandom } from './random.js';
import { animatePerson } from './actors.js';

const SETTLE_STEPS = 60;

export function stageShot(name, ctx, opts = {}) {
  const { game, player, missions, city, hud, peds, step, updateCamera, hudState, renderer, scene, camera } = ctx;
  const shotRandom = createRandom(7);

  // Late golden hour: warm sun, neon already on, sky still bright.
  game.clock = 17.6;
  game.time = 12;
  game.health = 88;
  game.money = 1250;
  game.ammo = 9;
  game.wanted = 0;
  game.inCar = null;

  if (name === 'start') {
    game.screen = 'title';
    hud.setTitleVisible(true);
    hud.setHudVisible(false);
  } else {
    game.screen = 'play';
    hud.setTitleVisible(false);
    hud.setHudVisible(true);
    game.missionCar = null;
    missions.restore(null);
    ctx.startCurrentMission();
  }

  // QA mode: ?shot=free&x=&z=&yaw=&pitch=&hour=&wanted= frames any spot in the
  // city so staging can be checked without a browser session.
  if (name === 'free' && opts.x !== undefined) {
    player.x = opts.x;
    player.z = opts.z;
    player.heading = opts.yaw ?? 0;
    player.speed = 2.4;
    game.camYaw = opts.yaw ?? 0;
    game.camPitch = opts.pitch ?? 0.26;
    if (opts.hour !== undefined) game.clock = opts.hour;
    if (opts.wanted !== undefined) { game.wanted = opts.wanted; ctx.spawnPolice(); }
  }

  if (name === 'play') {
    // Sidewalk on the main avenue: palms, shopfronts, traffic and the tower
    // ahead. Framed from the street side so the lead character reads clearly.
    player.x = 4.5;
    player.z = -84;
    player.heading = -0.55;
    player.y = 0.02;
    player.speed = 2.6; // mid-stride, so the walk cycle is engaged
    game.camYaw = -0.55;
    game.camPitch = 0.22;
    game.clock = 17.5;
    game.health = 88;
    game.money = 1250;
    // A couple of pedestrians in frame for life.
    if (peds && peds.peds.length > 4) {
      peds.peds[0].x = player.x + 3.5;
      peds.peds[0].z = player.z - 4;
      peds.peds[0].heading = 2.2;
      peds.peds[1].x = player.x - 5;
      peds.peds[1].z = player.z - 7;
      peds.peds[1].heading = 0.4;
      peds.peds[2].x = player.x + 8;
      peds.peds[2].z = player.z - 9;
    }
  }

  if (name === 'drive') {
    // Sport car on the main avenue, cruiser closing behind, two wanted stars.
    const road = city.centres[3];
    const car = createCar('sport', -34, road - 3.4, Math.PI / 2, shotRandom);
    scene.add(car.mesh);
    car.speed = 21;
    game.inCar = car;
    player.x = car.x;
    player.z = car.z;
    game.wanted = 2;
    ctx.spawnPolice();
    if (ctx.policeCars.length > 0) {
      const cop = ctx.policeCars[0];
      cop.x = car.x - 13;
      cop.z = car.z + 1.2;
      cop.heading = Math.PI / 2;
      cop.speed = 16;
      cop.mesh.position.set(cop.x, 0, cop.z);
    }
    if (ctx.policeCars.length > 1) {
      const cop2 = ctx.policeCars[1];
      cop2.x = car.x - 30;
      cop2.z = car.z - 1;
      cop2.heading = Math.PI / 2;
      cop2.speed = 15;
    }
    game.money = 4820;
  }

  if (name === 'mission') {
    // Harbour edge at dusk: moored boats, the landmark tower behind the palms,
    // objective marker lit and a briefing on screen.
    player.x = -110;
    player.z = 160;
    player.heading = -0.66;
    player.speed = 2.4;
    game.camYaw = -0.66;
    game.camPitch = 0.18;
    game.clock = 19.2;
    game.health = 64;
    game.money = 4820;
    game.wanted = 1;
    hud.showBriefing('First Light — Marisol at the marina',
      'Marisol: "Rook. Verge City eats tourists for breakfast. The Syndicate needs a driver who keeps their head. South pier, ten minutes."', 30);
  }

  // Settle the world so traffic has moved and crowds are walking, then keep the
  // staged player exactly where we put them.
  const staged = { x: player.x, z: player.z, heading: player.heading, speed: player.speed };
  for (let i = 0; i < SETTLE_STEPS; i += 1) {
    step(1 / 60);
    player.x = staged.x;
    player.z = staged.z;
    player.heading = staged.heading;
  }
  player.speed = staged.speed;
  animatePerson(player, 0.016);
  player.mesh.position.set(player.x, 0, player.z);
  updateCamera(1);
  hud.update(hudState(), 0.016);
  if (hud.clearToasts) hud.clearToasts();
  camera.position.set(
    player.x - Math.sin(game.camYaw) * Math.cos(game.camPitch) * (game.inCar ? 10.5 : 6.6),
    (game.inCar ? 4.0 : 2.5) + Math.sin(game.camPitch) * 3,
    player.z - Math.cos(game.camYaw) * Math.cos(game.camPitch) * (game.inCar ? 10.5 : 6.6),
  );

  let painted = 0;
  function paint() {
    updateCamera(0.016);
    renderer.render(scene, camera);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}
