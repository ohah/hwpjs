//! 보호 위치의 분할 귀속 계산입니다. 구조 편집 허용이나 XML 출력을 소유하지 않습니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig").Sites;
const Location = @import("section_text.zig").Location;
const positions = @import("paragraph_text_positions.zig");

pub const Move = struct {
    element_index: usize,
    kind: enum { anchor, tab },
    side: enum { left, right },
    unit: usize,
};

// 결과 배열만 소유합니다. 원본 개체와 중첩 본문은 복제하지 않습니다.
pub fn build(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, locations: []const Location, paragraph: usize, start: usize, end: usize) ![]Move {
    const segments = try @import("anchor_text_positions.zig").build(a, tree, sites, locations, paragraph);
    defer a.free(segments);
    try positions.validateRange(segments, start, end);
    try positions.validateBoundary(sites, segments, start);
    try positions.validateBoundary(sites, segments, end);
    var count: usize = 0;
    for (segments) |segment| {
        if (segment.kind != .text) count += 1;
    }
    const output = try a.alloc(Move, count);
    var index: usize = 0;
    for (segments) |segment| {
        if (segment.kind == .text) continue;
        const left = segment.end_unit <= start;
        output[index] = .{
            .element_index = segment.index,
            .kind = if (segment.kind == .anchor) .anchor else .tab,
            .side = if (left) .left else .right,
            .unit = if (left) segment.start_unit else segment.start_unit - end,
        };
        index += 1;
    }
    return output;
}

test "HWPX anchor split plan preserves exact source identity and rejects protected deletion" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀</p:t><p:pic id='7'/><p:t>B</p:t><p:line id='8'/><p:t>C</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    for ([_]usize{ 0, 1, 3, 4, 5, 6, 7 }) |boundary| {
        const plan = try build(a, &tree, &sites, locations, 1, boundary, boundary);
        defer a.free(plan);
        try std.testing.expectEqual(@as(usize, 2), plan.len);
        for (plan, [_]usize{ 3, 5 }) |move, unit| {
            const expected_side: @TypeOf(move.side) = if (unit < boundary) .left else .right;
            try std.testing.expectEqual(expected_side, move.side);
            try std.testing.expectEqual(if (unit < boundary) unit else unit - boundary, move.unit);
            try std.testing.expect(@import("run_anchor.zig").kind(&tree, move.element_index) != null);
        }
        try std.testing.expect(plan[0].element_index != plan[1].element_index);
    }
    try std.testing.expectError(error.SplitSurrogatePair, build(a, &tree, &sites, locations, 1, 2, 2));
    try std.testing.expectError(error.ProtectedInlineControl, build(a, &tree, &sites, locations, 1, 3, 4));
    try std.testing.expectError(error.InvalidTextPosition, build(a, &tree, &sites, locations, 1, 8, 8));
    const removed = try build(a, &tree, &sites, locations, 1, 0, 3);
    defer a.free(removed);
    try std.testing.expectEqual(@as(usize, 0), removed[0].unit);
    try std.testing.expectEqual(@as(usize, 2), removed[1].unit);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, borrowed: *const Tree, current: *const Sites, bound: []const Location) !void {
            const result = try build(allocator, borrowed, current, bound, 1, 4, 4);
            defer allocator.free(result);
        }
    }.run, .{ &tree, &sites, locations });
    try std.testing.expectEqualStrings(source, tree.source);
    try std.testing.expectEqualStrings("A😀", sites.items[0].text);
}
