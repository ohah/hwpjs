const std = @import("std");
const a = std.testing.allocator;
const editor = @import("hwpx/editor_session.zig");
fn open() !editor.Session {
    const b = try @import("hwpx/test_formula_fixture.zig").zipWithSection(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>BODY</p:t><p:checkBtn name='c' enabled='1' editable='1' triState='1' value='UNCHECKED'/><p:radioBtn name='r' enabled='1' editable='1' radioGroupName='g' value='CHECKED'/><p:comboBox enabled='1' editable='1' editEnable='1'><p:text>combo😀</p:text></p:comboBox></p:run></p:p></s:sec>");
    defer a.free(b);
    return editor.open(a, b, .{});
}
fn find(s: *const editor.Session, kind: @import("hwpx/run_anchor.zig").Kind) !usize {
    for (s.sections[0].tree.elements, 0..) |_, i| if (@import("hwpx/run_anchor.zig").kind(&s.sections[0].tree, i) == kind) return i;
    return error.NoNode;
}
test "R7 mixed choice combo current source and selected duplicate error order" {
    var s = try open();
    defer s.deinit();
    const check = try find(&s, .check_button);
    const radio = try find(&s, .radio_button);
    const combo = try find(&s, .combo_box);
    try std.testing.expect(try s.setCheckBoxState(0, check, .checked));
    try std.testing.expect(try s.setFormText(0, combo, "current😀"));
    var c = @import("hwpx/form_read_context.zig").Context.init(&s, 0);
    defer c.deinit();
    try std.testing.expectEqual(try s.checkBoxState(0, check), try c.choice(&s, 0, check, false));
    try std.testing.expectEqual(try s.radioButtonState(0, radio), try c.choice(&s, 0, radio, true));
    const text = try c.read(&s, 0, combo);
    defer a.free(text);
    try std.testing.expectEqualStrings("current😀", text);
    const saved = try s.save();
    defer a.free(saved);
    var copy = try s.sections[0].form_texts.clone(a);
    defer copy.deinit(a);
    try std.testing.expectEqualStrings("current😀", copy.entries.items[0].text);
}
test "R7 choice selected duplicate unselected duplicate and radio indeterminate unchanged" {
    var s = try open();
    defer s.deinit();
    const check = try find(&s, .check_button);
    const radio = try find(&s, .radio_button);
    try s.sections[0].checkbox_states.append(a, .{ .form_node = check, .state = .checked });
    try s.sections[0].checkbox_states.append(a, .{ .form_node = check, .state = .checked });
    var c = @import("hwpx/form_read_context.zig").Context.init(&s, 0);
    defer c.deinit();
    try std.testing.expectEqual(try s.radioButtonState(0, radio), try c.choice(&s, 0, radio, true));
    try std.testing.expectError(error.DuplicateFormStateEdit, s.checkBoxState(0, check));
    try std.testing.expectError(error.DuplicateFormStateEdit, c.choice(&s, 0, check, false));
    try s.sections[0].checkbox_states.append(a, .{ .form_node = radio, .state = .indeterminate });
    var fresh = @import("hwpx/form_read_context.zig").Context.init(&s, 0);
    defer fresh.deinit();
    try std.testing.expectError(error.UnsupportedRadioState, s.radioButtonState(0, radio));
    try std.testing.expectError(error.UnsupportedRadioState, fresh.choice(&s, 0, radio, true));
}
test "R7 mixed choice metadata allocation failures retain Native pending ownership" {
    var s = try open();
    defer s.deinit();
    const check = try find(&s, .check_button);
    try std.testing.expect(try s.setCheckBoxState(0, check, .checked));
    const before = try s.save();
    defer a.free(before);
    var attempts: usize = 0;
    try @import("testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, session: *editor.Session, count: *usize) !void {
            count.* += 1;
            const previous = session.allocator;
            session.allocator = allocator;
            defer session.allocator = previous;
            var c = @import("hwpx/form_read_context.zig").Context.init(session, 0);
            defer c.deinit();
            const checknode = try find(session, .check_button);
            const radionode = try find(session, .radio_button);
            _ = try c.choice(session, 0, checknode, false);
            _ = try c.choice(session, 0, radionode, true);
        }
    }.run, .{ &s, &attempts });
    std.debug.print("R7 mixed choice OOM attempts={d}\n", .{attempts});
    const after = try s.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}

test "R7 attached read index never authorizes a writer against a changed immutable source" {
    var s = try open();
    defer s.deinit();
    s.history_delta_managed = true;
    const combo = try find(&s, .combo_box);
    const before = try s.save();
    defer a.free(before);
    var scope = try @import("hwpx/paragraph_read_scope.zig").Scope.init(&s, 0);
    defer scope.deinit();
    try scope.attach();
    const read = try s.formText(0, combo);
    a.free(read);
    const serial = s.mutation_serial;
    const xml = s.sections[0].tree.source;
    const at = std.mem.indexOf(u8, xml, "editable='1'") orelse return error.NoPermission;
    const offset = at + "editable='".len;
    const old = xml[offset];
    xml[offset] = '0';
    const result = s.setFormText(0, combo, "BAD");
    xml[offset] = old;
    try std.testing.expectError(error.SourceBindingMismatch, result);
    try std.testing.expectEqual(serial, s.mutation_serial);
    try std.testing.expectEqual(@as(usize, 0), s.sections[0].form_texts.entries.items.len);
    const after = try s.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
}
