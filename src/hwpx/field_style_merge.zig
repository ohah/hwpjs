//! 필드 텍스트 사이트 결합을 기존 서식 재배치 알고리즘에 연결합니다.
const std = @import("std");
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Tree = @import("xml_part_tree.zig").Tree;
const Segment = @import("paragraph_text_positions.zig").Segment;

fn positions(a: std.mem.Allocator, tree: *const Tree, row: *const Paragraph) ![]Segment {
    if (row.field_positions != null) return @import("field_owned_positions.zig").build(a, tree, row);
    const locations = try @import("paragraph_structure_locations.zig").build(a, tree, row);
    defer a.free(locations);
    return @import("paragraph_text_positions.zig").build(a, tree, &row.sites, locations, 1);
}

pub fn prepare(a: std.mem.Allocator, tree: *const Tree, output: *const Paragraph, left: *const Paragraph, right: *const Paragraph, limit: usize) ![]@import("character_style_paint.zig").Span {
    const one = try positions(a, tree, left);
    defer a.free(one);
    const two = try positions(a, tree, right);
    defer a.free(two);
    const target = try positions(a, tree, output);
    defer a.free(target);
    const Key = struct { element: usize, start: usize };
    var maps = [_]std.AutoHashMapUnmanaged(Key, Segment){ .empty, .empty };
    defer for (&maps) |*map| map.deinit(a);
    for ([_]*const Paragraph{ left, right }, [_][]const Segment{ one, two }, &maps) |row, segments, *map| {
        for (segments) |segment| {
            if (segment.kind != .text) return error.UnsupportedInlineControl;
            const site = row.sites.items[segment.index];
            const entry = try map.getOrPut(a, .{ .element = site.element_index, .start = site.start });
            if (entry.found_existing) return error.SourceBindingMismatch;
            entry.value_ptr.* = segment;
        }
    }
    var moves: std.ArrayList(@import("paragraph_protected_merge_text.zig").Move) = .empty;
    defer moves.deinit(a);
    for (output.sites.items, 0..) |site, index| {
        const key: Key = .{ .element = site.element_index, .start = site.start };
        const left_length = if (maps[0].get(key)) |segment| segment.end_unit - segment.start_unit else 0;
        for (&maps, 0..) |*map, side| if (map.get(key)) |segment| {
            try moves.append(a, .{ .side = side, .source_site = segment.index, .target_site = index, .source_start = segment.start_unit, .target_offset = if (side == 0) 0 else left_length });
        };
    }
    return @import("character_style_protected_merge.zig").preparePositions(a, tree, output, left, right, one, two, target, moves.items, limit);
}
