//! Derives field positions from current paragraph segments, never cached text.
const ranges = @import("field_text_ranges.zig");
const positions = @import("paragraph_text_positions.zig");

pub const Span = struct { start_unit: usize, end_unit: usize };

/// Validate a paragraph-local label command before preparing any draft.
/// Marker preservation does not authorize edits to text outside this field.
pub fn validateEdit(range: ranges.Range, section: usize, segments: []const positions.Segment, start: usize, end: usize) !usize {
    const span = project(range, section, segments) orelse return error.MissingFieldTextSite;
    if (end < start or start < span.start_unit or end > span.end_unit) return error.InvalidTextPosition;
    try positions.validateRange(segments, start, end);
    return insertionSite(range, section, segments, start);
}

/// Field-label commands choose an owned text site explicitly. At a shared
/// boundary the preceding outside run must never acquire the inserted label.
/// Returns a site index, not a segment index. Tabs are not insertion targets.
pub fn insertionSite(range: ranges.Range, section: usize, segments: []const positions.Segment, unit: usize) !usize {
    const span = project(range, section, segments) orelse return error.MissingFieldTextSite;
    if (unit < span.start_unit or unit > span.end_unit) return error.InvalidTextPosition;
    for (segments) |segment| {
        if (segment.kind != .text or segment.source_start < range.content_start or segment.source_start >= range.content_end) continue;
        if (unit >= segment.start_unit and unit <= segment.end_unit) return segment.index;
    }
    return error.MissingFieldTextSite;
}

/// Returns the field's owned portion in this paragraph. No visible marker
/// width is synthesized; retained tabs already have their shared position.
pub fn project(range: ranges.Range, section: usize, segments: []const positions.Segment) ?Span {
    if (range.section != section) return null;
    var result: ?Span = null;
    for (segments) |segment| {
        if (segment.source_start < range.content_start or segment.source_start >= range.content_end) continue;
        if (result) |*span| {
            span.end_unit = segment.end_unit;
        } else result = .{ .start_unit = segment.start_unit, .end_unit = segment.end_unit };
    }
    return result;
}

test "HWPX field positions retain empty field sites and separate paragraph portions" {
    const std = @import("std");
    const field: ranges.Range = .{ .section = 0, .begin_marker = 0, .end_marker = 1, .content_start = 10, .content_end = 100 };
    const first = [_]positions.Segment{
        .{ .kind = .text, .index = 0, .source_start = 5, .start_unit = 0, .end_unit = 2 },
        .{ .kind = .text, .index = 1, .source_start = 20, .start_unit = 2, .end_unit = 7 },
    };
    const second = [_]positions.Segment{
        .{ .kind = .text, .index = 2, .source_start = 80, .start_unit = 0, .end_unit = 4 },
        .{ .kind = .text, .index = 3, .source_start = 110, .start_unit = 4, .end_unit = 6 },
    };
    try std.testing.expectEqual(Span{ .start_unit = 2, .end_unit = 7 }, project(field, 0, &first).?);
    try std.testing.expectEqual(Span{ .start_unit = 0, .end_unit = 4 }, project(field, 0, &second).?);
    const empty = [_]positions.Segment{.{ .kind = .text, .index = 0, .source_start = 50, .start_unit = 0, .end_unit = 0 }};
    try std.testing.expectEqual(Span{ .start_unit = 0, .end_unit = 0 }, project(field, 0, &empty).?);
    try std.testing.expect(project(field, 0, &.{}) == null);
}

test "HWPX field positions select owned insertion affinity at both field boundaries" {
    const std = @import("std");
    const field: ranges.Range = .{ .section = 0, .begin_marker = 0, .end_marker = 1, .content_start = 10, .content_end = 100 };
    const segments = [_]positions.Segment{
        .{ .kind = .text, .index = 7, .source_start = 5, .start_unit = 0, .end_unit = 2 },
        .{ .kind = .text, .index = 8, .source_start = 20, .start_unit = 2, .end_unit = 4 },
        .{ .kind = .tab, .index = 9, .source_start = 30, .start_unit = 4, .end_unit = 5 },
        .{ .kind = .text, .index = 10, .source_start = 40, .start_unit = 5, .end_unit = 7 },
        .{ .kind = .text, .index = 11, .source_start = 110, .start_unit = 7, .end_unit = 9 },
    };
    try std.testing.expectEqual(@as(usize, 8), try insertionSite(field, 0, &segments, 2));
    try std.testing.expectEqual(@as(usize, 8), try insertionSite(field, 0, &segments, 4));
    try std.testing.expectEqual(@as(usize, 10), try insertionSite(field, 0, &segments, 5));
    try std.testing.expectEqual(@as(usize, 10), try insertionSite(field, 0, &segments, 7));
    try std.testing.expectEqual(@as(usize, 8), try validateEdit(field, 0, &segments, 2, 4));
    try std.testing.expectEqual(@as(usize, 10), try validateEdit(field, 0, &segments, 5, 7));
    try std.testing.expectEqual(@as(usize, 10), try validateEdit(field, 0, &segments, 7, 7));
    try std.testing.expectError(error.ProtectedInlineControl, validateEdit(field, 0, &segments, 2, 7));
    try std.testing.expectError(error.InvalidTextPosition, validateEdit(field, 0, &segments, 1, 4));
    try std.testing.expectError(error.InvalidTextPosition, validateEdit(field, 0, &segments, 5, 8));
    try std.testing.expectError(error.InvalidTextPosition, validateEdit(field, 0, &segments, 5, 4));
    try std.testing.expectError(error.MissingFieldTextSite, validateEdit(field, 1, &segments, 2, 4));
    try std.testing.expectError(error.InvalidTextPosition, insertionSite(field, 0, &segments, 1));
    try std.testing.expectError(error.InvalidTextPosition, insertionSite(field, 0, &segments, 8));
    try std.testing.expectError(error.MissingFieldTextSite, insertionSite(field, 1, &segments, 2));
    const empty = [_]positions.Segment{.{ .kind = .text, .index = 12, .source_start = 50, .start_unit = 2, .end_unit = 2 }};
    try std.testing.expectEqual(@as(usize, 12), try insertionSite(field, 0, &empty, 2));
    try std.testing.expectEqual(@as(usize, 12), try validateEdit(field, 0, &empty, 2, 2));
}

test "HWPX field positions follow current label text without moving original markers" {
    const std = @import("std");
    const a = std.testing.allocator;
    const trees_module = @import("xml_part_tree.zig");
    const sites_module = @import("text_sites.zig");
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>X</p:t><p:ctrl><p:fieldBegin id='1' type='HYPERLINK'/></p:ctrl><p:t>A😀</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl><p:t>Z</p:t></p:run></p:p></s:sec>";
    var tree = try trees_module.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    const trees = [_]trees_module.Tree{tree};
    var report = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer report.deinit();
    const fields = try ranges.build(a, &trees, &report);
    defer a.free(fields);
    var sites = try sites_module.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    const before = try positions.build(a, &tree, &sites, locations, 1);
    defer a.free(before);
    try std.testing.expectEqual(Span{ .start_unit = 1, .end_unit = 4 }, project(fields[0], 0, before).?);
    try std.testing.expect(project(fields[0], 1, before) == null);
    _ = try @import("text_site_edit.zig").splice(a, &sites, 1, 0, 0, "한", 10000);
    const after = try positions.build(a, &tree, &sites, locations, 1);
    defer a.free(after);
    try std.testing.expectEqual(Span{ .start_unit = 1, .end_unit = 5 }, project(fields[0], 0, after).?);
    try std.testing.expectEqualSlices(u8, source, tree.source);
}

test "HWPX field positions actual hyperlink label insertion saves markers and restores exact XML" {
    const std = @import("std");
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/hyperlink.hwpx", a, .limited(2_000_000));
    defer a.free(bytes);
    var document = try @import("package.zig").inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    const trees = [_]@import("xml_part_tree.zig").Tree{tree};
    var report = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer report.deinit();
    const linked = try ranges.build(a, &trees, &report);
    defer a.free(linked);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var exercised: usize = 0;
    for (linked) |field| {
        for (sites.items, locations) |site, location| {
            if (site.start < field.content_start or site.start >= field.content_end) continue;
            const segments = try positions.build(a, &tree, &sites, locations, location.paragraph_ordinal);
            defer a.free(segments);
            const span = project(field, 0, segments).?;
            const index = try insertionSite(field, 0, segments, span.start_unit);
            const original = try a.dupe(u8, sites.items[index].text);
            defer a.free(original);
            try std.testing.expect(try @import("field_label_splice.zig").splice(a, &sites, segments, field, 0, @intCast(span.start_unit), 0, "검증😀<&", 1_000_000));
            const saved = try @import("text_sites_save.zig").write(a, &tree, &sites, .{}, 2_000_000);
            defer a.free(saved);
            var reopened = try @import("xml_part_tree.zig").parse(a, saved, .section, 0, 0, .{});
            defer reopened.deinit(a);
            const reopened_trees = [_]@import("xml_part_tree.zig").Tree{reopened};
            var reopened_report = try @import("field_markers.zig").inspect(a, &reopened_trees, .{});
            defer reopened_report.deinit();
            try std.testing.expectEqual(report.markers.len, reopened_report.markers.len);
            for (report.markers, reopened_report.markers) |before, after| try std.testing.expectEqualSlices(u8, before.raw_xml, after.raw_xml);
            var reopened_sites = try @import("text_sites.zig").collect(a, &reopened, .{});
            defer reopened_sites.deinit(a);
            try std.testing.expectEqualSlices(u8, sites.items[index].text, reopened_sites.items[index].text);
            try std.testing.expect(try @import("text_site_edit.zig").splice(a, &sites, index, 0, 6, "", 1_000_000));
            try std.testing.expectEqualSlices(u8, original, sites.items[index].text);
            const restored = try @import("text_sites_save.zig").write(a, &tree, &sites, .{}, 2_000_000);
            defer a.free(restored);
            try std.testing.expectEqualSlices(u8, tree.source, restored);
            exercised += 1;
            break;
        }
    }
    try std.testing.expect(exercised > 0);
}
