// PALM VERGE — Neon Heat: every tuning number, colour and label in one place.
// The city is generated from a fixed seed (see random.js), so the same seed always
// builds the same Verge City. The simulation steps at a fixed 1/60 s.

export const STEP = 1 / 60;
export const SEED = 20261122;

/** City grid: BLOCKS x BLOCKS blocks, each BLOCK metres wide, roads ROAD metres wide. */
export const CITY = {
  blocks: 7,
  block: 40,
  road: 14,
  get pitch() { return this.block + this.road; },
  get size() { return this.blocks * this.pitch + this.road; }, // full island width
  get half() { return this.size / 2; },
};

/** World -> grid helpers: roads run along both axes at every pitch boundary. */
export function roadCentres() {
  const out = [];
  for (let i = 0; i <= CITY.blocks; i += 1) {
    out.push(-CITY.half + CITY.road / 2 + i * CITY.pitch);
  }
  return out;
}

export const PLAYER = {
  radius: 0.45,
  height: 1.8,
  walkSpeed: 5.2,
  runSpeed: 9.5,
  jumpVelocity: 6.4,
  gravity: 18,
  maxHealth: 100,
  punchRange: 2.2,
  punchDamage: 34,
  punchCooldown: 0.45,
  gunDamage: 40,
  gunRange: 90,
  gunCooldown: 0.22,
  magazine: 12,
  reloadTime: 1.1,
  startMoney: 150,
};

export const CAR = {
  radius: 1.15,
  maxSpeed: 34,
  reverseSpeed: 12,
  acceleration: 16,
  brake: 30,
  drag: 0.6,
  turnRate: 1.9,
  grip: 8,
};

export const WANTED = {
  /** Seconds of unseen calm before a star decays. */
  decaySeconds: 26,
  /** Bust progress per second while a cruiser is close and the player is slow. */
  bustRate: 0.34,
  escapeSeconds: 8,
};

export const TRAFFIC = { count: 14, speed: 9 };
export const PEDESTRIANS = { count: 26 };

export const SHOP = { ammoPrice: 40, healthPrice: 60, repairPrice: 80 };

export const PALETTE = {
  skyDay: 0x7ec8e3,
  skyDusk: 0xff9a5c,
  skyNight: 0x0b1026,
  fogDay: 0xa8d8ea,
  fogNight: 0x141a33,
  road: 0x2b2f36,
  roadLine: 0xf2c94c,
  sidewalk: 0x8d9299,
  water: 0x1b6f8e,
  palmTrunk: 0x8a6a4a,
  palmLeaf: 0x2fae5f,
  buildingA: 0x3a4a63,
  buildingB: 0x5a4a63,
  buildingC: 0x2f5a5a,
  windowLit: 0xffe9a3,
  neonPink: 0xff3d8a,
  neonCyan: 0x2fe8ff,
  neonYellow: 0xffd23d,
  police: 0x2456d8,
  playerShirt: 0xff3d8a,
  playerSkin: 0xc98a5e,
  pedShirts: [0x4fc3f7, 0xf2c94c, 0x81c784, 0xe57373, 0xba68c8, 0xfff176],
  skinTones: [0xc98a5e, 0x8d5a3b, 0xe8b48a, 0x6b4226, 0xd9a273],
};

export const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';

/** Where the save lives (this browser only). */
export const SAVE_KEY = 'palm-verge.save.v1';

/** Mission marker colours on the minimap and in the world. */
export const MARKER = 0xffd23d;
