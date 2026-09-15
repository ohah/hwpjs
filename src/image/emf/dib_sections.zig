const std = @import("std");

pub const Fields = struct { bmi_offset: u32, bmi_size: u32, bits_offset: u32, bits_size: u32 };
pub const Sections = struct {
    before_bmi: []const u8,
    bmi: []const u8,
    bits: []const u8,
    padding: []const u8,
};

pub fn parse(bytes: []const u8, fixed_end: usize, fields: Fields) !?Sections {
    const absent = fields.bmi_offset == 0 and fields.bmi_size == 0 and fields.bits_offset == 0 and fields.bits_size == 0;
    if (absent) {
        if (bytes.len != fixed_end) return error.UnreferencedEmfObjectCreationBytes;
        return null;
    }
    if (fields.bmi_offset == 0 or fields.bmi_size == 0 or fields.bits_offset == 0 or fields.bits_size == 0)
        return error.IncompleteEmfDibSections;
    const bmi_start: usize = fields.bmi_offset;
    const bmi_end_u64 = @as(u64, fields.bmi_offset) + fields.bmi_size;
    const bits_end_u64 = @as(u64, fields.bits_offset) + fields.bits_size;
    if (bmi_start < fixed_end or bmi_end_u64 > bytes.len or bits_end_u64 > bytes.len)
        return error.InvalidEmfDibSectionExtent;
    if (fields.bits_offset != bmi_end_u64) return error.NonContiguousEmfPackedDib;
    const bits_end: usize = @intCast(bits_end_u64);
    const semantic_end_u64 = std.mem.alignForward(u64, bits_end_u64, 4);
    if (semantic_end_u64 > bytes.len) return error.InvalidEmfObjectCreationPadding;
    const semantic_end: usize = @intCast(semantic_end_u64);
    return .{
        .before_bmi = bytes[fixed_end..bmi_start],
        .bmi = bytes[bmi_start..@intCast(bmi_end_u64)],
        .bits = bytes[fields.bits_offset..bits_end],
        .padding = bytes[bits_end..semantic_end],
    };
}

test "DIB sections preserve undefined space and alignment padding" {
    const bytes = [_]u8{0} ** 68;
    const sections = (try parse(&bytes, 52, .{ .bmi_offset = 56, .bmi_size = 8, .bits_offset = 64, .bits_size = 1 })).?;
    try std.testing.expectEqual(@as(usize, 4), sections.before_bmi.len);
    try std.testing.expectEqual(@as(usize, 8), sections.bmi.len);
    try std.testing.expectEqual(@as(usize, 1), sections.bits.len);
    try std.testing.expectEqual(@as(usize, 3), sections.padding.len);
    var extended: [72]u8 = undefined;
    @memcpy(extended[0..68], &bytes);
    extended[68..].* = .{ 1, 2, 3, 4 };
    const with_trailing = (try parse(&extended, 52, .{ .bmi_offset = 56, .bmi_size = 8, .bits_offset = 64, .bits_size = 1 })).?;
    try std.testing.expectEqual(@as(usize, 3), with_trailing.padding.len);
    try std.testing.expect((try parse(bytes[0..52], 52, .{ .bmi_offset = 0, .bmi_size = 0, .bits_offset = 0, .bits_size = 0 })) == null);
}

test "DIB sections reject partial overlapping overflowing and unreferenced layouts" {
    const bytes = [_]u8{0} ** 68;
    try std.testing.expectError(error.UnreferencedEmfObjectCreationBytes, parse(&bytes, 52, .{ .bmi_offset = 0, .bmi_size = 0, .bits_offset = 0, .bits_size = 0 }));
    try std.testing.expectError(error.IncompleteEmfDibSections, parse(&bytes, 52, .{ .bmi_offset = 56, .bmi_size = 8, .bits_offset = 0, .bits_size = 0 }));
    try std.testing.expectError(error.InvalidEmfDibSectionExtent, parse(&bytes, 52, .{ .bmi_offset = 48, .bmi_size = 8, .bits_offset = 56, .bits_size = 1 }));
    try std.testing.expectError(error.NonContiguousEmfPackedDib, parse(&bytes, 52, .{ .bmi_offset = 56, .bmi_size = 4, .bits_offset = 64, .bits_size = 1 }));
    try std.testing.expectError(error.InvalidEmfDibSectionExtent, parse(&bytes, 52, .{ .bmi_offset = 56, .bmi_size = 8, .bits_offset = 64, .bits_size = 8 }));
    try std.testing.expectError(error.InvalidEmfDibSectionExtent, parse(&bytes, 52, .{ .bmi_offset = 0xfffffff0, .bmi_size = 0x40, .bits_offset = 0x30, .bits_size = 1 }));
}
