const std = @import("std");
test "created table display save excludes registry without mutating owned cells on allocation failures" {
    try @import("../testing/checked_allocator.zig").run(struct {
        fn run(a: std.mem.Allocator) !void {
            const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4000000));
            defer a.free(bytes);
            var session = try @import("editor_session.zig").open(a, bytes, .{});
            defer session.deinit();
            var table = try @import("created_table_prepare.zig").prepare(&session, 0, 2, 0, 1, 1, 100, 17, .{ .paragraph = 1, .character = 1, .style = 0, .border_fill = 1 });
            defer table.deinit(a);
            _ = try table.replaceText(a, 0, 0, "현재😀", 100);
            _ = try @import("created_table_session.zig").stage(&session, 0, 2, 0, &table);
            const saved = try session.save();
            defer a.free(saved);
            try std.testing.checkAllAllocationFailures(a, struct {
                fn run(allocator: std.mem.Allocator, source: *const @import("editor_session.zig").Session, original: []const u8) !void {
                    var borrowed = source.*;
                    borrowed.allocator = allocator;
                    const projected = try @import("editor_display_save.zig").save(&borrowed);
                    defer allocator.free(projected);
                    try std.testing.expectEqualSlices(u8, original, projected);
                }
            }.run, .{ &session, bytes });
            try std.testing.expectEqualStrings("현재😀", session.sections[0].created_tables.entries.items[0].table.cells[0].text);
            const after = try session.save();
            defer a.free(after);
            try std.testing.expectEqualSlices(u8, saved, after);
        }
    }.run, .{});
}
