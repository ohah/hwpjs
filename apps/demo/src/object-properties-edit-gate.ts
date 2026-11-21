export type ObjectPropertiesEditLane = 'geometry' | 'margins';
/** One dialog intent and one in-flight mutation. This does not issue edit authority. */
export function createObjectPropertiesEditGate() {
  const dirty = { geometry: false, margins: false };
  const listeners = new Set<() => void>();
  let active: ObjectPropertiesEditLane | null = null;
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const allowed = (lane: ObjectPropertiesEditLane) =>
    active === null && !dirty[lane === 'geometry' ? 'margins' : 'geometry'];
  return {
    allowed,
    get conflict() {
      return dirty.geometry && dirty.margins;
    },
    get busy() {
      return active !== null;
    },
    setDirty(lane: ObjectPropertiesEditLane, value: boolean) {
      if (dirty[lane] === value) return;
      dirty[lane] = value;
      notify();
    },
    begin(lane: ObjectPropertiesEditLane) {
      if (!allowed(lane)) return false;
      active = lane;
      notify();
      return true;
    },
    end(lane: ObjectPropertiesEditLane) {
      if (active !== lane) return;
      active = null;
      notify();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
export type ObjectPropertiesEditGate = ReturnType<typeof createObjectPropertiesEditGate>;
