//! Validate candidate current strings and complete save before publishing.
const std = @import("std");
const editor = @import("editor_session.zig");
pub const Kind = @import("dutmal_text_changes.zig").Kind;
fn validate(session: *const editor.Session, section: usize, node: usize) !void {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const tree = &session.sections[section].tree;
    if (node >= tree.elements.len) return error.InvalidDutmalNode;
    const options = editor.siteOptions(session.options);
    const frames = try @import("xml_tree_selection.zig").build(session.allocator, tree, options.branch_policy, options.max_attribute_bytes);
    defer session.allocator.free(frames);
    if (!frames[node].active) return error.InactiveDutmalNode;
}
pub fn read(session: *const editor.Session, section: usize, node: usize, kind: Kind) ![]u8 {
    try validate(session, section, node);
    const part = &session.sections[section];
    return part.dutmal_texts.read(session.allocator, &part.tree, node, kind, session.options.max_text_bytes);
}
pub fn set(session: *editor.Session, section: usize, node: usize, kind: Kind, text: []const u8) !bool {
    try validate(session, section, node);
    const a = session.allocator;
    const part = &session.sections[section];
    var values = try part.dutmal_texts.clone(a);
    defer values.deinit(a);
    if (!try values.set(a, &part.tree, node, kind, text, session.options.max_text_bytes)) return false;
    const sections = try a.dupe(editor.Section, session.sections);
    defer a.free(sections);
    sections[section].dutmal_texts = values;
    var candidate = session.*;
    candidate.sections = sections;
    var total: usize = 0;
    for (candidate.sections) |other| {
        total += try other.textBytes(session.options.max_text_bytes -| total);
        for (other.dutmal_texts.entries.items) |entry| {
            if (entry.text.len > session.options.max_text_bytes -| total) return error.LimitExceeded;
            total += entry.text.len;
        }
    }
    const saved = try candidate.save();
    defer a.free(saved);
    std.mem.swap(@import("dutmal_text_values.zig").Values, &part.dutmal_texts, &values);
    return true;
}

test "dutmal transaction allocation failures preserve prior values and ZIP" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE' dirty='0'/></p:ctrl><p:dutmal><p:mainText>A</p:mainText><p:subText>B</p:subText></p:dutmal><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run><p:linesegarray/></p:p></s:sec>";
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var node: ?usize = null;
    for (session.sections[0].tree.elements, 0..) |_, index| {
        if (@import("run_anchor.zig").kind(&session.sections[0].tree, index) == .dutmal) node = index;
    }
    try std.testing.expect(try session.setDutmalText(0, node.?, .main_text, "prior"));
    const baseline = try session.save();
    defer a.free(baseline);
    const Probe = struct {
        fn run(failing: std.mem.Allocator, current: *editor.Session, control: usize, expected: []const u8) !void {
            const base = current.allocator;
            current.allocator = failing;
            const result = current.setDutmalText(0, control, .sub_text, "new😀<&");
            current.allocator = base;
            if (result) |changed| {
                try std.testing.expect(changed);
                try std.testing.expect(try current.setDutmalText(0, control, .sub_text, "B"));
            } else |err| {
                const saved = try current.save();
                defer base.free(saved);
                try std.testing.expectEqualSlices(u8, expected, saved);
                const main = try current.dutmalText(0, control, .main_text);
                defer base.free(main);
                const sub = try current.dutmalText(0, control, .sub_text);
                defer base.free(sub);
                try std.testing.expectEqualStrings("prior", main);
                try std.testing.expectEqualStrings("B", sub);
                return err;
            }
        }
    };
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &session, node.?, baseline });
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, baseline, restored);
}
