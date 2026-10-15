const std = @import("std");
test "field exterior permits empty text after a matched end marker" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='8' type='CLICK_HERE' editable='1'/></p:ctrl><p:t>protected</p:t></p:run></p:p><p:p><p:run><p:ctrl><p:fieldEnd beginIDRef='8'/></p:ctrl></p:run><p:run><p:t/></p:run></p:p></s:sec>";
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try @import("field_outside_query.zig").canEdit(&session, 0, 2, 0, 0));
    try std.testing.expect(try session.splice(0, 2, 0, 0, "outside😀<&"));
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    const resaved = try reopened.save();
    defer a.free(resaved);
    try std.testing.expectEqualSlices(u8, saved, resaved);
    try std.testing.expectError(error.ProtectedFieldRange, session.splice(0, 1, 0, 0, "blocked"));
}
test "field exterior retains inline line breaks while allowing text insertion" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>before<p:lineBreak/>outside</p:t><p:ctrl><p:fieldBegin id='8' type='HYPERLINK'/></p:ctrl><p:t>label</p:t><p:ctrl><p:fieldEnd beginIDRef='8'/></p:ctrl><p:t>after</p:t></p:run></p:p></s:sec>";
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    try std.testing.expect(try @import("field_outside_query.zig").canEdit(&session, 0, 1, 0, 0));
    try std.testing.expect(try session.splice(0, 1, 0, 0, "검증😀<&"));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectError(error.ProtectedInlineControl, session.splice(0, 1, 12, 1, ""));
    const labels = try session.fieldLabels(0, 1);
    defer a.free(labels);
    try std.testing.expectEqual(@as(usize, 1), labels.len);
    try std.testing.expect(!try @import("field_outside_query.zig").canEdit(&session, 0, 1, @intCast(labels[0].start), @intCast(labels[0].start)));
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, saved, unchanged);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    const resaved = try reopened.save();
    defer a.free(resaved);
    try std.testing.expectEqualSlices(u8, saved, resaved);
}
test "unmatched cell field keeps its own list protected and permits sibling and root text" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>before</p:t></p:run></p:p><p:tbl rowCnt='1' colCnt='2'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/><p:subList><p:p><p:run><p:ctrl><p:fieldBegin id='8' type='CLICK_HERE' editable='1'/></p:ctrl><p:t>unfinished</p:t></p:run></p:p><p:p><p:run><p:t>continuation</p:t></p:run></p:p></p:subList></p:tc><p:tc><p:cellAddr rowAddr='0' colAddr='1'/><p:cellSpan rowSpan='1' colSpan='1'/><p:subList><p:p><p:run><p:t>sibling</p:t></p:run></p:p></p:subList></p:tc></p:tr></p:tbl><p:p><p:run><p:t>after</p:t></p:run></p:p></s:sec>";
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    std.debug.print("FIELD_SCOPE permissions before={any} inside={any} continuation={any} sibling={any} after={any}\n", .{ try session.canEdit(0, 1), try session.canEdit(0, 2), try session.canEdit(0, 3), try session.canEdit(0, 4), try session.canEdit(0, 5) });
    try std.testing.expect(try session.canEdit(0, 1));
    try std.testing.expect(!try session.canEdit(0, 2));
    try std.testing.expect(!try session.canEdit(0, 3));
    try std.testing.expect(try session.canEdit(0, 4));
    try std.testing.expect(try session.canEdit(0, 5));
    try std.testing.expectEqual(@as(usize, 1), session.source_fields.?.report.unmatched_begins);
    const History = @import("editor_history.zig").History;
    var history = try History.init(&session, 8, 4000000);
    defer history.deinit();
    try std.testing.expect(try history.apply(&session, .{ .kind = .plain, .paragraph = 4, .start = 0, .deleted = 0, .inserted = "셀😀<&" }));
    try std.testing.expect(try history.apply(&session, .{ .kind = .plain, .paragraph = 5, .start = 0, .deleted = 0, .inserted = "본문😀<&" }));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expect(try history.undo(&session));
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, input, undone);
    try std.testing.expect(try history.redo(&session));
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    try std.testing.expectError(error.ProtectedFieldRange, session.splice(0, 3, 0, 0, "blocked"));
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, saved, unchanged);
}

test "unmatched root field continues protecting later lists and body text" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:fieldBegin id='8' type='CLICK_HERE' editable='1'/></p:ctrl><p:t>unfinished</p:t></p:run></p:p><p:subList><p:p><p:run><p:t>nested later</p:t></p:run></p:p></p:subList><p:p><p:run><p:t>body later</p:t></p:run></p:p></s:sec>";
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    for ([_]usize{ 2, 3 }) |paragraph| {
        try std.testing.expect(!try session.canEdit(0, paragraph));
        try std.testing.expectError(error.ProtectedFieldRange, session.splice(0, paragraph, 0, 0, "blocked"));
    }
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
    try std.testing.expectEqual(@as(usize, 1), session.source_fields.?.report.unmatched_begins);
}

test "closed field labels outside an unmatched cell scope remain queryable and editable" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:subList><p:p><p:run><p:ctrl><p:fieldBegin id='8' type='CLICK_HERE' editable='1'/></p:ctrl><p:t>unfinished</p:t></p:run></p:p><p:p><p:run><p:ctrl><p:fieldBegin id='2' type='CLICK_HERE' editable='1'/></p:ctrl><p:t>nested</p:t><p:ctrl><p:fieldEnd beginIDRef='2'/></p:ctrl></p:run></p:p></p:subList><p:subList><p:p><p:run><p:ctrl><p:fieldBegin id='3' type='CLICK_HERE' editable='1'/></p:ctrl><p:t>safe</p:t><p:ctrl><p:fieldEnd beginIDRef='3'/></p:ctrl></p:run></p:p></p:subList></s:sec>";
    const input = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const safe = try session.fieldLabels(0, 3);
    defer a.free(safe);
    try std.testing.expectEqual(@as(usize, 1), safe.len);
    const protected = try session.fieldLabels(0, 2);
    defer a.free(protected);
    try std.testing.expectEqual(@as(usize, 0), protected.len);
    const History = @import("editor_history.zig").History;
    var history = try History.init(&session, 8, 4000000);
    defer history.deinit();
    try std.testing.expect(try history.apply(&session, .{ .kind = .field, .paragraph = 3, .begin_element = safe[0].begin_element, .start = 0, .deleted = 0, .inserted = "라벨😀<&" }));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, input, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    const nested_begin = for (session.sections[0].tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin") and index != safe[0].begin_element and index != session.source_fields.?.report.markers[0].element_index) break index;
    } else return error.MissingFieldBegin;
    try std.testing.expectError(error.UnsupportedFieldLabel, session.spliceFieldLabel(0, 2, nested_begin, 0, 0, "blocked"));
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, saved, unchanged);
    try std.testing.expectEqual(@as(usize, 1), session.source_fields.?.report.unmatched_begins);
}
