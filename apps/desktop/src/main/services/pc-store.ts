/**
 * PC identity persistence (electron-store). Used by getOrRegisterPcId.
 */
import Store from "electron-store";

const store = new Store<{ pcNumber?: string }>();

export function getSavedPcNumber(): string | null {
  const v = store.get("pcNumber");
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function setSavedPcNumber(pcNumber: string): void {
  store.set("pcNumber", pcNumber.trim());
}
