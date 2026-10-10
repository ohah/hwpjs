//! Insert one resource and update its single ID-mapping count.
const std = @import("std");
pub fn write(a: std.mem.Allocator, input: []const u8, at: usize, mapping_offset: usize, count: i32, tag: u10, payload: []const u8, limit: usize) ![]u8 {
    if (input.len > limit) return error.LimitExceeded;
    if (at > input.len or mapping_offset > input.len or input.len - mapping_offset < 4) return error.UnexpectedEnd;
    if (count < 0) return error.NegativeMappingCount;
    if (count == std.math.maxInt(i32)) return error.ResourceCountOverflow;
    var output: std.ArrayList(u8) = .empty;
    errdefer output.deinit(a);
    try output.appendSlice(a, input[0..at]);
    try @import("../record_writer.zig").append(a, &output, tag, 1, payload, limit);
    const added = output.items.len - at;
    if (input.len - at > limit - output.items.len) return error.LimitExceeded;
    try output.appendSlice(a, input[at..]);
    const adjusted = mapping_offset + if (mapping_offset >= at) added else @as(usize, 0);
    std.mem.writeInt(i32, output.items[adjusted..][0..4], count + 1, .little);
    return output.toOwnedSlice(a);
}
