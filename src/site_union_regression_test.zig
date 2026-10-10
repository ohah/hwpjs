//! Focused entrypoint: eagerly discover the site-union module's tests.
comptime {
    _ = @import("hwpx/paragraph_site_union.zig");
    _ = @import("hwpx/paragraph_site_union_tests.zig");
    _ = @import("hwpx/title_mark_edit_tests.zig");
}

test "title ownership clone is independent and counted in the model budget" {
    const std = @import("std");
    const model = @import("hwpx/paragraph_structure_values.zig");
    const Position = @import("hwpx/title_mark_position.zig").Position;
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator) !void {
            var original: model.Paragraph = .{ .template_element = 1, .source_ordinal = 1, .sites = .{ .items = try a.alloc(@import("hwpx/text_sites.zig").Site, 0) } };
            defer original.deinit(a);
            original.title_positions = try a.dupe(Position, &.{.{ .element_index = 3, .unit = 7 }});
            var copied = try original.clone(a);
            defer copied.deinit(a);
            copied.title_positions.?[0].unit = 20;
            try std.testing.expectEqual(@as(usize, 7), original.title_positions.?[0].unit);
            var rows = [_]model.Paragraph{original};
            const values: model.Values = .{ .paragraphs = &rows };
            const size = try values.byteSize(10000);
            try std.testing.expectEqual(@sizeOf(model.Paragraph) + @sizeOf(Position), size);
            try std.testing.expectError(error.LimitExceeded, values.byteSize(size - 1));
        }
    }.run, .{});
}
