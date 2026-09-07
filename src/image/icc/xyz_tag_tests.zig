const std = @import("std");
const t = std.testing;
const tag = @import("xyz_tag.zig");
const values = @import("xyz_tag_values.zig");
test "known XYZ tags require exactly one XYZ triple and unknown tags stay unhandled" {
    var data = [_]u8{0} ** 32;
    data[0..4].* = "XYZ ".*;
    const names = [_][4]u8{ "rXYZ".*, "gXYZ".*, "bXYZ".*, "lumi".*, "wtpt".* };
    for (names, 0..) |name, i| {
        const parsed = (try tag.parse(name, data[0..20])).?;
        try t.expectEqual(@as(tag.Kind, @enumFromInt(i)), parsed.kind);
        for ([_]usize{ 8, 32 }) |size| try t.expectError(error.InvalidIccXyzTagCount, tag.parse(name, data[0..size]));
        for (0..20) |size| {
            if (size == 8) continue;
            if (tag.parse(name, data[0..size])) |_| return error.ExpectedRejection else |_| {}
        }
        data[0] = 'x';
        try t.expectError(error.InvalidIccXyzType, tag.parse(name, data[0..20]));
        data[0] = 'X';
        data[7] = 1;
        try t.expectError(error.InvalidIccTagReserved, tag.parse(name, data[0..20]));
        data[7] = 0;
    }
    for ([_][4]u8{ "RXYZ".*, "bkpt".*, "abcd".* }) |name| try t.expectEqual(@as(?tag.Value, null), try tag.parse(name, &.{}));
}
test "display white point uses shared D50 policy without constraining other contexts" {
    const base: tag.Value = .{ .kind = .white_point, .xyz = .{ 63190, 65536, 54061 } };
    try t.expect(!(try values.inspectV4(.display, base)).context_deferred);
    for (0..3) |axis| {
        var bad = base;
        bad.xyz[axis] = 0;
        try t.expectError(error.InvalidIccIlluminant, values.inspectV4(.display, bad));
        try t.expect((try values.inspectV4(.input, bad)).context_deferred);
    }
    for ([_]tag.Kind{ .red_column, .green_column, .blue_column, .luminance }) |kind| {
        const result = try values.inspectV4(.display, .{ .kind = kind, .xyz = .{ -1, 65536, 1 } });
        try t.expect(result.context_deferred);
        try t.expectEqual(kind == .luminance, result.luminance_unused_nonzero);
    }
    try t.expect(!(try values.inspectV4(.display, .{ .kind = .luminance, .xyz = .{ 0, 65536, 0 } })).luminance_unused_nonzero);
}
