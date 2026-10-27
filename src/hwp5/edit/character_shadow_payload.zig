//! HWP5 공개 명세4.2.6: bit11..12, byte50/51/64..67만 수정합니다.
const std = @import("std");
pub fn write(a: std.mem.Allocator, input: []const u8, version: @import("../version.zig").Version, patch: @import("../../model/character_shadow.zig").Patch, limit: usize) ![]u8 {
    try @import("../../model/character_shadow.zig").validate(patch);
    if (input.len > limit) return error.LimitExceeded;
    const shape = try @import("../docinfo/char_shape.zig").CharShape.parse(input, version);
    if (shape.shadowKindRaw() == 3) return error.UnsupportedCharacterShadowSource;
    const output = try a.dupe(u8, input);
    if (patch.kind) |value| std.mem.writeInt(u32, output[46..50], (shape.attributes & ~@as(u32, 3 << 11)) | (@as(u32, @backingInt(value)) << 11), .little);
    if (patch.offset_x) |value| output[50] = @bitCast(@as(i8, @intCast(value)));
    if (patch.offset_y) |value| output[51] = @bitCast(@as(i8, @intCast(value)));
    if (patch.color) |value| std.mem.writeInt(u32, output[64..68], @import("../../model/rgb_color.zig").hwp5(value), .little);
    return output;
}
