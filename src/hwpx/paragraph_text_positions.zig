//! Current text positions plus preserved inline tab boundaries, not display text.
const std = @import("std");
const tree_module = @import("xml_part_tree.zig");
const sites_module = @import("text_sites.zig");
const scanner = @import("section_text.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub const Segment = struct {
    kind: enum { text, tab, anchor },
    index: usize,
    source_start: usize,
    start_unit: usize = 0,
    end_unit: usize = 0,
};

/// Shared derived text spelling. This is never serialized into source XML.
pub fn segmentText(sites: *const sites_module.Sites, segment: Segment) []const u8 {
    return switch (segment.kind) {
        .text => sites.items[segment.index].text,
        .tab => "\t",
        .anchor => "\xef\xbf\xbc",
    };
}

/// Half-open text deletion cannot remove a preserved inline element.
/// UTF-16 surrogate boundaries inside text are checked by the text splice layer.
pub fn validateRange(segments: []const Segment, start: usize, end: usize) !void {
    if (segments.len == 0 or end < start or end > segments[segments.len - 1].end_unit) return error.InvalidTextPosition;
    for (segments) |segment| {
        if (segment.kind != .text and start < segment.end_unit and end > segment.start_unit) return error.ProtectedInlineControl;
    }
}

/// Caller owns the slice. Positions are rebuilt from current owned text.
pub fn build(a: std.mem.Allocator, tree: *const tree_module.Tree, sites: *const sites_module.Sites, locations: []const scanner.Location, paragraph: usize) ![]Segment {
    if (locations.len != sites.items.len or paragraph == 0) return error.InvalidTextSites;
    var segments: std.ArrayList(Segment) = .empty;
    defer segments.deinit(a);
    const owners = try a.alloc(bool, tree.elements.len);
    defer a.free(owners);
    @memset(owners, false);
    var found = false;
    for (sites.items, locations, 0..) |site, location, index| {
        if (location.paragraph_ordinal != paragraph) continue;
        if (site.element_index >= tree.elements.len) return error.InvalidTextSites;
        owners[site.element_index] = true;
        found = true;
        try segments.append(a, .{ .kind = .text, .index = index, .source_start = site.start });
    }
    if (!found) return error.MissingTextSite;
    for (tree.elements, 0..) |text_element, text_index| {
        if (!owners[text_index]) continue;
        if (text_element.is(uri, "run") and text_element.first_child == null) continue;
        if (!text_element.is(uri, "t")) return error.UnsupportedTextPositionProjection;
        var child = text_element.first_child;
        while (child) |index| {
            const element = tree.elements[index];
            if (!@import("retained_tab.zig").supported(tree, index)) return error.UnsupportedInlineControl;
            try segments.append(a, .{ .kind = .tab, .index = index, .source_start = element.start_tag.start });
            child = element.next_sibling;
        }
    }
    std.mem.sort(Segment, segments.items, {}, struct {
        fn less(_: void, left: Segment, right: Segment) bool {
            if (left.source_start == right.source_start) return left.kind == .text and right.kind == .tab;
            return left.source_start < right.source_start;
        }
    }.less);
    var units: usize = 0;
    for (segments.items) |*segment| {
        segment.start_unit = units;
        if (segment.kind == .tab) {
            units = std.math.add(usize, units, 1) catch return error.LimitExceeded;
        } else {
            const text = sites.items[segment.index].text;
            var offset: usize = 0;
            while (try @import("../xml/scalars.zig").read(text, offset, .utf8)) |scalar| {
                units = std.math.add(usize, units, if (scalar.value > 0xffff) 2 else 1) catch return error.LimitExceeded;
                offset = scalar.end;
            }
        }
        segment.end_unit = units;
    }
    return segments.toOwnedSlice(a);
}

test "HWPX paragraph positions preserve tab gaps and follow current text" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀<p:tab width='100'/>B</p:t></p:run></p:p></s:sec>";
    var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_module.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    const positions = try build(a, &tree, &sites, locations, 1);
    defer a.free(positions);
    try std.testing.expectEqual(@as(usize, 3), positions.len);
    try std.testing.expectEqual(@as(usize, 3), positions[1].start_unit);
    try std.testing.expectEqual(@as(usize, 4), positions[1].end_unit);
    try validateRange(positions, 0, 3);
    try validateRange(positions, 4, 5);
    try validateRange(positions, 3, 3);
    try validateRange(positions, 4, 4);
    try std.testing.expectError(error.ProtectedInlineControl, validateRange(positions, 3, 4));
    try std.testing.expectError(error.ProtectedInlineControl, validateRange(positions, 0, 5));
    try std.testing.expectError(error.InvalidTextPosition, validateRange(positions, 0, 6));
    _ = try @import("text_site_edit.zig").splice(a, &sites, 0, 0, 0, "한", 10000);
    const changed = try build(a, &tree, &sites, locations, 1);
    defer a.free(changed);
    try std.testing.expectEqual(@as(usize, 4), changed[1].start_unit);
    try std.testing.expectEqualSlices(u8, source, tree.source);
}

test "HWPX paragraph positions span styled runs and release every failed allocation" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='1'><p:t>A<p:tab/>B</p:t></p:run><p:run charPrIDRef='2'><p:t>😀<p:tab/>끝</p:t></p:run></p:p></s:sec>";
    var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_module.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const tree_module.Tree, current: *const sites_module.Sites, bound: []const scanner.Location) !void {
            const positions = try build(allocator, parsed, current, bound, 1);
            defer allocator.free(positions);
            try std.testing.expectEqual(@as(usize, 6), positions.len);
            try std.testing.expectEqual(@as(usize, 7), positions[5].end_unit);
            try std.testing.expectEqual(@as(usize, 5), positions[4].start_unit);
        }
    }.run, .{ &tree, &sites, locations });
}
