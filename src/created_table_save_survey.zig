//! Emits one actual staged/save fixture for the independent ZIP/XML oracle.
const std = @import("std");
test "emit created table saved fixture" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("hwpx/editor_session.zig").open(a, input, .{});
    defer session.deinit();
    var table = try @import("model/created_table.zig").create(a, 1, 33, try @import("model/table_creation_plan.zig").create(2, 2, 101, 17, 4), &.{ 1000000, 1000001, 1000002, 1000003 }, .{ .paragraph = 1, .character = 1, .style = 0, .border_fill = 1 }, 4);
    defer table.deinit(a);
    _ = try table.replaceText(a, 0, 0, "셀😀<&\r", 100);
    try std.testing.expect(try @import("hwpx/created_table_session.zig").stage(&session, 0, 2, 0, &table));
    const saved = try session.save();
    defer a.free(saved);
    try std.Io.File.stdout().writeStreamingAll(std.testing.io, saved);
}
