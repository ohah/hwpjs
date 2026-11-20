//! Snapshot construction owns every allocation before arena state is moved.
const std = @import("std");
const Snapshot = @import("document_text_snapshot.zig").Snapshot;
const State = @import("formatting_binding.zig").State;
const SectionCoverage = @import("text_transaction.zig").SectionCoverage;
fn emptyCase(a: std.mem.Allocator) !void {
    var state: State = .{};
    try state.open();
    var value = try Snapshot.init(a, .hwpx, state, null, .{ .sections = &.{}, .paragraphs = 0, .created_cell_paragraphs = 0 });
    defer value.deinit();
    try std.testing.expect(value.arena.queryCapacity() > 0);
    try value.validateComplete();
    const encoded = try value.encode(a);
    defer a.free(encoded);
    try std.testing.expectEqualStrings("s1", value.binding.session);
}
fn manyCase(a: std.mem.Allocator) !void {
    var sections: [257]SectionCoverage = undefined;
    for (&sections, 0..) |*entry, index| entry.* = .{ .section = @intCast(index), .paragraphs = 0 };
    var state: State = .{};
    try state.open();
    var value = try Snapshot.init(a, .hwp5, state, 7, .{ .sections = &sections, .paragraphs = 0, .created_cell_paragraphs = 0 });
    defer value.deinit();
    // The owned coverage survives mutation of its original input array.
    sections[0].section = 999;
    try std.testing.expectEqual(@as(u32, 0), value.coverage.sections[0].section);
    try value.validateComplete();
    const encoded = try value.encode(a);
    defer a.free(encoded);
}
test "document text search snapshot ownership zero coverage retains the session allocation" {
    try @import("../testing/allocation_failures.zig").check(emptyCase, .{});
}
test "document text search snapshot ownership multiple sections retains every arena allocation through OOM" {
    try @import("../testing/allocation_failures.zig").check(manyCase, .{});
}
