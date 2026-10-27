//! Source-only regression draft. Must not be reported as executed Native proof.
const std = @import("std");
const p = @import("../model/formatting_projection.zig");
const m = @import("../model/formatting_patch.zig");
const Binding = @import("../model/formatting_binding.zig").State;
test "formatting binding rejects closed and reopened sessions" {
    const a = std.testing.allocator;
    var binding: Binding = .{};
    try std.testing.expectError(error.EditorNotOpen, binding.coordinate("p1:0:0"));
    try binding.open();
    const session = try binding.session(a);
    defer a.free(session);
    const ref = try binding.reference(a, .{ .section = 0, .paragraph = 3 });
    defer a.free(ref);
    try binding.check(.{ .session = session, .revision = 4 }, 4);
    try std.testing.expectEqualDeep(m.Owner{ .section = 0, .paragraph = 3 }, try binding.coordinate(ref));
    try std.testing.expectError(error.StaleFormattingBinding, binding.check(.{ .session = session, .revision = 4 }, 5));
    binding.close();
    try binding.open();
    try std.testing.expectError(error.StaleFormattingBinding, binding.coordinate(ref));
}
test "formatting query aggregate keeps unavailable despite absent unit" {
    const a = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const values = [_]p.Observation{
        p.known(p.integer(1200), true, null, "hundredth-point"),
        p.unknown("MissingHeight", "MissingSourceField"),
        p.unavailable("UnsupportedOwner"),
    };
    const result = try p.aggregate(&values);
    try std.testing.expectEqual(.unavailable, result.state);
    try std.testing.expectEqualStrings("UnsupportedOwner", result.reason.?);
    try std.testing.expectEqualStrings("MissingSourceField", result.writeUnavailableReason.?);
}
test "formatting font patch asks only explicitly requested language" {
    const a = std.testing.allocator;
    var patch: m.Patch = .{};
    patch.fonts[0] = .{ .id = 0 };
    const fields = try p.requestedFields(a, patch);
    defer a.free(fields);
    try std.testing.expectEqual(@as(usize, 1), fields.len);
    try std.testing.expectEqualStrings("character.fonts.hangul.id", fields[0]);
}
test "formatting JSON equality is semantic for owned font strings" {
    const a = std.testing.allocator;
    const one = try a.dupe(u8, "same-font");
    defer a.free(one);
    const two = try a.dupe(u8, "same-font");
    defer a.free(two);
    try std.testing.expect(p.equal(.{ .string = one }, .{ .string = two }));
    try std.testing.expect(!p.equal(.{ .integer = 0 }, .{ .bool = false }));
}

// A readonly backend double isolates allocator classification. This source test
// is not a real-format/OOM execution receipt until it has actually been run.
const OomBackend = struct {
    pub fn paragraphField(_: @This(), _: std.mem.Allocator, _: m.Owner, _: []const u8) !p.Observation {
        return p.known(p.integer(1), true, null, null);
    }
    pub fn spans(_: @This(), a: std.mem.Allocator, _: m.Owner) ![]p.Span {
        return a.alloc(p.Span, 0);
    }
    pub fn validateRange(_: @This(), _: m.Owner, _: m.Range) !void {}
    pub fn characterField(_: @This(), _: std.mem.Allocator, _: u32, _: []const u8) !p.Observation {
        return p.known(p.integer(1), true, null, null);
    }
    pub fn authorize(_: @This(), _: m.Owner, _: []const m.Range, _: []const u8) !void {
        return error.OutOfMemory;
    }
};
test "formatting authorization OOM propagates instead of writable false" {
    try std.testing.expectError(error.OutOfMemory, p.observe(std.testing.allocator, OomBackend{}, .{ .section = 0, .paragraph = 0 }, &.{}, "paragraph.alignment"));
}
