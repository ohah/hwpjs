//! HWP5 공개 명세 문단 속성1: grid8/connect28 비트 외 원본을 보존합니다.
const std = @import("std");
pub const Patch = @import("../../model/paragraph_flags.zig").Patch;
pub fn read(attributes: u32) @import("../../model/paragraph_flags.zig").Value {
    return .{ .grid = attributes & (1 << 8) != 0, .border_connect = attributes & (1 << 28) != 0 };
}
pub fn write(a: std.mem.Allocator, input: []const u8, version: @import("../version.zig").Version, patch: Patch, limit: usize) ![]u8 {
    if (input.len > limit) return error.LimitExceeded;
    const shape = try @import("../docinfo/para_shape.zig").ParaShape.parse(input, version);
    var attributes = shape.attributes;
    if (patch.grid) |value| attributes = (attributes & ~@as(u32, 1 << 8)) | (@as(u32, @intFromBool(value)) << 8);
    if (patch.border_connect) |value| attributes = (attributes & ~@as(u32, 1 << 28)) | (@as(u32, @intFromBool(value)) << 28);
    const output = try a.dupe(u8, input);
    std.mem.writeInt(u32, output[0..4], attributes, .little);
    return output;
}
