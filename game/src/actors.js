// People: low-poly humanoids built from boxes (torso, head, swinging arms and
// legs), the pedestrian crowd that strolls the sidewalks and flees danger, and
// rival gang members who hunt the player during missions. Everyone is a soft
// blob shadow plus a few boxes, so a crowd of dozens stays cheap.

import * as THREE from '../vendor/three.module.min.js';
import { PALETTE } from './config.js';
import { range, pick } from './random.js';
import { resolveCollisions } from './city.js';

export function createPersonMesh(shirtColor, skinColor) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const skin = new THREE.MeshLambertMaterial({ color: skinColor });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2f3a });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.08;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), skin);
  head.position.y = 1.62;
  group.add(head);
  // Face: eyes and a brow, so characters have a front from any camera angle.
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x11131a });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.02), eyeMat);
    eye.position.set(side * 0.08, 1.66, 0.18);
    group.add(eye);
  }
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.4), pants);
  cap.position.y = 1.84;
  group.add(cap);

  const armGeo = new THREE.BoxGeometry(0.16, 0.62, 0.16);
  const legGeo = new THREE.BoxGeometry(0.2, 0.72, 0.2);
  const armL = new THREE.Mesh(armGeo, shirt);
  armL.geometry.translate(0, -0.26, 0);
  armL.position.set(-0.4, 1.38, 0);
  const armR = new THREE.Mesh(armGeo, shirt);
  armR.geometry.translate(0, -0.26, 0);
  armR.position.set(0.4, 1.38, 0);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.geometry.translate(0, -0.32, 0);
  legL.position.set(-0.16, 0.72, 0);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.geometry.translate(0, -0.32, 0);
  legR.position.set(0.16, 0.72, 0);
  group.add(armL, armR, legL, legR);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 10),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  group.add(shadow);

  group.traverse((part) => {
    if (part.isMesh && part.material && part.material.isMeshLambertMaterial) part.castShadow = true;
  });
  group.userData = { armL, armR, legL, legR, head };
  return group;
}

export function createPerson(kind, x, z, random) {
  const shirt = kind === 'player' ? PALETTE.playerShirt
    : kind === 'enemy' ? 0x22262e
    : pick(random, PALETTE.pedShirts);
  const skin = kind === 'player' ? PALETTE.playerSkin : pick(random, PALETTE.skinTones);
  const mesh = createPersonMesh(shirt, skin);
  if (kind === 'player') {
    // The lead: jacket collar, a cyan high-vis stripe and a swept-back mane, so
    // the silhouette reads as "Rook" from any camera angle.
    const jacket = new THREE.MeshLambertMaterial({ color: 0x1b1f2b });
    const stripe = new THREE.MeshBasicMaterial({ color: PALETTE.neonCyan });
    const hair = new THREE.MeshLambertMaterial({ color: 0x15161c });
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.42), jacket);
    collar.position.y = 1.46;
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.1, 0.38), stripe);
    belt.position.y = 0.76;
    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.44), hair);
    mane.position.set(0, 1.8, -0.02);
    mesh.add(collar, belt, mane);
  }
  return {
    kind,
    mesh,
    x,
    z,
    y: 0,
    vy: 0,
    heading: random() * Math.PI * 2,
    speed: 0,
    radius: 0.45,
    health: kind === 'enemy' ? 60 : 100,
    walkPhase: random() * Math.PI * 2,
    state: 'walk',
    stateTime: 0,
    waypoint: null,
    shootCooldown: 0,
    dead: false,
  };
}

/** Swing the limbs for a walking cycle; amount scales with speed. */
export function animatePerson(person, dt) {
  const u = person.mesh.userData;
  const speed = Math.abs(person.speed);
  person.walkPhase += dt * (4 + speed * 1.6);
  const swing = Math.min(1, speed / 3) * 0.7;
  const s = Math.sin(person.walkPhase);
  u.legL.rotation.x = s * swing;
  u.legR.rotation.x = -s * swing;
  u.armL.rotation.x = -s * swing * 0.8;
  u.armR.rotation.x = s * swing * 0.8;
  person.mesh.position.set(person.x, person.y, person.z);
  person.mesh.rotation.y = person.heading;
}

/** Pedestrians: stroll the block perimeters, flee gunfire and speeding cars. */
export class PedestrianSystem {
  constructor(scene, random, blockCentres, colliders) {
    this.random = random;
    this.blockCentres = blockCentres;
    this.colliders = colliders;
    this.peds = [];
    for (let i = 0; i < 26; i += 1) {
      const block = pick(random, blockCentres);
      const ped = createPerson('ped', block.x + range(random, -16, 16), block.z + range(random, -16, 16), random);
      ped.waypoint = this.newWaypoint(ped);
      scene.add(ped.mesh);
      this.peds.push(ped);
    }
  }

  newWaypoint(ped) {
    const block = pick(this.random, this.blockCentres);
    return { x: block.x + range(this.random, -18, 18), z: block.z + range(this.random, -18, 18) };
  }

  /** danger: { x, z, radius } to flee from, or null. */
  update(dt, danger) {
    for (const ped of this.peds) {
      if (ped.dead) continue;
      ped.stateTime += dt;
      let target = ped.waypoint;
      let speed = 1.6;
      if (danger) {
        const dist = Math.hypot(ped.x - danger.x, ped.z - danger.z);
        if (dist < danger.radius) {
          ped.state = 'flee';
          ped.stateTime = 0;
          target = { x: ped.x + (ped.x - danger.x), z: ped.z + (ped.z - danger.z) };
          speed = 5.2;
        }
      }
      if (ped.state === 'flee') {
        speed = 5.2;
        if (ped.stateTime > 2.2) {
          ped.state = 'walk';
          ped.waypoint = this.newWaypoint(ped);
          target = ped.waypoint;
        }
      }
      const dx = target.x - ped.x;
      const dz = target.z - ped.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.2) {
        ped.waypoint = this.newWaypoint(ped);
        ped.speed = 0;
      } else {
        const desired = Math.atan2(dx, dz);
        let diff = desired - ped.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ped.heading += Math.max(-3 * dt, Math.min(3 * dt, diff));
        ped.speed = speed;
        ped.x += Math.sin(ped.heading) * speed * dt;
        ped.z += Math.cos(ped.heading) * speed * dt;
        resolveCollisions(ped, this.colliders);
      }
      animatePerson(ped, dt);
    }
  }
}

/** Rival gang members: close in on the player and fire when in range. */
export class EnemySystem {
  constructor(scene, random, colliders) {
    this.random = random;
    this.colliders = colliders;
    this.enemies = [];
  }

  spawn(x, z) {
    const enemy = createPerson('enemy', x, z, this.random);
    enemy.mesh.position.set(x, 0, z);
    this.enemies.push(enemy);
    return enemy;
  }

  clear(scene) {
    for (const enemy of this.enemies) scene.remove(enemy.mesh);
    this.enemies = [];
  }

  /** Returns shots fired this step: [{ x, z, hit }] for the main loop to resolve. */
  update(dt, playerPos, onShoot) {
    const shots = [];
    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      enemy.shootCooldown -= dt;
      const dx = playerPos.x - enemy.x;
      const dz = playerPos.z - enemy.z;
      const dist = Math.hypot(dx, dz);
      const desired = Math.atan2(dx, dz);
      let diff = desired - enemy.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      enemy.heading += Math.max(-4 * dt, Math.min(4 * dt, diff));
      if (dist > 14) {
        enemy.speed = 4.6;
        enemy.x += Math.sin(enemy.heading) * enemy.speed * dt;
        enemy.z += Math.cos(enemy.heading) * enemy.speed * dt;
        resolveCollisions(enemy, this.colliders);
      } else {
        enemy.speed = 0;
        if (enemy.shootCooldown <= 0 && dist < 42) {
          enemy.shootCooldown = range(this.random, 0.9, 1.6);
          shots.push({ x: enemy.x, z: enemy.z, heading: enemy.heading, dist });
          if (onShoot) onShoot(enemy);
        }
      }
      animatePerson(enemy, dt);
    }
    return shots;
  }

  aliveCount() {
    return this.enemies.filter((e) => !e.dead).length;
  }
}
