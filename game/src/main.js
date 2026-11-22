// PALM VERGE — Neon Heat: boot and the one loop. The world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one); input is read
// every frame, the simulation steps, and the renderer paints what is there.
// Screens: title, play, paused, busted/wasted. ?shot=start|play|drive|mission
// (with &seed=N) stages that scene for a screenshot instead of running the loop.

import * as THREE from '../vendor/three.module.min.js';
import { CITY, PLAYER, WANTED, SHOP, PALETTE, SEED, SAVE_KEY } from './config.js';
import { createRandom, range, pick } from './random.js';
import { buildCity, resolveCollisions } from './city.js';
import { createCar, stepCar, TrafficSystem } from './vehicles.js';
import { createPerson, animatePerson, PedestrianSystem, EnemySystem } from './actors.js';
import { MissionTracker, MISSION_DEFS } from './missions.js';
import { createInput, ACTION_INTERACT, ACTION_PUNCH, ACTION_JUMP, ACTION_PAUSE, ACTION_CONFIRM, ACTION_MUTE, ACTION_RELOAD, ACTION_SHOOT } from './input.js';
import { createHud } from './hud.js';
import { SoundBank } from './audio.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const DAY_LENGTH = 240; // real seconds per full day

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : SEED;

const canvas = document.getElementById('game');
const root = document.getElementById('ui');
const random = createRandom(seed);

// --- Renderer, scene, camera -------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
// Real shadows on the ground plane: they land as long golden-hour shade instead
// of ambiguous dark bands.
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.skyDay);
scene.fog = new THREE.Fog(PALETTE.fogDay, 60, 420);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);

// Three lights do the whole job: sky bounce, a raking sun, and a little fill so
// night streets stay readable instead of turning into a black rectangle.
const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x3a4230, 1.05);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d4, 2.1);
sun.position.set(80, 120, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -90;
sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90;
sun.shadow.camera.bottom = -90;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 400;
sun.shadow.bias = -0.0008;
sun.shadow.normalBias = 0.35;
sun.shadow.radius = 2;
scene.add(sun);
scene.add(sun.target);
const fill = new THREE.AmbientLight(0x8fa8d8, 0.35);
scene.add(fill);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- World -------------------------------------------------------------------
const city = buildCity(scene, random);
const traffic = new TrafficSystem(scene, random, city.centres, city.colliders);
const peds = new PedestrianSystem(scene, random, city.blockCentres, city.colliders);
const enemies = new EnemySystem(scene, random, city.colliders);

// Parked cars the player can steal.
const parkedCars = [];
for (let i = 0; i < 10; i += 1) {
  const road = pick(random, city.centres);
  const along = range(random, -CITY.half + 30, CITY.half - 30);
  const eastWest = random() < 0.5;
  const car = createCar(pick(random, ['sedan', 'taxi', 'van', 'sport']),
    eastWest ? along : road + CITY.road / 4,
    eastWest ? road - CITY.road / 4 : along,
    eastWest ? Math.PI / 2 : 0, random);
  scene.add(car.mesh);
  parkedCars.push(car);
}

// Mission marker and car beacon: gold columns of light.
function beaconColumn(color) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  mesh.position.y = 30;
  return mesh;
}
const markerBeacon = beaconColumn(0xffd23d);
scene.add(markerBeacon);
const carBeacon = beaconColumn(0x2fe8ff);
carBeacon.visible = false;
scene.add(carBeacon);

// --- Player ------------------------------------------------------------------
const player = createPerson('player', city.places.plaza.x, city.places.plaza.z, random);
scene.add(player.mesh);

const game = {
  screen: 'title', // title | play | pause | end
  money: PLAYER.startMoney,
  health: PLAYER.maxHealth,
  ammo: PLAYER.magazine,
  wanted: 0,
  lastCrime: -999,
  bustProgress: 0,
  clock: 9.5, // hours
  time: 0,
  inCar: null,
  missionCar: null,
  damageFlash: 0,
  lastDamage: -999,
  reloadUntil: 0,
  shootCooldown: 0,
  punchCooldown: 0,
  camYaw: Math.PI,
  camPitch: 0.32,
  endKind: null,
};

const missions = new MissionTracker();
const sound = new SoundBank();
const hud = createHud(root);
const input = createInput(canvas);

// --- Police ------------------------------------------------------------------
const policeCars = [];
function spawnPolice() {
  const wanted = game.wanted;
  while (policeCars.length < wanted) {
    const road = pick(random, city.centres);
    const car = createCar('police', road, range(random, -CITY.half + 20, CITY.half - 20), 0, random);
    // Spawn away from the player so cruisers arrive from the streets.
    for (let tries = 0; tries < 8; tries += 1) {
      const d = Math.hypot(car.x - player.x, car.z - player.z);
      if (d > 60) break;
      car.x = pick(random, city.centres);
      car.z = range(random, -CITY.half + 20, CITY.half - 20);
    }
    car.driver = 'police';
    scene.add(car.mesh);
    policeCars.push(car);
  }
  while (policeCars.length > wanted) {
    const car = policeCars.pop();
    scene.remove(car.mesh);
  }
}

function addWanted(stars) {
  if (game.wanted < 5) {
    game.wanted = Math.min(5, game.wanted + stars);
    game.lastCrime = game.time;
    spawnPolice();
  }
}

function updatePolice(dt) {
  const target = game.inCar ?? player;
  const targetSpeed = game.inCar ? Math.abs(game.inCar.speed) : Math.abs(player.speed);
  let nearest = Infinity;
  let sirenLevel = 0;
  for (const cop of policeCars) {
    const dx = target.x - cop.x;
    const dz = target.z - cop.z;
    const dist = Math.hypot(dx, dz);
    nearest = Math.min(nearest, dist);
    sirenLevel = Math.max(sirenLevel, 1 - dist / 90);
    // Pursuit steering toward the player's predicted position.
    const lead = 0.4;
    const tx = target.x + Math.sin(target.heading ?? 0) * targetSpeed * lead - cop.x;
    const tz = target.z + Math.cos(target.heading ?? 0) * targetSpeed * lead - cop.z;
    const desired = Math.atan2(tx, tz);
    let diff = desired - cop.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2.4));
    const throttle = dist > 5 ? 1 : 0.3;
    stepCar(cop, { throttle, steer }, dt, city.colliders);
    // Lightbar flash.
    const bar = cop.mesh.userData.lightbar;
    if (bar) {
      const phase = Math.sin(game.time * 10 + cop.sirenPhase) > 0;
      bar.children[0].material.color.setHex(phase ? 0xff2222 : 0x550000);
      bar.children[1].material.color.setHex(phase ? 0x000055 : 0x2266ff);
    }
    // Ram damage.
    if (dist < 2.6 && targetSpeed > 4) damagePlayer(9 * dt, false);
  }
  // Bust: a cruiser close while the player is slow fills the bust meter.
  if (game.wanted > 0 && nearest < 7 && targetSpeed < 3) {
    game.bustProgress += WANTED.bustRate * dt * (1 + game.wanted * 0.15);
    if (game.bustProgress >= 1) endGame('busted');
  } else {
    game.bustProgress = Math.max(0, game.bustProgress - dt * 0.5);
  }
  // Decay: unseen calm cools the heat.
  if (game.wanted > 0 && game.time - game.lastCrime > WANTED.decaySeconds && nearest > 40) {
    game.wanted -= 1;
    game.lastCrime = game.time;
    spawnPolice();
    if (game.wanted === 0) hud.showToast('You lost the heat.', 3);
  }
  sound.updateDriving(game.inCar ? game.inCar.speed : 0, game.wanted > 0 ? sirenLevel : 0);
}

// --- Damage, death, respawn ----------------------------------------------------
function damagePlayer(amount, fromEnemy) {
  if (game.screen !== 'play') return;
  game.health -= amount;
  game.damageFlash = 0.5;
  game.lastDamage = game.time;
  if (fromEnemy) sound.hit();
  if (game.health <= 0) endGame('wasted');
}

function endGame(kind) {
  game.screen = 'end';
  game.endKind = kind;
  game.inCar = null;
  sound.busted();
  const fine = Math.floor(game.money * (kind === 'busted' ? 0.15 : 0.1));
  game.money -= fine;
  hud.setEndVisible(true, kind === 'busted' ? 'BUSTED' : 'WASTED',
    kind === 'busted'
      ? `The Verge City police took you in. Fine paid: $${fine}.`
      : `Rook went down in the neon. Hospital bill: $${fine}.`);
  hud.setHudVisible(false);
  saveGame(serialize());
}

function respawn() {
  game.health = PLAYER.maxHealth;
  game.wanted = 0;
  game.bustProgress = 0;
  game.ammo = PLAYER.magazine;
  spawnPolice();
  player.x = city.places.plaza.x;
  player.z = city.places.plaza.z;
  player.dead = false;
  player.health = 100;
  if (game.inCar) { game.inCar.driver = null; game.inCar = null; }
  game.screen = 'play';
  hud.setEndVisible(false);
  hud.setHudVisible(true);
  hud.showToast('Back on the street.', 3);
}

function serialize() {
  return {
    money: game.money,
    health: game.health,
    mission: missions.serialize(),
    x: player.x,
    z: player.z,
    clock: game.clock,
    savedAt: new Date().toISOString(),
  };
}

function applySave(data) {
  game.money = data.money ?? PLAYER.startMoney;
  game.health = data.health ?? PLAYER.maxHealth;
  player.x = data.x ?? city.places.plaza.x;
  player.z = data.z ?? city.places.plaza.z;
  game.clock = data.clock ?? 9.5;
  missions.restore(data.mission);
  startCurrentMission();
}

// --- Missions ------------------------------------------------------------------
function startCurrentMission() {
  const def = missions.current();
  if (!def) return;
  missions.startMission();
  // Spawn the mission car and the rival gunmen.
  if (def.carKind) {
    const spot = def.carKind === 'truck' ? city.places.marina : city.places.plaza;
    const car = createCar(def.carKind, spot.x + 6, spot.z + 4, 0, random);
    scene.add(car.mesh);
    game.missionCar = car;
    carBeacon.visible = true;
    carBeacon.position.set(car.x, 30, car.z);
  }
  if (def.type === 'fight') {
    for (let i = 0; i < def.enemies; i += 1) {
      enemies.spawn(city.places.plaza.x + range(random, -14, 14), city.places.plaza.z + range(random, -14, 14));
    }
  }
  hud.showBriefing(`${def.title} — ${def.contact}`, def.briefing, 8);
}

function missionContext() {
  return {
    player,
    inCar: game.inCar,
    car: game.inCar,
    missionCar: game.missionCar,
    wanted: game.wanted,
    enemiesAlive: enemies.aliveCount(),
    reached(place) {
      const spot = city.places[place];
      if (!spot) return false;
      const at = game.inCar ?? player;
      return Math.hypot(at.x - spot.x, at.z - spot.z) < 7;
    },
  };
}

function handleMissionEvent(event) {
  if (!event) return;
  if (event.type === 'pickup') {
    hud.showToast('Package secured — get it to the hideout. Clock is running.', 4);
    sound.pickup();
    return;
  }
  if (event.type === 'timeout') {
    hud.showToast('You missed the window. The package is back at the marina — go again.', 4);
    return;
  }
  game.money += event.reward;
  sound.cash();
  if (event.type === 'story-complete') {
    hud.showBriefing('Story complete', 'The Neon Syndicate owns Verge City — and so do you. Free roam: steal, race the traffic, dodge the heat.', 10);
    hud.showToast(`Story complete! Bonus $${event.reward}.`, 5);
  } else {
    sound.mission();
    hud.showToast(`Job done: +$${event.reward}`, 4);
    if (event.next) {
      if (game.missionCar) {
        // Retiring the job car: never leave the player "inside" a car that no
        // longer exists. Eject them onto the kerb first.
        if (game.inCar === game.missionCar) exitCar();
        scene.remove(game.missionCar.mesh);
        game.missionCar = null;
        carBeacon.visible = false;
      }
      startCurrentMission();
    }
  }
  saveGame(serialize());
}

// --- Player actions --------------------------------------------------------------
function nearestCar(maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const car of [...parkedCars, ...traffic.cars, ...policeCars, ...(game.missionCar ? [game.missionCar] : [])]) {
    if (car === game.inCar) continue;
    const d = Math.hypot(car.x - player.x, car.z - player.z);
    if (d < bestDist) { best = car; bestDist = d; }
  }
  return best;
}

function nearestShop(maxDist) {
  let best = null;
  let bestDist = maxDist;
  for (const shop of city.shops) {
    const d = Math.hypot(shop.x - player.x, shop.z - player.z);
    if (d < bestDist) { best = shop; bestDist = d; }
  }
  return best;
}

function exitCar() {
  const car = game.inCar;
  if (!car) return;
  car.driver = null;
  car.speed = 0;
  game.inCar = null;
  player.x = car.x + Math.sin(car.heading + Math.PI / 2) * 2.2;
  player.z = car.z + Math.cos(car.heading + Math.PI / 2) * 2.2;
  player.heading = car.heading;
  resolveCollisions(player, city.colliders);
  player.mesh.visible = true;
}

function interact() {
  if (game.inCar) {
    exitCar();
    sound.door();
    return;
  }
  const shop = nearestShop(4);
  if (shop) {
    if (shop.kind === 'ammo' && game.money >= SHOP.ammoPrice) {
      game.money -= SHOP.ammoPrice;
      game.ammo = PLAYER.magazine;
      hud.showToast('Ammo restocked.', 2);
      sound.pickup();
    } else if (shop.kind === 'health' && game.money >= SHOP.healthPrice) {
      game.money -= SHOP.healthPrice;
      game.health = PLAYER.maxHealth;
      hud.showToast('Patched up.', 2);
      sound.pickup();
    } else if (shop.kind === 'repair') {
      hud.showToast('Repairs need a car — bring one to the garage.', 3);
    } else {
      hud.showToast('Not enough cash.', 2);
    }
    return;
  }
  const car = nearestCar(4.5);
  if (car) {
    game.inCar = car;
    car.driver = 'player';
    sound.door();
    if (car.driver === 'traffic') {
      // Carjacking traffic: the driver bails, the heat notices.
      car.driver = 'player';
      addWanted(1);
      hud.showToast('Carjacked! The heat is on.', 3);
    } else if (car.kind === 'police') {
      addWanted(1);
    } else if (car !== game.missionCar) {
      addWanted(1);
      hud.showToast('Stolen. Keep moving.', 3);
    }
  }
}

function punch() {
  if (game.punchCooldown > 0 || game.inCar) return;
  game.punchCooldown = PLAYER.punchCooldown;
  sound.punch();
  player.mesh.userData.armR.rotation.x = -1.6;
  const fx = Math.sin(player.heading);
  const fz = Math.cos(player.heading);
  for (const enemy of enemies.enemies) {
    if (enemy.dead) continue;
    const dx = enemy.x - player.x;
    const dz = enemy.z - player.z;
    if (Math.hypot(dx, dz) < PLAYER.punchRange && (dx * fx + dz * fz) > 0) {
      enemy.health -= PLAYER.punchDamage;
      if (enemy.health <= 0) killEnemy(enemy);
    }
  }
}

function killEnemy(enemy) {
  enemy.dead = true;
  enemy.mesh.rotation.x = Math.PI / 2;
  enemy.mesh.position.y = 0.4;
  game.money += 25;
  hud.showToast('Rival down: +$25', 2);
}

function shoot() {
  if (game.shootCooldown > 0 || game.inCar) return;
  if (game.time < game.reloadUntil) return;
  if (game.ammo <= 0) {
    game.reloadUntil = game.time + PLAYER.reloadTime;
    hud.showToast('Reloading…', 1.5);
    return;
  }
  game.shootCooldown = PLAYER.gunCooldown;
  game.ammo -= 1;
  sound.shoot();
  // Ray from the camera through the crosshair.
  const origin = new THREE.Vector3();
  camera.getWorldPosition(origin);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  let bestT = PLAYER.gunRange;
  let hitEnemy = null;
  let hitPed = null;
  let hitCar = null;
  const testSphere = (x, y, z, r) => {
    const ox = x - origin.x, oy = y - origin.y, oz = z - origin.z;
    const t = ox * dir.x + oy * dir.y + oz * dir.z;
    if (t < 0 || t > bestT) return false;
    const px = origin.x + dir.x * t - x;
    const py = origin.y + dir.y * t - y;
    const pz = origin.z + dir.z * t - z;
    if (px * px + py * py + pz * pz > r * r) return false;
    bestT = t;
    return true;
  };
  for (const enemy of enemies.enemies) {
    if (!enemy.dead && testSphere(enemy.x, 1.1, enemy.z, 0.8)) { hitEnemy = enemy; hitPed = null; hitCar = null; }
  }
  for (const ped of peds.peds) {
    if (!ped.dead && testSphere(ped.x, 1.1, ped.z, 0.7)) { hitPed = ped; hitEnemy = null; hitCar = null; }
  }
  for (const car of [...parkedCars, ...traffic.cars, ...policeCars]) {
    if (testSphere(car.x, 0.8, car.z, 1.6)) { hitCar = car; hitEnemy = null; hitPed = null; }
  }
  if (hitEnemy) {
    hitEnemy.health -= PLAYER.gunDamage;
    if (hitEnemy.health <= 0) killEnemy(hitEnemy);
  } else if (hitPed) {
    hitPed.dead = true;
    hitPed.mesh.rotation.x = Math.PI / 2;
    hitPed.mesh.position.y = 0.4;
    addWanted(1);
    hud.showToast('Civilian down. The heat rises.', 3);
  } else if (hitCar) {
    hitCar.health -= PLAYER.gunDamage;
    if (hitCar.health <= 0) {
      hitCar.health = 100;
      hitCar.speed = 0;
      hud.showToast('Car disabled.', 2);
    }
  }
  if (game.ammo === 0) game.reloadUntil = game.time + PLAYER.reloadTime;
  addWanted(0); // firing draws attention but is not itself a star
  game.lastCrime = game.time;
}

// --- Simulation step -------------------------------------------------------------
function step(dt) {
  game.time += dt;
  game.clock = (game.clock + dt / DAY_LENGTH * 24) % 24;
  game.damageFlash = Math.max(0, game.damageFlash - dt * 1.4);
  game.shootCooldown -= dt;
  game.punchCooldown -= dt;
  if (game.time >= game.reloadUntil && game.ammo === 0) game.ammo = PLAYER.magazine;
  // Slow health regen after 8 calm seconds.
  if (game.time - game.lastDamage > 8 && game.health < PLAYER.maxHealth) {
    game.health = Math.min(PLAYER.maxHealth, game.health + dt * 4);
  }

  const actions = input.takeActions();
  if (actions & ACTION_MUTE) {
    sound.setMuted(!sound.muted);
    hud.showToast(sound.muted ? 'Muted.' : 'Sound on.', 2);
  }
  if (actions & ACTION_PAUSE) {
    if (game.screen === 'play') { game.screen = 'pause'; hud.setPauseVisible(true); }
    else if (game.screen === 'pause') { game.screen = 'play'; hud.setPauseVisible(false); }
  }
  if (game.screen !== 'play') return;

  if (actions & ACTION_INTERACT) interact();
  if (actions & ACTION_PUNCH) punch();
  if (actions & ACTION_RELOAD) game.reloadUntil = game.time + PLAYER.reloadTime;
  if ((actions & ACTION_SHOOT) || (input.mouseDown && game.shootCooldown <= 0)) shoot();

  const axes = input.axes();
  const look = input.takeLook();
  game.camYaw -= look.x * 0.0032;
  game.camPitch = Math.max(-0.1, Math.min(1.1, game.camPitch + look.y * 0.0032));

  if (game.inCar) {
    const car = game.inCar;
    const brake = axes.throttle < 0 && car.speed > 1;
    stepCar(car, { throttle: axes.throttle, steer: -axes.strafe }, dt, city.colliders);
    if (brake && car.speed > 0) car.speed = Math.max(0, car.speed - 20 * dt);
    player.x = car.x;
    player.z = car.z;
    player.heading = car.heading;
    player.speed = car.speed;
    player.mesh.visible = false;
    // Run over pedestrians and rivals.
    for (const ped of peds.peds) {
      if (!ped.dead && Math.hypot(ped.x - car.x, ped.z - car.z) < 1.4 && Math.abs(car.speed) > 3) {
        ped.dead = true;
        ped.mesh.rotation.x = Math.PI / 2;
        ped.mesh.position.y = 0.4;
        addWanted(1);
        sound.hit();
        hud.showToast('Pedestrian down. The heat rises.', 3);
      }
    }
    for (const enemy of enemies.enemies) {
      if (!enemy.dead && Math.hypot(enemy.x - car.x, enemy.z - car.z) < 1.4 && Math.abs(car.speed) > 3) {
        killEnemy(enemy);
      }
    }
    // Repair shop: park at the repair shop to fix the car.
    const repair = city.shops.find((s) => s.kind === 'repair');
    if (repair && Math.hypot(car.x - repair.x, car.z - repair.z) < 5 && car.health < 100 && game.money >= SHOP.repairPrice) {
      game.money -= SHOP.repairPrice;
      car.health = 100;
      hud.showToast('Car repaired.', 2);
      sound.pickup();
    }
  } else {
    player.mesh.visible = true;
    const speed = axes.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const sin = Math.sin(game.camYaw);
    const cos = Math.cos(game.camYaw);
    // Camera forward is (sin yaw, cos yaw); right is (-cos yaw, sin yaw).
    let mx = sin * axes.throttle - cos * axes.strafe;
    let mz = cos * axes.throttle + sin * axes.strafe;
    const len = Math.hypot(mx, mz);
    if (len > 0.01) {
      mx /= len; mz /= len;
      player.heading = Math.atan2(mx, mz);
      player.speed = speed;
      player.x += mx * speed * dt;
      player.z += mz * speed * dt;
      resolveCollisions(player, city.colliders);
    } else {
      player.speed = 0;
    }
    // Jump.
    if ((actions & ACTION_JUMP) && player.y <= 0.01) player.vy = PLAYER.jumpVelocity;
    if (player.y > 0 || player.vy > 0) {
      player.y += player.vy * dt;
      player.vy -= PLAYER.gravity * dt;
      if (player.y <= 0) { player.y = 0; player.vy = 0; }
    }
    animatePerson(player, dt);
  }

  // Traffic, pedestrians, enemies, police.
  const danger = game.shootCooldown > 0.15 ? { x: player.x, z: player.z, radius: 14 } : null;
  traffic.update(dt, game.inCar ?? player);
  peds.update(dt, danger);
  const shots = enemies.update(dt, game.inCar ?? player, null);
  for (const shotInfo of shots) {
    const hitChance = Math.max(0.15, 0.75 - shotInfo.dist / 60);
    if (random() < hitChance) damagePlayer(7, true);
    sound.shoot();
  }
  updatePolice(dt);

  // Missions.
  handleMissionEvent(missions.update(missionContext()));

  // Marker beacons.
  const target = missions.markerTarget(city.places, game.missionCar);
  if (target) {
    markerBeacon.visible = true;
    markerBeacon.position.set(target.x, 30, target.z);
  } else {
    markerBeacon.visible = false;
  }
  if (game.missionCar) carBeacon.position.set(game.missionCar.x, 30, game.missionCar.z);

  // Interact hint.
  let hint = '';
  if (game.inCar) hint = 'E — exit car';
  else if (nearestShop(4)) hint = 'E — shop';
  else if (nearestCar(4.5)) hint = 'E — enter car';
  game.hint = hint;

  // Day/night.
  updateSky();
}

function updateSky() {
  const h = game.clock;
  // Dayness: 0 at midnight, 1 at noon. Sunrise ~6, sunset ~19.
  const dayness = Math.max(0, Math.min(1, Math.sin(((h - 6) / 13) * Math.PI)));
  // Golden hour: strongest just before sunset and again just after sunrise.
  const duskness = Math.max(0, 1 - Math.abs(h - 18.6) / 2.4) * 0.85
    + Math.max(0, 1 - Math.abs(h - 6.6) / 2.0) * 0.55;
  const sky = new THREE.Color(PALETTE.skyNight).lerp(new THREE.Color(PALETTE.skyDay), dayness);
  sky.lerp(new THREE.Color(PALETTE.skyDusk), Math.min(0.75, duskness));
  scene.background.copy(sky);
  scene.fog.color.copy(sky).lerp(new THREE.Color(PALETTE.fogNight), 1 - dayness);
  // Night is dim and blue, never black: you can still read the streets.
  hemi.intensity = 0.55 + dayness * 0.7;
  sun.intensity = 0.22 + dayness * 1.95;
  fill.intensity = 0.42 - dayness * 0.12;
  // Golden hour warms the bounce light and the sun itself.
  const warmth = Math.min(1, duskness);
  hemi.color.setHex(0xcfe8ff).lerp(new THREE.Color(0xffc9a0), warmth * 0.85);
  sun.color.setHex(0xfff0d4).lerp(new THREE.Color(0xff9d5c), warmth * 0.8);
  fill.color.setHex(0x8fa8d8).lerp(new THREE.Color(0xffb98a), warmth * 0.5);
  renderer.toneMappingExposure = 1.16 + warmth * 0.1;
  const angle = ((h - 6) / 13) * Math.PI;
  // Keep the shadow frustum centred on the action.
  const focus = game.inCar ?? player;
  sun.target.position.set(focus.x, 0, focus.z);
  sun.target.updateMatrixWorld();
  sun.position.set(focus.x + Math.cos(angle) * 150, Math.max(40, Math.sin(angle) * 160), focus.z + 70);
}

// --- Camera ----------------------------------------------------------------------
function updateCamera(dt) {
  if (game.screen === 'title') {
    // Slow orbit around the landmark tower behind the title screen.
    const t = game.time * 0.08;
    camera.position.set(Math.sin(t) * 92, 36, Math.cos(t) * 92);
    camera.lookAt(city.places.tower.x, 24, city.places.tower.z);
    return;
  }
  const focus = game.inCar ?? player;
  const height = game.inCar ? 4.0 : 2.5;
  const yaw = game.inCar ? game.inCar.heading + Math.PI : game.camYaw;
  const pitch = game.inCar ? 0.3 : Math.max(0.14, game.camPitch);
  // Pull the boom in when it would end up inside a building, so the view never
  // fills with wall geometry when the player stands with their back to a block.
  let dist = game.inCar ? 10.5 : 6.6;
  for (let i = 0; i < 9; i += 1) {
    const px = focus.x - Math.sin(yaw) * Math.cos(pitch) * dist;
    const pz = focus.z - Math.cos(yaw) * Math.cos(pitch) * dist;
    let blocked = false;
    for (const box of city.colliders) {
      if (px > box.minX - 0.9 && px < box.maxX + 0.9 && pz > box.minZ - 0.9 && pz < box.maxZ + 0.9) { blocked = true; break; }
    }
    if (!blocked) break;
    dist *= 0.7;
  }
  const tx = focus.x - Math.sin(yaw) * Math.cos(pitch) * dist;
  const tz = focus.z - Math.cos(yaw) * Math.cos(pitch) * dist;
  const ty = (focus.y ?? 0) + height + Math.sin(pitch) * dist * 0.4;
  const k = Math.min(1, dt * 9);
  camera.position.x += (tx - camera.position.x) * k;
  camera.position.y += (ty - camera.position.y) * k;
  camera.position.z += (tz - camera.position.z) * k;
  camera.lookAt(focus.x, (focus.y ?? 0) + 1.6, focus.z);
}

// --- HUD state ---------------------------------------------------------------------
function hudState() {
  const def = missions.current();
  const target = missions.markerTarget(city.places, game.missionCar);
  return {
    health: game.health,
    ammo: game.ammo,
    magazine: PLAYER.magazine,
    money: game.money,
    wanted: game.wanted,
    clock: game.clock,
    missionTitle: def ? def.title : 'Free roam',
    objective: missions.objectiveText(),
    timer: def?.type === 'timed-deliver' ? missions.timer : 0,
    inCar: !!game.inCar,
    speed: game.inCar ? game.inCar.speed : 0,
    hint: game.hint || '',
    damageFlash: game.damageFlash,
    time: game.time,
    marker: target,
    shops: city.shops,
    police: policeCars,
    centres: city.centres,
    player: { x: player.x, z: player.z, heading: game.inCar ? game.inCar.heading : player.heading },
  };
}

// --- Screens -----------------------------------------------------------------------
hud.setContinueEnabled(hasSave());
hud.onStart(() => {
  sound.ensure();
  game.screen = 'play';
  hud.setTitleVisible(false);
  hud.setHudVisible(true);
  missions.restore(null);
  startCurrentMission();
});
hud.onContinue(() => {
  sound.ensure();
  const data = loadGame();
  game.screen = 'play';
  hud.setTitleVisible(false);
  hud.setHudVisible(true);
  if (data) applySave(data);
  else startCurrentMission();
  hud.showToast('Welcome back to Verge City.', 3);
});
hud.onResume(() => { game.screen = 'play'; hud.setPauseVisible(false); });
hud.onSave(() => {
  const ok = saveGame(serialize());
  hud.showToast(ok ? 'Game saved.' : 'Save unavailable in this browser.', 3);
});
hud.onQuit(() => {
  game.screen = 'title';
  hud.setPauseVisible(false);
  hud.setHudVisible(false);
  hud.setTitleVisible(true);
  hud.setContinueEnabled(hasSave());
});
hud.onRespawn(() => respawn());

// --- Main loop -----------------------------------------------------------------------
if (shot) {
  const num = (key) => {
    const raw = params.get(key);
    if (raw === null) return undefined;
    const v = Number.parseFloat(raw);
    return Number.isFinite(v) ? v : undefined;
  };
  stageShot(shot, {
    game, player, missions, city, traffic, peds, enemies, policeCars,
    parkedCars, startCurrentMission, hud, sound, spawnPolice, addWanted,
    step, updateCamera, hudState, renderer, scene, camera,
  }, { x: num('x'), z: num('z'), yaw: num('yaw'), pitch: num('pitch'), hour: num('hour'), wanted: num('wanted') });
} else {
  hud.setTitleVisible(true);
  hud.setHudVisible(false);
  let accumulator = 0;
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    accumulator += frameDt;
    while (accumulator >= 1 / 60) {
      step(1 / 60);
      accumulator -= 1 / 60;
    }
    city.update(game.time);
    updateCamera(frameDt);
    hud.update(hudState(), frameDt);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

// Headless QA hook: `?test=1` exposes a deterministic stepper so the whole
// simulation can be exercised (missions, police, combat, save) without waiting
// on a GPU in software rendering. Inert in normal play and in screenshots.
if (params.get('test') === '1') {
  window.__pv = {
    state: () => ({
      screen: game.screen, mission: missions.current()?.id ?? 'done', stage: missions.stage,
      index: missions.index, health: Math.round(game.health), money: game.money,
      wanted: game.wanted, inCar: !!game.inCar, clock: Number(game.clock.toFixed(2)),
      x: Number(player.x.toFixed(2)), z: Number(player.z.toFixed(2)),
      peds: peds.peds.length, traffic: traffic.cars.length, police: policeCars.length,
      enemies: enemies.enemies.filter((e) => !e.dead).length,
      endKind: game.endKind, objective: missions.objectiveText(), ourAmmo: game.ammo,
      missionCar: game.missionCar ? { x: Number(game.missionCar.x.toFixed(2)), z: Number(game.missionCar.z.toFixed(2)) } : null,
      marker: city.places && missions.markerTarget(city.places, game.missionCar),
    }),
    /** Run N fixed steps with optional synthetic input {throttle, strafe, run, actions}. */
    step: (n, synthetic) => {
      const mask = synthetic?.actions ?? 0;
      if (synthetic) {
        input.setOverride({ throttle: synthetic.throttle ?? 0, strafe: synthetic.strafe ?? 0, run: !!synthetic.run });
        if (mask) input.pushActions(mask);
      }
      for (let i = 0; i < n; i += 1) {
        if (i === 0 && mask) input.pushActions(mask);
        step(1 / 60);
      }
      input.setOverride(null);
      city.update(game.time);
      return window.__pv.state();
    },
    actions: { INTERACT: ACTION_INTERACT, PUNCH: ACTION_PUNCH, JUMP: ACTION_JUMP, SHOOT: ACTION_SHOOT, CONFIRM: ACTION_CONFIRM },
    teleport: (x, z) => { player.x = x; player.z = z; if (game.inCar) { game.inCar.x = x; game.inCar.z = z; } },
    place: (name) => { const p = city.places[name]; if (p) { player.x = p.x; player.z = p.z; } return p; },
    setWanted: (n) => { game.wanted = n; spawnPolice(); },
    giveCar: (kind = 'sport') => {
      const car = createCar(kind, player.x + 2, player.z, 0, random);
      scene.add(car.mesh); parkedCars.push(car); return { x: car.x, z: car.z };
    },
    grantAmmo: (n) => { game.ammo = n; },
    save: () => saveGame(serialize()),
    load: () => loadGame(),
    serialize: () => serialize(),
    // QA helpers for the story test: clear heat the way time does, and clear
    // the rival gunmen the way combat does.
    clearWanted: () => { game.wanted = 0; game.lastCrime = -999; spawnPolice(); return window.__pv.state(); },
    killEnemies: () => { for (const e of enemies.enemies) if (!e.dead) killEnemy(e); return window.__pv.state(); },
    startStory: () => { startCurrentMission(); },
    jumpToMission: (i) => { missions.index = i; missions.done = false; if (game.missionCar) { scene.remove(game.missionCar.mesh); game.missionCar = null; } startCurrentMission(); return missions.current()?.id; },
    nearestCarInfo: () => {
      const car = nearestCar(6);
      return car ? { kind: car.kind, x: Number(car.x.toFixed(2)), z: Number(car.z.toFixed(2)), driver: car.driver ?? null, isMission: car === game.missionCar, dist: Number(Math.hypot(car.x - player.x, car.z - player.z).toFixed(2)) } : null;
    },
    playerPos: () => ({ x: player.x, z: player.z }),
  };
}

export { SAVE_KEY, MISSION_DEFS };
