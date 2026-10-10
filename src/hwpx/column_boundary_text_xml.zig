//! Insert a closed column control between text fragments of the same source run.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Site = @import("text_sites.zig").Site;
const Position = @import("column_boundary_position.zig").Position;
pub const Local = @import("text_metadata_fragment.zig").Local;

/// Returns a replacement for site.start..site.end, not a whole paragraph.
/// Caller removes the original control separately and owns namespace context.
pub fn write(a: std.mem.Allocator, tree: *const Tree, site: Site, local_unit: u32, boundary: Position, limit: usize) ![]u8 {
    return writeMany(a, tree, site, &.{.{ .source_element = boundary.source_element, .unit = local_unit }}, limit);
}

/// Boundaries are ordered within this site; equal positions retain input order.
pub fn writeMany(a: std.mem.Allocator, tree: *const Tree, site: Site, boundaries: []const Local, limit: usize) ![]u8 {
    return writeManyFrom(a, tree, site, tree, boundaries, limit);
}

/// Read text tags from the current tree and controls from immutable provenance.
/// This avoids assembling an extra run solely to carry source settings.
pub fn writeManyFrom(a: std.mem.Allocator, tree: *const Tree, site: Site, provenance: *const Tree, boundaries: []const Local, limit: usize) ![]u8 {
    return @import("text_metadata_fragment.zig").writeManyFrom(a, tree, site, provenance, boundaries, limit, writeControl);
}

fn writeControl(a: std.mem.Allocator, tree: *const Tree, source_element: usize, limit: usize) ![]u8 {
    return @import("column_boundary_xml.zig").write(a, tree, .{ .source_element = source_element, .unit = 0, .affinity = .right }, limit);
}

test "column boundary text XML uses separate provenance without extra styled runs" {
    const a = std.testing.allocator;
    const original = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:original'><p:p><p:run><p:ctrl x:keep='yes'><p:colPr colCount='3'><x:future/></p:colPr></p:ctrl><p:t>source-only</p:t></p:run></p:p></s:sec>";
    const current = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:q='http://www.hancom.co.kr/hwpml/2011/paragraph'><q:p><q:run charPrIDRef='7'><q:t>A😀&amp;B</q:t></q:run></q:p></s:sec>";
    var source = try @import("xml_part_tree.zig").parse(a, original, .section, 0, 0, .{});
    defer source.deinit(a);
    var target = try @import("xml_part_tree.zig").parse(a, current, .section, 0, 0, .{});
    defer target.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &target, .{});
    defer sites.deinit(a);
    const boundaries = [_]Local{.{ .source_element = 4, .unit = 3 }};
    const fragment = try writeManyFrom(a, &target, sites.items[0], &source, &boundaries, 10000);
    defer a.free(fragment);
    const output = try @import("xml_source_writer.zig").write(a, current, &.{.{ .start = sites.items[0].start, .end = sites.items[0].end, .text = "", .serialized_xml = fragment }}, 10000);
    defer a.free(output);
    var reopened = try @import("xml_part_tree.zig").parse(a, output, .section, 0, 0, .{});
    defer reopened.deinit(a);
    var runs: usize = 0;
    var columns: usize = 0;
    for (reopened.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "run")) runs += 1;
        if (element.is(@import("document_xml.zig").paragraph_uri, "colPr")) {
            columns += 1;
            try std.testing.expectEqualStrings(source.sourceOf(4), reopened.sourceOf(index));
        }
    }
    try std.testing.expectEqual(@as(usize, 1), runs);
    try std.testing.expectEqual(@as(usize, 1), columns);
    var text = try @import("text_sites.zig").collect(a, &reopened, .{});
    defer text.deinit(a);
    try std.testing.expectEqualStrings("A😀", text.items[0].text);
    try std.testing.expectEqualStrings("&B", text.items[1].text);
    try std.testing.expect(std.mem.indexOf(u8, output, "source-only") == null);
    try std.testing.expect(std.mem.indexOf(u8, output, "urn:original") != null);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, destination: *const Tree, site: Site, provenance: *const Tree, positions: []const Local) !void {
            const result = try writeManyFrom(allocator, destination, site, provenance, positions, 10000);
            defer allocator.free(result);
        }
    }.run, .{ &target, sites.items[0], &source, &boundaries });
    try std.testing.expectError(error.SplitSurrogatePair, writeManyFrom(a, &target, sites.items[0], &source, &.{.{ .source_element = 4, .unit = 2 }}, 10000));
    try std.testing.expectError(error.InvalidColumnBoundarySource, writeManyFrom(a, &target, sites.items[0], &target, &boundaries, 10000));
    try std.testing.expectError(error.LimitExceeded, writeManyFrom(a, &target, sites.items[0], &source, &boundaries, fragment.len - 1));
    try std.testing.expectEqualStrings(original, source.source);
    try std.testing.expectEqualStrings(current, target.source);
}

test "column boundary text XML serializes coincident controls in one ordered replacement" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:colPr colCount='1'/></p:ctrl><p:ctrl><p:colPr colCount='2'/></p:ctrl><p:t>A😀&amp;B</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const sources = try @import("column_boundary_collect.zig").collect(a, &tree, 1, &.{}, .right, 2);
    defer a.free(sources);
    const boundaries = [_]Local{ .{ .source_element = sources[0].source_element, .unit = 3 }, .{ .source_element = sources[1].source_element, .unit = 3 } };
    const output = try writeMany(a, &tree, sites.items[0], &boundaries, 10000);
    defer a.free(output);
    const wrapper = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>", output, "</p:t></p:run></p:p></s:sec>" });
    defer a.free(wrapper);
    var reopened = try @import("xml_part_tree.zig").parse(a, wrapper, .section, 0, 0, .{});
    defer reopened.deinit(a);
    var current = try @import("text_sites.zig").collect(a, &reopened, .{});
    defer current.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &reopened, &current, .{});
    defer a.free(locations);
    const positions = try @import("anchor_text_positions.zig").build(a, &reopened, &current, locations, 1);
    defer a.free(positions);
    const saved = try @import("column_boundary_collect.zig").collect(a, &reopened, 1, positions, .right, 2);
    defer a.free(saved);
    try std.testing.expectEqual(@as(usize, 2), saved.len);
    for (saved, sources) |result, original| {
        try std.testing.expectEqual(@as(u32, 3), result.unit);
        try std.testing.expectEqualStrings(tree.sourceOf(original.source_element), reopened.sourceOf(result.source_element));
    }
    try std.testing.expectEqual(@as(usize, 3), current.items.len);
    try std.testing.expectEqualStrings("A😀", current.items[0].text);
    try std.testing.expectEqualStrings("", current.items[1].text);
    try std.testing.expectEqualStrings("&B", current.items[2].text);
    var reversed = boundaries;
    reversed[1].unit = 1;
    try std.testing.expectError(error.InvalidTextPosition, writeMany(a, &tree, sites.items[0], &reversed, 10000));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, site: Site, columns: []const Local) !void {
            const result = try writeMany(allocator, parsed, site, columns, 10000);
            defer allocator.free(result);
        }
    }.run, .{ &tree, sites.items[0], &boundaries });
    try std.testing.expectEqualStrings(source, tree.source);
}

test "column boundary text XML places controls outside text and preserves UTF16 scalar boundaries" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀&lt;&amp;B</p:t><p:ctrl><p:colPr colCount='2'/></p:ctrl></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    var source_element: usize = 0;
    for (tree.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "colPr")) {
        source_element = index;
    };
    const boundary: Position = .{ .source_element = source_element, .unit = 3, .affinity = .right };
    const output = try write(a, &tree, sites.items[0], 3, boundary, 10000);
    defer a.free(output);
    const wrapper = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>", output, "</p:t></p:run></p:p></s:sec>" });
    defer a.free(wrapper);
    var reopened = try @import("xml_part_tree.zig").parse(a, wrapper, .section, 0, 0, .{});
    defer reopened.deinit(a);
    var changed = try @import("text_sites.zig").collect(a, &reopened, .{});
    defer changed.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), changed.items.len);
    try std.testing.expectEqualStrings("A😀", changed.items[0].text);
    try std.testing.expectEqualStrings("<&B", changed.items[1].text);
    try std.testing.expect(reopened.elements[4].is(@import("document_xml.zig").paragraph_uri, "ctrl"));
    try std.testing.expectEqual(@as(?usize, 2), reopened.elements[4].parent);
    try std.testing.expectError(error.SplitSurrogatePair, write(a, &tree, sites.items[0], 2, boundary, 10000));
    try std.testing.expectError(error.InvalidTextPosition, write(a, &tree, sites.items[0], 7, boundary, 10000));
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, sites.items[0], 3, boundary, output.len - 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, site: Site, position: Position) !void {
            const result = try write(allocator, parsed, site, 3, position, 10000);
            defer allocator.free(result);
        }
    }.run, .{ &tree, sites.items[0], boundary });
    try std.testing.expectEqualStrings(source, tree.source);
}

test "column boundary empty text XML preserves source tags and allocation failures" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:ctrl><p:colPr/></p:ctrl><p:t/></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const boundary: Position = .{ .source_element = 4, .unit = 0, .affinity = .right };
    const output = try write(a, &tree, sites.items[0], 0, boundary, 10000);
    defer a.free(output);
    try std.testing.expect(std.mem.startsWith(u8, output, "<p:t/>"));
    try std.testing.expectError(error.InvalidTextPosition, write(a, &tree, sites.items[0], 1, boundary, 10000));
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, sites.items[0], 0, boundary, output.len - 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, site: Site, column: Position) !void {
            const result = try write(allocator, parsed, site, 0, column, 10000);
            defer allocator.free(result);
        }
    }.run, .{ &tree, sites.items[0], boundary });
    try std.testing.expectEqualStrings(source, tree.source);
}
