const std = @import("std");
const t = std.testing;
const d = @import("reader.zig");
const Reader = @import("../../binary/reader.zig").Reader;
const Head = @import("paragraph_head.zig").Head;

test "paragraph head signed fields, sentinel and atomic truncation" {
    const bytes = [_]u8{ 0xff, 0xff, 0xff, 0xff, 0, 0x80, 0xff, 0x7f, 0xff, 0xff, 0xff, 0xff };
    for (0..bytes.len) |n| {
        var r: Reader = .{ .bytes = bytes[0..n] };
        try t.expectError(error.UnexpectedEnd, Head.read(&r));
        try t.expectEqual(0, r.offset);
    }
    var r: Reader = .{ .bytes = &bytes };
    const h = try Head.read(&r);
    try t.expectEqual(-32768, h.width_adjustment);
    try t.expectEqual(32767, h.text_distance);
    try t.expectEqual(0xffffffff, h.char_shape_id);
}
test "tab count bounds, unknown values and reserved bytes" {
    const bytes = [_]u8{ 3, 0, 0, 0x80, 1, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 0xfe, 0xfd, 0x34, 0x12, 0xaa };
    for (0..16) |n| try t.expectError(error.UnexpectedEnd, d.TabDef.parse(bytes[0..n]));
    const v = try d.TabDef.parse(&bytes);
    try t.expectEqual(1, v.count());
    try t.expectEqual(0xffffffff, v.get(0).?.position);
    try t.expectEqual(0xfe, v.get(0).?.kind);
    try t.expectEqual(0x1234, v.get(0).?.reserved);
    try t.expect(v.get(std.math.maxInt(usize)) == null);
    try t.expectEqualSlices(u8, &.{0xaa}, v.extra);
    try t.expectError(error.UnexpectedEnd, d.TabDef.parse(&.{ 0, 0, 0, 0, 255, 255, 255, 255 }));
}
test "numbering optional groups, version boundaries and partial groups" {
    var bytes = [_]u8{0} ** 184; // 7*(12+2)+2 + 28 + 3*(12+2)+12 + 2 extra
    bytes[98] = 7;
    bytes[100] = 9;
    bytes[128] = 0x81;
    bytes[170] = 11;
    const modern = @import("../version.zig").Version{ .raw = 0x05010000 };
    for (0..182) |n| {
        if (n == 100 or n == 128) continue;
        try t.expectError(error.UnexpectedEnd, d.Numbering.parse(bytes[0..n], modern));
    }
    const absent = try d.Numbering.parse(bytes[0..100], modern);
    try t.expect(absent.starts == null and absent.extension == null);
    const full = try d.Numbering.parse(&bytes, modern);
    try t.expectEqual(7, full.start);
    try t.expectEqual(9, full.starts.?[0]);
    try t.expectEqual(0x81, full.extension.?.levels[0].head.attributes);
    try t.expectEqual(11, full.extension.?.starts[0]);
    try t.expectEqual(2, full.extra.len);
    const old = try d.Numbering.parse(&bytes, .{ .raw = 0x05000204 });
    try t.expect(old.starts == null);
    try t.expectEqual(84, old.extra.len);
    const middle = try d.Numbering.parse(&bytes, .{ .raw = 0x05000205 });
    try t.expectEqual(9, middle.starts.?[0]);
    try t.expect(middle.extension == null);
    try t.expectEqual(56, middle.extra.len);
}
test "bullet image is nine bytes and check character follows full ID" {
    const bytes = [_]u8{ 8, 0, 0, 0, 0, 0, 50, 0, 255, 255, 255, 255, 0x22, 0x20, 1, 0, 0, 0, 0xf6, 20, 3, 0x34, 0x12, 0x13, 0x27, 0xaa };
    for (0..25) |n| {
        if (n == 14 or n == 23) continue;
        try t.expectError(error.UnexpectedEnd, d.Bullet.parse(bytes[0..n]));
    }
    const old = try d.Bullet.parse(bytes[0..14]);
    try t.expect(old.image == null and old.check_character == null);
    const middle = try d.Bullet.parse(bytes[0..23]);
    try t.expect(middle.image != null and middle.check_character == null);
    const v = try d.Bullet.parse(&bytes);
    try t.expectEqual(-10, v.image.?.contrast);
    try t.expectEqual(20, v.image.?.brightness);
    try t.expectEqual(0x1234, v.image.?.bin_data_id);
    try t.expectEqual(0x2713, v.check_character.?);
    try t.expectEqualSlices(u8, &.{0xaa}, v.extra);
}
test "style raw UTF16, signed language and unknown tail" {
    const bytes = [_]u8{ 1, 0, 0, 0xd8, 0, 0, 0xff, 0xfe, 0xff, 0xff, 0x34, 0x12, 0x78, 0x56, 0xab, 0xcd };
    for (0..14) |n| try t.expectError(error.UnexpectedEnd, d.Style.parse(bytes[0..n]));
    const v = try d.Style.parse(&bytes);
    try t.expectEqualSlices(u8, &.{ 0, 0xd8 }, v.local_utf16);
    try t.expectEqual(0, v.english_utf16.len);
    try t.expectEqual(-1, v.language_id);
    try t.expectEqual(0x1234, v.para_shape_id);
    try t.expectEqual(0x5678, v.char_shape_id);
    try t.expectEqualSlices(u8, &.{ 0xab, 0xcd }, v.extra);
}
test "formatting dispatch failures do not consume records" {
    for ([_]u10{ 22, 23, 24, 26 }) |tag| {
        var bytes: [4]u8 = undefined;
        std.mem.writeInt(u32, &bytes, @as(u32, tag) | (1 << 10), .little);
        var it = try d.Iterator.init(&bytes, .{ .raw = 0x05010001 }, .{});
        for (0..2) |_| {
            try t.expectError(error.UnexpectedEnd, it.next());
            try t.expectEqual(0, it.records.reader.offset);
            try t.expectEqual(0, it.records.count);
        }
    }
}
