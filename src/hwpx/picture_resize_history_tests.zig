const std = @import("std");
const editor = @import("editor_session.zig");
const histories = @import("editor_history.zig");
test "picture resize history restores both dimension and matrix owners and retains redo on failed batch" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapepict-scaled.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var history = try histories.History.init(&session, 8, 4_000_000);
    defer history.deinit();
    var picture: ?usize = null;
    for (session.sections[0].tree.elements, 0..) |element, node| if (element.is(@import("document_xml.zig").paragraph_uri, "pic")) {
        picture = node;
        break;
    };
    const node = picture orelse return error.MissingPictureImage;
    const command: histories.Command = .{ .kind = .picture_resize, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .picture_node = node, .picture_size = .{ 10000, 6000 } };
    try std.testing.expect(try history.apply(&session, command));
    const changed = try session.save();
    defer a.free(changed);
    try std.testing.expect(try history.undo(&session));
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, bytes, restored);
    var invalid = command;
    invalid.picture_size = .{ 0, 6000 };
    try std.testing.expectError(error.InvalidResizeAxisSize, history.applyBatch(&session, &.{ command, invalid }));
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].picture_dimensions.items.len);
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].picture_matrices.items.len);
    var noop = command;
    noop.picture_size = .{ 37500, 22500 };
    try std.testing.expect(!try history.apply(&session, noop));
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, changed, redone);
}
