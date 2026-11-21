import { PAGE_RESTART_MAX_ROWS, PAGE_RESTART_MAX_REASON } from '../../js/page-restart-limits.mjs';
import { ownPageRecord } from '../../js/page-settings-edit.mjs';
const uint = (v) => Number.isSafeInteger(v) && v >= 0 && v <= 0xffffffff && !Object.is(v, -0);
const number = (v) => uint(v) && v > 0 && v <= 65535;
/** Runtime transport draft, not a Native wire decoder. Native observations stay private. */
export function createPageRestartCommands(getEditor, writable) {
  let lastEditor,
    sequence = 0;
  const leases = new Map();
  function backend() {
    const editor = getEditor();
    if (editor !== lastEditor) {
      leases.clear();
      lastEditor = editor;
    }
    if (
      !writable() ||
      !editor ||
      editor.historyStats?.()?.protocolVersion !== 2 ||
      typeof editor.pageRestartCapabilities !== 'function' ||
      typeof editor.writePageRestart !== 'function' ||
      typeof editor.historyRevision !== 'function' ||
      typeof editor.ownsPageRestartObservation !== 'function'
    )
      throw Error('PageRestartEditUnavailable');
    return editor;
  }
  function read(editor) {
    const revision = editor.historyRevision(),
      cap = editor.pageRestartCapabilities();
    if (
      !uint(revision) ||
      revision === 0xffffffff ||
      !cap ||
      cap.schemaVersion !== 1 ||
      cap.binding?.revision !== String(revision) ||
      !['hwp5', 'hwpx'].includes(cap.format) ||
      !Array.isArray(cap.rows) ||
      cap.rows.length > PAGE_RESTART_MAX_ROWS
    )
      throw Error('InvalidPageRestartInventory');
    const keys = new Set();
    for (const row of cap.rows) {
      if (
        !row ||
        !uint(row.section) ||
        (row.controlNode !== null && !uint(row.controlNode)) ||
        (row.paragraph !== null && !uint(row.paragraph))
      )
        throw Error('InvalidPageRestartInventory');
      const key = `${row.section}:${row.controlNode}`;
      if (keys.has(key)) throw Error('AmbiguousPageRestart');
      keys.add(key);
      if (row.reason != null) {
        if (
          typeof row.reason !== 'string' ||
          !row.reason.length ||
          row.reason.length > PAGE_RESTART_MAX_REASON ||
          row.observation != null
        )
          throw Error('InvalidPageRestartInventory');
      } else if (
        row.controlNode === null ||
        !number(row.number) ||
        row.paragraph === null ||
        !row.observation ||
        typeof row.observation !== 'object' ||
        row.observation.revision !== String(revision) ||
        !Object.isFrozen(row.observation) ||
        editor.ownsPageRestartObservation(row.observation) !== true
      )
        throw Error('InvalidPageRestartInventory');
    }
    if (editor !== getEditor() || editor.historyRevision() !== revision)
      throw Error('StalePageRestartTarget');
    return { revision, format: cap.format, rows: cap.rows };
  }
  return {
    reset() {
      leases.clear();
      lastEditor = undefined;
    },
    query() {
      const editor = backend(),
        cap = read(editor),
        entries = [],
        unavailable = [];
      for (const row of cap.rows) {
        const { section, controlNode, paragraph } = row;
        if (row.reason != null) {
          unavailable.push({ section, controlNode, paragraph, reason: row.reason });
          continue;
        }
        while (leases.size >= PAGE_RESTART_MAX_ROWS) leases.delete(leases.keys().next().value);
        const leaseKey = String(++sequence),
          before = row.observation;
        leases.set(leaseKey, {
          editor,
          format: cap.format,
          section,
          controlNode,
          before,
          revision: cap.revision,
        });
        entries.push({ section, controlNode, paragraph, number: row.number, leaseKey });
      }
      return { schemaVersion: 1, format: cap.format, revision: cap.revision, entries, unavailable };
    },
    apply(message) {
      const fields = Reflect.ownKeys(message);
      if (
        fields.some(
          (key) => !['kind', 'leaseKey', 'number', 'origin', 'requestId'].includes(key),
        ) ||
        !['kind', 'leaseKey', 'number'].every((key) => Object.hasOwn(message, key))
      )
        throw Error('InvalidPageRestartRequest');
      const v = ownPageRecord(message, fields);
      if (v.kind !== 'edit-page-restart' || typeof v.leaseKey !== 'string' || !number(v.number))
        throw Error('InvalidPageRestartRequest');
      const editor = backend(),
        lease = leases.get(v.leaseKey);
      if (!lease || lease.editor !== editor) throw Error('ForeignPageRestartTarget');
      leases.delete(v.leaseKey);
      if (
        editor.historyRevision() !== lease.revision ||
        editor.ownsPageRestartObservation(lease.before) !== true
      )
        throw Error('StalePageRestartTarget');
      // Native managed History repeats the complete ticket/revision/source/owner check.
      return editor.writePageRestart({ before: lease.before, number: v.number });
    },
  };
}
