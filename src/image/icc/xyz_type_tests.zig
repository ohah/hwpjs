const std = @import("std");
const t = std.testing;
const xyz = @import("xyz_type.zig");
const values = @import("xyz_values.zig");
test "v2 XYZ nonnegative semantics do not change raw signed parsing" {
    var bytes = [_]u8{0} ** 32;
    bytes[0..4].* = "XYZ ".*;
    for (0..6) |i| {
        for ([_]i32{ std.math.minInt(i32), -1, 0, 1, std.math.maxInt(i32) }) |value| {
            std.mem.writeInt(i32, bytes[8 + i * 4 ..][0..4], value, .big);
            const array = try xyz.parse(&bytes);
            if (value < 0) {
                try t.expectError(error.InvalidIccV2XyzValue, values.validateV2_2001(array));
            } else try values.validateV2_2001(array);
            std.mem.writeInt(i32, bytes[8 + i * 4 ..][0..4], 0, .big);
        }
    }
    try values.validateV2_2001(try xyz.parse(bytes[0..8]));
}
test "XYZType preserves signed wire values and borrows exact array" {
    var bytes = [_]u8{ 'X', 'Y', 'Z', ' ', 0, 0, 0, 0, 0x80, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 0x7f, 0xff, 0xff, 0xff, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0 };
    const array = try xyz.parse(&bytes);
    try t.expectEqual(@as(usize, 2), array.count());
    try t.expectEqualDeep([3]i32{ std.math.minInt(i32), -1, std.math.maxInt(i32) }, try array.at(0));
    try t.expectEqualDeep([3]i32{ 65536, 1, 0 }, try array.at(1));
    bytes[31] = 9;
    try t.expectEqual(@as(i32, 9), (try array.at(1))[2]);
    try t.expectError(error.InvalidIccXyzIndex, array.at(2));
    try t.expectError(error.InvalidIccXyzIndex, array.at(std.math.maxInt(usize)));
}
test "XYZType length residue and prefix corruption are rejected" {
    var bytes = [_]u8{0} ** 57;
    bytes[0..4].* = "XYZ ".*;
    for (0..bytes.len + 1) |len| {
        if (len < 8) {
            try t.expectError(error.InvalidIccTagDataSize, xyz.parse(bytes[0..len]));
        } else if ((len - 8) % 12 != 0) {
            try t.expectError(error.InvalidIccXyzSize, xyz.parse(bytes[0..len]));
        } else {
            const array = try xyz.parse(bytes[0..len]);
            try t.expectEqual((len - 8) / 12, array.count());
            try t.expectError(error.InvalidIccXyzIndex, array.at(array.count()));
        }
    }
    for (0..8) |i| {
        const old = bytes[i];
        bytes[i] ^= 1;
        if (i < 4) {
            try t.expectError(error.InvalidIccXyzType, xyz.parse(bytes[0..20]));
        } else {
            try t.expectError(error.InvalidIccTagReserved, xyz.parse(bytes[0..20]));
        }
        bytes[i] = old;
    }
    _ = try xyz.parse(bytes[0..20]);
}
