//! Owned current form field intent, never a serialized payload cache.
const std = @import("std");
pub const Field = enum { text, value };
pub const Value = struct { source_node: u32, field: Field = .text, text: []u8 };
pub fn find(values: []const Value, source_node: u32) ?Value {
    var low: usize = 0;
    var high = values.len;
    while (low < high) {
        const mid = low + (high - low) / 2;
        if (values[mid].source_node < source_node) low = mid + 1 else high = mid;
    }
    return if (low < values.len and values[low].source_node == source_node) values[low] else null;
}
pub fn deinit(a: std.mem.Allocator, values: []Value) void {
    for (values) |value| a.free(value.text);
    a.free(values);
}
pub fn clone(a: std.mem.Allocator, values: []const Value) ![]Value {
    const result = try a.alloc(Value, values.len);
    var initialized: usize = 0;
    errdefer {
        for (result[0..initialized]) |value| a.free(value.text);
        a.free(result);
    }
    for (values, result) |value, *out| {
        out.* = .{ .source_node = value.source_node, .field = value.field, .text = try a.dupe(u8, value.text) };
        initialized += 1;
    }
    return result;
}

pub fn upsert(a: std.mem.Allocator, target: *?[]Value, source_node: u32, text: []const u8, original: []const u8, limit: usize) !void {
    return upsertField(a, target, source_node, .text, text, original, limit);
}
pub fn upsertField(a: std.mem.Allocator, target: *?[]Value, source_node: u32, field: Field, text: []const u8, original: []const u8, limit: usize) !void {
    const previous = target.* orelse &.{};
    var index: ?usize = null;
    var total: usize = 0;
    for (previous, 0..) |value, i| {
        if (i > 0 and previous[i - 1].source_node >= value.source_node) return error.SourceBindingMismatch;
        if (value.source_node == source_node) {
            if (value.field != field) return error.SourceBindingMismatch;
            if (index != null) return error.SourceBindingMismatch;
            index = i;
        } else {
            if (value.text.len > limit -| total) return error.LimitExceeded;
            total += value.text.len;
        }
    }
    const reset = std.mem.eql(u8, text, original);
    if (index) |i| {
        if (!reset and std.mem.eql(u8, text, previous[i].text)) return;
    } else if (reset) return;
    if (!reset and text.len > limit -| total) return error.LimitExceeded;
    const count = previous.len + @as(usize, if (index == null and !reset) 1 else 0) - @as(usize, if (index != null and reset) 1 else 0);
    if (count > 100_000) return error.LimitExceeded;
    const replacement = if (reset) null else try a.dupe(u8, text);
    errdefer if (replacement) |bytes| a.free(bytes);
    const next = if (count == 0) null else try a.alloc(Value, count);
    var cursor: usize = 0;
    var inserted = false;
    for (previous, 0..) |value, i| {
        if (index == null and !reset and !inserted and source_node < value.source_node) {
            next.?[cursor] = .{ .source_node = source_node, .field = field, .text = replacement.? };
            cursor += 1;
            inserted = true;
        }
        if (index != null and index.? == i) {
            if (reset) continue;
            next.?[cursor] = .{ .source_node = source_node, .field = field, .text = replacement.? };
        } else next.?[cursor] = value;
        cursor += 1;
    }
    if (index == null and !reset and !inserted) next.?[cursor] = .{ .source_node = source_node, .field = field, .text = replacement.? };
    if (index) |i| a.free(previous[i].text);
    if (target.*) |owned| a.free(owned);
    target.* = next;
}
