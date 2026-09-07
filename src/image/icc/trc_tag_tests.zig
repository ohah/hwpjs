const std = @import("std");
const t = std.testing;
const trc = @import("trc_tag.zig");
test "TRC channels distinguish permitted types by explicit edition" {
    var curv = [_]u8{0} ** 16;
    curv[0..4].* = "curv".*;
    curv[11] = 2;
    curv[12..16].* = .{ 255, 255, 0, 0 };
    var para = [_]u8{0} ** 16;
    para[0..4].* = "para".*;
    para[12..16].* = .{ 255, 255, 255, 255 };
    for ([_][4]u8{ "rTRC".*, "gTRC".*, "bTRC".*, "kTRC".* }, 0..) |name, i| {
        for ([_]trc.Edition{ .v2_2001, .v4_2022 }) |edition| {
            const result = (try trc.parse(name, &curv, edition)).?;
            try t.expectEqual(i, @intFromEnum(result.channel));
            try t.expect(result.semantics_deferred);
            try t.expectEqual(@as(u16, 65535), try result.curve.curve_type.samples.at(0));
            try t.expectEqual(@as(u16, 0), try result.curve.curve_type.samples.at(1));
        }
        try t.expectError(error.InvalidIccTrcType, trc.parse(name, &para, .v2_2001));
        const result = (try trc.parse(name, &para, .v4_2022)).?;
        try t.expect(result.semantics_deferred);
        try t.expectEqual(@as(?i32, -1), result.curve.parametric.get(.g));
        try t.expectError(error.InvalidIccParametricSize, trc.parse(name, para[0..15], .v4_2022));
        try t.expectError(error.InvalidIccCurveSize, trc.parse(name, curv[0..15], .v2_2001));
        try t.expectError(error.InvalidIccTagDataSize, trc.parse(name, &.{}, .v4_2022));
    }
}
test "TRC unknown names remain unhandled and borrowed samples retain lifetime contract" {
    for ([_][4]u8{ "RTRC".*, "gtrc".*, "abcd".* }) |name| try t.expectEqual(@as(?trc.Parsed, null), try trc.parse(name, &.{}, .v4_2022));
    var bytes = [_]u8{0} ** 16;
    bytes[0..4].* = "curv".*;
    bytes[11] = 2;
    const result = (try trc.parse("rTRC".*, &bytes, .v4_2022)).?;
    bytes[15] = 7;
    try t.expectEqual(@as(u16, 7), try result.curve.curve_type.samples.at(1));
    bytes[0..4].* = "XYZ ".*;
    try t.expectError(error.InvalidIccTrcType, trc.parse("rTRC".*, &bytes, .v4_2022));
}
