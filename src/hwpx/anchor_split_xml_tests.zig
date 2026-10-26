const std = @import("std");
const serializer = @import("paragraph_split_xml.zig");

test "HWPX anchored split current output preserves other edits and field dirty state" {
    const a = std.testing.allocator;
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:fieldBegin id='5' dirty='0'/><p:t>field</p:t><p:fieldEnd/></p:run></p:p><p:p id='2'><p:run><p:t>A</p:t><p:pic id='7'/><p:t>B</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    try std.testing.expect(try @import("text_site_edit.zig").splice(a, &sites, 0, 0, 0, "필드<&", 1000));
    try std.testing.expect(try @import("text_site_edit.zig").splice(a, &sites, 1, 0, 0, "😀", 1000));
    var field: ?usize = null;
    for (tree.elements, 0..) |element, index| if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) {
        field = index;
    };
    const dirty = [_]@import("text_sites_save.zig").FieldDirty{.{ .element_index = field.?, .dirty = true }};
    const output = try @import("paragraph_split_current.zig").writeAnchored(a, &tree, &sites, .{}, &dirty, 2, 3, 3, 3, 10000);
    defer a.free(output);
    try std.testing.expect(std.mem.indexOf(u8, output, "dirty='1'") != null);
    try std.testing.expect(std.mem.indexOf(u8, output, "필드&lt;&amp;field") != null);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, output, "<p:pic id='7'/>"));
    var reopened = try @import("xml_part_tree.zig").parse(a, output, .section, 0, 0, .{});
    defer reopened.deinit(a);
    var copied = try @import("text_sites.zig").collect(a, &reopened, .{});
    defer copied.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &reopened, &copied, .{});
    defer a.free(locations);
    const left = try @import("anchor_paragraph_edit.zig").text(a, &reopened, &copied, locations, 2, 1000);
    defer a.free(left);
    const right = try @import("anchor_paragraph_edit.zig").text(a, &reopened, &copied, locations, 3, 1000);
    defer a.free(right);
    try std.testing.expectEqualStrings("😀A", left);
    try std.testing.expectEqualStrings("\xef\xbf\xbcB", right);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree, current: *const @import("text_sites.zig").Sites, flags: []const @import("text_sites_save.zig").FieldDirty) !void {
            const bytes = try @import("paragraph_split_current.zig").writeAnchored(allocator, parsed, current, .{}, flags, 2, 3, 3, 3, 10000);
            defer allocator.free(bytes);
        }
    }.run, .{ &tree, &sites, &dirty });
    try std.testing.expectEqualStrings(xml, tree.source);
    try std.testing.expectEqualStrings("😀A", sites.items[1].text);
}

test "HWPX anchored split XML retains each nested object once and preserves opaque payload" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run charPrIDRef='3'><p:t>A😀</p:t><p:pic id='7'><p:subList><p:p id='9'><p:run><p:t>nested</p:t></p:run><p:linesegarray/></p:p></p:subList></p:pic><p:t>B</p:t><p:ctrl><p:footNote><p:subList><p:p id='10'><p:run><p:t>note</p:t></p:run><p:linesegarray/></p:p></p:subList></p:footNote></p:ctrl><p:t>C</p:t></p:run><p:linesegarray/></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    const moves = try @import("anchor_split_plan.zig").build(a, &tree, &sites, locations, 1, 0, 0);
    defer a.free(moves);
    try std.testing.expectEqual(@as(usize, 2), moves.len);
    const section = try @import("paragraph_split_section.zig").writeAnchored(a, &tree, &sites, locations, .{}, 1, 3, 3, 2, 10000);
    defer a.free(section);
    var section_tree = try @import("xml_part_tree.zig").parse(a, section, .section, 0, 0, .{});
    defer section_tree.deinit(a);
    const owner = tree.elements[try @import("paragraph_site_owner.zig").resolve(&tree, &sites, locations, 1)];
    try std.testing.expect(std.mem.startsWith(u8, section, source[0..owner.start_tag.start]));
    try std.testing.expect(std.mem.endsWith(u8, section, source[owner.end..]));
    for ([_]u32{ 0, 1, 3, 4, 5, 6, 7 }) |boundary| {
        const left = try serializer.writeAnchored(a, &tree, &sites, locations, .{}, 1, boundary, boundary, false, 0, 10000);
        defer a.free(left);
        const right = try serializer.writeAnchored(a, &tree, &sites, locations, .{}, 1, boundary, boundary, true, 2, 10000);
        defer a.free(right);
        for (moves, [_]u32{ 3, 5 }) |move, unit| {
            const element = tree.elements[move.element_index];
            const raw = source[element.start_tag.start..element.end];
            try std.testing.expectEqual(@as(usize, if (unit < boundary) 1 else 0), std.mem.count(u8, left, raw));
            try std.testing.expectEqual(@as(usize, if (unit < boundary) 0 else 1), std.mem.count(u8, right, raw));
        }
        const combined = try std.fmt.allocPrint(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>{s}{s}</s:sec>", .{ left, right });
        defer a.free(combined);
        var reopened = try @import("xml_part_tree.zig").parse(a, combined, .section, 0, 0, .{});
        defer reopened.deinit(a);
        try std.testing.expectEqual(@as(usize, 2), std.mem.count(u8, combined, "<p:linesegarray/>"));
    }
    try std.testing.expectError(error.ProtectedInlineControl, serializer.writeAnchored(a, &tree, &sites, locations, .{}, 1, 3, 4, true, 2, 10000));
    try std.testing.expectError(error.SplitSurrogatePair, serializer.writeAnchored(a, &tree, &sites, locations, .{}, 1, 2, 2, true, 2, 10000));
    try std.testing.expectError(error.LimitExceeded, serializer.writeAnchored(a, &tree, &sites, locations, .{}, 1, 3, 3, true, 2, 1));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree, current: *const @import("text_sites.zig").Sites, bound: []const @import("section_text.zig").Location) !void {
            const output = try serializer.writeAnchored(allocator, parsed, current, bound, .{}, 1, 3, 3, true, 2, 10000);
            defer allocator.free(output);
            const whole = try @import("paragraph_split_section.zig").writeAnchored(allocator, parsed, current, bound, .{}, 1, 3, 3, 2, 10000);
            defer allocator.free(whole);
        }
    }.run, .{ &tree, &sites, locations });
    try std.testing.expectEqualStrings(source, tree.source);
    try std.testing.expectEqualStrings("A😀", sites.items[0].text);
}
