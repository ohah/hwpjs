import { createDisplayEscaper } from './render-escape.ts';
import { buildObjectReference, parseObjectReference } from './object-reference.ts';
export interface FormDocument {
  format: 'hwp5' | 'hwpx';
  sourceSha256: string;
  sectionCount: number;
  sdk: object;
  nativeExports?: readonly string[];
}
export type FormObservation =
  | { state: 'known'; value: string | boolean; raw?: string; scope: 'current' | 'source' }
  | {
      state: 'unknown' | 'unavailable';
      value: null;
      reason: string;
      raw?: string;
      scope: 'current' | 'source';
    };
export interface FormControl {
  reference: string;
  kind: string;
  source: { section: number; node: number; paragraph: number | null; anchorUnit: number | null };
  current: {
    state: FormObservation;
    text: FormObservation;
    groupName: FormObservation;
    name: FormObservation;
  };
  permissions: {
    enabled: FormObservation;
    editable: FormObservation;
    triState: FormObservation;
    readOnly: FormObservation;
    editEnable: FormObservation;
  };
  writers: { checkbox: boolean; radio: boolean; text: boolean };
  ownership: 'located' | 'unavailable';
  // Current Native provenance is inspection data, never caller-supplied authority.
  fingerprint: string;
}
export interface FormInventory {
  status: 'available' | 'unavailable';
  reason?: string;
  forms: FormControl[];
}
export const sdkMethod = (document: FormDocument, name: string) => {
  const fn: unknown = Reflect.get(document.sdk, name);
  if (typeof fn !== 'function') throw new Error('FormSdkMethodUnavailable:' + name);
  return (...args: unknown[]): any => Reflect.apply(fn, document.sdk, args);
};
const has = (d: FormDocument, name: string) => typeof Reflect.get(d.sdk, name) === 'function';
const capability = (d: FormDocument, name: string) => has(d, name) && sdkMethod(d, name)() === true;
export function formWriterCapabilities(d: FormDocument) {
  if (d.format === 'hwp5')
    return {
      checkbox: capability(d, 'supportsCheckBoxStateEdit'),
      radio: capability(d, 'supportsRadioButtonSelect'),
      text:
        capability(d, 'supportsFormTextEdit') && capability(d, 'supportsFormTextLayoutRetention'),
    };
  return {
    checkbox: d.nativeExports?.includes('hwpx_edit_set_checkbox_state') === true,
    radio: capability(d, 'supportsRadioButtonSelect'),
    text: capability(d, 'supportsFormTextEdit') && capability(d, 'supportsFormTextLayoutRetention'),
  };
}
const unknown = (
  reason: string,
  scope: 'current' | 'source' = 'current',
  raw?: string,
): FormObservation => ({
  state: 'unavailable',
  value: null,
  reason,
  scope,
  ...(raw === undefined ? {} : { raw }),
});
const known = (
  value: string | boolean,
  scope: 'current' | 'source' = 'current',
  raw?: string,
): FormObservation => ({ state: 'known', value, scope, ...(raw === undefined ? {} : { raw }) });
function field(properties: any, name: string, kind: string): FormObservation {
  const row = properties.fields.find((x: any) => x.field === name);
  if (!row || row.kind !== kind) return unknown('MissingOrMismatchedFormProperty:' + name);
  let raw = '';
  for (let i = 0; i < row.units.length; i += 4096)
    raw += String.fromCharCode(...row.units.slice(i, i + 4096));
  if (!raw.isWellFormed())
    return { state: 'unknown', value: null, reason: 'InvalidFormUnicode', scope: 'current' };
  if (kind === 'boolean')
    return /^[0-9]{1,10}$/.test(raw) && Number(raw) <= 1
      ? known(Number(raw) === 1, 'current', raw)
      : { state: 'unknown', value: null, reason: 'UnknownFormBoolean', scope: 'current', raw };
  return known(raw, 'current', raw);
}
function choice(raw: FormObservation, radio: boolean): FormObservation {
  if (raw.state !== 'known') return raw;
  if (
    typeof raw.value !== 'string' ||
    !/^[0-9]{1,10}$/.test(raw.value) ||
    Number(raw.value) > (radio ? 1 : 2)
  )
    return {
      state: 'unknown',
      value: null,
      reason: 'UnknownFormChoiceState',
      scope: 'current',
      raw: String(raw.value),
    };
  return known(['UNCHECKED', 'CHECKED', 'INDETERMINATE'][Number(raw.value)], 'current', raw.value);
}
function hxString(row: any, key: string): FormObservation {
  return typeof row.strings[key] === 'string'
    ? known(row.strings[key], 'source')
    : unknown('FormSourceAttributeUnavailable:' + key, 'source');
}
function hxBool(row: any, key: string): FormObservation {
  return typeof row.booleans[key] === 'boolean'
    ? known(row.booleans[key], 'source')
    : unknown('FormSourceAttributeUnavailable:' + key, 'source');
}
export function readFormInventory(document: FormDocument): FormInventory {
  const d = document;
  if (!Number.isInteger(d.sectionCount) || d.sectionCount < 1 || d.sectionCount > 4096)
    throw new Error('InvalidFormSectionCount');
  if (
    d.format === 'hwp5' &&
    (!capability(d, 'supportsFormSources') || !capability(d, 'supportsFormProperties'))
  )
    return { status: 'unavailable', reason: 'Hwp5FormInventoryAbiUnavailable', forms: [] };
  if (
    d.format === 'hwpx' &&
    (!['formSites', 'formSourceAttributes', 'checkBoxState'].every((k) => has(d, k)) ||
      (d.nativeExports &&
        ![
          'hwpx_edit_form_sites',
          'hwpx_edit_form_source_attributes',
          'hwpx_edit_checkbox_state',
        ].every((k) => d.nativeExports!.includes(k))))
  )
    return { status: 'unavailable', reason: 'HwpxFormInventoryAbiUnavailable', forms: [] };
  const writers = formWriterCapabilities(d),
    forms: FormControl[] = [],
    seen = new Set();
  let provenanceUnits = 0;
  const fingerprint = (value: unknown) => {
    const encoded = JSON.stringify(value);
    provenanceUnits += encoded.length;
    if (encoded.length > 4 * 1024 * 1024 || provenanceUnits > 16 * 1024 * 1024)
      throw new Error('FormProvenanceLimitExceeded');
    return encoded;
  };
  for (let section = 0; section < d.sectionCount; section++) {
    let hosts: Map<number, any> | undefined;
    const ownerHost = (paragraph: number) => {
      if (!hosts) {
        hosts = new Map<number, any>();
        const flow = has(d, 'paragraphFlow') ? sdkMethod(d, 'paragraphFlow')(section) : [];
        for (const row of flow) {
          if (hosts.has(row.paragraph)) throw new Error('AmbiguousFormOwner');
          hosts.set(row.paragraph, row);
        }
      }
      return hosts.get(paragraph);
    };
    if (d.format === 'hwp5') {
      const sources = sdkMethod(d, 'formSources')(section),
        anchors = sdkMethod(d, 'formAnchors')(section),
        properties = sdkMethod(d, 'formProperties')(section);
      if (sources.length !== anchors.length || sources.length !== properties.length)
        throw new Error('IncompleteFormInventory');
      const anchorMap = new Map(anchors.map((r: any) => [r.object_node, r])),
        propertyMap = new Map(properties.map((r: any) => [r.object_node, r]));
      for (const source of sources) {
        const anchor: any = anchorMap.get(source.object_node),
          property: any = propertyMap.get(source.object_node);
        if (
          !anchor ||
          !property ||
          source.control_node !== anchor.control_node ||
          source.control_node !== property.control_node ||
          source.source_unit !== anchor.source_unit ||
          property.known_nodes + property.deferred_nodes !== source.property_nodes
        )
          throw new Error('MismatchedFormProvenance');
        const host = ownerHost(anchor.paragraph),
          located = !!host && host.source_node === source.paragraph_node;
        const reference = buildObjectReference({
          sourceSha256: d.sourceSha256,
          format: d.format,
          section,
          kind: 'form',
          node: source.object_node,
        });
        const stableProperties = {
          ...property,
          fields: property.fields.filter((r: any) => !['value', 'text'].includes(r.field)),
        };
        forms.push({
          reference,
          kind: source.kind,
          source: {
            section,
            node: source.object_node,
            paragraph: anchor.paragraph,
            anchorUnit: anchor.current_unit,
          },
          current: {
            state: choice(field(property, 'value', 'integer'), source.kind === 'radio_button'),
            text: field(property, 'text', 'wstring'),
            groupName: field(property, 'radio_group_name', 'wstring'),
            name: field(property, 'name', 'wstring'),
          },
          permissions: {
            enabled: field(property, 'enabled', 'boolean'),
            editable: field(property, 'editable', 'boolean'),
            triState: field(property, 'tri_state', 'boolean'),
            readOnly: field(property, 'read_only', 'boolean'),
            editEnable: field(property, 'edit_enable', 'boolean'),
          },
          writers: {
            checkbox: writers.checkbox && source.kind === 'check_box',
            radio: writers.radio && source.kind === 'radio_button',
            text: writers.text && ['edit', 'combo_box'].includes(source.kind),
          },
          ownership: located ? 'located' : 'unavailable',
          fingerprint: fingerprint({ source, anchor, host, properties: stableProperties }),
        });
      }
    } else {
      const sites = sdkMethod(d, 'formSites')(section);
      for (const site of sites) {
        const attrs = sdkMethod(d, 'formSourceAttributes')(section, site.formNode);
        if (attrs.kind !== site.kind) throw new Error('MismatchedFormProvenance');
        const host = ownerHost(site.paragraph);
        const reference = buildObjectReference({
          sourceSha256: d.sourceSha256,
          format: d.format,
          section,
          kind: 'form',
          node: site.formNode,
        });
        let state = hxString(attrs, 'value');
        if (site.kind === 'check_button') {
          try {
            const actual = sdkMethod(d, 'checkBoxState')(section, site.formNode);
            state = ['UNCHECKED', 'CHECKED', 'INDETERMINATE'].includes(actual)
              ? known(actual)
              : {
                  state: 'unknown',
                  value: null,
                  reason: 'UnknownFormChoiceState',
                  scope: 'current',
                  raw: String(actual),
                };
          } catch (error) {
            state = unknown(
              error instanceof Error ? error.message : 'FormStateObservationFailed',
              'current',
              attrs.strings.value ?? undefined,
            );
          }
        }
        let currentText = unknown('HwpxFormTextCurrentQueryAbiUnavailable');
        if (site.kind === 'radio_button') {
          try {
            state = known(sdkMethod(d, 'radioButtonState')(section, site.formNode));
          } catch (error) {
            state = unknown(
              error instanceof Error ? error.message : 'FormStateObservationFailed',
              'current',
              attrs.strings.value ?? undefined,
            );
          }
        }
        if (['edit_box', 'combo_box'].includes(site.kind)) {
          try {
            currentText = known(sdkMethod(d, 'formText')(section, site.formNode));
          } catch (error) {
            currentText = unknown(
              error instanceof Error ? error.message : 'FormTextObservationFailed',
            );
          }
        }
        forms.push({
          reference,
          kind: site.kind,
          source: {
            section,
            node: site.formNode,
            paragraph: site.paragraph,
            anchorUnit: site.anchorUnit,
          },
          current: {
            state,
            text: currentText,
            groupName: hxString(attrs, 'radioGroupName'),
            name: hxString(attrs, 'name'),
          },
          permissions: {
            enabled: hxBool(attrs, 'enabled'),
            editable: hxBool(attrs, 'editable'),
            triState: hxBool(attrs, 'triState'),
            readOnly: hxBool(attrs, 'readOnly'),
            editEnable: hxBool(attrs, 'editEnable'),
          },
          writers: {
            checkbox: writers.checkbox && site.kind === 'check_button',
            radio: writers.radio && site.kind === 'radio_button',
            text: writers.text && ['edit_box', 'combo_box'].includes(site.kind),
          },
          ownership: site.state === 'located' && !!host ? 'located' : 'unavailable',
          fingerprint: fingerprint({ site, attrs, host }),
        });
      }
    }
    if (forms.length > 100000) throw new Error('FormInventoryLimitExceeded');
  }
  for (const form of forms) {
    if (seen.has(form.reference)) throw new Error('AmbiguousFormReference');
    seen.add(form.reference);
  }
  return { status: 'available', forms };
}
export function resolveFormReference(
  document: FormDocument,
  reference: string,
  inventory = readFormInventory(document),
): FormControl {
  const parsed = parseObjectReference(reference, {
    sourceSha256: document.sourceSha256,
    format: document.format,
  });
  if (parsed.kind !== 'form' || parsed.section >= document.sectionCount)
    throw new Error('ExpectedFormReference');
  if (inventory.status !== 'available') throw new Error(inventory.reason);
  const rows = inventory.forms.filter((row) => row.reference === reference);
  if (rows.length !== 1) throw new Error('FormReferenceNotFound');
  return rows[0];
}
export function publicFormInventory(inventory: FormInventory) {
  return {
    ...inventory,
    forms: inventory.forms.map((form) => {
      const { fingerprint, ...row } = form;
      void fingerprint;
      return row;
    }),
  };
}
export function renderFormInventory(inventory: FormInventory): string {
  const escape = createDisplayEscaper({ format: 'text', view: 'structure' });
  const text = 'formControls: ' + escape(JSON.stringify(publicFormInventory(inventory))) + '\n';
  if (new TextEncoder().encode(text).length > 4 * 1024 * 1024)
    throw new Error('FormInspectionOutputLimitExceeded');
  return text;
}
