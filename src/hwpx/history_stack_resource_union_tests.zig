const std = @import("std");
const editor = @import("editor_session.zig");
const history = @import("editor_history.zig");
const proof = @import("display_resource_generation.zig");
fn load() ![]u8 {
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwpx", std.testing.allocator, .limited(4_000_000));
}
fn suffix() history.Command {
    return .{ .section = 0, .paragraph = 3, .start = 4, .deleted = 0, .inserted = "x" };
}
test "SSOT resource union: managed delta preserves current valid proof and original save" {
    const a = std.testing.allocator;
    const bytes = try load();
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    proof.openOwned(&s);
    const generation = s.display_resource_generation;
    var h = try history.History.initV2(&s, .{});
    defer h.deinit();
    try std.testing.expect(try proof.applyOwned(&h, &s, &.{suffix()}));
    try std.testing.expect(s.display_resource_trusted);
    try std.testing.expectEqual(generation, s.display_resource_generation);
    try std.testing.expect(try h.undo(&s));
    const saved = try s.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
    try std.testing.expect(try h.redo(&s));
    try std.testing.expectEqual(generation, s.display_resource_generation);
}
test "SSOT resource union: managed serial alone never reauthenticates suspended proof" {
    const a = std.testing.allocator;
    const bytes = try load();
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    proof.openOwned(&s);
    const generation = s.display_resource_generation;
    var h = try history.History.initV2(&s, .{});
    defer h.deinit();
    const changed = try h.undo(&s);
    proof.afterTravel(&s, changed);
    try std.testing.expect(!changed and !s.display_resource_trusted);
    try std.testing.expect(try proof.applyOwned(&h, &s, &.{suffix()}));
    try std.testing.expect(!s.display_resource_trusted and s.display_resource_recoverable);
    try std.testing.expectEqual(generation, s.display_resource_generation);
}
test "SSOT resource union: managed bridge noop existing full comparison may reauthenticate" {
    const a = std.testing.allocator;
    const bytes = try load();
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    proof.openOwned(&s);
    var h = try history.History.initV2(&s, .{});
    defer h.deinit();
    proof.pauseReceipt(&s);
    // start0 is not the original suffix end4, so this uses the existing bridge CP comparison.
    const noop: history.Command = .{ .section = 0, .paragraph = 3, .start = 0, .deleted = 0, .inserted = "" };
    try std.testing.expect(!try proof.applyOwned(&h, &s, &.{noop}));
    try std.testing.expect(s.display_resource_trusted);
    try std.testing.expectEqual(@as(u32, 0), h.stats().revision);
}

test "SSOT resource union: paused managed format noop undo redo and branch never alias header generations" {
    const a = std.testing.allocator;
    const bytes = try load();
    defer a.free(bytes);
    var s = try editor.open(a, bytes, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    proof.openOwned(&s);
    const original_generation = s.display_resource_generation;
    var h = try history.History.initV2(&s, .{});
    defer h.deinit();
    const changed = try h.undo(&s);
    proof.afterTravel(&s, changed);
    try std.testing.expect(!changed and !s.display_resource_trusted);
    const format_command: history.Command = .{ .kind = .character_properties, .section = 0, .paragraph = 3, .start = 0, .deleted = 1, .inserted = "", .character_properties = .{ .size = 1800 } };
    try std.testing.expect(try proof.applyOwned(&h, &s, &.{format_command}));
    const formatted_generation = s.display_resource_generation;
    try std.testing.expect(formatted_generation != original_generation);
    try std.testing.expect(!s.display_resource_trusted);
    const formatted = try s.save();
    defer a.free(formatted);
    try std.testing.expect(!std.mem.eql(u8, bytes, formatted));
    const noop: history.Command = .{ .section = 0, .paragraph = 3, .start = 0, .deleted = 0, .inserted = "" };
    try std.testing.expect(!try proof.applyOwned(&h, &s, &.{noop}));
    try std.testing.expect(s.display_resource_trusted);
    try std.testing.expectEqual(formatted_generation, s.display_resource_generation);
    try std.testing.expect(try h.undo(&s));
    try std.testing.expectEqual(original_generation, s.display_resource_generation);
    const restored = try s.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, bytes, restored);
    try std.testing.expect(try h.redo(&s));
    try std.testing.expectEqual(formatted_generation, s.display_resource_generation);
    const redone = try s.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, formatted, redone);
    try std.testing.expect(try h.undo(&s));
    try std.testing.expect(try proof.applyOwned(&h, &s, &.{format_command}));
    try std.testing.expect(s.display_resource_generation != original_generation and s.display_resource_generation != formatted_generation);
}
