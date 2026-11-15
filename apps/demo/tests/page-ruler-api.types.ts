import type { CanvasPageGeometry, CanvasPageStatus, createCanvasSurface } from '@hwpjs/vanilla';
import type { CanvasSurfaceInstance } from '../../../packages/react/src/surface.ts';
import type { CanvasSurface } from '../../../packages/svelte/src/types.ts';
import type { DemoPageStatusHost } from '../src/page-status.ts';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type Surface = ReturnType<typeof createCanvasSurface>;
export type PublicGeometry = Expect<
  Equal<ReturnType<Surface['getPageGeometry']>, CanvasPageGeometry | null>
>;
export type PublicStatus = Expect<
  Equal<ReturnType<Surface['getPageStatus']>, CanvasPageStatus | null>
>;
export type PublicSubscription = Expect<
  Equal<ReturnType<Surface['subscribePageStatus']>, () => void>
>;
export type ReactGeometry = Expect<
  Equal<ReturnType<CanvasSurfaceInstance['getPageGeometry']>, CanvasPageGeometry | null>
>;
export type SvelteGeometry = Expect<
  Equal<ReturnType<CanvasSurface['getPageGeometry']>, CanvasPageGeometry | null>
>;
export type OptionalHost = Expect<
  Equal<
    ReturnType<NonNullable<DemoPageStatusHost['getPageGeometry']>>,
    CanvasPageGeometry | null | undefined
  >
>;
export type GeometryIsNotAny = Expect<
  Equal<0 extends 1 & ReturnType<Surface['getPageGeometry']> ? true : false, false>
>;

export function immutableObservations(geometry: CanvasPageGeometry, status: CanvasPageStatus) {
  // @ts-expect-error Public geometry is an immutable observation, not editable state.
  geometry.current = 12;
  // @ts-expect-error Nested paper rectangles are immutable too.
  geometry.paper.width = 0;
  // @ts-expect-error Page status cannot be edited to invent a page number.
  status.current = 12;
}
export function nullableObservation(surface: Surface) {
  const geometry = surface.getPageGeometry();
  // @ts-expect-error A detached or unpainted Surface has no geometry.
  return geometry.current;
}
