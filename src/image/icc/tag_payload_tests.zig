const std = @import("std");
const t = std.testing;
const api = @import("tag_payload.zig");
test "ICC payload dispatch separates unknown edition and invalid known type" {
    try t.expect((try api.parse("A2B0".*, "mft1", .v4_2022, .{})) == .unhandled);
    for ([_][4]u8{ "desc".*, "cprt".*, "chad".* }) |name| {
        try t.expect((try api.parse(name, &.{}, .v2_2001, .{})) == .unsupported_edition);
    }
    const invalid = [_]u8{ 'd', 'a', 't', 'a', 0, 0, 0, 0 };
    try t.expectError(error.InvalidIccTrcType, api.parse("rTRC".*, &invalid, .v4_2022, .{}));
    try t.expectError(error.InvalidIccMlucType, api.parse("desc".*, &invalid, .v4_2022, .{}));
}
test "ICC payload dispatch preserves borrowed strings and computational deferrals" {
    var curve = [_]u8{0} ** 12;
    curve[0..4].* = "curv".*;
    const trc = try api.parse("gTRC".*, &curve, .v2_2001, .{});
    try t.expect(trc == .trc);
    try t.expectEqual(.green, trc.trc.channel);
    try t.expect(trc.trc.semantics_deferred);
    var xyz = [_]u8{0} ** 20;
    xyz[0..4].* = "XYZ ".*;
    std.mem.writeInt(i32, xyz[8..12], -65536, .big);
    const point = try api.parse("rXYZ".*, &xyz, .v4_2022, .{});
    try t.expect(point == .xyz);
    try t.expectEqual(@as(i32, -65536), point.xyz.xyz[0]);
    var strings = [_]u8{0} ** 16;
    strings[0..4].* = "mluc".*;
    std.mem.writeInt(u32, strings[12..16], 12, .big);
    const text = try api.parse("cprt".*, &strings, .v4_2022, .{});
    try t.expect(text == .localized);
    try t.expectEqual(@intFromPtr(&strings), @intFromPtr(text.localized.strings.data.ptr));
    try t.expect(text.localized.unicode_deferred and text.localized.locale_deferred);
    try t.expectError(error.LimitExceeded, api.parse("cprt".*, &strings, .v4_2022, .{ .max_bytes = 15 }));
    var chad = [_]u8{0} ** 44;
    chad[0..4].* = "sf32".*;
    for ([_]usize{ 8, 24, 40 }) |offset| std.mem.writeInt(i32, chad[offset..][0..4], 65536, .big);
    const adapted = try api.parse("chad".*, &chad, .v4_2022, .{});
    try t.expect(adapted == .adaptation);
    try t.expect(adapted.adaptation.adaptation_deferred);
}
