//! Derive a field start tag from immutable source and current dirty state.
const std = @import("std");
const tree_module = @import("xml_part_tree.zig");

/// Caller owns the returned tag. Does not mutate source or cache serialized XML.
pub fn write(a: std.mem.Allocator, tree: *const tree_module.Tree, index: usize, dirty: bool, max_bytes: usize) ![]u8 {
    if (index >= tree.elements.len) return error.InvalidElementIndex;
    const element = tree.elements[index];
    if (!element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) return error.InvalidFieldElement;
    if (element.name.local.encoding != .utf8) return error.UnsupportedEditEncoding;
    const raw = tree.source[element.start_tag.start..element.start_tag.end];
    const value = try @import("xml_part_attributes.zig").find(a, tree, index, "", "dirty");
    var start: usize = undefined;
    var end: usize = undefined;
    var replacement: []const u8 = undefined;
    if (value) |attribute| {
        const decoded = try attribute.toUtf8(a, max_bytes);
        defer a.free(decoded);
        if (try @import("xml_values.zig").boolean(decoded) == dirty) {
            if (raw.len > max_bytes) return error.LimitExceeded;
            return a.dupe(u8, raw);
        }
        start = @intFromPtr(attribute.raw.ptr) - @intFromPtr(raw.ptr);
        end = start + attribute.raw.len;
        replacement = if (attribute.raw[0] == '\'') (if (dirty) "'1'" else "'0'") else (if (dirty) "\"1\"" else "\"0\"");
    } else {
        start = raw.len - (if (std.mem.endsWith(u8, raw, "/>")) @as(usize, 2) else 1);
        end = start;
        replacement = if (dirty) " dirty=\"1\"" else " dirty=\"0\"";
    }
    const kept = raw.len - (end - start);
    if (kept > max_bytes or replacement.len > max_bytes - kept) return error.LimitExceeded;
    const output = try a.alloc(u8, kept + replacement.len);
    @memcpy(output[0..start], raw[0..start]);
    @memcpy(output[start..][0..replacement.len], replacement);
    @memcpy(output[start + replacement.len ..], raw[end..]);
    return output;
}

test "HWPX field dirty tag preserves lexical attributes and rejects output limits" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:fieldBegin id='1' dirty = 'false' opaque='keep'/><p:fieldBegin id='2' dirty='&#49;'/><p:fieldBegin id='3'/></s:sec>";
    var tree = try tree_module.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    const changed = try write(a, &tree, 1, true, 1000);
    defer a.free(changed);
    try std.testing.expectEqualStrings("<p:fieldBegin id='1' dirty = '1' opaque='keep'/>", changed);
    const unchanged = try write(a, &tree, 2, true, 1000);
    defer a.free(unchanged);
    try std.testing.expectEqualStrings("<p:fieldBegin id='2' dirty='&#49;'/>", unchanged);
    const added = try write(a, &tree, 3, true, 1000);
    defer a.free(added);
    try std.testing.expectEqualStrings("<p:fieldBegin id='3' dirty=\"1\"/>", added);
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, 1, true, 1));
    try std.testing.expectError(error.InvalidFieldElement, write(a, &tree, 0, true, 1000));
    try std.testing.expectEqualSlices(u8, source, tree.source);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: *const tree_module.Tree) !void {
            const output = try write(allocator, input, 1, true, 1000);
            defer allocator.free(output);
        }
    }.run, .{&tree});
}

test "HWPX field dirty tag actual hyperlink saves label and dirty together without source mutation" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/hyperlink.hwpx", a, .limited(2_000_000));
    defer a.free(bytes);
    var document = try @import("package.zig").inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    const trees = [_]tree_module.Tree{tree};
    var report = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer report.deinit();
    const linked = try @import("field_text_ranges.zig").build(a, &trees, &report);
    defer a.free(linked);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const original_xml = try a.dupe(u8, tree.source);
    defer a.free(original_xml);
    var exercised = false;
    for (linked) |field| {
        for (sites.items, 0..) |site, site_index| {
            if (site.start < field.content_start or site.start >= field.content_end) continue;
            const element_index = report.markers[field.begin_marker].element_index;
            try std.testing.expect(try @import("text_site_edit.zig").splice(a, &sites, site_index, 0, 0, "검증😀<&", 1_000_000));
            const flags = [_]@import("text_sites_save.zig").FieldDirty{.{ .element_index = element_index, .dirty = true }};
            const saved = try @import("text_sites_save.zig").writeWithFieldDirty(a, &tree, &sites, .{}, &flags, 2_000_000);
            defer a.free(saved);
            var reopened = try tree_module.parse(a, saved, .section, 0, 0, .{});
            defer reopened.deinit(a);
            const reopened_trees = [_]tree_module.Tree{reopened};
            var after = try @import("field_markers.zig").inspect(a, &reopened_trees, .{});
            defer after.deinit();
            const dirty = try @import("xml_part_attributes.zig").find(a, &reopened, after.markers[field.begin_marker].element_index, "", "dirty");
            const decoded = try dirty.?.toUtf8(a, 100);
            defer a.free(decoded);
            try std.testing.expect(try @import("xml_values.zig").boolean(decoded));
            var current = try @import("text_sites.zig").collect(a, &reopened, .{});
            defer current.deinit(a);
            try std.testing.expectEqualSlices(u8, sites.items[site_index].text, current.items[site_index].text);
            try std.testing.expectEqual(report.markers.len, after.markers.len);
            try std.testing.expectError(error.DuplicateFieldDirty, @import("text_sites_save.zig").writeWithFieldDirty(a, &tree, &sites, .{}, &.{ flags[0], flags[0] }, 2_000_000));
            try std.testing.expectEqualSlices(u8, original_xml, tree.source);
            exercised = true;
            break;
        }
        if (exercised) break;
    }
    try std.testing.expect(exercised);
}
