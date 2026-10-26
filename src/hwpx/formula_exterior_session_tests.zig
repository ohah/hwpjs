const std = @import("std");

test "HWPX plain eligibility rejects cross paragraph field continuation including empty sites" {
    const a = std.testing.allocator;
    const paragraphs = "<p:p><p:run><p:ctrl><p:fieldBegin id='88' type='CLICK_HERE' name='body'/></p:ctrl><p:t>first</p:t></p:run></p:p>" ++
        "<p:p><p:run><p:t>inside</p:t></p:run></p:p>" ++
        "<p:p><p:run/></p:p>" ++
        "<p:p><p:run><p:t>last</p:t><p:ctrl><p:fieldEnd beginIDRef='88'/></p:ctrl><p:t>outside</p:t></p:run></p:p>" ++
        "<p:p><p:run><p:t>plain</p:t></p:run></p:p>";
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, paragraphs);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    for ([_]usize{ 2, 3 }) |paragraph| {
        try std.testing.expect(!try session.canEdit(0, paragraph));
        try std.testing.expectError(error.ProtectedFieldRange, session.splice(0, paragraph, 0, 0, "x"));
        try std.testing.expectError(error.ProtectedFieldRange, session.spliceAnchored(0, paragraph, 0, 0, "x"));
        try std.testing.expectError(error.UnsupportedStructuralFieldEdit, session.anchorText(0, paragraph));
    }
    try std.testing.expect(try session.canEdit(0, 5));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("editor_session.zig").Session) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            try std.testing.expect(!try proxy.canEdit(0, 3));
            try std.testing.expect(try proxy.canEdit(0, 5));
            const text: ?[]u8 = proxy.anchorText(0, 3) catch |err| switch (err) {
                error.UnsupportedStructuralFieldEdit => null,
                else => return err,
            };
            if (text) |value| {
                allocator.free(value);
                return error.UnexpectedFieldAnchorPermission;
            }
        }
    }.run, .{&session});
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}

const exterior = "<p:p><p:run><p:t>outside</p:t><p:ctrl><p:fieldBegin id='2' type='HYPERLINK'/></p:ctrl><p:t>label</p:t><p:ctrl><p:fieldEnd beginIDRef='2'/></p:ctrl></p:run></p:p>";

test "HWPX formula section exterior allocation failures preserve every current site" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, exterior);
    defer a.free(input);
    const editor = @import("editor_session.zig");
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: *const editor.Session) !void {
            var proxy = original.*;
            proxy.allocator = allocator;
            proxy.sections = try allocator.dupe(editor.Section, original.sections);
            defer allocator.free(proxy.sections);
            proxy.sections[0].sites = try original.sections[0].sites.clone(allocator);
            defer proxy.sections[0].sites.deinit(allocator);
            const changed = proxy.splice(0, 1, 0, 0, "한😀") catch |err| {
                for (original.sections[0].sites.items, proxy.sections[0].sites.items) |old, now| {
                    try std.testing.expectEqual(old.element_index, now.element_index);
                    try std.testing.expectEqualStrings(old.text, now.text);
                }
                try std.testing.expect(proxy.sections[0].structure_values == null);
                try std.testing.expectEqual(@as(usize, 0), proxy.sections[0].field_dirty.items.len);
                return err;
            };
            try std.testing.expect(changed);
            try std.testing.expectEqualStrings("한😀outside", proxy.sections[0].sites.items[0].text);
            for (original.sections[0].sites.items[1..], proxy.sections[0].sites.items[1..]) |old, now| try std.testing.expectEqualStrings(old.text, now.text);
        }
    }.run, .{&session});
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}

test "HWPX formula section exterior session preserves field boundary history and saved reopen" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithParagraphs(a, exterior);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try @import("field_outside_query.zig").canEdit(&session, 0, 1, 0, 0));
    try std.testing.expect(!try @import("field_outside_query.zig").canEdit(&session, 0, 1, 7, 7));
    var history = try @import("editor_history.zig").History.init(&session, 8, 4000000);
    defer history.deinit();
    try std.testing.expect(try history.apply(&session, .{ .paragraph = 1, .start = 0, .deleted = 0, .inserted = "한😀" }));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expect(try @import("field_outside_query.zig").canEdit(&reopened, 0, 1, 0, 0));
    try std.testing.expect(!try @import("field_outside_query.zig").canEdit(&reopened, 0, 1, 10, 10));
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, input, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
}
