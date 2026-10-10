//! 개체 사이 텍스트를 동일 run의 원본 사이트에 순서대로 연결합니다.
const std = @import("std");
const model = @import("paragraph_structure_values.zig");
const Segment = @import("paragraph_text_positions.zig").Segment;
const Tree = @import("xml_part_tree.zig").Tree;
pub const Move = struct { side: usize, source_site: usize, target_site: usize, source_start: usize, target_offset: usize };

pub fn fillMapped(a: std.mem.Allocator, tree: *const Tree, output: *model.Paragraph, left: *const model.Paragraph, right: *const model.Paragraph, left_segments: []const Segment, right_segments: []const Segment, limit: usize) ![]Move {
    var moves: std.ArrayList(Move) = .empty;
    defer moves.deinit(a);
    var inherited = left.*;
    inherited.protected_positions = null;
    const source = try @import("paragraph_protected_positions.zig").build(a, tree, &inherited);
    defer a.free(source);
    const previous = try a.alloc(?usize, output.sites.items.len);
    defer a.free(previous);
    @memset(previous, null);
    var last: ?usize = null;
    for (source) |segment| {
        if (segment.kind == .text) previous[segment.index] = last else {
            for (left.protected_positions.?) |item| if (item.element_index == segment.index) {
                last = segment.index;
            };
            for (right.protected_positions.?) |item| if (item.element_index == segment.index) {
                last = segment.index;
            };
        }
    }
    for (output.sites.items) |*site| {
        const empty = try a.dupe(u8, "");
        a.free(site.text);
        site.text = empty;
    }
    last = null;
    // 오른쪽 접두어를 앞선 빈 원본 사이트로 돌려보내면 텍스트 순서가 바뀝니다.
    var last_target: usize = 0;
    var bytes: usize = 0;
    for ([_]*const model.Paragraph{ left, right }, [_][]const Segment{ left_segments, right_segments }, 0..) |paragraph, segments, side| {
        for (segments) |segment| {
            if (segment.kind != .text) {
                last = segment.index;
                continue;
            }
            const input = paragraph.sites.items[segment.index];
            var target: ?usize = null;
            if (previous[segment.index] == last and (input.text.len == 0 or segment.index >= last_target)) target = segment.index else {
                for (output.sites.items, 0..) |site, index| {
                    if (index >= last_target and previous[index] == last and compatibleRun(tree, output, site.element_index, input.element_index)) {
                        target = index;
                        break;
                    }
                }
            }
            const index = target orelse {
                if (input.text.len == 0) continue;
                return error.UnsupportedAnchoredStructure;
            };
            if (input.text.len != 0) last_target = index;
            try moves.append(a, .{ .side = side, .source_site = segment.index, .target_site = index, .source_start = segment.start_unit, .target_offset = try @import("text_site_edit.zig").utf16Length(output.sites.items[index].text) });
            bytes = std.math.add(usize, bytes, input.text.len) catch return error.LimitExceeded;
            if (bytes > limit) return error.LimitExceeded;
            const joined = try std.mem.concat(a, u8, &.{ output.sites.items[index].text, input.text });
            a.free(output.sites.items[index].text);
            output.sites.items[index].text = joined;
        }
    }
    return moves.toOwnedSlice(a);
}

fn run(tree: *const Tree, index: usize) ?usize {
    if (tree.elements[index].is(@import("document_xml.zig").paragraph_uri, "run")) return index;
    return tree.elements[index].parent;
}

fn compatibleRun(tree: *const Tree, paragraph: *const model.Paragraph, first: usize, second: usize) bool {
    const left = run(tree, first) orelse return false;
    const right = run(tree, second) orelse return false;
    if (left == right) return true;
    // 현재 서식이 없는 joined 모델에서 원본 run 속성이 완전히 같을 때만 이동합니다.
    if (paragraph.pieces == null or paragraph.character_styles != null) return false;
    const one = tree.elements[left].start_tag;
    const two = tree.elements[right].start_tag;
    return std.mem.eql(u8, tree.source[one.start..one.end], tree.source[two.start..two.end]);
}

test "protected merge run equivalence refuses different attributes and edited styles" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='1'><p:t>A</p:t></p:run><p:run charPrIDRef='1'><p:t>B</p:t></p:run><p:run charPrIDRef='2'><p:t>C</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var texts: [3]usize = undefined;
    var count: usize = 0;
    for (tree.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "t")) {
        texts[count] = index;
        count += 1;
    };
    try std.testing.expectEqual(@as(usize, 3), count);
    var paragraph: model.Paragraph = .{ .template_element = 1, .source_ordinal = 1, .sites = .{ .items = &.{} }, .pieces = &.{} };
    try std.testing.expect(compatibleRun(&tree, &paragraph, texts[0], texts[1]));
    try std.testing.expect(!compatibleRun(&tree, &paragraph, texts[0], texts[2]));
    paragraph.character_styles = &.{};
    try std.testing.expect(!compatibleRun(&tree, &paragraph, texts[0], texts[1]));
    paragraph.character_styles = null;
    paragraph.pieces = null;
    try std.testing.expect(!compatibleRun(&tree, &paragraph, texts[0], texts[1]));
    try std.testing.expect(compatibleRun(&tree, &paragraph, texts[0], texts[0]));
}
