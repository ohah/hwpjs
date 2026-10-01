const std = @import("std");
const sites_mod = @import("text_sites.zig");

test "HWPX owned Sites clone preserves source bindings and allocation failure atomicity" {
    var text = [_]u8{ 'A', '&' };
    var empty: [0]u8 = .{};
    var items = [_]sites_mod.Site{
        .{ .element_index = 7, .start = 12, .end = 20, .text = &text, .empty_element = true },
        .{ .element_index = 8, .start = 21, .end = 21, .text = &empty, .missing_text = true, .anchor_boundary = true },
    };
    const original: sites_mod.Sites = .{ .items = &items };
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, source: *const sites_mod.Sites) !void {
            var copy = try source.clone(a);
            defer copy.deinit(a);
            try std.testing.expectEqual(source.items.len, copy.items.len);
            for (source.items, copy.items) |before, after| {
                try std.testing.expectEqual(before.element_index, after.element_index);
                try std.testing.expectEqual(before.start, after.start);
                try std.testing.expectEqual(before.end, after.end);
                try std.testing.expectEqual(before.empty_element, after.empty_element);
                try std.testing.expectEqual(before.missing_text, after.missing_text);
                try std.testing.expectEqual(before.anchor_boundary, after.anchor_boundary);
                try std.testing.expectEqualSlices(u8, before.text, after.text);
            }
            copy.items[0].text[0] = 'B';
            try std.testing.expectEqualStrings("A&", source.items[0].text);
        }
    }.run, .{&original});
    try std.testing.expectEqualStrings("A&", original.items[0].text);
}
