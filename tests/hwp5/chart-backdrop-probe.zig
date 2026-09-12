const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var grid = try core.hwp5.chart_grid_cells.readObservedV6(a, bytes, .{ .prelude = .{ .max_bytes = limit } });
    defer grid.deinit();
    var reader: core.Reader = .{ .bytes = bytes, .offset = grid.payload_offset };
    // Private probe explicitly selects the corpus's opaque 26-byte transition.
    // This does not add automatic chart routing to the document parser.
    const transition = try reader.take(26);
    const value = try core.hwp5.chart_backdrop.readObservedEmptyPicture(&reader, &grid.prelude.types);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try int(a, &out, u32, @intCast(value.end));
    for (value.object_ids) |id| try int(a, &out, u32, id);
    try int(a, &out, u16, value.fill_suffix);
    try out.appendSlice(a, transition);
    try out.appendSlice(a, &value.raw_backdrop);
    try out.appendSlice(a, &value.raw_fill);
    try out.appendSlice(a, &value.raw_picture);
    return out.toOwnedSlice(a);
}
