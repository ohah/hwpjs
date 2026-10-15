const std = @import("std");
fn preservationCase(a: std.mem.Allocator) !void {
    const fixture = @import("hwpx/test_formula_fixture.zig").section;
    const position = std.mem.lastIndexOf(u8, fixture, "<p:t>2</p:t>").?;
    const xml = try std.mem.concat(a, u8, &.{ fixture[0..position], "<p:t>100</p:t>", fixture[position + "<p:t>2</p:t>".len ..] });
    defer a.free(xml);
    var tree = try @import("hwpx/xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("hwpx/text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const trees = [_]@import("hwpx/xml_part_tree.zig").Tree{tree};
    const writer = @import("hwpx/formula_section_save.zig");
    const untouched = try writer.writeWithDefinitionsMode(a, &trees, 0, &sites, .{}, &.{}, null, xml.len + 4096, true);
    defer a.free(untouched);
    try std.testing.expectEqualStrings(xml, untouched);
    const internal = try writer.write(a, &trees, 0, &sites, .{}, &.{}, xml.len + 4096);
    defer a.free(internal);
    try std.testing.expect(std.mem.indexOf(u8, internal, "<p:t>100</p:t>") == null);
    const text = try a.dupe(u8, "5");
    a.free(sites.items[0].text);
    sites.items[0].text = text;
    const edited = try writer.writeWithDefinitionsMode(a, &trees, 0, &sites, .{}, &.{}, null, xml.len + 4096, true);
    defer a.free(edited);
    try std.testing.expect(std.mem.indexOf(u8, edited, "name='LastResult'>5") != null);
    try std.testing.expect(std.mem.indexOf(u8, edited, "<p:t>100</p:t>") == null);
    try std.testing.expectEqualStrings(xml, tree.source);
}

test "untouched formula preservation does not suppress internal or edited derivation" {
    try preservationCase(std.testing.allocator);
    try std.testing.checkAllAllocationFailures(std.testing.allocator, preservationCase, .{});
}
