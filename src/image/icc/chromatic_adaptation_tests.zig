const std = @import("std");
const t = std.testing;
const array = @import("s15_fixed16_array.zig");
const matrix = @import("matrix3_fixed.zig");
const tag = @import("chromatic_adaptation.zig");
fn wire(values: [9]i32) [44]u8 {
    var out: [44]u8 = @splat(0);
    @memcpy(out[0..4], "sf32");
    for (values, 0..) |v, i| std.mem.writeInt(i32, out[8 + i * 4 ..][0..4], v, .big);
    return out;
}
test "signed fixed array checks prefix lengths indices and preserves full i32 range" {
    var b = wire(.{ std.math.minInt(i32), -1, 0, 1, 65536, std.math.maxInt(i32), 2, 3, 4 });
    const view = try array.parse(&b);
    try t.expectEqual(std.math.minInt(i32), try view.at(0));
    try t.expectEqual(std.math.maxInt(i32), try view.at(5));
    try t.expectError(error.InvalidIccFixedArrayIndex, view.at(std.math.maxInt(usize)));
    try t.expectError(error.InvalidIccFixedArrayIndex, view.at(9));
    for (0..b.len + 1) |len| {
        if (len < 8) try t.expectError(error.InvalidIccTagDataSize, array.parse(b[0..len])) else if ((len - 8) % 4 != 0) try t.expectError(error.InvalidIccFixedArraySize, array.parse(b[0..len])) else try t.expectEqual((len - 8) / 4, (try array.parse(b[0..len])).count());
    }
    for (0..8) |i| {
        b[i] ^= 1;
        if (i < 4) try t.expectError(error.InvalidIccFixedArrayType, array.parse(&b)) else try t.expectError(error.InvalidIccTagReserved, array.parse(&b));
        b[i] ^= 1;
    }
}
test "chad validates nine row-major coefficients and exact invertibility" {
    const identity = wire(.{ 65536, 0, 0, 0, 65536, 0, 0, 0, 65536 });
    const parsed = (try tag.parse("chad".*, &identity, .v4_2022)).?;
    try t.expect(parsed.adaptation_deferred);
    try t.expectEqual(@as(i128, 1) << 48, matrix.determinantNumerator(parsed.coefficients));
    const tiny = wire(.{ 1, 0, 0, 0, 1, 0, 0, 0, 1 });
    _ = try tag.parse("chad".*, &tiny, .v4_2022);
    const cancellation = wire(.{ 2147483647, 2147483646, 0, 2147483646, 2147483645, 0, 0, 0, 1 });
    const close = (try tag.parse("chad".*, &cancellation, .v4_2022)).?;
    try t.expectEqual(@as(i128, -1), matrix.determinantNumerator(close.coefficients));
    try t.expectError(error.UnsupportedIccAdaptationEdition, tag.parse("chad".*, &tiny, .v2_2001));
    const singular = wire(.{ 1, 2, 3, 1, 2, 3, 4, 5, 6 });
    try t.expectError(error.InvalidIccAdaptationSingular, tag.parse("chad".*, &singular, .v4_2022));
    try t.expectError(error.InvalidIccAdaptationCount, tag.parse("chad".*, identity[0..40], .v4_2022));
    try t.expectEqual(@as(?tag.Value, null), try tag.parse("zzzz".*, &.{}, .v4_2022));
    for ([_]i32{ std.math.minInt(i32), -1, 1, std.math.maxInt(i32) }) |n| {
        const a = [9]i32{ n, 0, 0, 0, n, 0, 0, 0, n };
        try t.expectEqual(@as(i128, n) * n * n, matrix.determinantNumerator(a));
    }
}
