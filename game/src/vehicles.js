// Cars: low-poly models built from boxes (body, cabin, wheels, lights), an
// arcade driving model (throttle, steering, drift grip), and the traffic AI
// that keeps Verge City's avenues busy. Traffic follows the road grid with
// right-hand lanes and turns at intersections, all from the seeded stream.

import * as THREE from '../vendor/three.module.min.js';
import { CAR, CITY, TRAFFIC } from './config.js';
import { range, pick } from './random.js';
import { resolveCollisions } from './city.js';

const BODY_COLORS = {
  sedan: [0x8a94a6, 0x5a6a8a, 0x7a5a4a, 0x4a7a5a],
  taxi: [0xf2c94c],
  sport: [0xff3d8a, 0x2fe8ff, 0xffd23d, 0xff5722],
  police: [0x2456d8],
  van: [0xd8d8d8, 0xb8c4d0],
  truck: [0x3a3f4a],
};

/** Squash the top face of a box in X/Z, giving cars a tapered greenhouse. */
function taper(geo, topX, topZ) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    if (pos.getY(i) > 0) {
      pos.setX(i, pos.getX(i) * topX);
      pos.setZ(i, pos.getZ(i) * topZ);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

const cabinFrontZ = (length) => length * 0.13;

export function createCarMesh(kind, random) {
  const group = new THREE.Group();
  const bodyColor = pick(random, BODY_COLORS[kind] ?? BODY_COLORS.sedan);
  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14181f });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });

  const isTruck = kind === 'truck';
  const isVan = kind === 'van';
  const length = isTruck ? 7.4 : isVan ? 5.6 : kind === 'sport' ? 4.6 : 4.4;
  const width = isTruck ? 2.6 : 2.0;
  const bodyH = isTruck ? 2.2 : 0.85;

  // Lower body is a slightly tapered slab; a bonnet slab in front keeps the
  // silhouette car-like rather than box-like.
  const bodyGeo = new THREE.BoxGeometry(width, bodyH, length);
  taper(bodyGeo, 0.86, 0.94);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = bodyH / 2 + 0.35;
  group.add(body);

  const cabinH = isVan || isTruck ? bodyH * 0.85 : 0.72;
  const cabinGeo = new THREE.BoxGeometry(width * 0.84, cabinH, length * 0.46);
  taper(cabinGeo, 0.8, 0.72);
  const cabin = new THREE.Mesh(cabinGeo, isVan || isTruck ? bodyMat : glassMat);
  cabin.position.set(0, bodyH + 0.35 + cabinH / 2 - 0.06, isTruck ? -length * 0.2 : -length * 0.06);
  group.add(cabin);
  // Roof panel over the glass: reads as a hardtop from the chase camera.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(width * 0.72, 0.14, length * 0.34), bodyMat);
  roof.position.set(0, cabin.position.y + cabinH / 2 + 0.05, cabin.position.z);
  group.add(roof);

  if (!isTruck) {
    // Wing mirrors and bumpers for silhouette detail.
    const mirrorMat = bodyMat;
    for (const side of [-1, 1]) {
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.1), mirrorMat);
      mirror.position.set(side * (width / 2 + 0.08), bodyH + 0.5, cabinFrontZ(length));
      group.add(mirror);
    }
  }
  const bumperGeo = new THREE.BoxGeometry(width * 0.98, 0.22, 0.3);
  const bumperMat = new THREE.MeshLambertMaterial({ color: 0x2a2f38 });
  for (const end of [1, -1]) {
    const bumper = new THREE.Mesh(bumperGeo, bumperMat);
    bumper.position.set(0, 0.5, end * (length / 2 + 0.04));
    group.add(bumper);
  }

  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheels = [];
  const wheelY = 0.36;
  const wheelX = width / 2 - 0.1;
  const wheelZ = length / 2 - 1.0;
  for (const [x, z] of [[-wheelX, wheelZ], [wheelX, wheelZ], [-wheelX, -wheelZ], [wheelX, -wheelZ]]) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, wheelY, z);
    group.add(wheel);
    wheels.push(wheel);
  }

  // Headlights and tail lights.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const side of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.08), headMat);
    head.position.set(side * width * 0.32, bodyH * 0.6 + 0.35, length / 2 + 0.02);
    group.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.08), tailMat);
    tail.position.set(side * width * 0.32, bodyH * 0.6 + 0.35, -length / 2 - 0.02);
    group.add(tail);
  }

  // Police lightbar.
  let lightbar = null;
  if (kind === 'police') {
    lightbar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.3;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.x = 0.3;
    lightbar.add(red, blue);
    lightbar.position.set(0, bodyH + 1.1, -length * 0.05);
    group.add(lightbar);
  }

  // Soft blob shadow so cars read on the asphalt without shadow maps.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(width, length) * 0.62, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  shadow.scale.set(width / Math.max(width, length), length / Math.max(width, length), 1);
  group.add(shadow);

  group.traverse((part) => {
    if (part.isMesh && part.material && part.material.isMeshLambertMaterial) {
      part.castShadow = true;
      part.receiveShadow = true;
    }
  });
  group.userData = { wheels, lightbar, kind };
  return group;
}

export function createCar(kind, x, z, heading, random) {
  const mesh = createCarMesh(kind, random);
  return {
    kind,
    mesh,
    x,
    z,
    heading,
    speed: 0,
    steer: 0,
    radius: kind === 'truck' ? 1.5 : CAR.radius,
    driver: null, // 'player' | 'traffic' | 'police' | null (parked)
    health: 100,
    sirenPhase: random() * Math.PI * 2,
  };
}

/** One arcade driving step. input: { throttle: -1..1, steer: -1..1, brake: bool }. */
export function stepCar(car, input, dt, colliders) {
  const maxSpeed = car.kind === 'sport' ? CAR.maxSpeed * 1.25
    : car.kind === 'truck' ? CAR.maxSpeed * 0.7
    : CAR.maxSpeed;
  const accel = CAR.acceleration * (car.kind === 'truck' ? 0.6 : 1);

  if (input.throttle > 0) car.speed += accel * input.throttle * dt;
  else if (input.throttle < 0) {
    if (car.speed > 0.5) car.speed -= CAR.brake * dt;
    else car.speed += accel * 0.6 * input.throttle * dt;
  } else {
    car.speed -= car.speed * CAR.drag * dt;
    if (Math.abs(car.speed) < 0.05) car.speed = 0;
  }
  car.speed = Math.max(-CAR.reverseSpeed, Math.min(maxSpeed, car.speed));

  // Steering fades at speed; the car turns around its heading.
  const steerTarget = input.steer * 0.55;
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * 8);
  const turn = car.steer * CAR.turnRate * Math.min(1, Math.abs(car.speed) / 6) * Math.sign(car.speed || 1);
  car.heading += turn * dt;

  const vx = Math.sin(car.heading) * car.speed;
  const vz = Math.cos(car.heading) * car.speed;
  car.x += vx * dt;
  car.z += vz * dt;

  const hit = resolveCollisions(car, colliders);
  if (hit && Math.abs(car.speed) > 6) {
    car.speed *= 0.55; // crumple, but keep rolling
    car.health -= Math.abs(car.speed) * 0.4;
  }

  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  for (const wheel of car.mesh.userData.wheels) {
    wheel.rotation.x += (car.speed * dt) / 0.36;
  }
  return hit;
}

/** Traffic: cars cruise the grid, turning at intersections. */
export class TrafficSystem {
  constructor(scene, random, centres, colliders) {
    this.random = random;
    this.centres = centres;
    this.colliders = colliders;
    this.cars = [];
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const kind = pick(random, ['sedan', 'sedan', 'taxi', 'van']);
      const road = pick(random, centres);
      const along = range(random, -CITY.half + 20, CITY.half - 20);
      const eastWest = random() < 0.5;
      const dir = random() < 0.5 ? 1 : -1;
      const lane = CITY.road / 4;
      const x = eastWest ? along : road + lane * dir;
      const z = eastWest ? road - lane * dir : along;
      const heading = eastWest ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
      const car = createCar(kind, x, z, heading, random);
      car.driver = 'traffic';
      car.speed = TRAFFIC.speed * range(random, 0.8, 1.1);
      car.target = this.nextTarget(car);
      scene.add(car.mesh);
      this.cars.push(car);
    }
  }

  /** The next intersection point ahead of the car, with a right-hand lane offset. */
  nextTarget(car) {
    const lane = CITY.road / 4;
    const eastWest = Math.abs(Math.sin(car.heading)) > Math.abs(Math.cos(car.heading));
    const dirX = Math.sin(car.heading);
    const dirZ = Math.cos(car.heading);
    // Snap to the nearest intersection ahead on the car's road.
    const roadCoord = eastWest ? car.z : car.x;
    let best = null;
    for (const c of this.centres) {
      const ahead = eastWest ? (c - car.x) * dirX : (c - car.z) * dirZ;
      if (ahead > 4 && (best === null || ahead < best.ahead)) best = { c, ahead };
    }
    if (!best) return { x: car.x + dirX * 40, z: car.z + dirZ * 40 };
    const turn = this.random() < 0.4;
    if (turn) {
      // Turn onto the crossing road: aim at the far lane of that road.
      const turnDir = this.random() < 0.5 ? 1 : -1;
      if (eastWest) return { x: best.c + lane * turnDir, z: best.c - lane * dirX };
      return { x: best.c - lane * dirZ, z: best.c + lane * turnDir };
    }
    if (eastWest) return { x: best.c + dirX * 10, z: roadCoord - lane * dirX };
    return { x: roadCoord - lane * dirZ, z: best.c + dirZ * 10 };
  }

  update(dt, playerPos) {
    for (const car of this.cars) {
      if (car.driver !== 'traffic') continue;
      // Yield to the player when close ahead.
      const dx = playerPos.x - car.x;
      const dz = playerPos.z - car.z;
      const dist = Math.hypot(dx, dz);
      const ahead = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
      let throttle = 1;
      if (dist < 9 && ahead > 0 && ahead < 9) throttle = 0;
      // Steer toward the target point.
      const tx = car.target.x - car.x;
      const tz = car.target.z - car.z;
      const desired = Math.atan2(tx, tz);
      let diff = desired - car.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 2.2));
      stepCar(car, { throttle, steer }, dt, this.colliders);
      if (Math.hypot(tx, tz) < 5) car.target = this.nextTarget(car);
    }
  }
}
