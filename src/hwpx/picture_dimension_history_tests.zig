const std = @import("std");
const editor = @import("editor_session.zig");
const history_module = @import("editor_history.zig");

test "HWPX picture dimension history saves zero-current fixture and rolls back late invalid batch" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/sample-5017-pics.hwpx", a, .limited(16_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var node: ?usize = null;
    for (session.sections[0].tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "pic")) {
            node = index;
            break;
        }
    }
    const picture = node orelse return error.MissingPictureImage;
    var history = try history_module.History.init(&session, 8, 16_000_000);
    defer history.deinit();
    const command: history_module.Command = .{ .kind = .picture_dimensions, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .picture_node = picture, .picture_dimensions = .{ .display = .{ 10000, 6000 }, .current = .{ 10000, 6000 } } };
    var invalid = command;
    invalid.inserted = "unexpected text";
    try std.testing.expectError(error.InvalidPictureDimensionCommand, history.applyBatch(&session, &.{ command, invalid }));
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].picture_dimensions.items.len);
    try std.testing.expect(!try history.undo(&session));
    try std.testing.expect(try history.apply(&session, command));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const dimensions = try @import("picture_dimension_values.zig").read(a, &reopened.sections[0].tree, picture);
    try std.testing.expectEqualDeep([2]?u32{ 10000, 6000 }, dimensions.display);
    try std.testing.expectEqualDeep(dimensions.display, dimensions.current);
    try std.testing.expectEqualDeep([2]?u32{ 12600, 7560 }, dimensions.original);
    try std.testing.expect(try history.undo(&session));
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, bytes, restored);
    var noop = command;
    noop.picture_dimensions = .{};
    try std.testing.expect(!try history.apply(&session, noop));
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}
