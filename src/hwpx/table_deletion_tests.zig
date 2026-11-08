const std = @import("std");
const deletion = @import("table_deletion.zig");
const parser = @import("section_tree.zig");
const a = std.testing.allocator;
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:opaque'>";
const table = "<p:tbl id='9'><p:tr><p:tc><p:subList><p:p id='2'><p:run><p:t>CELL</p:t></p:run></p:p></p:subList></p:tc></p:tr></p:tbl>";
fn find(tree: *const parser.Tree, local: []const u8, ordinal: usize) usize {
    var count: usize = 0;
    for (tree.elements, 0..) |e, index| {
        if (!e.is(@import("document_xml.zig").paragraph_uri, local)) continue;
        if (count == ordinal) return index;
        count += 1;
    }
    unreachable;
}
test "표삭제 같은 run 형제와 opaque 원문을 보존하고 셀 문단 전체를 제거한다" {
    const before = prefix ++ "<p:p id='1'><p:run charPrIDRef='7'><p:t>A&amp;<![CDATA[B]]></p:t>" ++ table ++ "<p:pic id='22'/><x:keep a='raw'/><p:t>END</p:t></p:run><p:linesegarray><p:lineseg textpos='0'/></p:linesegarray></p:p><x:after/></s:sec>";
    const expected = prefix ++ "<p:p id='1'><p:run charPrIDRef='7'><p:t>A&amp;<![CDATA[B]]></p:t><p:pic id='22'/><x:keep a='raw'/><p:t>END</p:t></p:run></p:p><x:after/></s:sec>";
    var tree = try parser.parse(a, before, 0, 0, .{});
    defer tree.deinit(a);
    var result = try deletion.prepare(a, &tree, find(&tree, "tbl", 0), 10000);
    defer result.deinit(a);
    try std.testing.expectEqualStrings(expected, result.bytes);
    try std.testing.expectEqual(@as(usize, 1), result.removed_paragraphs.len);
    try std.testing.expectEqual(@as(usize, 1), result.removed_tables);
    try std.testing.expectEqualStrings(before, tree.source);
    var reopened = try parser.parse(a, result.bytes, 0, 0, .{});
    defer reopened.deinit(a);
}
test "표삭제 부모 표는 자식 표와 캡션을 소유하지만 형제 표는 남긴다" {
    const nested = "<p:tbl id='10'><p:caption><p:subList><p:p id='3'><p:run><p:t>CAP</p:t></p:run></p:p></p:subList></p:caption><p:tr><p:tc><p:subList><p:p id='4'><p:run>" ++ table ++ "</p:run></p:p></p:subList></p:tc></p:tr></p:tbl>";
    const before = prefix ++ "<p:p id='1'><p:run>" ++ nested ++ "<p:tbl id='11'/></p:run></p:p></s:sec>";
    var tree = try parser.parse(a, before, 0, 0, .{});
    defer tree.deinit(a);
    var parent = try deletion.prepare(a, &tree, find(&tree, "tbl", 0), 10000);
    defer parent.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), parent.removed_tables);
    try std.testing.expectEqual(@as(usize, 3), parent.removed_paragraphs.len);
    try std.testing.expectEqualStrings(prefix ++ "<p:p id='1'><p:run><p:tbl id='11'/></p:run></p:p></s:sec>", parent.bytes);
    var child = try deletion.prepare(a, &tree, find(&tree, "tbl", 1), 10000);
    defer child.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), child.removed_tables);
    try std.testing.expect(std.mem.indexOf(u8, child.bytes, "CAP") != null);
    try std.testing.expect(std.mem.indexOf(u8, child.bytes, "id='10'") != null);
    try std.testing.expect(std.mem.indexOf(u8, child.bytes, "id='11'") != null);
}
test "표삭제 미지원 소유권과 참조는 쓰기 전에 거부한다" {
    const cases = [_][]const u8{
        prefix ++ "<p:p id='1'><p:run><p:tbl><p:footNote/></p:tbl></p:run></p:p></s:sec>",
        prefix ++ "<p:p id='1'><p:run><p:tbl><p:fieldBegin/></p:tbl></p:run></p:p></s:sec>",
        prefix ++ "<p:p id='1'><p:run><p:tbl><p:subList linkListIDRef='2'/></p:tbl></p:run></p:p></s:sec>",
    };
    for (cases, 0..) |before, index| {
        var tree = try parser.parse(a, before, 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(if (index == 1) error.ProtectedFieldRange else error.UnsupportedTableDeletionReference, deletion.prepare(a, &tree, find(&tree, "tbl", 0), 10000));
        try std.testing.expectEqualStrings(before, tree.source);
    }
    var wrong = try parser.parse(a, prefix ++ "<p:tbl/></s:sec>", 0, 0, .{});
    defer wrong.deinit(a);
    try std.testing.expectError(error.InvalidTableDeletionHost, deletion.prepare(a, &wrong, 1, 10000));
    try std.testing.expectError(error.InvalidTableDeletionTarget, deletion.prepare(a, &wrong, 0, 10000));
}
test "표삭제 현재 편집 출력과 ID를 결속하고 다른 호스트와 중복 ID를 거부한다" {
    const before = prefix ++ "<p:p id='1'><p:run><p:t>A</p:t>" ++ table ++ "</p:run></p:p></s:sec>";
    const current = prefix ++ "<p:p id='1'><p:run><p:t>CHANGED</p:t>" ++ table ++ "<p:tbl id='80'/></p:run></p:p></s:sec>";
    var tree = try parser.parse(a, before, 0, 0, .{});
    defer tree.deinit(a);
    const node = find(&tree, "tbl", 0);
    var result = try deletion.prepareCurrent(a, &tree, current, node, 10000);
    defer result.deinit(a);
    try std.testing.expectEqualStrings(prefix ++ "<p:p id='1'><p:run><p:t>CHANGED</p:t><p:tbl id='80'/></p:run></p:p></s:sec>", result.bytes);
    const duplicate = prefix ++ "<p:p id='1'><p:run>" ++ table ++ table ++ "</p:run></p:p></s:sec>";
    try std.testing.expectError(error.AmbiguousTableDeletionIdentity, deletion.prepareCurrent(a, &tree, duplicate, node, 10000));
    const moved = prefix ++ "<p:p id='5'><p:run>" ++ table ++ "</p:run></p:p></s:sec>";
    try std.testing.expectError(error.SourceBindingMismatch, deletion.prepareCurrent(a, &tree, moved, node, 10000));
    const missing = prefix ++ "<p:p id='1'><p:run/></p:p></s:sec>";
    try std.testing.expectError(error.MissingTableDeletionTarget, deletion.prepareCurrent(a, &tree, missing, node, 10000));
}
fn allocationCase(allocator: std.mem.Allocator, tree: *const parser.Tree, node: usize) !void {
    var result = try deletion.prepare(allocator, tree, node, 10000);
    defer result.deinit(allocator);
}
test "표삭제 한도와 모든 할당 실패에서도 원본과 배열 소유권이 유지된다" {
    const before = prefix ++ "<p:p id='1'><p:run>" ++ table ++ "</p:run></p:p></s:sec>";
    var tree = try parser.parse(a, before, 0, 0, .{});
    defer tree.deinit(a);
    const node = find(&tree, "tbl", 0);
    try std.testing.checkAllAllocationFailures(a, allocationCase, .{ &tree, node });
    try std.testing.expectError(error.LimitExceeded, deletion.prepare(a, &tree, node, 1));
    try std.testing.expectEqualStrings(before, tree.source);
}

fn pending(a2: std.mem.Allocator) !@import("created_table_values.zig").Values {
    const model = @import("../model/created_table.zig");
    const plan = try @import("../model/table_creation_plan.zig").create(1, 1, 100, 100, 1);
    var values: @import("created_table_values.zig").Values = .{};
    errdefer values.deinit(a2);
    for ([_]u32{ 10, 20 }) |id| {
        var value = try model.create(a2, id, id + 1, plan, &.{id + 2}, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 1);
        defer value.deinit(a2);
        _ = try value.replaceText(a2, 0, 0, "KEPT", 100);
        try values.append(a2, .{ .section = 0, .paragraph = .{ .source_ordinal = 1 }, .unit = id }, &value, 4);
    }
    return values;
}
fn createdAllocationCase(a2: std.mem.Allocator, values: *const @import("created_table_values.zig").Values) !void {
    var result = try @import("table_deletion_created.zig").prepare(a2, values, 10);
    defer result.deinit(a2);
}
test "표삭제 pending 생성 표 하나만 제거하고 다른 identity anchor 텍스트를 보존한다" {
    var values = try pending(a);
    defer values.deinit(a);
    var result = try @import("table_deletion_created.zig").prepare(a, &values, 10);
    defer result.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), values.entries.items.len);
    try std.testing.expectEqual(@as(usize, 1), result.entries.items.len);
    try std.testing.expectEqual(@as(u64, 20), result.entries.items[0].table.identity);
    try std.testing.expectEqual(@as(u32, 20), result.entries.items[0].anchor.unit);
    try std.testing.expectEqualStrings("KEPT", result.entries.items[0].table.cells[0].text);
    try std.testing.checkAllAllocationFailures(a, createdAllocationCase, .{&values});
    try std.testing.expectError(error.MissingTableDeletionTarget, @import("table_deletion_created.zig").prepare(a, &values, 99));
    values.entries.items[1].anchor.paragraph = .{ .generated_id = 12 };
    try std.testing.expectError(error.UnsupportedTableDeletionReference, @import("table_deletion_created.zig").prepare(a, &values, 10));
}

test "표삭제 마지막 표 뒤에도 호스트 문단과 외부 주석 및 형제 리소스 참조는 남는다" {
    const before = prefix ++ "<p:p id='1'><p:run>" ++ table ++ "</p:run></p:p><p:p id='8'><p:run><p:footNote/><p:pic binaryItemIDRef='same'/></p:run></p:p></s:sec>";
    var tree = try parser.parse(a, before, 0, 0, .{});
    defer tree.deinit(a);
    var result = try deletion.prepare(a, &tree, find(&tree, "tbl", 0), 10000);
    defer result.deinit(a);
    try std.testing.expectEqualStrings(prefix ++ "<p:p id='1'><p:run></p:run></p:p><p:p id='8'><p:run><p:footNote/><p:pic binaryItemIDRef='same'/></p:run></p:p></s:sec>", result.bytes);
}

test "표삭제 선택 분기와 원본 호스트 ID 모호성 및 생성 ID 중복은 거부한다" {
    var branch = try parser.parse(a, prefix ++ "<p:switch><p:case><p:p id='1'><p:run>" ++ table ++ "</p:run></p:p></p:case></p:switch></s:sec>", 0, 0, .{});
    defer branch.deinit(a);
    try std.testing.expectError(error.UnsupportedTableDeletionBranch, deletion.prepare(a, &branch, find(&branch, "tbl", 0), 10000));
    const duplicate = prefix ++ "<p:p id='1'><p:run>" ++ table ++ "</p:run></p:p><p:p id='1'/></s:sec>";
    var tree = try parser.parse(a, duplicate, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.AmbiguousTableDeletionIdentity, deletion.prepareCurrent(a, &tree, duplicate, find(&tree, "tbl", 0), 10000));
    var values = try pending(a);
    defer values.deinit(a);
    values.entries.items[1].table.identity = 10;
    try std.testing.expectError(error.AmbiguousTableDeletionIdentity, @import("table_deletion_created.zig").prepare(a, &values, 10));
}
