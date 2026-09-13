const std = @import("std");
const Contents = @import("observed_contents.zig").Contents;
const patches = @import("contents_patch.zig");

/// Replaces one registered String object definition. Aliases keep referencing
/// the same object ID. The original inline u16 length and u8 trailer are part
/// of the patch; reference sites and type/object IDs are untouched.
pub fn replaceStringObject(a: std.mem.Allocator, value: *const Contents, object_id: u32, bytes: []const u8, trailer: u8, max_output_bytes: usize) ![]u8 {
    if (bytes.len > std.math.maxInt(u16)) return error.LimitExceeded;
    const entry = value.prefix.objects.entries.get(object_id) orelse return error.UnknownChartStringObject;
    const string = switch (entry) {
        .string => |string| string,
        else => return error.UnsupportedChartStringEditTarget,
    };
    if (string.object_id != object_id) return error.InvalidChartStringSource;

    const source = value.source;
    const source_address = @intFromPtr(source.ptr);
    const string_address = @intFromPtr(string.bytes.ptr);
    if (string_address < source_address) return error.InvalidChartStringSource;
    const payload_offset = string_address - source_address;
    if (payload_offset < 2 or payload_offset > source.len or string.bytes.len > source.len - payload_offset or
        source.len - payload_offset - string.bytes.len < 1)
        return error.InvalidChartStringSource;
    const length_offset = payload_offset - 2;
    const old_end = payload_offset + string.bytes.len + 1;
    if (std.mem.readInt(u16, source[length_offset..][0..2], .little) != string.bytes.len or source[old_end - 1] != string.trailer)
        return error.InvalidChartStringSource;

    const replacement = try a.alloc(u8, bytes.len + 3);
    defer a.free(replacement);
    std.mem.writeInt(u16, replacement[0..2], @intCast(bytes.len), .little);
    @memcpy(replacement[2..][0..bytes.len], bytes);
    replacement[replacement.len - 1] = trailer;
    return patches.applyOriginal(a, value, &.{.{ .start = length_offset, .end = old_end, .replacement = replacement }}, max_output_bytes);
}
