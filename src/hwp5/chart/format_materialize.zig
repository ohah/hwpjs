const std = @import("std");
const Contents = @import("observed_contents.zig").Contents;
const ValueBlock = @import("value_block.zig").Block;
const ids = @import("object_ids.zig");

/// Serializes one absent optional TextFormat as an inline TextFormat whose
/// required code is a new inline String. The caller composes the returned
/// bytes into the original-coordinate Contents patch batch.
pub fn replacement(a: std.mem.Allocator, value: *const Contents, block: *const ValueBlock, format_object_id: u32, code_object_id: u32, format_type_id: u32, raw_word: u16, bytes: []const u8, trailer: u8) ![]u8 {
    if (block.format != null) return error.ExpectedNullChartFormat;
    if (block.format_start > block.format_end or block.format_end > value.source.len or block.format_end - block.format_start != 4)
        return error.InvalidChartFormatSpan;
    if (std.mem.readInt(u32, value.source[block.format_start..][0..4], .little) != 0xffffffff)
        return error.InvalidChartFormatSpan;
    if (bytes.len > std.math.maxInt(u16)) return error.LimitExceeded;
    try ids.requireInline(format_object_id);
    try ids.requireInline(code_object_id);
    if (format_object_id == code_object_id or value.prefix.objects.entries.contains(format_object_id) or value.prefix.objects.entries.contains(code_object_id))
        return error.DuplicateChartObjectId;

    const types = &value.prefix.grid.prelude.types;
    if (format_type_id == 0xffffffff or types.definitions.contains(format_type_id))
        return error.DuplicateChartTypeId;
    const string_type = types.findLowestId("VtString\x00", 1) orelse return error.MissingChartStringForkType;
    const value_type = types.findLowestId("VtValue\x00", 1) orelse return error.MissingChartStringForkType;
    const object_type = types.findLowestId("VtObject\x00", 1) orelse return error.MissingChartStringForkType;

    const format_name = "VtTextFormat\x00";
    const output = try a.alloc(u8, bytes.len + 50);
    errdefer a.free(output);
    std.mem.writeInt(u32, output[0..4], format_object_id, .little);
    std.mem.writeInt(u32, output[4..8], format_type_id, .little);
    std.mem.writeInt(u16, output[8..10], format_name.len, .little);
    @memcpy(output[10..23], format_name);
    std.mem.writeInt(u16, output[23..25], 1, .little);
    std.mem.writeInt(u32, output[25..29], object_type, .little);
    std.mem.writeInt(u16, output[29..31], raw_word, .little);
    std.mem.writeInt(u32, output[31..35], code_object_id, .little);
    std.mem.writeInt(u32, output[35..39], string_type, .little);
    std.mem.writeInt(u16, output[39..41], @intCast(bytes.len), .little);
    @memcpy(output[41..][0..bytes.len], bytes);
    output[41 + bytes.len] = trailer;
    std.mem.writeInt(u32, output[42 + bytes.len ..][0..4], value_type, .little);
    std.mem.writeInt(u32, output[46 + bytes.len ..][0..4], object_type, .little);
    return output;
}
