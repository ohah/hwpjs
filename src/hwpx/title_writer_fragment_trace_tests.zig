//! 실제 writer trace와 Session whole/partial/mixed 출력 계약을 검사합니다.
const std = @import("std");
const editor = @import("editor_session.zig");
const a = std.testing.allocator;
const head = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const body = "<p:p><p:run charPrIDRef='1'><p:t>X</p:t><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE' dirty='0'/></p:ctrl><p:t>A</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl><p:t>B<p:titleMark ignore='1'/>C</p:t></p:run></p:p></s:sec>";
const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList><h:charProperties itemCnt='2'><h:charPr id='1' height='1000'/><h:charPr id='2' height='1200'/></h:charProperties></h:refList></h:head>";

fn input(allocator: std.mem.Allocator) ![]u8 {
    return @import("test_formula_fixture.zig").zipWithSectionHeader(allocator, head ++ body, header);
}

fn compare(allocator: std.mem.Allocator, current: *editor.Session, reopened: *editor.Session) !void {
    const left = try current.save();
    defer allocator.free(left);
    const right = try reopened.save();
    defer allocator.free(right);
    try std.testing.expectEqualSlices(u8, left, right);
    const left_ranges = try @import("character_style_snapshot.zig").read(current, 0, 1);
    defer allocator.free(left_ranges);
    const right_ranges = try @import("character_style_snapshot.zig").read(reopened, 0, 1);
    defer allocator.free(right_ranges);
    try std.testing.expectEqualDeep(left_ranges, right_ranges);
}

fn uniformPipeline(allocator: std.mem.Allocator, original: []const u8) !void {
    var session = try editor.open(allocator, original, .{});
    defer session.deinit();
    var history = try @import("editor_history.zig").History.init(&session, 8, 1024 * 1024);
    defer history.deinit();
    const formatted_ok = history.apply(&session, .{ .kind = .format, .section = 0, .paragraph = 1, .start = 0, .deleted = 4, .inserted = "", .char_shape_id = 2 }) catch |err| {
        try std.testing.expectEqualSlices(u8, original, session.source);
        try std.testing.expect(session.sections[0].structure_values == null);
        return err;
    };
    try std.testing.expect(formatted_ok);
    const formatted = try session.save();
    defer allocator.free(formatted);
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].structure_values.?.paragraphs[0].title_output_projection.?.derived_gaps.len);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer allocator.free(undone);
    try std.testing.expectEqualSlices(u8, original, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer allocator.free(redone);
    try std.testing.expectEqualSlices(u8, formatted, redone);
    var before = try session.sections[0].structure_values.?.paragraphs[0].clone(allocator);
    defer before.deinit(allocator);
    const replaced = history.apply(&session, .{ .kind = .plain, .section = 0, .paragraph = 1, .start = 3, .deleted = 1, .inserted = "Y" }) catch |err| {
        try std.testing.expectEqualDeep(before, session.sections[0].structure_values.?.paragraphs[0]);
        try std.testing.expectEqualSlices(u8, original, session.source);
        return err;
    };
    try std.testing.expect(replaced);
    const saved = try session.save();
    defer allocator.free(saved);
    var reopened = try editor.open(allocator, saved, .{});
    defer reopened.deinit();
    // 원본+whole-format+C→Y에서 정한 literal expected이며 결과에서 역추정하지 않습니다.
    const expected = head ++ "<p:p><p:run charPrIDRef='2'><p:t>X</p:t><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE' dirty='0'/></p:ctrl><p:t>A</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl><p:t>BY<p:titleMark ignore='1'/></p:t></p:run></p:p></s:sec>";
    try std.testing.expectEqualStrings(expected, reopened.sections[0].tree.source);
    const row = &session.sections[0].structure_values.?.paragraphs[0];
    try std.testing.expectEqual(@as(usize, 0), row.title_output_projection.?.derived_gaps.len);
    var trace: std.ArrayList(usize) = .empty;
    defer trace.deinit(allocator);
    const planned = try @import("character_style_paragraph_xml.zig").writeFieldsDirtyOptionsTrace(allocator, &session.sections[0].tree, row, session.sections[0].field_dirty.items, row.title_output_projection.?.options, session.options.max_xml_bytes, &trace);
    defer allocator.free(planned);
    try std.testing.expectEqual(@as(usize, 0), trace.items.len);
    try compare(allocator, &session, &reopened);
    try std.testing.expectEqualSlices(u8, original, session.source);
}

test "writer fragment trace whole history replacement preserves uniform source t no extra empty" {
    const original = try input(a);
    defer a.free(original);
    try uniformPipeline(a, original);
}

test "writer fragment trace partial emission retains identified empty fragment and exact parity" {
    const original = try input(a);
    defer a.free(original);
    var current = try editor.open(a, original, .{});
    defer current.deinit();
    try std.testing.expect(try current.setCharacterFormat(0, 1, 2, 3, 2));
    const row = &current.sections[0].structure_values.?.paragraphs[0];
    var trace: std.ArrayList(usize) = .empty;
    defer trace.deinit(a);
    const planned = try @import("character_style_paragraph_xml.zig").writeFieldsDirtyOptionsTrace(a, &current.sections[0].tree, row, current.sections[0].field_dirty.items, row.title_output_projection.?.options, current.options.max_xml_bytes, &trace);
    defer a.free(planned);
    try std.testing.expectEqual(@as(usize, 1), trace.items.len);
    try std.testing.expectEqual(row.character_styles.?[0].run_element, trace.items[0]);
    for (row.character_styles.?) |span| try std.testing.expect(span.canonical_fragment != null);
    try std.testing.expect(row.title_output_projection.?.derived_gaps.len != 0);
    const formatted = try current.save();
    defer a.free(formatted);
    var reopened = try editor.open(a, formatted, .{});
    defer reopened.deinit();
    try std.testing.expect(try current.splice(0, 1, 3, 1, "Y"));
    try std.testing.expect(try reopened.splice(0, 1, 3, 1, "Y"));
    try compare(a, &current, &reopened);
}

test "writer fragment trace mixed source runs omit untouched per text marker gaps" {
    const source = head ++ "<p:p><p:run charPrIDRef='1'><p:t>AB<p:titleMark ignore='1'/></p:t></p:run><p:run charPrIDRef='1'><p:t>CD<p:titleMark ignore='1'/></p:t></p:run></p:p></s:sec>";
    const original = try @import("test_formula_fixture.zig").zipWithSectionHeader(a, source, header);
    defer a.free(original);
    var session = try editor.open(a, original, .{});
    defer session.deinit();
    try std.testing.expect(try session.setCharacterFormat(0, 1, 0, 1, 2));
    const row = &session.sections[0].structure_values.?.paragraphs[0];
    var trace: std.ArrayList(usize) = .empty;
    defer trace.deinit(a);
    const planned = try @import("character_style_paragraph_xml.zig").writeFieldsDirtyOptionsTrace(a, &session.sections[0].tree, row, session.sections[0].field_dirty.items, row.title_output_projection.?.options, session.options.max_xml_bytes, &trace);
    defer a.free(planned);
    try std.testing.expectEqual(@as(usize, 1), trace.items.len);
    try std.testing.expectEqual(row.character_styles.?[0].run_element, trace.items[0]);
    try std.testing.expect(row.title_output_projection.?.derived_gaps.len != 0);
    for (row.title_output_projection.?.derived_gaps) |entry| try std.testing.expectEqual(trace.items[0], entry.run_element);
    try std.testing.expectEqualSlices(u8, original, session.source);
}

test "writer fragment trace whole format replacement all allocation failures retain source" {
    const original = try input(a);
    defer a.free(original);
    try @import("../testing/allocation_failures.zig").check(uniformPipeline, .{original});
}
