// Verge City: a fictional neon island city, generated from a fixed seed so the
// same seed always builds the same streets. Roads form a 7x7 grid; every block
// holds low-poly towers with lit windows, palms line the avenues, and a landmark
// tower, a marina and a neon arch give the skyline its identity. Buildings are
// plain boxes with canvas textures, so the whole city is a few dozen draw calls.

import * as THREE from '../vendor/three.module.min.js';
import { CITY, PALETTE } from './config.js';
import { range, int, pick } from './random.js';
import { roadCentres } from './config.js';

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Lit-window facade texture: glazed tower panels with warm windows. */
function facadeTexture(random, base, litRatio) {
  const t = canvasTexture(256, (ctx, size) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    const cols = 4;
    const rows = 4;
    const cw = size / cols;
    const ch = size / rows;
    for (let x = 0; x < cols; x += 1) {
      for (let y = 0; y < rows; y += 1) {
        const lit = random() < litRatio;
        ctx.fillStyle = lit ? '#ffe9a3' : '#33435c';
        ctx.fillRect(x * cw + 5, y * ch + 5, cw - 10, ch - 11);
        // Sky reflection on the top of each pane.
        ctx.fillStyle = 'rgba(170,215,255,0.22)';
        ctx.fillRect(x * cw + 5, y * ch + 5, cw - 10, (ch - 11) * 0.34);
      }
    }
    // Spandrel bands between floors.
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    for (let y = 0; y <= rows; y += 1) ctx.fillRect(0, y * ch - 3, size, 6);
  });
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Ground-floor shops: awnings, warm glass and doorways, tiled along the block. */
function shopfrontTexture() {
  const t = canvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#20242f';
    ctx.fillRect(0, 0, size, size);
    const bays = 3;
    const bw = size / bays;
    const colors = ['#ff3d8a', '#2fe8ff', '#ffd23d', '#7CFC00', '#ff8a5c', '#b06bff'];
    for (let i = 0; i < bays; i += 1) {
      // Awning.
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(i * bw + 4, size * 0.1, bw - 8, size * 0.17);
      // Warm interior glow seen through the glass.
      const grd = ctx.createLinearGradient(0, size * 0.3, 0, size * 0.92);
      grd.addColorStop(0, '#ffdfa0');
      grd.addColorStop(1, '#8a5a2a');
      ctx.fillStyle = grd;
      ctx.fillRect(i * bw + 10, size * 0.34, bw - 20, size * 0.58);
      // Doorway.
      ctx.fillStyle = 'rgba(20,24,34,0.9)';
      ctx.fillRect(i * bw + bw * 0.4, size * 0.58, bw * 0.2, size * 0.34);
      // Sign strip.
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(i * bw + bw * 0.22, size * 0.31, bw * 0.56, size * 0.025);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, size * 0.95, size, size * 0.05);
  });
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A unit box whose UVs tile the facade texture at a fixed world size. */
function tiledBox(w, h, d, tileW, tileH) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const uv = geo.attributes.uv;
  const uRep = Math.max(1, Math.round(w / tileW));
  const vRep = Math.max(1, Math.round(h / tileH));
  for (let i = 0; i < uv.count; i += 1) {
    uv.setXY(i, uv.getX(i) * uRep, uv.getY(i) * vRep);
  }
  uv.needsUpdate = true;
  void d;
  return geo;
}

/** The island ground: asphalt roads with lane dashes, pale sidewalks, plaza. */
function groundTexture() {
  // 4096px over a ~380-unit island keeps road markings crisp at street level.
  const size = 4096;
  const scale = size / CITY.size;
  const t = canvasTexture(size, (ctx) => {
    // Sidewalk / plaza base.
    ctx.fillStyle = '#b6bdc4';
    ctx.fillRect(0, 0, size, size);
    // Paving joints.
    ctx.strokeStyle = 'rgba(120,130,140,0.35)';
    ctx.lineWidth = 2;
    for (let p = 0; p < size; p += 32) {
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
    }
    const centres = roadCentres();
    const roadW = CITY.road * scale;
    // Asphalt.
    ctx.fillStyle = '#4c525b';
    for (const c of centres) {
      const p = (c + CITY.half) * scale;
      ctx.fillRect(p - roadW / 2, 0, roadW, size);
      ctx.fillRect(0, p - roadW / 2, size, roadW);
    }
    // Kerb highlight along every road edge.
    ctx.fillStyle = '#cfd5da';
    for (const c of centres) {
      const p = (c + CITY.half) * scale;
      ctx.fillRect(p - roadW / 2 - 3, 0, 3, size);
      ctx.fillRect(p + roadW / 2, 0, 3, size);
      ctx.fillRect(0, p - roadW / 2 - 3, size, 3);
      ctx.fillRect(0, p + roadW / 2, size, 3);
    }
    // Centre dashes (3 units long, 6 unit gap).
    ctx.fillStyle = '#f2c94c';
    const dash = 3 * scale;
    const gap = 6 * scale;
    for (const c of centres) {
      const p = (c + CITY.half) * scale;
      for (let t2 = 0; t2 < size; t2 += dash + gap) {
        ctx.fillRect(p - 1.5, t2, 3, dash);
        ctx.fillRect(t2, p - 1.5, dash, 3);
      }
    }
    // Crosswalks at intersections.
    ctx.fillStyle = 'rgba(240,244,248,0.9)';
    const stripe = 0.9 * scale;
    for (const cx of centres) {
      for (const cz of centres) {
        const px = (cx + CITY.half) * scale;
        const pz = (cz + CITY.half) * scale;
        for (let i = -3; i <= 3; i += 1) {
          const off = i * stripe * 2.1;
          ctx.fillRect(px + off, pz - roadW / 2 + 4, stripe, stripe * 3.4);
          ctx.fillRect(px + off, pz + roadW / 2 - 4 - stripe * 3.4, stripe, stripe * 3.4);
          ctx.fillRect(px - roadW / 2 + 4, pz + off, stripe * 3.4, stripe);
          ctx.fillRect(px + roadW / 2 - 4 - stripe * 3.4, pz + off, stripe * 3.4, stripe);
        }
      }
    }
  });
  t.anisotropy = 8;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function neonSignTexture(text, color) {
  return canvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#101018';
    ctx.fillRect(0, 0, size, size);
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    ctx.fillText(text, size / 2, size / 2 + 14);
  });
}

export function buildCity(scene, random) {
  const colliders = [];
  const centres = roadCentres();
  const half = CITY.half;

  // --- Island ground and surrounding water ---------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.size, CITY.size),
    new THREE.MeshLambertMaterial({ map: groundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Bay water: a lit surface plus a glossy mesh with a mirrored sun streak, so
  // sunsets read across the bay instead of a flat blue slab.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.size * 4, CITY.size * 4),
    new THREE.MeshPhongMaterial({
      color: PALETTE.water, shininess: 90, specular: 0xffd9a8, transparent: true, opacity: 0.96,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.6;
  scene.add(water);
  const waterGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.size * 4, CITY.size * 4),
    new THREE.MeshBasicMaterial({
      color: 0xffb070, transparent: true, opacity: 0.16, depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  waterGlow.rotation.x = -Math.PI / 2;
  waterGlow.position.y = -0.55;
  scene.add(waterGlow);

  // --- Buildings -------------------------------------------------------------
  const facadeMats = [
    new THREE.MeshLambertMaterial({ map: facadeTexture(random, '#6b7fa3', 0.34) }),
    new THREE.MeshLambertMaterial({ map: facadeTexture(random, '#8a6f92', 0.4) }),
    new THREE.MeshLambertMaterial({ map: facadeTexture(random, '#4f8a88', 0.3) }),
    new THREE.MeshLambertMaterial({ map: facadeTexture(random, '#9aa6b8', 0.26) }),
  ];
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a4152 });
  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  const neonTexts = ['VERGE', 'NEON', 'PALM', 'HOTEL', 'CLUB', '24H', 'TAXI', 'BAR'];
  const neonColors = ['#ff3d8a', '#2fe8ff', '#ffd23d', '#7CFC00'];
  const neonMats = neonTexts.map((t, i) => new THREE.MeshBasicMaterial({
    map: neonSignTexture(t, neonColors[i % neonColors.length]),
  }));

  const blockCentres = [];
  const shopMat = new THREE.MeshLambertMaterial({ map: shopfrontTexture() });
  for (let bx = 0; bx < CITY.blocks; bx += 1) {
    for (let bz = 0; bz < CITY.blocks; bz += 1) {
      const cx = -half + CITY.road + bx * CITY.pitch + CITY.block / 2;
      const cz = -half + CITY.road + bz * CITY.pitch + CITY.block / 2;
      blockCentres.push({ x: cx, z: cz });
      const isCentre = bx === 3 && bz === 3;
      if (isCentre) continue; // the landmark tower stands here
      const count = int(random, 1, 3);
      for (let n = 0; n < count; n += 1) {
        const w = range(random, 10, 18);
        const d = range(random, 10, 18);
        const h = range(random, 12, 46);
        const ox = range(random, -8, 8);
        const oz = range(random, -8, 8);
        const x = cx + ox;
        const z = cz + oz;
        // Facade: windows tile at a constant real-world size whatever the tower.
        const mesh = new THREE.Mesh(tiledBox(w, h, d, 7.2, 6.4), pick(random, facadeMats));
        mesh.scale.set(w, h, d);
        mesh.position.set(x, h / 2, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        const roof = new THREE.Mesh(buildingGeo, roofMat);
        roof.scale.set(w * 0.5, 2, d * 0.5);
        roof.position.set(x, h + 1, z);
        roof.castShadow = true;
        scene.add(roof);
        // Street-level podium: shops wrap the base, a thin canopy caps them.
        const shopH = 4.6;
        const shop = new THREE.Mesh(tiledBox(w + 2.4, shopH, d + 2.4, 7, shopH), shopMat);
        shop.scale.set(w + 2.4, shopH, d + 2.4);
        shop.position.set(x, shopH / 2, z);
        shop.receiveShadow = true;
        scene.add(shop);
        const canopy = new THREE.Mesh(buildingGeo, roofMat);
        canopy.scale.set(w + 3.4, 0.5, d + 3.4);
        canopy.position.set(x, shopH + 0.2, z);
        canopy.castShadow = true;
        scene.add(canopy);
        // Rooftop clutter: a vent stack or water tank for a believable skyline.
        if (random() < 0.55) {
          const kit = new THREE.Mesh(buildingGeo, roofMat);
          const kw = range(random, 1.5, 3.5);
          kit.scale.set(kw, range(random, 1.5, 4), kw);
          kit.position.set(x + range(random, -w * 0.2, w * 0.2), h + 1.4, z + range(random, -d * 0.2, d * 0.2));
          kit.castShadow = true;
          scene.add(kit);
        }
        colliders.push({ minX: x - (w + 2.4) / 2, maxX: x + (w + 2.4) / 2, minZ: z - (d + 2.4) / 2, maxZ: z + (d + 2.4) / 2 });
        // A neon sign on some towers, facing the nearest road.
        if (random() < 0.4) {
          const sign = new THREE.Mesh(
            new THREE.PlaneGeometry(10, 10),
            pick(random, neonMats),
          );
          const side = int(random, 0, 3);
          const off = 0.6;
          if (side === 0) { sign.position.set(x, h * 0.7, z - d / 2 - off); }
          if (side === 1) { sign.position.set(x, h * 0.7, z + d / 2 + off); sign.rotation.y = Math.PI; }
          if (side === 2) { sign.position.set(x - w / 2 - off, h * 0.7, z); sign.rotation.y = -Math.PI / 2; }
          if (side === 3) { sign.position.set(x + w / 2 + off, h * 0.7, z); sign.rotation.y = Math.PI / 2; }
          scene.add(sign);
        }
      }
    }
  }

  // --- Landmark tower (centre block) -----------------------------------------
  const tower = new THREE.Group();
  const towerBody = new THREE.Mesh(
    buildingGeo,
    new THREE.MeshLambertMaterial({ map: facadeTexture(random, '#3b4664', 0.5) }),
  );
  towerBody.scale.set(20, 78, 20);
  towerBody.position.y = 39;
  towerBody.castShadow = true;
  towerBody.receiveShadow = true;
  tower.add(towerBody);
  const spire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 2.2, 22, 8),
    new THREE.MeshLambertMaterial({ color: 0x9fb4c8 }),
  );
  spire.position.y = 89;
  tower.add(spire);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3d3d }),
  );
  beacon.position.y = 101;
  tower.add(beacon);
  const crown = new THREE.Mesh(
    buildingGeo,
    new THREE.MeshBasicMaterial({ color: PALETTE.neonPink }),
  );
  crown.scale.set(21, 2, 21);
  crown.position.y = 79;
  tower.add(crown);
  const centreBlock = blockCentres[3 * CITY.blocks + 3];
  tower.position.set(centreBlock.x, 0, centreBlock.z);
  scene.add(tower);
  colliders.push({
    minX: centreBlock.x - 10, maxX: centreBlock.x + 10,
    minZ: centreBlock.z - 10, maxZ: centreBlock.z + 10,
  });

  // --- Marina (south edge): docks and moored boats ---------------------------
  const dockMat = new THREE.MeshLambertMaterial({ color: 0x6a5236 });
  const boatMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
  const boatAccent = new THREE.MeshLambertMaterial({ color: PALETTE.neonCyan });
  for (let i = 0; i < 5; i += 1) {
    const x = -half + 40 + i * 55;
    const dock = new THREE.Mesh(buildingGeo, dockMat);
    dock.scale.set(4, 1, 26);
    dock.position.set(x, 0.5, half + 8);
    scene.add(dock);
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(buildingGeo, boatMat);
    hull.scale.set(5, 2, 12);
    hull.position.y = 1;
    boat.add(hull);
    const cabin = new THREE.Mesh(buildingGeo, boatAccent);
    cabin.scale.set(3.4, 1.6, 5);
    cabin.position.set(0, 2.6, -1);
    boat.add(cabin);
    boat.position.set(x + 6, 0, half + 20);
    boat.rotation.y = range(random, -0.2, 0.2);
    scene.add(boat);
  }

  // --- Neon arch over the main east-west avenue -------------------------------
  const archMat = new THREE.MeshBasicMaterial({ color: PALETTE.neonCyan });
  const archZ = centres[3];
  // Slim pylons out on the kerb line, so the avenue stays clear to drive.
  const pillarGeo = new THREE.CylinderGeometry(0.28, 0.42, 13, 8);
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(pillarGeo, archMat);
    pillar.position.set(side * (CITY.road / 2 + 3.2), 6.5, archZ);
    scene.add(pillar);
    colliders.push({
      minX: side * (CITY.road / 2 + 3.2) - 0.5, maxX: side * (CITY.road / 2 + 3.2) + 0.5,
      minZ: archZ - 0.5, maxZ: archZ + 0.5,
    });
  }
  const archTop = new THREE.Mesh(new THREE.BoxGeometry(CITY.road + 7.4, 0.7, 0.7), archMat);
  archTop.position.set(0, 13.4, archZ);
  scene.add(archTop);
  // Marquee lettering across the arch.
  const archSign = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 3.2),
    new THREE.MeshBasicMaterial({ map: neonSignTexture('VERGE CITY', '#2fe8ff'), transparent: true }),
  );
  archSign.position.set(0, 11.6, archZ + 0.5);
  scene.add(archSign);
  const archSign2 = archSign.clone();
  archSign2.position.set(0, 11.6, archZ - 0.5);
  archSign2.rotation.y = Math.PI;
  scene.add(archSign2);

  // --- Palms and streetlights (instanced) --------------------------------------
  const palmSpots = [];
  for (const c of centres) {
    for (let t = -half + 10; t < half - 10; t += 18) {
      if (random() < 0.75) palmSpots.push({ x: c + CITY.road / 2 + 1.6, z: t + range(random, -3, 3) });
      if (random() < 0.75) palmSpots.push({ x: t + range(random, -3, 3), z: c - CITY.road / 2 - 1.6 });
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6, 6);
  const crownGeo = new THREE.IcosahedronGeometry(2.4, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: PALETTE.palmTrunk }), palmSpots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: PALETTE.palmLeaf }), palmSpots.length);
  trunks.castShadow = true;
  crowns.castShadow = true;
  const dummy = new THREE.Object3D();
  palmSpots.forEach((spot, i) => {
    const lean = range(random, -0.12, 0.12);
    dummy.position.set(spot.x, 3, spot.z);
    dummy.rotation.set(lean, random() * Math.PI, lean);
    dummy.scale.set(1, range(random, 0.8, 1.3), 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 6.4 * dummy.scale.y;
    dummy.scale.set(1.3, 0.55, 1.3);
    dummy.updateMatrix();
    crowns.setMatrixAt(i, dummy.matrix);
  });
  scene.add(trunks);
  scene.add(crowns);

  const lampSpots = [];
  for (const c of centres) {
    for (let t = -half + 8; t < half - 8; t += 26) {
      lampSpots.push({ x: c + CITY.road / 2 + 0.8, z: t });
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 5.4, 5);
  const headGeo = new THREE.BoxGeometry(0.5, 0.22, 0.5);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x555c66 }), lampSpots.length);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a3 }), lampSpots.length);
  lampSpots.forEach((spot, i) => {
    dummy.position.set(spot.x, 2.7, spot.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 5.5;
    dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
  });
  scene.add(poles);
  scene.add(heads);

  // --- Named places (mission and shop anchors) ---------------------------------
  const marina = { x: -half + 60, z: half - 14 };
  const garage = { x: centres[5] + CITY.road / 2 + 4, z: centres[1] };
  const hideout = { x: centres[1] - CITY.road / 2 - 4, z: centres[5] };
  const plaza = { x: centreBlock.x + 16, z: centreBlock.z + 16 };
  const shops = [
    { x: centres[2] + CITY.road / 2 + 3, z: centres[4], kind: 'ammo' },
    { x: centres[4] - CITY.road / 2 - 3, z: centres[2], kind: 'health' },
    { x: centres[6] + CITY.road / 2 + 3, z: centres[6], kind: 'repair' },
  ];

  return {
    colliders,
    water,
    waterGlow,
    centres,
    blockCentres,
    places: { marina, garage, hideout, plaza, tower: { x: centreBlock.x, z: centreBlock.z } },
    shops,
    /** Neon flicker and beacon spin; called every frame with elapsed seconds. */
    update(elapsed) {
      beacon.material.color.setHex(Math.sin(elapsed * 2.4) > 0 ? 0xff3d3d : 0x551111);
      crown.material.color.setHSL(0.92 + Math.sin(elapsed * 0.7) * 0.04, 1, 0.55);
      water.position.y = -0.6 + Math.sin(elapsed * 0.5) * 0.12;
    },
  };
}

/** Push a circle (x, z, radius) out of every building AABB. Returns true on hit. */
export function resolveCollisions(entity, colliders) {
  let hit = false;
  for (const box of colliders) {
    const nx = Math.max(box.minX, Math.min(entity.x, box.maxX));
    const nz = Math.max(box.minZ, Math.min(entity.z, box.maxZ));
    const dx = entity.x - nx;
    const dz = entity.z - nz;
    const distSq = dx * dx + dz * dz;
    if (distSq < entity.radius * entity.radius) {
      hit = true;
      if (distSq > 1e-8) {
        const dist = Math.sqrt(distSq);
        entity.x = nx + (dx / dist) * entity.radius;
        entity.z = nz + (dz / dist) * entity.radius;
      } else {
        // Centre inside the box: push out along the smallest penetration axis.
        const left = entity.x - box.minX;
        const right = box.maxX - entity.x;
        const top = entity.z - box.minZ;
        const bottom = box.maxZ - entity.z;
        const min = Math.min(left, right, top, bottom);
        if (min === left) entity.x = box.minX - entity.radius;
        else if (min === right) entity.x = box.maxX + entity.radius;
        else if (min === top) entity.z = box.minZ - entity.radius;
        else entity.z = box.maxZ + entity.radius;
      }
    }
  }
  // Keep everyone on the island.
  const limit = CITY.half - 2;
  entity.x = Math.max(-limit, Math.min(limit, entity.x));
  entity.z = Math.max(-limit, Math.min(limit, entity.z));
  return hit;
}
