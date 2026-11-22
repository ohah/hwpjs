export type ObjectPropertiesEditLane = 'geometry' | 'margins' | 'bodyFlow' | 'crop';
/** One dialog intent and one in-flight mutation. This does not issue edit authority. */
export function createObjectPropertiesEditGate() {
  const dirty = { geometry: false, margins: false, bodyFlow: false, crop: false };
  const listeners = new Set<() => void>();
  let active: ObjectPropertiesEditLane | null = null;
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const allowed = (lane: ObjectPropertiesEditLane) =>
    active === null &&
    (Object.keys(dirty) as ObjectPropertiesEditLane[]).every(
      (other) => other === lane || !dirty[other],
    );
  return {
    allowed,
    get conflict() {
      return Object.values(dirty).filter(Boolean).length > 1;
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
