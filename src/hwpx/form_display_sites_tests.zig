const std = @import("std");
const editor = @import("editor_session.zig");
const subject = @import("form_display_sites.zig");
test "HWPX form current sites follow Unicode insertion split and undo without source position caches" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/form-01.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const original = try subject.read(a, &session, 0);
    defer a.free(original);
    try std.testing.expectEqual(@as(usize, 5), original.len);
    for (original, [_]usize{ 1, 3, 5, 7, 9 }) |site, paragraph| {
        try std.testing.expectEqual(.located, site.state);
        try std.testing.expectEqual(@as(?usize, paragraph), site.paragraph);
        try std.testing.expectEqual(@as(?usize, 0), site.anchorUnit);
    }
    _ = try session.spliceAnchored(0, 3, 0, 0, "앞😀");
    const inserted = try subject.read(a, &session, 0);
    defer a.free(inserted);
    try std.testing.expectEqual(original[1].formNode, inserted[1].formNode);
    try std.testing.expectEqual(@as(?usize, 3), inserted[1].anchorUnit);
    var snapshot = try @import("editor_checkpoint.zig").capture(&session, 4_000_000);
    defer snapshot.deinit();
    _ = try session.splitParagraphAnchored(0, 3, 3, 0);
    const split = try subject.read(a, &session, 0);
    defer a.free(split);
    try std.testing.expectEqual(@as(?usize, 4), split[1].paragraph);
    try std.testing.expectEqual(@as(?usize, 0), split[1].anchorUnit);
    try snapshot.exchange(&session);
    const restored = try subject.read(a, &session, 0);
    defer a.free(restored);
    try std.testing.expectEqualDeep(inserted, restored);
    try std.testing.expectError(error.InvalidSectionIndex, subject.read(a, &session, 99));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session) !void {
            const rows = try subject.read(allocator, source, 0);
            defer allocator.free(rows);
            try std.testing.expectEqual(@as(usize, 5), rows.len);
            try std.testing.expectEqual(@as(?usize, 3), rows[1].anchorUnit);
        }
    }.run, .{&session});
}
