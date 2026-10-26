//! Compose current text/dirty serialization with a transient structural split.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const sites_mod = @import("text_sites.zig");
const Dirty = @import("text_sites_save.zig").FieldDirty;

/// Paragraph is the section-local selected scanner ordinal. Reparsed values
/// exist only during output preparation; immutable Session source is unchanged.
/// Formula recalculation and document-wide ID permission belong to the caller.
pub fn write(a: std.mem.Allocator, tree: *const Tree, current: *const sites_mod.Sites, options: sites_mod.Options, dirty: []const Dirty, paragraph: usize, at: u32, end: u32, id: u32, max_bytes: usize) ![]u8 {
    return writeMode(a, tree, current, options, dirty, paragraph, at, end, id, max_bytes, false);
}

pub fn writeAnchored(a: std.mem.Allocator, tree: *const Tree, current: *const sites_mod.Sites, options: sites_mod.Options, dirty: []const Dirty, paragraph: usize, at: u32, end: u32, id: u32, max_bytes: usize) ![]u8 {
    return writeMode(a, tree, current, options, dirty, paragraph, at, end, id, max_bytes, true);
}

fn writeMode(a: std.mem.Allocator, tree: *const Tree, current: *const sites_mod.Sites, options: sites_mod.Options, dirty: []const Dirty, paragraph: usize, at: u32, end: u32, id: u32, max_bytes: usize, anchored: bool) ![]u8 {
    if (tree.part_kind != .section) return error.InvalidPartKind;
    const serialized = try @import("text_sites_save.zig").writeWithFieldDirty(a, tree, current, options, dirty, max_bytes);
    defer a.free(serialized);
    var derived = try @import("xml_part_tree.zig").parse(a, serialized, .section, tree.section_ordinal, tree.item_index, .{ .max_xml_bytes = max_bytes });
    defer derived.deinit(a);
    var sites = try sites_mod.collect(a, &derived, options);
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &derived, &sites, options);
    defer a.free(locations);
    if (anchored) return @import("paragraph_split_section.zig").writeAnchored(a, &derived, &sites, locations, options, paragraph, at, end, id, max_bytes);
    var draft = try @import("paragraph_split_text.zig").prepare(a, &derived, &sites, locations, paragraph, at, end, options.max_text_bytes);
    defer draft.deinit(a);
    return @import("paragraph_split_section.zig").write(a, &derived, &draft, id, max_bytes);
}

test "HWPX split current output preserves non-target edits and is atomic on every allocation failure" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:fieldBegin id='5' dirty='0'/><p:t>first</p:t><p:fieldEnd/></p:run></p:p><p:p id='2'><p:run><p:t>AB</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var current = try sites_mod.collect(a, &tree, .{});
    defer current.deinit(a);
    try std.testing.expect(try @import("text_site_edit.zig").splice(a, &current, 0, 0, 0, "편집<&", 1000));
    try std.testing.expect(try @import("text_site_edit.zig").splice(a, &current, 1, 0, 0, "😀", 1000));
    var field: ?usize = null;
    for (tree.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) {
        field = index;
    };
    const dirty = [_]Dirty{.{ .element_index = field.?, .dirty = true }};
    const output = try write(a, &tree, &current, .{}, &dirty, 2, 3, 3, 3, 2000);
    defer a.free(output);
    try std.testing.expect(std.mem.indexOf(u8, output, "<p:fieldBegin id='5' dirty='1'/>") != null);
    var reopened = try @import("xml_part_tree.zig").parse(a, output, .section, 0, 0, .{});
    defer reopened.deinit(a);
    var sites = try sites_mod.collect(a, &reopened, .{});
    defer sites.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), sites.items.len);
    try std.testing.expectEqualStrings("편집<&first", sites.items[0].text);
    try std.testing.expectEqualStrings("😀A", sites.items[1].text);
    try std.testing.expectEqualStrings("B", sites.items[2].text);
    try std.testing.expectError(error.SplitSurrogatePair, write(a, &tree, &current, .{}, &.{}, 2, 1, 1, 3, 2000));
    try std.testing.expectEqualStrings("편집<&first", current.items[0].text);
    try std.testing.expectEqualStrings("😀AB", current.items[1].text);
    try std.testing.expectEqualStrings(source, tree.source);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, borrowed_tree: *const Tree, borrowed_sites: *const sites_mod.Sites, fields: []const Dirty) !void {
            const bytes = try write(allocator, borrowed_tree, borrowed_sites, .{}, fields, 2, 3, 3, 3, 2000);
            defer allocator.free(bytes);
            try std.testing.expect(std.mem.indexOf(u8, bytes, "<p:fieldBegin id='5' dirty='1'/>") != null);
        }
    }.run, .{ &tree, &current, @as([]const Dirty, &dirty) });
    try std.testing.expect(dirty[0].dirty);
    try std.testing.expectEqualStrings("편집<&first", current.items[0].text);
    try std.testing.expectEqualStrings("😀AB", current.items[1].text);
}
