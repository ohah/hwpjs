const std = @import("std");
const a = std.testing.allocator;
const parse = @import("hwpx/section_tree.zig").parse;
const fields = @import("hwpx/table_xml_fields.zig");
const owner = @import("hwpx/source_table_grid_owner_path.zig");
fn check(xml: []const u8, ordinal_a: usize, ordinal_b: usize) !void {
    var before = try parse(a, xml, 0, 0, .{});
    defer before.deinit(a);
    var after = try parse(a, xml, 0, 0, .{});
    defer after.deinit(a);
    var count: usize = 0;
    var first: ?usize = null;
    var wrong: ?usize = null;
    for (before.elements, 0..) |_, i| if (fields.childIs(&before, i, "tbl")) {
        if (count == ordinal_a) first = i;
        if (count == ordinal_b) wrong = i;
        count += 1;
    };
    try owner.verify(&before, first.?, &after, first.?);
    try std.testing.expectError(error.SourceBindingMismatch, owner.verify(&before, first.?, &after, wrong.?));
}
test "Noori Main owner path identical sibling tables reject wrong target without external IDs" {
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='0'><p:run><p:tbl/></p:run><p:run><p:tbl/></p:run></p:p></s:sec>";
    try check(xml, 0, 1);
}
test "Noori Main owner path identical nested tables reject wrong target with duplicate paragraph IDs" {
    const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='0'><p:run><p:tbl><p:tr><p:tc><p:subList><p:p id='0'><p:run><p:tbl/></p:run></p:p><p:p id='0'><p:run><p:tbl/></p:run></p:p></p:subList></p:tc></p:tr></p:tbl></p:run></p:p></s:sec>";
    try check(xml, 1, 2);
}
