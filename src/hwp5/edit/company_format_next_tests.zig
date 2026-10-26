const std = @import("std");
const Session = @import("style_preservation.zig").Session;
const a = std.testing.allocator;
const command: @import("style_preservation.zig").Command = .{ .set_character_properties = .{ .section = 0, .paragraph = 6, .start_unit = 0, .end_unit = 2, .properties = .{ .italic = true, .size = 1800 } } };
fn original() ![]u8 {
    return @import("company_reference_fixture.zig").company(a);
}
fn equals(s: *Session, b: []const u8) !void {
    const v = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(v.bytes);
    try std.testing.expectEqualSlices(u8, b, v.bytes);
}
test "Company format next deterministic early middle late OOM rollback and success" {
    const b = try original();
    defer a.free(b);
    var measured = std.testing.FailingAllocator.init(a, .{});
    const baseline = try Session.open(measured.allocator(), b);
    defer baseline.close();
    const start = measured.alloc_index;
    try baseline.apply(command);
    const total = measured.alloc_index - start;
    try std.testing.expect(total > 3);
    const positive = try baseline.save(a, .{ .allow_stale_layout = true });
    defer a.free(positive.bytes);
    try std.testing.expect(!std.mem.eql(u8, b, positive.bytes));
    const positions = [_]usize{ 0, total / 2, total - 1 };
    for (positions) |position| {
        var failing = std.testing.FailingAllocator.init(a, .{});
        const s = try Session.open(failing.allocator(), b);
        defer s.close();
        const count = s.characterShapeCount();
        failing.fail_index = failing.alloc_index + position;
        try std.testing.expectError(error.OutOfMemory, s.apply(command));
        failing.fail_index = std.math.maxInt(usize);
        try std.testing.expectEqual(count, s.characterShapeCount());
        try equals(s, b);
        // Same live session remains usable after rollback.
        try s.apply(command);
        try equals(s, positive.bytes);
    }
    std.debug.print("Company format next allocation points {d}; injected {any}; byte/resource rollback and subsequent success verified\n", .{ total, positions });
}
