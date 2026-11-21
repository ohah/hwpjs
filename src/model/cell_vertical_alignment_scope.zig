//! Native-only scope identities; never exchanged by undo or supplied by callers.
const std = @import("std");
const builtin = @import("builtin");
var native_next: std.atomic.Value(u64) = .init(1);
// Current freestanding WASM instances own separate single-threaded memories.
// Keep this branch free of a new shared-memory/atomics feature requirement.
var wasm_next: u64 = 1;
pub fn issue() !u64 {
    if (builtin.cpu.arch == .wasm32 or builtin.cpu.arch == .wasm64) {
        const current = wasm_next;
        if (current == 0) return error.CellVerticalAlignmentScopeExhausted;
        wasm_next = std.math.add(u64, current, 1) catch 0;
        return current;
    }
    var current = native_next.load(.monotonic);
    while (true) {
        if (current == 0) return error.CellVerticalAlignmentScopeExhausted;
        const after = std.math.add(u64, current, 1) catch 0;
        if (native_next.cmpxchgWeak(current, after, .monotonic, .monotonic)) |actual| current = actual else return current;
    }
}
