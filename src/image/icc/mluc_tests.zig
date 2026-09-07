const std = @import("std");
const t = std.testing;
const mluc = @import("mluc.zig");
fn fixture() [50]u8 {
    var b: [50]u8 = @splat(0);
    @memcpy(b[0..4], "mluc");
    std.mem.writeInt(u32, b[8..12], 2, .big);
    std.mem.writeInt(u32, b[12..16], 16, .big);
    for ([_]usize{ 16, 32 }, [_][]const u8{ "enUS", "enGB" }) |o, locale| {
        @memcpy(b[o..][0..4], locale);
        std.mem.writeInt(u32, b[o + 4 ..][0..4], 2, .big);
        std.mem.writeInt(u32, b[o + 8 ..][0..4], 48, .big);
        @memcpy(b[o + 12 ..][0..4], "ext!");
    }
    b[49] = 'A';
    return b;
}
test "mluc uses dynamic stride and preserves shared storage and record extensions" {
    var b = fixture();
    const v = try mluc.parse(&b, .{});
    try t.expectEqual(@as(usize, 2), v.count);
    const a = try v.at(0);
    const c = try v.at(1);
    try t.expectEqualStrings("en", &a.language);
    try t.expectEqualStrings("GB", &c.country);
    try t.expectEqualStrings("ext!", a.extension);
    try t.expect(a.text.ptr == c.text.ptr);
    try t.expectError(error.InvalidIccMlucIndex, v.at(std.math.maxInt(usize)));
}
test "mluc bounds count stride string ranges and explicit resource limits" {
    const good = fixture();
    for (0..good.len) |n| try t.expectError(if (n < 8) error.InvalidIccTagDataSize else if (n < 48) error.InvalidIccMlucSize else error.InvalidIccMlucString, mluc.parse(good[0..n], .{}));
    try t.expectError(error.LimitExceeded, mluc.parse(&good, .{ .max_records = 1 }));
    try t.expectError(error.LimitExceeded, mluc.parse(&good, .{ .max_bytes = good.len - 1 }));
    for ([_]u32{ 0, 1, 11 }) |stride| {
        var b = good;
        std.mem.writeInt(u32, b[12..16], stride, .big);
        try t.expectError(error.InvalidIccMlucRecordSize, mluc.parse(&b, .{}));
    }
    for ([_]u32{ 0, 47, 49, 50, std.math.maxInt(u32) }) |offset| {
        var b = good;
        std.mem.writeInt(u32, b[24..28], offset, .big);
        try t.expectError(error.InvalidIccMlucString, mluc.parse(&b, .{}));
    }
    var empty: [16]u8 = @splat(0);
    @memcpy(empty[0..4], "mluc");
    std.mem.writeInt(u32, empty[12..16], 12, .big);
    try t.expectEqual(@as(usize, 0), (try mluc.parse(&empty, .{})).count);
}
test "localized tags dispatch without discharging Unicode or locale semantics" {
    const tag = @import("localized_tag.zig");
    const b = fixture();
    for ([_][4]u8{ "desc".*, "cprt".* }, 0..) |name, i| {
        const value = (try tag.parse(name, &b, .v4_2022, .{})).?;
        try t.expectEqual(i, @intFromEnum(value.kind));
        try t.expect(value.unicode_deferred and value.locale_deferred and value.extensions_deferred);
        try t.expectError(error.UnsupportedIccLocalizedEdition, tag.parse(name, &b, .v2_2001, .{}));
    }
    try t.expectEqual(null, try tag.parse("zzzz".*, &.{}, .v4_2022, .{}));
}
