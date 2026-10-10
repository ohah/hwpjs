//! Source column controls projected through the existing paragraph coordinates.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Segment = @import("paragraph_text_positions.zig").Segment;
const Position = @import("column_boundary_position.zig").Position;
const uri = @import("document_xml.zig").paragraph_uri;

/// Caller supplies source-ordered coordinates for this original paragraph.
/// Generated/joined paragraphs must move their authoritative boundaries instead.
pub fn collect(a: std.mem.Allocator, tree: *const Tree, paragraph: usize, segments: []const Segment, affinity: @FieldType(Position, "affinity"), limit: usize) ![]Position {
    try @import("source_metadata_coordinates.zig").validate(tree, paragraph, segments);
    var output: std.ArrayList(Position) = .empty;
    defer output.deinit(a);
    for (tree.elements, 0..) |element, index| {
        if (!element.is(uri, "colPr")) continue;
        if (!belongsTo(tree, index, paragraph)) continue;
        if (output.items.len >= limit) return error.LimitExceeded;
        const unit = @import("source_metadata_coordinates.zig").before(segments, element.start_tag.start);
        try output.append(a, .{ .source_element = index, .unit = std.math.cast(u32, unit) orelse return error.LimitExceeded, .affinity = affinity });
    }
    return output.toOwnedSlice(a);
}

pub fn hasForParagraph(tree: *const Tree, paragraph: usize) bool {
    for (tree.elements, 0..) |_, index| if (belongsTo(tree, index, paragraph)) return true;
    return false;
}

fn belongsTo(tree: *const Tree, index: usize, paragraph: usize) bool {
    const element = tree.elements[index];
    if (!element.is(uri, "colPr")) return false;
    const control = element.parent orelse return false;
    if (!tree.elements[control].is(uri, "ctrl")) return false;
    const run = tree.elements[control].parent orelse return false;
    return tree.elements[run].is(uri, "run") and tree.elements[run].parent == paragraph;
}

test "column boundary presence excludes a nested-only declaration from its host" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>host</p:t><p:ctrl><p:footNote><p:subList><p:p><p:run><p:ctrl><p:colPr colCount='2'/></p:ctrl><p:t>note</p:t></p:run></p:p></p:subList></p:footNote></p:ctrl></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var owners: [2]usize = undefined;
    var count: usize = 0;
    for (tree.elements, 0..) |element, index| if (element.is(uri, "p")) {
        if (count >= owners.len) return error.UnexpectedParagraphCount;
        owners[count] = index;
        count += 1;
    };
    try std.testing.expectEqual(@as(usize, 2), count);
    try std.testing.expect(!hasForParagraph(&tree, owners[0]));
    try std.testing.expect(hasForParagraph(&tree, owners[1]));
    const host = try collect(a, &tree, owners[0], &.{}, .right, 0);
    defer a.free(host);
    try std.testing.expectEqual(@as(usize, 0), host.len);
    const note = try collect(a, &tree, owners[1], &.{}, .right, 1);
    defer a.free(note);
    try std.testing.expectEqual(@as(usize, 1), note.len);
    try std.testing.expectEqualStrings(xml, tree.source);
}

test "column boundary collection shares tab and Unicode coordinates and excludes nested owners" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A😀<p:tab/>B</p:t><p:ctrl><p:colPr colCount='2'/></p:ctrl><p:t>C</p:t></p:run><p:subList><p:p><p:run><p:ctrl><p:colPr colCount='3'/></p:ctrl><p:t>nested</p:t></p:run></p:p></p:subList></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    const segments = try @import("paragraph_text_positions.zig").build(a, &tree, &sites, locations, 1);
    defer a.free(segments);
    const paragraph = tree.elements[0].first_child.?;
    const result = try collect(a, &tree, paragraph, segments, .right, 1);
    defer a.free(result);
    try std.testing.expectEqual(@as(usize, 1), result.len);
    try std.testing.expectEqual(@as(u32, 5), result[0].unit);
    try std.testing.expect(tree.elements[result[0].source_element].is(uri, "colPr"));
    try std.testing.expectError(error.LimitExceeded, collect(a, &tree, paragraph, segments, .right, 0));
    try std.testing.expectError(error.InvalidParagraphElement, collect(a, &tree, 0, segments, .right, 1));
    var invalid = segments[0];
    invalid.start_unit = 1;
    try std.testing.expectError(error.InvalidTextPosition, collect(a, &tree, paragraph, &.{invalid}, .right, 1));
    invalid = segments[0];
    invalid.source_start = 0;
    try std.testing.expectError(error.SourceBindingMismatch, collect(a, &tree, paragraph, &.{invalid}, .right, 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, owner: usize, positions: []const Segment) !void {
            const values = try collect(allocator, parsed, owner, positions, .right, 1);
            defer allocator.free(values);
            try std.testing.expectEqual(@as(u32, 5), values[0].unit);
        }
    }.run, .{ &tree, paragraph, segments });
    try std.testing.expectEqualStrings(xml, tree.source);
}

test "column boundary collection matches actual multicolumn fixture controls without changing saves" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "multicolumns", "multicolumns-widths" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwpx", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var session = try @import("editor_session.zig").open(a, input, .{});
        defer session.deinit();
        var count: usize = 0;
        for (session.sections) |*section| {
            for (section.first_paragraph..section.last_paragraph + 1) |ordinal| {
                const segments = try @import("anchor_text_positions.zig").build(a, &section.tree, &section.sites, section.locations, ordinal);
                defer a.free(segments);
                const owner = try @import("paragraph_site_owner.zig").resolve(&section.tree, &section.sites, section.locations, ordinal);
                const values = try collect(a, &section.tree, owner, segments, .right, 16);
                defer a.free(values);
                try std.testing.expectEqual(@as(usize, 1), values.len);
                try std.testing.expectEqual(@as(u32, 0), values[0].unit);
                const attribute = (try section.tree.attributeValue(a, values[0].source_element, "", "colCount")).?;
                const decoded = try attribute.toUtf8(a, 16);
                defer a.free(decoded);
                try std.testing.expectEqual(@as(u32, @intCast(count + 1)), try @import("xml_values.zig").unsigned32(decoded));
                count += 1;
            }
        }
        try std.testing.expectEqual(@as(usize, 3), count);
        const saved = try session.save();
        defer a.free(saved);
        try std.testing.expectEqualSlices(u8, input, saved);
    }
}

test "column boundary collection counts object anchors rather than text alone" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>A</p:t><p:tbl/><p:ctrl><p:colPr/></p:ctrl><p:t>B</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    const segments = try @import("anchor_text_positions.zig").build(a, &tree, &sites, locations, 1);
    defer a.free(segments);
    const result = try collect(a, &tree, tree.elements[0].first_child.?, segments, .right, 1);
    defer a.free(result);
    try std.testing.expectEqual(@as(usize, 1), result.len);
    try std.testing.expectEqual(@as(u32, 2), result[0].unit);
}
