import { loadState } from './storage';
export const SETUP_KEY = 'aster.setup.v1';
export interface SetupState { version: 1; status: 'in-progress' | 'complete'; step: number }
export function setupState(): SetupState | null {
  try { const value = JSON.parse(localStorage.getItem(SETUP_KEY) || 'null'); return value?.version === 1 && ['in-progress', 'complete'].includes(value.status) ? { ...value, step: Math.max(0, Math.min(3, Number(value.step) || 0)) } : null; } catch { return null; }
}
export function needsSetup() {
  const saved = setupState(); if (saved) return saved.status !== 'complete';
  const existing = loadState(); return !existing.addons.length && !Object.keys(existing.items).length;
}
export function saveSetup(status: SetupState['status'], step = 0) {
  try { localStorage.setItem(SETUP_KEY, JSON.stringify({ version: 1, status, step })); return true; } catch { return false; }
}
