//! Actual Session format transaction failure sweep; no injected paragraph values.
const std = @import("std");
const editor = @import("editor_session.zig");

test "title projection actual Session format allocation failures preserve original owner" {
    const a = std.testing.allocator;
    const section = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='1'><p:t>X</p:t><p:t>A</p:t><p:t>BC<p:titleMark ignore='1'/></p:t></p:run></p:p></s:sec>";
    const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList><h:charProperties itemCnt='2'><h:charPr id='1' height='1000'/><h:charPr id='2' height='1200'/></h:charProperties></h:refList></h:head>";
    const input = try @import("test_formula_fixture.zig").zipWithSectionHeader(a, section, header);
    defer a.free(input);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            var session = try editor.open(allocator, bytes, .{});
            defer session.deinit();
            const site_count = session.sections[0].sites.items.len;
            const changed = session.setCharacterFormat(0, 1, 2, 3, 2) catch |err| {
                if (err == error.OutOfMemory) {
                    try std.testing.expect(session.sections[0].structure_values == null);
                    try std.testing.expectEqual(site_count, session.sections[0].sites.items.len);
                    try std.testing.expectEqualSlices(u8, bytes, session.source);
                    try std.testing.expectEqualStrings("X", session.sections[0].sites.items[0].text);
                    try std.testing.expectEqualStrings("A", session.sections[0].sites.items[1].text);
                    try std.testing.expectEqualStrings("BC", session.sections[0].sites.items[2].text);
                }
                return err;
            };
            try std.testing.expect(changed);
            const row = &session.sections[0].structure_values.?.paragraphs[0];
            try std.testing.expect(row.title_output_projection != null);
            try row.title_output_projection.?.validate(row);
            try std.testing.expectEqualSlices(u8, bytes, session.source);
        }
    }.run, .{input});
}
