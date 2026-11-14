const std = @import("std");
const editor = @import("editor_session.zig");
const histories = @import("editor_history.zig");
const Kind = enum { equation, chart };
fn trial(root: std.mem.Allocator, input: []const u8, kind: Kind, failure: ?usize, no_resize: bool) !usize {
    var nr: @import("../testing/no_resize_allocator.zig").NoResize = .{ .backing = root };
    var failing = std.testing.FailingAllocator.init(if (no_resize) nr.allocator() else root, .{});
    const a = failing.allocator();
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var h = try histories.History.initV2(&session, .{});
    defer h.deinit();
    try std.testing.expect(try h.apply(&session, .{ .paragraph = 1, .start = 0, .deleted = 0, .inserted = "A" }));
    try std.testing.expect(try h.apply(&session, .{ .paragraph = 1, .start = 1, .deleted = 0, .inserted = "B" }));
    try std.testing.expect(try h.undo(&session));
    const before = try session.save();
    defer a.free(before);
    const pointer = session.source.ptr;
    const serial = session.mutation_serial;
    const rev = h.revision();
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(before, &digest, .{});
    const e: @import("equation_insert.zig").Request = .{ .expected_source_sha256 = digest, .target = .{ .section = 0, .paragraph = 1, .unit = 1, .expected_text = "A" }, .script = "x^2", .width = 2400, .height = 1200, .base_line = 80, .base_unit = 1000, .font = "HYhwpEQ", .version = "Equation Version 60" };
    const c: @import("chart_create.zig").Request = .{ .expected_source_sha256 = digest, .target = e.target, .size = .{ .width = 21600, .height = 14400 }, .data = .{ .categories = &.{ "A", "B" }, .series = &.{.{ .name = "S", .values = &.{ "1", "2" } }} } };
    const command: histories.Command = if (kind == .equation) .{ .kind = .equation_insert, .paragraph = 1, .start = 1, .deleted = 0, .inserted = "", .equation_insert = &e } else .{ .kind = .chart_create, .paragraph = 1, .start = 1, .deleted = 0, .inserted = "", .chart_create = &c };
    const start = failing.alloc_index;
    if (failure) |offset| failing.fail_index = start + offset;
    const result = h.apply(&session, command);
    const count = failing.alloc_index - start;
    const induced = failing.has_induced_failure;
    failing.fail_index = std.math.maxInt(usize);
    if (induced) {
        try std.testing.expectError(error.OutOfMemory, result);
        try std.testing.expectEqual(pointer, session.source.ptr);
        try std.testing.expectEqual(rev, h.revision());
        try std.testing.expectEqual(serial, session.mutation_serial);
        const unchanged = try session.save();
        defer a.free(unchanged);
        try std.testing.expectEqualSlices(u8, before, unchanged);
        try std.testing.expect(try h.redo(&session));
        const text = try session.anchorText(0, 1);
        defer a.free(text);
        try std.testing.expectEqualStrings("AB", text);
    } else {
        try std.testing.expect(try result);
        const after = try session.save();
        defer a.free(after);
        try std.testing.expect(try h.undo(&session));
        const undone = try session.save();
        defer a.free(undone);
        try std.testing.expectEqualSlices(u8, before, undone);
        try std.testing.expect(try h.redo(&session));
        const redone = try session.save();
        defer a.free(redone);
        try std.testing.expectEqualSlices(u8, after, redone);
    }
    return count;
}
fn sweep(kind: Kind) !void {
    const a = std.testing.allocator;
    const input = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(input);
    _ = try trial(a, input, kind, null, false);
    const count = try trial(a, input, kind, null, true);
    try std.testing.expect(count > 0);
    for (0..count) |i| _ = try trial(a, input, kind, i, true);
    try std.testing.expectEqual(count, try trial(a, input, kind, count, true));
    std.debug.print("managed {s} NoResize induced={d} plus boundary success\n", .{ @tagName(kind), count });
}
test "HWPX inline object whole managed NoResize equation OOM" {
    try sweep(.equation);
}
test "HWPX inline object whole managed NoResize chart OOM" {
    try sweep(.chart);
}
