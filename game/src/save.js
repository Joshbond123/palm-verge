// Save and load: the player's cash, health, mission progress and position are
// kept in localStorage, so a session survives a closed tab. Storage can be off
// (private windows): the save then lasts this visit only, and the game says so.

import { SAVE_KEY } from './config.js';

export function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear when storage is off.
  }
}
