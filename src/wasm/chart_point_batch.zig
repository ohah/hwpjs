//! Bounded borrowed-value batch envelope; semantic validation stays in Session.
const std = @import("std");
const Reader = @import("../binary/reader.zig").Reader;
const Edit = @import("../hwpx/chart_point_write.zig").Edit;
pub const max_edits = 256;
pub const max_bytes = 4 * 1024 * 1024;
pub fn decode(a: std.mem.Allocator, bytes: []const u8) ![]Edit {
    if (bytes.len > max_bytes) return error.LimitExceeded;
    var reader: Reader = .{ .bytes = bytes };
    const count = try reader.readInt(u32);
    if (count > max_edits) return error.LimitExceeded;
    if (@as(usize, count) > (bytes.len - reader.offset) / 8) return error.UnexpectedEnd;
    const edits = try a.alloc(Edit, count);
    errdefer a.free(edits);
    for (edits) |*edit| {
        const point = try reader.readInt(u32);
        const size = try reader.readInt(u32);
        edit.* = .{ .point = point, .value = try reader.take(size) };
    }
    if (reader.offset != bytes.len) return error.InvalidChartPointBatch;
    return edits;
}
