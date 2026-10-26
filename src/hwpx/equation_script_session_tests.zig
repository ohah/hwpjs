const std = @import("std");
const editor = @import("editor_session.zig");
const history = @import("editor_history.zig");
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const body = "<p:p><p:run><p:t>body</p:t><p:equation baseLine='7'><p:script>A</p:script></p:equation><p:dutmal><p:mainText>M</p:mainText><p:subText>S</p:subText></p:dutmal></p:run><p:linesegarray/></p:p><p:p><p:run><p:t>other</p:t></p:run></p:p>";

fn find(session: *const editor.Session, kind: @import("run_anchor.zig").Kind) !usize {
    for (session.sections[0].tree.elements, 0..) |_, index| {
        if (@import("run_anchor.zig").kind(&session.sections[0].tree, index) == kind) return index;
    }
    return error.MissingEquationNode;
}

test "equation script session history save reopen no-op and refused edit preserves redo" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, prefix ++ body ++ "</s:sec>");
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const node = try find(&session, .equation);
    var h = try history.History.init(&session, 8, 1_000_000);
    defer h.deinit();
    const command: history.Command = .{ .kind = .equation_script, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "{a+b} over c😀<&", .equation_node = node };
    const initial_size = try @import("editor_checkpoint.zig").size(&session, 1_000_000);
    try std.testing.expect(try h.apply(&session, command));
    try std.testing.expectEqual(@as(u32, 1), h.stack.revision);
    try std.testing.expect((try @import("editor_checkpoint.zig").size(&session, 1_000_000)) > initial_size);
    try std.testing.expect(!try h.apply(&session, command));
    try std.testing.expectEqual(@as(u32, 1), h.stack.revision);
    const changed = try session.save();
    defer a.free(changed);
    var reopened = try editor.open(a, changed, .{});
    defer reopened.deinit();
    const text = try reopened.equationScript(0, try find(&reopened, .equation));
    defer a.free(text);
    try std.testing.expectEqualStrings(command.inserted, text);
    try std.testing.expect(try h.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, input, undone);
    var invalid = command;
    invalid.inserted = &.{0};
    try std.testing.expectError(error.InvalidXmlCharacter, h.apply(&session, invalid));
    try std.testing.expectEqual(@as(u32, 0), h.stack.revision);
    try std.testing.expectEqual(@as(usize, 1), h.stack.redo.items.len);
    try std.testing.expect(try h.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, changed, redone);
    invalid = command;
    invalid.start = 1;
    try std.testing.expectError(error.InvalidEquationScriptCommand, h.apply(&session, invalid));
    try std.testing.expectError(error.InvalidSectionIndex, session.setEquationScript(999, node, "x"));
    try std.testing.expect(try session.setEquationScript(0, node, "A"));
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].equation_scripts.entries.items.len);
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
    try std.testing.expect(try session.setEquationScript(0, node, "pending"));
    try std.testing.expectError(error.UnsupportedEquationStructuralSave, session.splitParagraph(0, 2, 1, 0));
    try std.testing.expect(!try session.canSplitParagraph(0, 2, 1, 0));
    try std.testing.expect(session.sections[0].structure_values == null);
    try std.testing.expect(try session.setEquationScript(0, node, "A"));
    try std.testing.expect(try session.splitParagraph(0, 2, 1, 0));
    try std.testing.expectError(error.UnsupportedEquationStructuralSave, session.setEquationScript(0, node, "blocked"));
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].equation_scripts.entries.items.len);
}

test "equation script session field invalidation shared with dutmal and protected field refusals" {
    const a = std.testing.allocator;
    for ([_]struct { kind: []const u8, closed: bool, failure: ?anyerror }{
        .{ .kind = "CLICK_HERE", .closed = true, .failure = null },
        .{ .kind = "DATE", .closed = true, .failure = error.UnsupportedEquationFieldEdit },
        .{ .kind = "CLICK_HERE", .closed = false, .failure = error.ProtectedFieldRange },
    }) |case| {
        const xml = try std.fmt.allocPrint(a, "{s}<p:p><p:run><p:ctrl><p:fieldBegin id='1' type='{s}' dirty='0'/></p:ctrl><p:equation><p:script>A</p:script></p:equation><p:dutmal><p:mainText>M</p:mainText><p:subText>S</p:subText></p:dutmal>{s}</p:run><p:linesegarray/></p:p></s:sec>", .{ prefix, case.kind, if (case.closed) "<p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl>" else "" });
        defer a.free(xml);
        const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
        defer a.free(input);
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        const node = try find(&session, .equation);
        if (case.failure) |failure| {
            try std.testing.expectError(failure, session.setEquationScript(0, node, "new"));
            try std.testing.expectEqual(@as(usize, 0), session.sections[0].equation_scripts.entries.items.len);
            const saved = try session.save();
            defer a.free(saved);
            try std.testing.expectEqualSlices(u8, input, saved);
        } else {
            try std.testing.expect(try session.setDutmalText(0, try find(&session, .dutmal), .sub_text, "new sub"));
            try std.testing.expect(try session.setEquationScript(0, node, "new equation"));
            const dirty = try @import("equation_script_session.zig").fieldDirty(&session, 0);
            defer a.free(dirty);
            try std.testing.expectEqual(@as(usize, 1), dirty.len);
            try std.testing.expect(dirty[0].dirty);
            const saved = try session.save();
            defer a.free(saved);
            var reopened = try editor.open(a, saved, .{});
            defer reopened.deinit();
            try std.testing.expect(reopened.source_fields.?.report.markers[0].begin.?.dirty.?);
        }
        try std.testing.expectEqual(@as(usize, 0), session.sections[0].field_dirty.items.len);
    }
}

test "equation script session full allocation failure leaves original and history unchanged" {
    const base = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithSection(base, prefix ++ body ++ "</s:sec>");
    defer base.free(input);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(a: std.mem.Allocator, source: []const u8) !void {
            var session = try editor.open(a, source, .{});
            defer session.deinit();
            var h = try history.History.init(&session, 2, 1_000_000);
            defer h.deinit();
            _ = h.apply(&session, .{ .kind = .equation_script, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "new😀<&", .equation_node = try find(&session, .equation) }) catch |err| {
                try std.testing.expectEqual(@as(usize, 0), session.sections[0].equation_scripts.entries.items.len);
                try std.testing.expectEqual(@as(u32, 0), h.stack.revision);
                try std.testing.expectEqual(@as(u32, 1), h.stack.next_revision);
                try std.testing.expectEqual(@as(usize, 0), h.stack.undo.items.len);
                var proxy = session;
                proxy.allocator = std.testing.allocator;
                const saved = try proxy.save();
                defer std.testing.allocator.free(saved);
                try std.testing.expectEqualSlices(u8, source, saved);
                return err;
            };
            try std.testing.expectEqual(@as(u32, 1), h.stack.revision);
        }
    }.run, .{input});
}

test "equation script session shared text budget cannot be bypassed by dutmal order" {
    const a = std.testing.allocator;
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, prefix ++ body ++ "</s:sec>");
    defer a.free(input);
    const text: [200]u8 = @splat('X');
    for ([_]bool{ false, true }) |equation_first| {
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        session.options.max_text_bytes = 400;
        const equation = try find(&session, .equation);
        const dutmal = try find(&session, .dutmal);
        if (equation_first) {
            try std.testing.expect(try session.setEquationScript(0, equation, &text));
        } else {
            try std.testing.expect(try session.setDutmalText(0, dutmal, .main_text, &text));
        }
        const before = try session.save();
        defer a.free(before);
        if (equation_first) {
            try std.testing.expectError(error.LimitExceeded, session.setDutmalText(0, dutmal, .main_text, &text));
        } else {
            try std.testing.expectError(error.LimitExceeded, session.setEquationScript(0, equation, &text));
        }
        const after = try session.save();
        defer a.free(after);
        try std.testing.expectEqualSlices(u8, before, after);
    }
}
