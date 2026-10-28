import type { CharacterFontLanguage } from './commands.ts';
import {
  validateBorderPatch,
  validateBackgroundPatch,
  type BorderPatch,
  type BackgroundPatch,
} from './formatting-resource-intent.ts';
// @ts-ignore Canonical language partition order; no generated IDs or second issuer.
import { FONT_LANGUAGES } from '../../../../js/font-face-identity.mjs';
// @ts-ignore Same UTF-16/byte validator as the existing typed font-name command.
import { characterFontNameArgs } from '../../../../js/character-font-name-args.mjs';

const characterLineStyles = [
  'SOLID',
  'DASH',
  'DOT',
  'DASH_DOT',
  'DASH_DOT_DOT',
  'LONG_DASH',
  'CIRCLE',
  'DOUBLE_SLIM',
  'SLIM_THICK',
  'THICK_SLIM',
  'SLIM_THICK_SLIM',
  'WAVE',
  'DOUBLEWAVE',
  'THICK3D',
  'THICKREV3D',
  '3D',
  'REV3D',
] as const;
export type CharacterLineStyle = (typeof characterLineStyles)[number];
export type CharacterOutlineKind =
  | 'none'
  | 'solid'
  | 'dot'
  | 'thick'
  | 'dash'
  | 'dash_dot'
  | 'dash_dot_dot';
export type CharacterFontIntent =
  | { readonly id: number; readonly name?: never }
  | { readonly name: string; readonly id?: never };
export type CharacterLanguageMetrics = Readonly<Partial<Record<CharacterFontLanguage, number>>>;
export interface CharacterFormattingPatch {
  readonly size?: number;
  readonly bold?: boolean;
  readonly italic?: boolean;
  /** Wire RGB24, never source BGR or a None/Auto sentinel. */
  readonly textColor?: number;
  readonly fonts?: Readonly<Partial<Record<CharacterFontLanguage, CharacterFontIntent>>>;
  readonly ratio?: CharacterLanguageMetrics;
  readonly charSpacing?: CharacterLanguageMetrics;
  readonly relativeSize?: CharacterLanguageMetrics;
  readonly offset?: CharacterLanguageMetrics;
  readonly underline?: {
    readonly kind?: 'none' | 'bottom' | 'center' | 'top';
    readonly style?: CharacterLineStyle;
    readonly color?: number;
  };
  readonly strike?: {
    readonly enabled?: boolean;
    readonly style?: CharacterLineStyle;
    readonly color?: number;
  };
  readonly shade?: { readonly kind: 'none' } | { readonly kind: 'color'; readonly color: number };
  readonly outlineKind?: CharacterOutlineKind;
  readonly effects?: {
    readonly relief?: 'none' | 'emboss' | 'engrave';
    readonly script?: 'normal' | 'superscript' | 'subscript';
  };
  readonly shadow?: {
    readonly kind?: 'none' | 'drop' | 'continuous';
    readonly offsetX?: number;
    readonly offsetY?: number;
    readonly color?: number;
  };
  readonly border?: BorderPatch;
  readonly background?: BackgroundPatch;
}
export interface FormattingReset {
  readonly basis: 'paragraph-style';
  readonly scope: 'character' | 'paragraph' | 'all';
}
const lineStyles = new Set<string>(characterLineStyles);
function record(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  )
    throw Error('InvalidFormattingPatch');
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.includes(key)) throw Error('UnknownFormattingField');
    if (!('value' in Object.getOwnPropertyDescriptor(value, key)!))
      throw Error('InvalidFormattingPatch');
  }
  return value as Record<string, unknown>;
}
function integer(value: unknown, lo: number, hi: number): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < lo || value > hi)
    throw Error('InvalidCharacterFormattingValue');
}
function rgb(value: unknown): void {
  integer(value, 0, 0xffffff);
}
function choice(value: unknown, values: readonly string[]): void {
  if (typeof value !== 'string' || !values.includes(value))
    throw Error('UnsupportedCharacterFormattingValue');
}
function boolean(value: unknown): void {
  if (typeof value !== 'boolean') throw Error('InvalidCharacterFormattingValue');
}
/** Mirrors the existing Native JSON intent. Per-format support, ownership and
 * conditional source creation remain Native preflight decisions, not defaults here. */
export function validateCharacterFormattingPatch(value: unknown): void {
  const c = record(value, [
    'size',
    'bold',
    'italic',
    'textColor',
    'fonts',
    'ratio',
    'charSpacing',
    'relativeSize',
    'offset',
    'underline',
    'strike',
    'shade',
    'outlineKind',
    'effects',
    'shadow',
    'border',
    'background',
  ]);
  if (c.size !== undefined) integer(c.size, 0, 409600);
  for (const key of ['bold', 'italic']) if (c[key] !== undefined) boolean(c[key]);
  if (c.textColor !== undefined) rgb(c.textColor);
  if (c.fonts !== undefined) {
    const fonts = record(c.fonts, FONT_LANGUAGES);
    for (const language of FONT_LANGUAGES as readonly CharacterFontLanguage[]) {
      if (fonts[language] === undefined) continue;
      const f = record(fonts[language], ['id', 'name']);
      if ((f.id !== undefined) === (f.name !== undefined))
        throw Error('InvalidCharacterFontIntent');
      if (f.id !== undefined) integer(f.id, 0, 0xffffffff);
      else characterFontNameArgs(language, f.name);
    }
  }
  for (const [key, lo, hi] of [
    ['ratio', 50, 200],
    ['charSpacing', -50, 50],
    ['relativeSize', 10, 250],
    ['offset', -100, 100],
  ] as const) {
    if (c[key] === undefined) continue;
    const metrics = record(c[key], FONT_LANGUAGES);
    for (const v of Object.values(metrics)) if (v !== undefined) integer(v, lo, hi);
  }
  for (const key of ['underline', 'strike'] as const) {
    if (c[key] === undefined) continue;
    const d = record(
      c[key],
      key === 'underline' ? ['kind', 'style', 'color'] : ['enabled', 'style', 'color'],
    );
    if (d.color !== undefined) rgb(d.color);
    if (d.style !== undefined && !lineStyles.has(d.style as CharacterLineStyle))
      throw Error('UnsupportedCharacterLineStyle');
    if (key === 'underline' && d.kind !== undefined)
      choice(d.kind, ['none', 'bottom', 'center', 'top']);
    if (key === 'strike' && d.enabled !== undefined) boolean(d.enabled);
  }
  if (c.shade !== undefined) {
    const s = record(c.shade, ['kind', 'color']);
    choice(s.kind, ['none', 'color']);
    if (s.kind === 'none') {
      if (s.color !== undefined) throw Error('InvalidCharacterShade');
    } else rgb(s.color);
  }
  if (c.outlineKind !== undefined)
    choice(c.outlineKind, ['none', 'solid', 'dot', 'thick', 'dash', 'dash_dot', 'dash_dot_dot']);
  if (c.effects !== undefined) {
    const e = record(c.effects, ['relief', 'script']);
    if (e.relief !== undefined) choice(e.relief, ['none', 'emboss', 'engrave']);
    if (e.script !== undefined) choice(e.script, ['normal', 'superscript', 'subscript']);
  }
  if (c.shadow !== undefined) {
    const s = record(c.shadow, ['kind', 'offsetX', 'offsetY', 'color']);
    if (s.kind !== undefined) choice(s.kind, ['none', 'drop', 'continuous']);
    for (const k of ['offsetX', 'offsetY']) if (s[k] !== undefined) integer(s[k], -100, 100);
    if (s.color !== undefined) rgb(s.color);
  }
  if (c.border !== undefined) validateBorderPatch(c.border);
  if (c.background !== undefined) validateBackgroundPatch(c.background);
}
/** Only validated sparse fields count. Empty maps remain a no-op; false and 0 count. */
export function hasCharacterFormattingPatch(c: CharacterFormattingPatch | undefined): boolean {
  if (!c) return false;
  if (c.border && validateBorderPatch(c.border)) return true;
  if (c.background !== undefined || c.shade !== undefined) return true;
  for (const key of ['size', 'bold', 'italic', 'textColor', 'outlineKind'] as const)
    if (c[key] !== undefined) return true;
  for (const key of [
    'fonts',
    'ratio',
    'charSpacing',
    'relativeSize',
    'offset',
    'underline',
    'strike',
    'effects',
    'shadow',
  ] as const)
    if (c[key] && Object.values(c[key]!).some((v) => v !== undefined)) return true;
  return false;
}
export function validateFormattingReset(value: unknown): void {
  const r = record(value, ['basis', 'scope']);
  if (r.basis !== 'paragraph-style') throw Error('UnsupportedFormattingReset');
  choice(r.scope, ['character', 'paragraph', 'all']);
}
