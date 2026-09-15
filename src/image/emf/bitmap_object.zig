const std = @import("std");
const dib_colors = @import("dib_colors.zig");
const dib_payload = @import("dib_payload.zig");

pub const Fields = struct { bmi_offset: u32, bmi_size: u32, bits_offset: u32, bits_size: u32 };
pub const Options = struct { require_monochrome: bool = false, uncompressed_rows: ?u32 = null };
pub const Object = struct {
    start: usize,
    bmi: []const u8,
    between_bmi_and_bits: []const u8,
    bits: []const u8,
    dib: dib_payload.Payload,
    data_end: usize,
};

pub fn absent(fields: Fields) bool {
    return fields.bmi_offset == 0 and fields.bmi_size == 0 and fields.bits_offset == 0 and fields.bits_size == 0;
}

pub fn parse(bytes: []const u8, fixed_end: usize, fields: Fields, usage: dib_colors.Usage, options: Options) !?Object {
    if (fixed_end > bytes.len) return error.InvalidEmfBitmapObjectExtent;
    if (absent(fields)) return null;
    if (fields.bmi_offset == 0 or fields.bmi_size == 0 or fields.bits_offset == 0 or fields.bits_size == 0)
        return error.IncompleteEmfBitmapObject;
    const bmi_start: u64 = fields.bmi_offset;
    const bmi_end = bmi_start + fields.bmi_size;
    const bits_start: u64 = fields.bits_offset;
    const bits_end = bits_start + fields.bits_size;
    if (bmi_start < fixed_end or bmi_end > bits_start or bits_end > bytes.len)
        return error.InvalidEmfBitmapObjectExtent;
    const bmi = bytes[@intCast(bmi_start)..@intCast(bmi_end)];
    const bits = bytes[@intCast(bits_start)..@intCast(bits_end)];
    return .{
        .start = @intCast(bmi_start),
        .bmi = bmi,
        .between_bmi_and_bits = bytes[@intCast(bmi_end)..@intCast(bits_start)],
        .bits = bits,
        .dib = try dib_payload.parse(bmi, bits, usage, .{ .require_monochrome = options.require_monochrome, .uncompressed_rows = options.uncompressed_rows }),
        .data_end = @intCast(bits_end),
    };
}
