//! Current text positions plus preserved inline tab boundaries, not display text.
const std = @import("std");
const tree_module = @import("xml_part_tree.zig");
const sites_module = @import("text_sites.zig");
const scanner = @import("section_text.zig");
const uri = @import("document_xml.zig").paragraph_uri;

pub const Segment = struct {
    kind: enum { text, tab, anchor, nb_space, fw_space, line_break, hypen },
    index: usize,
    source_start: usize,
    start_unit: usize = 0,
    end_unit: usize = 0,
};
pub fn isInlineUnit(segment: Segment) bool {
    return segment.kind == .tab or segment.kind == .nb_space or segment.kind == .fw_space or segment.kind == .line_break or segment.kind == .hypen;
}
pub fn validateInlineUnit(tree: *const tree_module.Tree, segment: Segment) !void {
    const expected: @import("retained_inline_unit.zig").Kind = switch (segment.kind) {
        .tab => .tab,
        .nb_space => .nb_space,
        .fw_space => .fw_space,
        .line_break => .line_break,
        .hypen => .hypen,
        else => return error.UnsupportedInlineControl,
    };
    if (@import("retained_inline_unit.zig").kind(tree, segment.index) != expected) return error.SourceBindingMismatch;
    if (segment.end_unit < segment.start_unit or segment.end_unit - segment.start_unit != 1) return error.InvalidTextSites;
}

/// Shared derived text spelling. This is never serialized into source XML.
pub fn segmentText(sites: *const sites_module.Sites, segment: Segment) []const u8 {
    return switch (segment.kind) {
        .text => sites.items[segment.index].text,
        .tab => "\t",
        .anchor => "\xef\xbf\xbc",
        .nb_space => "\xc2\xa0",
        .fw_space => "\xe2\x80\x87",
        .line_break => "\n",
        .hypen => "\xc2\xad",
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

/// Shared point validation for source and materialized paragraph projections.
pub fn validateBoundary(sites: *const sites_module.Sites, segments: []const Segment, boundary: usize) !void {
    try validateRange(segments, boundary, boundary);
    for (segments) |segment| {
        if (segment.kind != .text or boundary < segment.start_unit or boundary > segment.end_unit) continue;
        if (segment.index >= sites.items.len) return error.InvalidTextSites;
        const unit = std.math.cast(u32, boundary - segment.start_unit) orelse return error.LimitExceeded;
        _ = try @import("text_site_edit.zig").bytePosition(sites.items[segment.index].text, unit);
    }
}

/// Caller owns the slice. Positions are rebuilt from current owned text.
pub fn build(a: std.mem.Allocator, tree: *const tree_module.Tree, sites: *const sites_module.Sites, locations: []const scanner.Location, paragraph: usize) ![]Segment {
    return buildMode(a, tree, sites, locations, paragraph, false);
}

/// Caller must first validate the field text policy and field ownership.
/// Point bookmarks have zero display width; no source-record axis is inferred.
pub fn buildForFieldText(a: std.mem.Allocator, tree: *const tree_module.Tree, sites: *const sites_module.Sites, locations: []const scanner.Location, paragraph: usize) ![]Segment {
    return buildMode(a, tree, sites, locations, paragraph, true);
}

fn buildMode(a: std.mem.Allocator, tree: *const tree_module.Tree, sites: *const sites_module.Sites, locations: []const scanner.Location, paragraph: usize, field_text: bool) ![]Segment {
    if (locations.len != sites.items.len or paragraph == 0) return error.InvalidTextSites;
    var segments: std.ArrayList(Segment) = .empty;
    var title_axis_validated = false;
    defer segments.deinit(a);
    const owners = try a.alloc(bool, tree.elements.len);
    defer a.free(owners);
    @memset(owners, false);
    var text_owners: std.ArrayList(usize) = .empty;
    defer text_owners.deinit(a);
    var found = false;
    for (sites.items, locations, 0..) |site, location, index| {
        if (location.paragraph_ordinal != paragraph) continue;
        if (site.element_index >= tree.elements.len) return error.InvalidTextSites;
        if (tree.elements[site.element_index].is(uri, "run") and !site.missing_text) return error.UnsupportedTextPositionProjection;
        if (!owners[site.element_index]) {
            try text_owners.append(a, site.element_index);
            owners[site.element_index] = true;
        }
        found = true;
        try segments.append(a, .{ .kind = .text, .index = index, .source_start = site.start });
    }
    if (!found) return error.MissingTextSite;
    const paragraph_owner = try @import("paragraph_site_owner.zig").resolve(tree, sites, locations, paragraph);
    var run_child = tree.elements[paragraph_owner].first_child;
    bookmark_search: while (run_child) |run| : (run_child = tree.elements[run].next_sibling) {
        var direct_child = tree.elements[run].first_child;
        while (direct_child) |index| : (direct_child = tree.elements[index].next_sibling) {
            if (!@import("retained_bookmark.zig").supported(tree, index) and !@import("retained_bookmark.zig").directSupported(tree, index)) continue;
            if (field_text) continue;
            var axis = try @import("title_mark_axis.zig").build(a, tree, sites, locations, paragraph);
            defer axis.deinit(a);
            title_axis_validated = true;
            break :bookmark_search;
        }
    }
    // Preserve the original tree-order traversal even for interleaved sites.
    std.mem.sort(usize, text_owners.items, {}, std.sort.asc(usize));
    for (text_owners.items) |text_index| {
        const text_element = tree.elements[text_index];
        if (text_element.is(uri, "run")) continue;
        if (!text_element.is(uri, "t")) return error.UnsupportedTextPositionProjection;
        var child = text_element.first_child;
        while (child) |index| {
            const element = tree.elements[index];
            if (@import("retained_markpen_marker.zig").supported(tree, index)) {
                child = element.next_sibling;
                continue;
            }
            if (@import("title_mark_axis.zig").retained(tree, index)) {
                if (!title_axis_validated) {
                    var axis = if (field_text)
                        try @import("title_mark_axis.zig").buildForFieldText(a, tree, sites, locations, paragraph)
                    else
                        try @import("title_mark_axis.zig").build(a, tree, sites, locations, paragraph);
                    defer axis.deinit(a);
                    title_axis_validated = true;
                }
                child = element.next_sibling;
                continue;
            }
            const inline_kind = @import("retained_inline_unit.zig").kind(tree, index) orelse return error.UnsupportedInlineControl;
            try segments.append(a, .{ .kind = switch (inline_kind) {
                .tab => .tab,
                .nb_space => .nb_space,
                .fw_space => .fw_space,
                .line_break => .line_break,
                .hypen => .hypen,
            }, .index = index, .source_start = element.start_tag.start });
            child = element.next_sibling;
        }
    }
    std.mem.sort(Segment, segments.items, {}, struct {
        fn less(_: void, left: Segment, right: Segment) bool {
            if (left.source_start == right.source_start) return left.kind == .text and right.kind != .text;
            return left.source_start < right.source_start;
        }
    }.less);
    var units: usize = 0;
    for (segments.items) |*segment| {
        segment.start_unit = units;
        if (segment.kind != .text) {
            units = std.math.add(usize, units, 1) catch return error.LimitExceeded;
        } else {
            const text = sites.items[segment.index].text;
            units = std.math.add(usize, units, try @import("text_site_edit.zig").utf16Length(text)) catch return error.LimitExceeded;
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

test "HWPX paragraph positions local owner traversal preserves reversed split site order" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A<p:tab/>B</p:t></p:run><p:run><p:t>😀<p:tab/>끝</p:t></p:run></p:p><p:p><p:run><p:t>unrelated<p:tab/></p:t></p:run></p:p></s:sec>";
    var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_module.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    std.mem.reverse(sites_module.Site, sites.items);
    std.mem.reverse(scanner.Location, locations);
    const positions = try build(a, &tree, &sites, locations, 1);
    defer a.free(positions);
    var text: std.ArrayList(u8) = .empty;
    defer text.deinit(a);
    var tabs: usize = 0;
    for (positions) |position| {
        try text.appendSlice(a, segmentText(&sites, position));
        if (position.kind == .tab) tabs += 1;
    }
    try std.testing.expectEqualStrings("A\tB😀\t끝", text.items);
    try std.testing.expectEqual(@as(usize, 2), tabs);
    try std.testing.expectEqual(@as(usize, 7), positions[positions.len - 1].end_unit);
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
