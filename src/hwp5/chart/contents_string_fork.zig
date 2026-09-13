const std = @import("std");
const Contents = @import("observed_contents.zig").Contents;
const Font = @import("font.zig").Font;
const Objects = @import("object_table.zig");
const TextBlock = @import("text_block.zig");
const TextBody = @import("text_block_body.zig").Body;
const TextFormat = @import("text_format.zig");
const ids = @import("object_ids.zig");
const patches = @import("contents_patch.zig");

/// Replaces one existing Font String alias with a new inline String definition.
/// The caller selects the new object ID; existing aliases remain unchanged.
pub fn forkFontName(a: std.mem.Allocator, value: *const Contents, font: *const Font, new_object_id: u32, bytes: []const u8, trailer: u8, max_output_bytes: usize) ![]u8 {
    return fork(a, value, .{ .object_id = font.name.object_id, .start = font.name_start, .end = font.name_end, .introduced = font.name_introduced }, font.object_id, new_object_id, bytes, trailer, max_output_bytes);
}

/// Replaces one existing generic String alias with a new inline definition.
pub fn forkStringReference(a: std.mem.Allocator, value: *const Contents, reference: *const Objects.Reference, new_object_id: u32, bytes: []const u8, trailer: u8, max_output_bytes: usize) ![]u8 {
    return fork(a, value, .{ .object_id = reference.value.object_id, .start = reference.start, .end = reference.end, .introduced = reference.introduced }, null, new_object_id, bytes, trailer, max_output_bytes);
}

/// Forks the String arm of a generic value reference. Number values are not
/// silently retyped because their inline payload and trailer layout differs.
pub fn forkStringValueReference(a: std.mem.Allocator, value: *const Contents, reference: *const Objects.ValueReference, new_object_id: u32, bytes: []const u8, trailer: u8, max_output_bytes: usize) ![]u8 {
    const string = switch (reference.value) {
        .string => |string| string,
        .number => return error.UnsupportedChartStringForkValue,
    };
    return fork(a, value, .{ .object_id = string.object_id, .start = reference.start, .end = reference.end, .introduced = reference.introduced }, null, new_object_id, bytes, trailer, max_output_bytes);
}

/// Forks the required text of an enclosing TextBlock.
pub fn forkTextBlockText(a: std.mem.Allocator, value: *const Contents, block: *const TextBlock.Block, new_object_id: u32, bytes: []const u8, trailer: u8, max_output_bytes: usize) ![]u8 {
    return fork(a, value, .{ .object_id = block.text.object_id, .start = block.text_start, .end = block.text_end, .introduced = block.text_introduced }, block.object_id, new_object_id, bytes, trailer, max_output_bytes);
}

/// Forks non-null text from a nullable enclosing TextBlock.
pub fn forkNullableTextBlockText(a: std.mem.Allocator, value: *const Contents, block: *const TextBlock.NullableBlock, new_object_id: u32, bytes: []const u8, trailer: u8, max_output_bytes: usize) ![]u8 {
    const string = block.text orelse return error.UnsupportedChartStringForkValue;
    return fork(a, value, .{ .object_id = string.object_id, .start = block.text_start, .end = block.text_end, .introduced = block.text_introduced }, block.object_id, new_object_id, bytes, trailer, max_output_bytes);
}

/// Forks non-null text from a base-class body without an enclosing object ID.
pub fn forkTextBodyText(a: std.mem.Allocator, value: *const Contents, body: *const TextBody, new_object_id: u32, bytes: []const u8, trailer: u8, max_output_bytes: usize) ![]u8 {
    const string = body.text orelse return error.UnsupportedChartStringForkValue;
    return fork(a, value, .{ .object_id = string.object_id, .start = body.text_start, .end = body.text_end, .introduced = body.text_introduced }, null, new_object_id, bytes, trailer, max_output_bytes);
}

/// Forks the required String code of an enclosing TextFormat.
pub fn forkTextFormatCode(a: std.mem.Allocator, value: *const Contents, format: *const TextFormat.Format, new_object_id: u32, bytes: []const u8, trailer: u8, max_output_bytes: usize) ![]u8 {
    return fork(a, value, .{ .object_id = format.code.object_id, .start = format.code_start, .end = format.code_end, .introduced = format.code_introduced }, format.object_id, new_object_id, bytes, trailer, max_output_bytes);
}

/// Forks the non-null String code of an enclosing nullable TextFormat.
pub fn forkNullableTextFormatCode(a: std.mem.Allocator, value: *const Contents, format: *const TextFormat.NullableFormat, new_object_id: u32, bytes: []const u8, trailer: u8, max_output_bytes: usize) ![]u8 {
    const string = format.code orelse return error.UnsupportedChartStringForkValue;
    return fork(a, value, .{ .object_id = string.object_id, .start = format.code_start, .end = format.code_end, .introduced = format.code_introduced }, format.object_id, new_object_id, bytes, trailer, max_output_bytes);
}

const Target = struct { object_id: u32, start: usize, end: usize, introduced: bool };

fn fork(a: std.mem.Allocator, value: *const Contents, target: Target, enclosing_object_id: ?u32, new_object_id: u32, bytes: []const u8, trailer: u8, max_output_bytes: usize) ![]u8 {
    if (bytes.len > std.math.maxInt(u16)) return error.LimitExceeded;
    try ids.requireInline(new_object_id);
    if (value.prefix.objects.entries.contains(new_object_id)) return error.DuplicateChartObjectId;
    if (enclosing_object_id != null and new_object_id == enclosing_object_id.?) return error.UnsupportedChartObjectReference;
    if (target.introduced) return error.UnsupportedChartStringForkTarget;

    const source = value.source;
    if (target.start > target.end or target.end > source.len or target.end - target.start != 4)
        return error.InvalidChartStringReferenceSpan;
    if (std.mem.readInt(u32, source[target.start..][0..4], .little) != target.object_id)
        return error.InvalidChartStringReferenceSpan;
    const original = value.prefix.objects.entries.get(target.object_id) orelse return error.InvalidChartStringReferenceSpan;
    switch (original) {
        .string => |string| if (string.object_id != target.object_id) return error.InvalidChartStringReferenceSpan,
        else => return error.InvalidChartStringReferenceSpan,
    }

    const types = &value.prefix.grid.prelude.types;
    const string_type = types.findLowestId("VtString\x00", 1) orelse return error.MissingChartStringForkType;
    const value_type = types.findLowestId("VtValue\x00", 1) orelse return error.MissingChartStringForkType;
    const object_type = types.findLowestId("VtObject\x00", 1) orelse return error.MissingChartStringForkType;

    const replacement = try a.alloc(u8, bytes.len + 19);
    defer a.free(replacement);
    std.mem.writeInt(u32, replacement[0..4], new_object_id, .little);
    std.mem.writeInt(u32, replacement[4..8], string_type, .little);
    std.mem.writeInt(u16, replacement[8..10], @intCast(bytes.len), .little);
    @memcpy(replacement[10..][0..bytes.len], bytes);
    replacement[10 + bytes.len] = trailer;
    std.mem.writeInt(u32, replacement[11 + bytes.len ..][0..4], value_type, .little);
    std.mem.writeInt(u32, replacement[15 + bytes.len ..][0..4], object_type, .little);
    return patches.applyOriginal(a, value, &.{.{ .start = target.start, .end = target.end, .replacement = replacement }}, max_output_bytes);
}
