//! Ownership only. Definition bytes and numeric values share one model entry.
const std = @import("std");
const Result = @import("document.zig").FormulaResult;

pub fn deinit(a: std.mem.Allocator, values: []Result) void {
    for (values) |value| if (value.expression) |bytes| a.free(bytes);
    a.free(values);
}

pub fn clone(a: std.mem.Allocator, values: []const Result) ![]Result {
    const out = try a.dupe(Result, values);
    for (out) |*value| value.expression = null;
    errdefer deinit(a, out);
    for (values, out) |source, *target| if (source.expression) |bytes| {
        target.expression = try a.dupe(u8, bytes);
    };
    return out;
}

pub fn find(values: []const Result, node: usize) !?Result {
    var found: ?Result = null;
    for (values) |value| if (value.source_node == node) {
        if (found != null) return error.SourceBindingMismatch;
        found = value;
    };
    return found;
}

/// Consumes old only on success; borrows value.expression and makes its own copy.
pub fn upsert(a: std.mem.Allocator, old: ?[]Result, value: Result) ![]Result {
    const rows = old orelse &.{};
    _ = try find(rows, value.source_node);
    var index: ?usize = null;
    for (rows, 0..) |row, i| if (row.source_node == value.source_node) {
        index = i;
    };
    var owned = value;
    owned.expression = if (value.expression) |bytes| try a.dupe(u8, bytes) else null;
    errdefer if (owned.expression) |bytes| a.free(bytes);
    const length = std.math.add(usize, rows.len, @as(usize, if (index == null) 1 else 0)) catch return error.LimitExceeded;
    const out = try a.alloc(Result, length);
    @memcpy(out[0..rows.len], rows);
    out[index orelse rows.len] = owned;
    if (index) |i| if (rows[i].expression) |bytes| a.free(bytes);
    if (old) |values| a.free(values);
    return out;
}
