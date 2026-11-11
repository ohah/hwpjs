import type { PageSettingsValues } from './page-settings-dto.ts';
import { checkedPageSettingsValues, ownPageRecord } from '../../../../js/page-settings-edit.mjs';
export type { PageSettingsValues };
declare const pageSettingsTarget: unique symbol;
export interface PageSettingsTarget {
  readonly [pageSettingsTarget]: true;
}
export interface EditPageSettingsPayload {
  readonly target: PageSettingsTarget;
  readonly scope: 'section' | 'document';
  readonly values: PageSettingsValues;
}
export interface PageSettingsSource {
  readonly orientation: 'widely' | 'narrowly' | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly gutter_type: 'left_only' | 'left_right' | 'top_bottom' | null;
  readonly margin: {
    readonly header: number | null;
    readonly footer: number | null;
    readonly gutter: number | null;
    readonly left: number | null;
    readonly right: number | null;
    readonly top: number | null;
    readonly bottom: number | null;
  } | null;
}
export type PageSettingsRead =
  | Readonly<{ state: 'unavailable'; reason: string }>
  | Readonly<{
      state: 'available';
      target: PageSettingsTarget;
      currentSection: number | null;
      sections: readonly Readonly<{
        section: number;
        source: PageSettingsSource | null;
        reason: string | null;
      }>[];
    }>;
export function capturePageSettingsPayload(input: unknown): EditPageSettingsPayload {
  const p = ownPageRecord(input, ['target', 'scope', 'values']);
  if (
    !p.target ||
    typeof p.target !== 'object' ||
    (p.scope !== 'section' && p.scope !== 'document')
  )
    throw Error('InvalidPageSettingsCommand');
  return Object.freeze({
    target: p.target,
    scope: p.scope,
    values: checkedPageSettingsValues(p.values),
  }) as EditPageSettingsPayload;
}
