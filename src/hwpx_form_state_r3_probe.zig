const std = @import("std");
const editor = @import("hwpx/editor_session.zig");
const history = @import("hwpx/editor_history.zig");
const fixture = @import("hwpx/test_formula_fixture.zig");
const uri = @import("hwpx/document_xml.zig").paragraph_uri;
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:opaque'><p:p id='stable' paraPrIDRef='0'><p:run charPrIDRef='0'><p:t>BODY</p:t>";
const meta = " name='keep' enabled='1' editable='1' opaque='retain'";
const radioA = "<p:radioBtn" ++ meta ++ " radioGroupName='G' value='CHECKED'><p:formCharPr charPrIDRef='0' autoSz='1' wordWrap='1'/><x:meta>opaque</x:meta></p:radioBtn>";
const radioB = "<p:radioBtn" ++ meta ++ " radioGroupName='G' value='UNCHECKED'><p:formCharPr charPrIDRef='0' followContext='0'/></p:radioBtn>";
const edit = "<p:edit" ++ meta ++ " readOnly='0' numOnly='0' multiLine='1' maxLength='100'><p:formCharPr charPrIDRef='0' autoSz='1' wordWrap='1'/><p:text x:keep='yes'>old<!--keep--><?hold x?></p:text><p:sz width='1234' height='567'/><x:unknown>stay</x:unknown></p:edit>";
const combo = "<p:comboBox" ++ meta ++ " editEnable='1' selectedValue='unrelated'><p:formCharPr charPrIDRef='0'/><p:text>combo</p:text><p:listItem>First</p:listItem><p:listItem>Second</p:listItem></p:comboBox>";
const suffix = "</p:run><p:linesegarray/></p:p></s:sec>";
fn make(a: std.mem.Allocator) ![]u8 {
    return fixture.zipWithSection(a, prefix ++ radioA ++ radioB ++ edit ++ combo ++ suffix);
}
fn node(s: *const editor.Session, kind: @import("hwpx/run_anchor.zig").Kind, ordinal: usize) !usize {
    var found: usize = 0;
    for (s.sections[0].tree.elements, 0..) |_, index| if (@import("hwpx/run_anchor.zig").kind(&s.sections[0].tree, index) == kind) {
        if (found == ordinal) return index;
        found += 1;
    };
    return error.MissingProbeForm;
}
fn string(s: *const editor.Session, n: usize, expected: []const u8) !void {
    const current = try s.formText(0, n);
    defer s.allocator.free(current);
    try std.testing.expectEqualStrings(expected, current);
}
test "R3 HWPX form Native current radio/text, exact source preservation, one history and reopen" {
    const a = std.testing.allocator;
    const input = try make(a);
    defer a.free(input);
    var s = try editor.open(a, input, .{});
    defer s.deinit();
    var h = try history.History.initV2(&s, .{});
    defer h.deinit();
    const first = try node(&s, .radio_button, 0);
    const second = try node(&s, .radio_button, 1);
    const e = try node(&s, .edit_box, 0);
    const c = try node(&s, .combo_box, 0);
    const command: history.Command = .{ .kind = .form_radio_select, .section = 0, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .form_node = second };
    try std.testing.expect(try h.apply(&s, command));
    try std.testing.expectEqual(@as(u32, 1), h.revision());
    try std.testing.expectEqual(.unchecked, try s.radioButtonState(0, first));
    try std.testing.expectEqual(.checked, try s.radioButtonState(0, second));
    try std.testing.expect(!try h.apply(&s, command));
    try std.testing.expectEqual(@as(u32, 1), h.revision());
    try std.testing.expect(try h.undo(&s));
    try std.testing.expectEqual(.checked, try s.radioButtonState(0, first));
    const back = try s.save();
    defer a.free(back);
    try std.testing.expectEqualSlices(u8, input, back);
    try std.testing.expect(try h.redo(&s));
    try std.testing.expect(try h.apply(&s, .{ .kind = .form_text, .section = 0, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "new😀<&\r\n", .form_node = e }));
    try string(&s, e, "new😀<&\r\n");
    try std.testing.expect(try h.apply(&s, .{ .kind = .form_text, .section = 0, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "combo new", .form_node = c }));
    const output = try s.save();
    defer a.free(output);
    var reopened = try editor.open(a, output, .{});
    defer reopened.deinit();
    try string(&reopened, try node(&reopened, .edit_box, 0), "new😀<&\r\n");
    try string(&reopened, try node(&reopened, .combo_box, 0), "combo new");
    const xml = reopened.sections[0].tree.source;
    try std.testing.expect(std.mem.indexOf(u8, xml, "opaque='retain'") != null);
    try std.testing.expect(std.mem.indexOf(u8, xml, "<p:formCharPr charPrIDRef='0' autoSz='1' wordWrap='1'/>") != null);
    try std.testing.expect(std.mem.indexOf(u8, xml, "<!--keep--><?hold x?>") != null);
    try std.testing.expect(std.mem.indexOf(u8, xml, "<p:listItem>Second</p:listItem>") != null);
    const saved = try reopened.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, output, saved);
    try std.testing.expect(try h.undo(&s));
    try string(&s, c, "combo");
    try std.testing.expect(try h.undo(&s));
    try string(&s, e, "old");
}
test "R3 HWPX form Native late mixed batch refusal preserves source and redo" {
    const a = std.testing.allocator;
    const input = try make(a);
    defer a.free(input);
    var s = try editor.open(a, input, .{});
    defer s.deinit();
    var h = try history.History.initV2(&s, .{});
    defer h.deinit();
    const e = try node(&s, .edit_box, 0);
    const cmd: history.Command = .{ .kind = .form_text, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "new", .form_node = e };
    try std.testing.expect(try h.apply(&s, cmd));
    try std.testing.expect(try h.undo(&s));
    try std.testing.expectError(error.InvalidFormNode, h.applyBatch(&s, &.{ cmd, .{ .kind = .form_radio_select, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .form_node = std.math.maxInt(usize) } }));
    try string(&s, e, "old");
    const output = try s.save();
    defer a.free(output);
    try std.testing.expectEqualSlices(u8, input, output);
    try std.testing.expect(try h.redo(&s));
    try string(&s, e, "new");
}
test "R3 HWPX form Native injected radio and text allocation failures are atomic" {
    const a = std.testing.allocator;
    const input = try make(a);
    defer a.free(input);
    var s = try editor.open(a, input, .{});
    defer s.deinit();
    const r = try node(&s, .radio_button, 1);
    const e = try node(&s, .edit_box, 0);
    const Probe = struct {
        fn run(failing: std.mem.Allocator, sess: *editor.Session, n: usize, radio: bool, baseline: []const u8) !void {
            const base = sess.allocator;
            sess.allocator = failing;
            const result = if (radio) sess.selectRadioButton(0, n) else sess.setFormText(0, n, "new😀<&");
            sess.allocator = base;
            if (result) |changed| {
                try std.testing.expect(changed);
                if (radio) {
                    _ = try sess.selectRadioButton(0, try node(sess, .radio_button, 0));
                } else {
                    _ = try sess.setFormText(0, n, "old");
                }
            } else |err| {
                const current = try sess.save();
                defer base.free(current);
                try std.testing.expectEqualSlices(u8, baseline, current);
                return err;
            }
        }
    };
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &s, r, true, input });
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &s, e, false, input });
}
fn twoSections(a: std.mem.Allocator) ![]u8 {
    const part = @import("hwpx/test_package_fixture.zig");
    return part.storedZip(a, &.{ .{ .name = "mimetype", .data = @import("hwpx/package.zig").mime }, .{ .name = "META-INF/container.xml", .data = part.package_container }, .{ .name = "Contents/content.hpf", .data = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest><o:item id='h' href='Contents/header.xml' media-type='application/xml'/><o:item id='a' href='Contents/section0.xml' media-type='application/xml'/><o:item id='b' href='Contents/section1.xml' media-type='application/xml'/></o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='a'/><o:itemref idref='b'/></o:spine></o:package>" }, .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='2'/>" }, .{ .name = "Contents/section0.xml", .data = prefix ++ radioA ++ radioB ++ edit ++ suffix }, .{ .name = "Contents/section1.xml", .data = prefix ++ radioA ++ radioB ++ edit ++ suffix } });
}
test "R3 HWPX form two sections same node IDs select exactly one global named member in one history" {
    const a = std.testing.allocator;
    const input = try twoSections(a);
    defer a.free(input);
    var s = try editor.open(a, input, .{});
    defer s.deinit();
    var h = try history.History.initV2(&s, .{});
    defer h.deinit();
    const first = try node(&s, .radio_button, 0);
    const second = try node(&s, .radio_button, 1);
    const cmd: history.Command = .{ .kind = .form_radio_select, .section = 1, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .form_node = second };
    try std.testing.expect(try h.apply(&s, cmd));
    try std.testing.expectEqual(@as(u32, 1), h.revision());
    try std.testing.expectEqual(.unchecked, try s.radioButtonState(0, first));
    try std.testing.expectEqual(.unchecked, try s.radioButtonState(1, first));
    try std.testing.expectEqual(.unchecked, try s.radioButtonState(0, second));
    try std.testing.expectEqual(.checked, try s.radioButtonState(1, second));
    try std.testing.expect(try h.undo(&s));
    const restored = try s.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, input, restored);
    try std.testing.expect(try h.redo(&s));
}
test "R3 HWPX form protected member late in global plan leaves every section unchanged" {
    const a = std.testing.allocator;
    const source = prefix ++ radioA ++ "<p:radioBtn name='locked' enabled='0' editable='1' radioGroupName='G' value='CHECKED'/>" ++ radioB ++ edit ++ suffix;
    const input = try fixture.zipWithSection(a, source);
    defer a.free(input);
    var s = try editor.open(a, input, .{});
    defer s.deinit();
    const target = try node(&s, .radio_button, 2);
    try std.testing.expectError(error.FormValueProtected, s.selectRadioButton(0, target));
    const after = try s.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, input, after);
    const e = try node(&s, .edit_box, 0);
    try std.testing.expectError(error.InvalidXmlCharacter, s.setFormText(0, e, &.{0}));
    try std.testing.expectError(error.FormTextTooLong, s.setFormText(0, e, &@as([101]u8, @splat('x'))));
    try string(&s, e, "old");
}
test "R3 HWPX form empty leaf CDATA Unicode and opaque metadata are preserved by shared XML source writer" {
    const a = std.testing.allocator;
    const input = try fixture.zipWithSection(a, prefix ++ "<p:edit" ++ meta ++ " readOnly='0' numOnly='0' multiLine='1'><p:formCharPr charPrIDRef='77' autoSz='1' wordWrap='1'/><p:text/><x:metadata command='do-not-run'>opaque</x:metadata></p:edit>" ++ suffix);
    defer a.free(input);
    var s = try editor.open(a, input, .{});
    defer s.deinit();
    const e = try node(&s, .edit_box, 0);
    try string(&s, e, "");
    try std.testing.expect(try s.setFormText(0, e, "\xef\xbb\xbf<&😀\r\n"));
    const output = try s.save();
    defer a.free(output);
    var reopened = try editor.open(a, output, .{});
    defer reopened.deinit();
    try string(&reopened, try node(&reopened, .edit_box, 0), "\xef\xbb\xbf<&😀\r\n");
    try std.testing.expect(std.mem.indexOf(u8, reopened.sections[0].tree.source, "charPrIDRef='77'") != null);
    try std.testing.expect(std.mem.indexOf(u8, reopened.sections[0].tree.source, "command='do-not-run'") != null);
}
test "R3 HWPX form managed history fail-index sweep disposes every injected failure without leak" {
    const Run = struct {
        fn run(a: std.mem.Allocator) !void {
            const bytes = try make(a);
            defer a.free(bytes);
            var s = try editor.open(a, bytes, .{});
            defer s.deinit();
            var h = try history.History.initV2(&s, .{});
            defer h.deinit();
            const e = try node(&s, .edit_box, 0);
            _ = try h.apply(&s, .{ .kind = .form_text, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "history😀", .form_node = e });
        }
    };
    var baseline = std.testing.FailingAllocator.init(std.testing.allocator, .{});
    try Run.run(baseline.allocator());
    const upper = baseline.alloc_index;
    var triggered: usize = 0;
    var not_triggered: usize = 0;
    for (0..upper) |index| {
        var failing = std.testing.FailingAllocator.init(std.testing.allocator, .{ .fail_index = index });
        if (Run.run(failing.allocator())) |_| {
            if (failing.has_induced_failure) return error.SwallowedOutOfMemoryError;
            not_triggered += 1;
        } else |err| {
            if (err != error.OutOfMemory) return err;
            if (!failing.has_induced_failure) return error.UnexpectedOutOfMemory;
            triggered += 1;
        }
        try std.testing.expectEqual(failing.allocated_bytes, failing.freed_bytes);
    }
    try std.testing.expect(triggered > 0);
    std.debug.print("managed-history OOM baseline={d} injected={d} untriggered={d}\n", .{ upper, triggered, not_triggered });
}
