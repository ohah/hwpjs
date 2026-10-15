const std = @import("std");

test "dutmal pending values and structural edits refuse before committing unsaveable state" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>body</p:t></p:run></p:p><p:p><p:run><p:dutmal><p:mainText>A</p:mainText><p:subText>B</p:subText></p:dutmal></p:run></p:p></s:sec>";
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const node = for (session.sections[0].tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "dutmal")) break index;
    } else return error.InvalidDutmalNode;
    try std.testing.expect(try session.setDutmalText(0, node, .main_text, "new😀"));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectError(error.UnsupportedDutmalStructuralSave, session.splitParagraph(0, 1, 1, 0));
    try std.testing.expectError(error.UnsupportedDutmalStructuralSave, session.splitParagraphAnchored(0, 1, 1, 0));
    try std.testing.expectError(error.UnsupportedDutmalStructuralSave, session.mergeParagraph(0, 1));
    try std.testing.expectError(error.UnsupportedDutmalStructuralSave, session.mergeParagraphPair(0, 1, 2));
    try std.testing.expect(!try session.canSplitParagraph(0, 1, 1, 0));
    try std.testing.expect(session.sections[0].structure_values == null);
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, saved, after);
    try std.testing.expect(try session.setDutmalText(0, node, .main_text, "A"));
    try std.testing.expect(try session.splitParagraph(0, 1, 1, 0));
    const split = try session.save();
    defer a.free(split);
    try std.testing.expectError(error.UnsupportedDutmalStructuralSave, session.setDutmalText(0, node, .sub_text, "blocked"));
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].dutmal_texts.entries.items.len);
    const refused = try session.save();
    defer a.free(refused);
    try std.testing.expectEqualSlices(u8, split, refused);
}
