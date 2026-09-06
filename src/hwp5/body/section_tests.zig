const std = @import("std");
const t = std.testing;
const body = @import("reader.zig");
test "section language version boundary, signed units and extra bytes" {
    var bytes = [_]u8{255} ** 29;
    const modern = @import("../version.zig").Version{ .raw = 0x05000105 };
    for (0..26) |n| try t.expectError(error.UnexpectedEnd, body.section_def.Definition.parse(bytes[0..n], modern));
    const old = try body.section_def.Definition.parse(&bytes, .{ .raw = 0x05000104 });
    try t.expect(old.language == null);
    try t.expectEqual(5, old.extra.len);
    var d = try body.section_def.Definition.parse(&bytes, modern);
    try t.expectEqual(-1, d.column_gap);
    try t.expectEqual(-1, d.vertical_grid);
    try t.expectEqual(-1, d.horizontal_grid);
    try t.expectEqual(0xffffffff, d.tab_spacing);
    try t.expectEqual(65535, d.language.?);
    try t.expectEqual(3, d.extra.len);
    bytes[24] = 0;
    bytes[25] = 0;
    d = try body.section_def.Definition.parse(&bytes, modern);
    try t.expectEqual(0, d.language.?);
}
test "page and border minimum sizes use field sums and keep signed wire values" {
    const bytes = [_]u8{255} ** 43;
    for (0..40) |n| try t.expectError(error.UnexpectedEnd, body.PageDefinition.parse(bytes[0..n]));
    const page = try body.PageDefinition.parse(&bytes);
    try t.expectEqual(0xffffffff, page.width);
    try t.expectEqual(0xffffffff, page.gutter);
    try t.expectEqual(3, page.extra.len);
    for (0..14) |n| try t.expectError(error.UnexpectedEnd, body.PageBorder.parse(bytes[0..n]));
    const border = try body.PageBorder.parse(bytes[0..17]);
    try t.expectEqual(-1, border.left);
    try t.expectEqual(-1, border.bottom);
    try t.expectEqual(65535, border.border_fill_id);
    try t.expectEqual(3, border.extra.len);
    for ([_]u32{ 73, 75 }) |tag| {
        var raw = [_]u8{0} ** 5;
        std.mem.writeInt(u32, raw[0..4], tag | (1 << 20), .little);
        var it = try body.Iterator.init(&raw, .{ .raw = 0x05000307 }, .{});
        for (0..2) |_| {
            try t.expectError(error.UnexpectedEnd, it.next());
            try t.expectEqual(0, it.records.reader.offset);
        }
    }
}
