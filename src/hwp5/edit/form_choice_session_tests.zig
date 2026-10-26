const std = @import("std");
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const a = std.testing.allocator;
fn expectValue(session: *const edit.Session, expected: u16) !void {
    const rows = try session.formProperties(a, 0);
    defer @import("form_property_snapshot.zig").deinit(a, rows);
    for (rows) |row| if (row.object_node == 22) {
        for (row.fields) |field| if (field.field == .value) {
            try std.testing.expectEqualSlices(u16, &.{expected}, field.units);
            return;
        };
    };
    return error.MissingTestFormChoice;
}
fn equalSave(session: *const edit.Session, wanted: []const u8) !void {
    const result = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(result.bytes);
    try std.testing.expectEqualSlices(u8, wanted, result.bytes);
}
test "HWP5 checkbox model composes text history resets and refuses unsupported states" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/form-02.hwp", a, .limited(8_000_000));
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    var history = try History.init(a, session, 10, 16 * 1024 * 1024);
    defer history.deinit();
    const change: edit.Command = .{ .set_form_choice = .{ .section = 0, .form_node = 22, .state = 0 } };
    try std.testing.expect(try history.apply(session, change));
    try expectValue(session, '0');
    try std.testing.expect(!try history.apply(session, change));
    try std.testing.expectError(error.LayoutReflowRequired, session.save(a, .{}));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    try expectValue(reopened, '0');
    try std.testing.expect(try history.apply(session, .{ .set_form_text = .{ .section = 0, .form_node = 49, .text = "함께😀" } }));
    try expectValue(session, '0');
    try std.testing.expect(try history.undo(session));
    try equalSave(session, saved.bytes);
    try std.testing.expectError(error.FormTriStateRequired, history.apply(session, .{ .set_form_choice = .{ .section = 0, .form_node = 22, .state = 2 } }));
    try std.testing.expectError(error.UnsupportedFormChoiceKind, history.apply(session, .{ .set_form_choice = .{ .section = 0, .form_node = 40, .state = 1 } }));
    try std.testing.expectError(error.InvalidFormChoiceState, history.apply(session, .{ .set_form_choice = .{ .section = 0, .form_node = 22, .state = 3 } }));
    try std.testing.expect(try history.redo(session));
    try std.testing.expect(try history.undo(session));
    try std.testing.expect(try history.apply(session, .{ .set_form_choice = .{ .section = 0, .form_node = 22, .state = 1 } }));
    try equalSave(session, input);
}
fn failures(allocator: std.mem.Allocator, input: []const u8) !void {
    const session = try edit.Session.open(allocator, input);
    defer session.close();
    session.apply(.{ .set_form_choice = .{ .section = 0, .form_node = 22, .state = 0 } }) catch |err| {
        try expectValue(session, '1');
        try equalSave(session, input);
        return err;
    };
    var history = try History.init(allocator, session, 4, 16 * 1024 * 1024);
    defer history.deinit();
    _ = history.apply(session, .{ .set_form_text = .{ .section = 0, .form_node = 49, .text = "소유😀" } }) catch |err| {
        try expectValue(session, '0');
        return err;
    };
    try expectValue(session, '0');
}
test "HWP5 checkbox transaction and mixed field checkpoint survive every allocation failure" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/form-02.hwp", a, .limited(8_000_000));
    defer a.free(input);
    try @import("../../testing/allocation_failures.zig").check(failures, .{input});
}
