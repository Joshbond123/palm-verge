// The story: six jobs for the Neon Syndicate, told through mission briefings
// and objectives. Each job is a small state machine (go to a marker, steal and
// deliver a car, beat the clock, lose the police, fight off rivals, the final
// armoured run). Completing a job pays cash and unlocks the next; finishing
// the story opens free roam with the city yours to run.

import { MARKER } from './config.js';

export const MISSION_DEFS = [
  {
    id: 'first-light',
    title: 'First Light',
    contact: 'Marisol at the marina',
    briefing: 'Marisol: "Rook, welcome to Verge City. The Syndicate needs a driver who keeps their head. Meet me at the marina, south pier."',
    objective: 'Meet Marisol at the marina (follow the gold marker).',
    type: 'goto',
    place: 'marina',
    reward: 250,
  },
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    contact: 'Marisol',
    briefing: 'Marisol: "A Neon GT is parked by the plaza tower. Take it — the garage crew will make it yours. Watch the cameras."',
    objective: 'Steal the marked sports car and deliver it to the garage.',
    type: 'steal-deliver',
    carKind: 'sport',
    place: 'garage',
    reward: 500,
  },
  {
    id: 'package-run',
    title: 'Package Run',
    contact: 'Dex, the dispatcher',
    briefing: 'Dex: "Hot package, cold clock. Get it to the hideout across town before the timer dies. No stops, no questions."',
    objective: 'Collect the package at the marina, then deliver it to the hideout before the clock dies.',
    type: 'timed-deliver',
    place: 'hideout',
    pickup: 'marina',
    timeLimit: 75,
    reward: 750,
  },
  {
    id: 'heat',
    title: 'Heat',
    contact: 'Marisol',
    briefing: 'Marisol: "The cameras flagged you. The heat is on — lose the police, then reach the hideout. Break their line of sight and stay cool."',
    objective: 'Lose the police (wanted level zero), then reach the hideout.',
    type: 'escape',
    place: 'hideout',
    reward: 600,
  },
  {
    id: 'rooftop-deal',
    title: 'Rooftop Deal',
    contact: 'The Syndicate',
    briefing: 'The Syndicate: "Rivals hit the deal at the plaza. Hold the ground — drop all four of them — then get clear."',
    objective: 'Defeat the 4 rival gunmen at the plaza.',
    type: 'fight',
    place: 'plaza',
    enemies: 4,
    reward: 1000,
  },
  {
    id: 'neon-heat',
    title: 'Neon Heat',
    contact: 'Marisol',
    briefing: 'Marisol: "Last job, Rook. The armoured truck leaves the marina tonight. Take it, outrun everything they throw at you, and bring it to the garage. Then the city is ours."',
    objective: 'Steal the armoured truck and deliver it to the garage — expect heavy heat.',
    type: 'final',
    carKind: 'truck',
    place: 'garage',
    reward: 2000,
  },
];

export class MissionTracker {
  constructor() {
    this.index = 0;
    this.stage = 'goto'; // goto | steal | deliver | escape | fight | done
    this.timer = 0;
    this.done = false;
  }

  current() {
    return this.done ? null : MISSION_DEFS[this.index];
  }

  /** Where the gold marker should sit, or null when there is none. */
  markerTarget(places, missionCar) {
    const def = this.current();
    if (!def) return null;
    if (this.stage === 'steal' && missionCar) return { x: missionCar.x, z: missionCar.z };
    return places[def.place] ?? null;
  }

  objectiveText() {
    const def = this.current();
    if (!def) return 'Free roam — Verge City is yours. Cause some neon.';
    if (def.type === 'escape' && this.stage === 'goto') return 'Lose the police, then reach the hideout.';
    if (def.type === 'timed-deliver') {
      return this.stage === 'goto'
        ? 'Collect the package at the marina (gold marker).'
        : 'Get the package to the hideout before the clock dies.';
    }
    if (def.type === 'steal-deliver' && this.stage === 'deliver') return 'Deliver the car to the garage.';
    if (def.type === 'final' && this.stage === 'deliver') return 'Deliver the truck to the garage.';
    return def.objective;
  }

  /**
   * Advance the story. ctx: { player, inCar, car, wanted, enemiesAlive, reached(place) }.
   * Returns an event object when something happened, else null.
   */
  update(ctx) {
    const def = this.current();
    if (!def) return null;
    const atPlace = ctx.reached(def.place);
    this.reachedPickup = !!(def.pickup && ctx.reached(def.pickup));

    switch (def.type) {
      case 'goto':
        if (atPlace) return this.complete();
        return null;
      case 'steal-deliver':
      case 'final':
        if (this.stage === 'goto') {
          if (ctx.missionCar && ctx.inCar && ctx.car === ctx.missionCar) this.stage = 'deliver';
          return null;
        }
        if (this.stage === 'deliver') {
          if (atPlace && ctx.inCar && ctx.car === ctx.missionCar) return this.complete();
          if (!ctx.inCar || ctx.car !== ctx.missionCar) this.stage = 'goto';
        }
        return null;
      case 'timed-deliver':
        if (this.stage === 'goto') {
          // Pick the package up first; that is when the clock starts ticking.
          if (this.reachedPickup) {
            this.stage = 'deliver';
            this.timer = def.timeLimit;
            return { type: 'pickup' };
          }
          return null;
        }
        this.timer -= 1 / 60;
        if (this.timer <= 0) {
          // Running out of time fails the run, not the story: back to the
          // pickup with a fresh clock, so the job is always completable.
          this.stage = 'goto';
          this.timer = def.timeLimit;
          return { type: 'timeout', retry: true };
        }
        if (atPlace) return this.complete();
        return null;
      case 'escape':
        if (this.stage === 'goto') {
          if (ctx.wanted === 0 && atPlace) return this.complete();
          return null;
        }
        return null;
      case 'fight':
        if (ctx.enemiesAlive === 0 && this.stage === 'fight') return this.complete();
        return null;
      default:
        return null;
    }
  }

  startMission() {
    const def = this.current();
    if (!def) return;
    this.timer = def.timeLimit ?? 0;
    this.reachedPickup = false;
    if (def.type === 'steal-deliver' || def.type === 'final') this.stage = 'goto';
    else if (def.type === 'fight') this.stage = 'fight';
    else this.stage = 'goto';
  }

  complete() {
    const def = this.current();
    const reward = def ? def.reward : 0;
    this.index += 1;
    if (this.index >= MISSION_DEFS.length) {
      this.done = true;
      return { type: 'story-complete', reward };
    }
    this.startMission();
    return { type: 'complete', reward, next: this.current() };
  }

  serialize() {
    return { index: this.index, done: this.done };
  }

  restore(data) {
    this.index = data?.index ?? 0;
    this.done = data?.done ?? false;
    this.startMission();
  }
}

export { MARKER };
