//! Edit authoritative paragraph text after topology changes, not source cache.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const model = @import("paragraph_structure_values.zig");

pub fn splice(a: std.mem.Allocator, tree: *const Tree, current: *model.Values, index: usize, start: u32, deleted: u32, inserted: []const u8, limit: usize) !bool {
    return spliceMode(a, tree, current, index, start, deleted, inserted, limit, false);
}

pub fn spliceMode(a: std.mem.Allocator, tree: *const Tree, current: *model.Values, index: usize, start: u32, deleted: u32, inserted: []const u8, limit: usize, anchored: bool) !bool {
    if (index >= current.paragraphs.len) return error.InvalidParagraphIndex;
    var other: usize = 0;
    for (current.paragraphs, 0..) |paragraph, ordinal| {
        if (ordinal == index) continue;
        for (paragraph.sites.items) |site| {
            if (site.text.len > limit -| other) return error.LimitExceeded;
            other += site.text.len;
        }
    }
    const paragraph = &current.paragraphs[index];
    if (paragraph.field_positions != null) return error.UnsupportedStructuralFieldEdit;
    if (paragraph.page_area_positions != null and paragraph.column_boundaries != null and paragraph.pieces != null) return @import("column_page_area_group_splice.zig").splice(a, tree, current, index, start, deleted, inserted, limit - other);
    if (paragraph.page_area_positions != null) return @import("page_area_splice.zig").splice(a, tree, paragraph, start, deleted, inserted, limit - other, anchored);
    if (paragraph.column_boundaries != null) {
        const group = try @import("column_boundary_group.zig").locate(current, index);
        if (paragraph.pieces != null and paragraph.protected_positions != null and @import("paragraph_joined_anchor_mode.zig").has(tree, &paragraph.joined().?))
            return @import("column_boundary_joined_splice.zig").spliceGroupWithAnchors(a, tree, current.paragraphs[group.start..group.end], index - group.start, start, deleted, inserted, limit - other);
        if (paragraph.pieces != null and paragraph.protected_positions != null) return @import("column_boundary_joined_splice.zig").spliceGroupWithTabs(a, tree, current.paragraphs[group.start..group.end], index - group.start, start, deleted, inserted, limit - other);
        if (paragraph.pieces != null) return @import("column_boundary_joined_splice.zig").spliceGroup(a, tree, current.paragraphs[group.start..group.end], index - group.start, start, deleted, inserted, limit - other);
        return @import("column_boundary_splice.zig").spliceGroup(a, tree, current.paragraphs[group.start..group.end], index - group.start, start, deleted, inserted, limit - other, anchored);
    }
    if (paragraph.protected_positions != null) {
        if (!anchored and paragraph.pieces == null) return error.UnsupportedAnchoredStructure;
        return @import("paragraph_protected_splice.zig").splice(a, tree, paragraph, start, deleted, inserted, limit - other);
    }
    if (paragraph.character_styles != null and paragraph.pieces == null) {
        if (anchored) return @import("character_style_splice.zig").spliceAnchored(a, tree, paragraph, start, deleted, inserted, limit - other);
        return @import("character_style_splice.zig").splice(a, tree, paragraph, start, deleted, inserted, limit - other);
    }
    if (paragraph.joined()) |view| {
        var owned = view;
        const changed = try @import("paragraph_joined_splice.zig").splice(a, tree, &owned, start, deleted, inserted, limit - other);
        // splice swaps ownership only on success; no fallible work after it.
        if (changed) {
            paragraph.sites = owned.sites;
            paragraph.pieces = owned.pieces;
            paragraph.character_styles = owned.character_styles;
        }
        return changed;
    }
    if (paragraph.title_positions != null) return @import("title_mark_plain_splice.zig").splice(a, tree, paragraph, start, deleted, inserted, limit - other, anchored);
    const locations = try @import("paragraph_structure_locations.zig").build(a, tree, paragraph);
    defer a.free(locations);
    if (anchored) return @import("anchor_paragraph_edit.zig").splice(a, tree, &paragraph.sites, locations, 1, start, deleted, inserted, limit - other);
    return @import("plain_paragraph_edit.zig").spliceWithTabs(a, tree, &paragraph.sites, locations, 1, start, deleted, inserted, limit - other, true);
}

test "HWPX structural splice edits generated paragraphs and preserves failed current values" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run charPrIDRef='7'><p:t>A😀B</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var counters: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &counters);
    defer values.deinit(a);
    var current = try @import("paragraph_structure_split.zig").prepare(a, &tree, &values, 0, 1, 1, 2, 10000);
    defer current.deinit(a);
    try std.testing.expectError(error.SplitSurrogatePair, splice(a, &tree, &current, 1, 1, 0, "x", 10000));
    try std.testing.expectError(error.LimitExceeded, splice(a, &tree, &current, 1, 0, 0, "x", 1));
    try std.testing.expectError(error.InvalidXmlCharacter, splice(a, &tree, &current, 1, 0, 0, &.{0}, 10000));
    try std.testing.expect(try splice(a, &tree, &current, 1, 2, 1, "편집<&", 10000));
    try std.testing.expectEqualStrings("😀편집<&", current.paragraphs[1].sites.items[0].text);
    try std.testing.expectEqualStrings("A", current.paragraphs[0].sites.items[0].text);
    try std.testing.expect(!try splice(a, &tree, &current, 1, 2, 4, "편집<&", 10000));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree, original: *const model.Values) !void {
            var copy = try original.clone(allocator);
            defer copy.deinit(allocator);
            _ = splice(allocator, source, &copy, 1, 0, 0, "검증", 10000) catch |err| {
                try std.testing.expectEqualStrings(original.paragraphs[1].sites.items[0].text, copy.paragraphs[1].sites.items[0].text);
                return err;
            };
        }
    }.run, .{ &tree, &current });
    const xml = try @import("paragraph_structure_save.zig").write(a, &tree, &current, .{}, &.{}, 10000);
    defer a.free(xml);
    try std.testing.expect(std.mem.indexOf(u8, xml, "😀편집&lt;&amp;") != null);
    try std.testing.expectEqualStrings("A😀B", sites.items[0].text);
}

test "HWPX structural anchored splice preserves ownership on every allocation failure" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:t>A</p:t></p:run></p:p><p:p id='2'><p:run><p:t>앞</p:t><p:ctrl><p:autoNum num='1'/></p:ctrl><p:t>뒤</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    const options: @import("text_sites.zig").Options = .{ .materialize_tab_boundaries = true, .materialize_anchor_boundaries = true };
    var sites = try @import("text_sites.zig").collect(a, &tree, options);
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, options);
    defer a.free(locations);
    var counters: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, options, &counters);
    defer values.deinit(a);
    var current = try @import("paragraph_structure_split.zig").prepare(a, &tree, &values, 0, 0, 0, 3, 10000);
    defer current.deinit(a);
    try std.testing.expectError(error.ProtectedInlineControl, spliceMode(a, &tree, &current, 2, 1, 1, "", 10000, true));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree, original: *const model.Values) !void {
            var copy = try original.clone(allocator);
            defer copy.deinit(allocator);
            _ = spliceMode(allocator, source, &copy, 2, 0, 0, "검증😀<&", 10000, true) catch |err| {
                for (original.paragraphs, copy.paragraphs) |before, after| {
                    try std.testing.expectEqual(before.template_element, after.template_element);
                    try std.testing.expectEqual(before.generated_id, after.generated_id);
                    try std.testing.expectEqual(before.sites.items.len, after.sites.items.len);
                    for (before.sites.items, after.sites.items) |left, right| try std.testing.expectEqualStrings(left.text, right.text);
                }
                return err;
            };
        }
    }.run, .{ &tree, &current });
    try std.testing.expect(try spliceMode(a, &tree, &current, 2, 0, 0, "검증😀<&", 10000, true));
    const local = try @import("paragraph_structure_locations.zig").build(a, &tree, &current.paragraphs[2]);
    defer a.free(local);
    const text = try @import("anchor_paragraph_edit.zig").text(a, &tree, &current.paragraphs[2].sites, local, 1, 10000);
    defer a.free(text);
    try std.testing.expectEqualStrings("검증😀<&앞\u{fffc}뒤", text);
}
