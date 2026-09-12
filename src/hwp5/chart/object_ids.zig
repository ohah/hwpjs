const Reader = @import("../../binary/reader.zig").Reader;
pub fn readInline(reader: *Reader) !u32 {
    const id = try reader.readInt(u32);
    try requireInline(id);
    return id;
}
pub fn requireInline(id: u32) !void {
    if (id == 0xffffffff) return error.UnsupportedChartObjectReference;
}
/// Only the caller-supplied, bounded inline group, not a global object registry.
pub fn requireUnique(ids: []const u32) !void {
    for (ids, 0..) |id, i| for (ids[0..i]) |prior| {
        if (id == prior) return error.UnsupportedChartObjectReference;
    };
}
