# Core input-surface compatibility boundary

`acquireInputSurface(hooks)` gives one host one input lease. A second active lease
is rejected. The lease never owns/disposes its editor. `release()` is idempotent,
cancels that host's composition with `detach`, and cannot release a successor.
Only Core's `editor.dispose()` terminates the editor and cancels with `dispose`.

This is an **internal compatibility port**, not a stable general JSON editing API.
`commands/surface-protocol.ts` is the exact read/mutation/view allowlist, based on
`web/preview/canvas-editor.mjs` and `reader-runtime.mjs`. Unknown `query-*` names are
not automatically reads. In particular `picture-bytes`, `table-background-bytes`,
`chart-display` and edit/split permission queries never masquerade as mutations.
`readResource(message, {token}?)` exposes those canonical reads without flushing IME
or incrementing the document revision. The experimental port cannot override
known read/mutation classifications.

A lease request requires a copied `StateToken` and `coordinates: 'legacy-native'`.
The legacy Canvas controller has already performed display-to-source projection.
The lease does **not** call the typed splice adapter or add one to paragraph IDs.
Core checks the lease, document/generation, operation/view revision before entering
Native; Native retains source/range/owner approval. The backend's existing HWPX
paragraph conversion still happens at its original boundary exactly once.
Mutation requests return a `CommandResult` (the original owned wire reply is in
`result.reply`); resource queries return the owned `RuntimeReply` directly.
`enable` and `set-edit-window` update Core's observation/state listeners without
inventing a document mutation. `load`, `unlock`, `save`, and disposal stay on the
editor API, not on this raw port.

At queue entry a detached lease is rejected without a Native request. A request
already executing when the host detaches is allowed to complete. Core preserves
its committed state/revision, then rejects that lease's Promise with
`InputSurfaceDetached` instead of acknowledging to the old host. The host must also
unsubscribe its own global listeners and fence render/resource callbacks with
`lease.isActive()`; release never removes another host's subscriptions.

`publishSelection(target)` installs the confirmed selection in Core. It is not an
IME draft store. Ownership comes from the existing `paragraphSelectionOwner`
projection: table/list metadata takes precedence over body ownership, otherwise
an explicit source-projected `selectionOwner` is required. Typed `SPLICE_TEXT_COMMAND`
supports editable, unclipped single-paragraph projections with that exact owner,
valid scalar boundaries, existing source offsets and (when present) current
references. Created cells need their existing `created-cell-text` protocol. A
header/footer or other nested row with no canonical owner is unsupported; Core
never guesses an owner from its visual location or invents a body owner. Selecting
a read-only projected row is allowed, while typed splice still rejects it.

External load/unlock/save/undo/redo/typed dispatch/update and experimental
mutations enter a separate FIFO admission queue. It settles
`hooks.commitComposition()` **before** entering Native's FIFO. `blocked`, rejected
hooks, detach during settlement, and disposal reject the external request. The
hook must commit/wait for its pending input through **its own lease**, which
bypasses that composition barrier; calling the external editor API recursively
from the hook would wait for its own admission. This separation allows an input
ack to finish while an external save is waiting for composition.

Implicit `save()`/`undo()`/`redo()` tokens are captured in their Native task after
settlement. An explicit `save({token})` or history token, typed target, or collected
command target is never silently rebased; a stale token is rejected. External
operation order remains FIFO even while hooks are async. Each operation settles
composition separately; a preceding blocked operation does not poison admission.
After a successful settlement, load calls `cancelComposition('load')` before
opening its candidate; unlock uses `external-replace`. Failed/cancelled candidates
preserve the previous active document. `cancelLoad()` cancels pending/in-flight
load candidates (including one waiting at admission), not the active editor or
its lease. Native work in progress is not freed early. Disposal interrupts pending
barriers and waits for admitted/native work and runtime cleanup to settle.

These contracts have fake-Runtime tests. They do not establish actual Canvas/IME,
fixture save parity, framework, Tailscale, or Native/RN E2E completion.
