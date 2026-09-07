const std = @import("std");
const xyz = @import("xyz_type.zig");
pub const Kind = enum { red_column, green_column, blue_column, luminance, white_point };
pub const Value = struct { kind: Kind, xyz: [3]i32 };
/// Recognizes five XYZ tags shared by the 2001 and 2022 editions.
/// null means unhandled, not valid. Input is the tag payload without table padding.
pub fn parse(signature: [4]u8, data: []const u8) !?Value {
    const names = [_][4]u8{ "rXYZ".*, "gXYZ".*, "bXYZ".*, "lumi".*, "wtpt".* };
    for (names, 0..) |name, i| {
        if (!std.mem.eql(u8, &signature, &name)) continue;
        const array = try xyz.parse(data);
        if (array.count() != 1) return error.InvalidIccXyzTagCount;
        return .{ .kind = @enumFromInt(i), .xyz = try array.at(0) };
    }
    return null;
}
