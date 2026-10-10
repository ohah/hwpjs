//! Read-only display ranges. Protected segments never become editable sites.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig").Sites;
const Segment = @import("paragraph_text_positions.zig").Segment;
const uri = @import("document_xml.zig").paragraph_uri;

pub const Range = struct { start_unit: usize, end_unit: usize, char_shape_id: ?u32 };

pub fn build(a: std.mem.Allocator, tree: *const Tree, sites: *const Sites, segments: []const Segment, limit: usize) ![]Range {
    if (segments.len > limit) return error.LimitExceeded;
    const output = try a.alloc(Range, segments.len);
    errdefer a.free(output);
    var cursor: usize = 0;
    for (segments, output) |segment, *range| {
        if (segment.start_unit != cursor or segment.end_unit < cursor) return error.InvalidTextSites;
        const element_index = switch (segment.kind) {
            .text => if (segment.index < sites.items.len) sites.items[segment.index].element_index else return error.InvalidTextSites,
            .tab, .anchor, .nb_space, .fw_space, .line_break, .hypen => segment.index,
        };
        if (element_index >= tree.elements.len) return error.SourceBindingMismatch;
        var ancestor: ?usize = element_index;
        var run: ?usize = null;
        while (ancestor) |index| {
            const element = tree.elements[index];
            if (element.is(uri, "run")) {
                run = index;
                break;
            }
            if (element.is(uri, "p")) return error.SourceBindingMismatch;
            ancestor = element.parent;
        }
        const owner = run orelse return error.SourceBindingMismatch;
        const id = try @import("character_style_projection.zig").runId(a, tree, owner);
        range.* = .{ .start_unit = segment.start_unit, .end_unit = segment.end_unit, .char_shape_id = id };
        cursor = segment.end_unit;
    }
    return output;
}

test "HWPX display ranges keep tabs anchors emoji and absent zero style distinct" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='0'><p:t>A😀<p:tab/>B</p:t><p:rect/></p:run><p:run><p:t>끝</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    const segments = try @import("anchor_text_positions.zig").build(a, &tree, &sites, locations, 1);
    defer a.free(segments);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, current: *const Sites, positions: []const Segment) !void {
            const ranges = try build(allocator, parsed, current, positions, 100);
            defer allocator.free(ranges);
            try std.testing.expectEqual(@as(usize, 5), ranges.len);
            try std.testing.expectEqual(@as(usize, 7), ranges[4].end_unit);
            try std.testing.expectEqual(@as(?u32, 0), ranges[3].char_shape_id);
            try std.testing.expectEqual(@as(?u32, null), ranges[4].char_shape_id);
        }
    };
    try Probe.run(a, &tree, &sites, segments);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &tree, &sites, segments });
    try std.testing.expectError(error.LimitExceeded, build(a, &tree, &sites, segments, 1));
    var invalid = segments[0];
    invalid.start_unit = 1;
    try std.testing.expectError(error.InvalidTextSites, build(a, &tree, &sites, &.{invalid}, 1));
    invalid = segments[0];
    invalid.index = sites.items.len;
    try std.testing.expectError(error.InvalidTextSites, build(a, &tree, &sites, &.{invalid}, 1));
    try std.testing.expectEqualSlices(u8, source, tree.source);
}
