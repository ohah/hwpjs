const std = @import("std");
const edit = @import("style_preservation.zig");
const History = @import("editor_history.zig").History;
const a = std.testing.allocator;
fn expectValue(session: *const edit.Session, node: usize, wanted: u16) !void {
    const rows = try session.formProperties(a, 0);
    defer @import("form_property_snapshot.zig").deinit(a, rows);
    for (rows) |row| if (row.object_node == node) {
        for (row.fields) |field| if (field.field == .value) {
            try std.testing.expectEqualSlices(u16, &.{wanted}, field.units);
            return;
        };
    };
    return error.MissingTestRadio;
}
fn equalSave(session: *const edit.Session, wanted: []const u8) !void {
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try std.testing.expectEqualSlices(u8, wanted, saved.bytes);
}
test "HWP5 radio session selects across paragraphs from current values as one history edit" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/basic/request.hwp", a, .limited(8_000_000));
    defer a.free(input);
    const session = try edit.Session.open(a, input);
    defer session.close();
    var history = try History.init(a, session, 12, 16 * 1024 * 1024);
    defer history.deinit();
    try std.testing.expect(!try history.apply(session, .{ .select_form_radio = .{ .section = 0, .form_node = 273 } }));
    try std.testing.expect(try history.apply(session, .{ .select_form_radio = .{ .section = 0, .form_node = 289 } }));
    try expectValue(session, 273, '0');
    try expectValue(session, 289, '1');
    try expectValue(session, 215, '1');
    try expectValue(session, 303, '1');
    try std.testing.expectEqual(@as(usize, 1), history.stack.undo.items.len);
    const first = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(first.bytes);
    const reopened = try edit.Session.open(a, first.bytes);
    defer reopened.close();
    try expectValue(reopened, 273, '0');
    try expectValue(reopened, 289, '1');
    try std.testing.expect(try history.apply(session, .{ .select_form_radio = .{ .section = 0, .form_node = 275 } }));
    try expectValue(session, 275, '1');
    try expectValue(session, 289, '0');
    try std.testing.expect(try history.undo(session));
    try equalSave(session, first.bytes);
    try std.testing.expectError(error.InvalidRadioTarget, history.apply(session, .{ .select_form_radio = .{ .section = 0, .form_node = 0 } }));
    try std.testing.expect(try history.redo(session));
    try expectValue(session, 275, '1');
    try std.testing.expect(try history.apply(session, .{ .select_form_radio = .{ .section = 0, .form_node = 273 } }));
    try equalSave(session, input);
    try std.testing.expect(try history.apply(session, .{ .select_form_radio = .{ .section = 0, .form_node = 217 } }));
    try expectValue(session, 215, '0');
    try expectValue(session, 217, '1');
    try std.testing.expect(try history.apply(session, .{ .select_form_radio = .{ .section = 0, .form_node = 301 } }));
    try expectValue(session, 303, '0');
    try expectValue(session, 301, '1');
    try expectValue(session, 217, '1');
    try expectValue(session, 273, '1');
}
fn failures(allocator: std.mem.Allocator, input: []const u8) !void {
    const session = try edit.Session.open(allocator, input);
    defer session.close();
    session.apply(.{ .select_form_radio = .{ .section = 0, .form_node = 217 } }) catch |err| {
        try expectValue(session, 215, '1');
        try expectValue(session, 217, '0');
        try equalSave(session, input);
        return err;
    };
    var history = try History.init(allocator, session, 4, 16 * 1024 * 1024);
    defer history.deinit();
    _ = history.apply(session, .{ .select_form_radio = .{ .section = 0, .form_node = 289 } }) catch |err| {
        try expectValue(session, 215, '0');
        try expectValue(session, 217, '1');
        try expectValue(session, 273, '1');
        try expectValue(session, 289, '0');
        return err;
    };
}
test "HWP5 radio group transaction and checkpoint survive every allocation failure" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/basic/request.hwp", a, .limited(8_000_000));
    defer a.free(input);
    try @import("../../testing/allocation_failures.zig").check(failures, .{input});
}

test "HWP5 radio document scope distinguishes identical node IDs in two decoded sections" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/basic/request.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    // A decoded-section control, not an original two-section fixture.
    const decoded = [_][]const u8{ bytes, bytes };
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &decoded);
    defer document.deinit(a);
    try @import("form_radio_apply.zig").apply(a, &decoded, source.header.version(), document.sections, .{ .section = 1, .form_node = 289 }, 32 * 1024 * 1024);
    const values = @import("../../model/form_values.zig");
    try std.testing.expectEqualSlices(u8, &.{ '0', 0 }, values.find(document.sections[0].form_values.?, 273).?.text);
    try std.testing.expect(values.find(document.sections[0].form_values.?, 289) == null);
    try std.testing.expectEqualSlices(u8, &.{ '0', 0 }, values.find(document.sections[1].form_values.?, 273).?.text);
    try std.testing.expectEqualSlices(u8, &.{ '1', 0 }, values.find(document.sections[1].form_values.?, 289).?.text);
    try @import("form_radio_apply.zig").apply(a, &decoded, source.header.version(), document.sections, .{ .section = 0, .form_node = 275 }, 32 * 1024 * 1024);
    try std.testing.expectEqualSlices(u8, &.{ '1', 0 }, values.find(document.sections[0].form_values.?, 275).?.text);
    try std.testing.expect(values.find(document.sections[1].form_values.?, 289) == null);
    for (document.sections) |section| {
        try std.testing.expect(values.find(section.form_values.?, 215) == null);
        try std.testing.expect(values.find(section.form_values.?, 303) == null);
    }
}
