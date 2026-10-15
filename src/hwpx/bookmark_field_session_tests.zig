const std = @import("std");

test "BOOKMARK field with point bookmark uses protected label transaction" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/opengov/36388711_사회보장제도 신설 협의요청서(청년오피스)_260624.hwpx", a, .limited(4_000_000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(!try session.canEdit(0, 1));
    const targets = try session.fieldLabels(0, 1);
    defer a.free(targets);
    try std.testing.expectEqual(@as(usize, 1), targets.len);
    try std.testing.expectEqual(@as(u32, 0), targets[0].start);
    const text = "책갈피😀<&";
    try std.testing.expect(try session.spliceFieldLabel(0, 1, targets[0].begin_element, 0, 0, text));
    const changed = try session.fieldLabels(0, 1);
    defer a.free(changed);
    try std.testing.expectEqual(targets[0].end + try @import("text_site_edit.zig").utf16Length(text), changed[0].end);
    try std.testing.expectError(error.InvalidTextPosition, session.spliceFieldLabel(0, 1, targets[0].begin_element, changed[0].end + 1, 0, "bad"));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    const again = try reopened.fieldLabels(0, 1);
    defer a.free(again);
    try std.testing.expectEqualDeep(changed, again);
    try std.testing.expectEqualSlices(u8, input, session.source);
}
