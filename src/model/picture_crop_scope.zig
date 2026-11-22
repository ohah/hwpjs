//! Native History owner scopes, not caller identifiers or undo state.
const std = @import("std");
const builtin = @import("builtin");
var native_next: std.atomic.Value(u64) = .init(1);
var wasm_next: u64 = 1;
pub fn issue() !u64 {
    if (builtin.cpu.arch == .wasm32 or builtin.cpu.arch == .wasm64) {
        const current = wasm_next;
        if (current == 0) return error.PictureCropScopeExhausted;
        wasm_next = std.math.add(u64, current, 1) catch 0;
        return current;
    }
    var current = native_next.load(.monotonic);
    while (true) {
        if (current == 0) return error.PictureCropScopeExhausted;
        const next = std.math.add(u64, current, 1) catch 0;
        if (native_next.cmpxchgWeak(current, next, .monotonic, .monotonic)) |actual| current = actual else return current;
    }
}
