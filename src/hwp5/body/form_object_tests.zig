const std = @import("std");
const t = std.testing;
const form = @import("form_object.zig");
test "observed form envelope preserves identifiers, unknown length and borrowed UTF16" {
    var bytes = [_]u8{0} ** 21;
    @memcpy(bytes[0..4], "tbp+");
    @memcpy(bytes[4..8], "????");
    std.mem.writeInt(u32, bytes[8..12], 0xffffffff, .little);
    bytes[12] = 3;
    @memcpy(bytes[14..20], &[_]u8{ 0, 0xd8, 0, 0, 13, 0 });
    bytes[20] = 0xa5;
    const v = try form.View.parseObserved(&bytes);
    try t.expectEqual(form.Kind.push_button, v.kind());
    try t.expectEqualStrings("????", &v.secondary_type_id);
    try t.expectEqual(@as(u32, 0xffffffff), v.raw_length);
    try t.expectEqualSlices(u8, bytes[14..20], v.properties);
    try t.expectEqualSlices(u8, &.{0xa5}, v.extra);
    bytes[14] = 42;
    try t.expectEqual(@as(u8, 42), v.properties[0]);
    for (0..20) |cut| try t.expectError(error.UnexpectedEnd, form.View.parseObserved(bytes[0..cut]));
}
test "observed form type selection never turns an unknown ID into a button" {
    inline for (.{ .{ "tbp+", form.Kind.push_button }, .{ "tbc+", form.Kind.check_box }, .{ "boc+", form.Kind.combo_box }, .{ "tbr+", form.Kind.radio_button }, .{ "tde+", form.Kind.edit }, .{ "+pbt", form.Kind.unknown }, .{ "TBP+", form.Kind.unknown } }) |pair| {
        var bytes = [_]u8{0} ** 14;
        @memcpy(bytes[0..4], pair[0]);
        const v = try form.View.parseObserved(&bytes);
        try t.expectEqual(pair[1], v.kind());
        try t.expectEqual(@as(usize, 0), v.properties.len);
    }
}
