//! Resolve exact HWPX grid track bounds from physical cell intervals.
const std = @import("std");
const grid = @import("source_table_grid.zig");

const Link = struct { node: u32, delta: i64 };
pub fn axis(a: std.mem.Allocator, cells: []const grid.Cell, count: u32, extent: u32, horizontal: bool, counter: ?*usize) ![]u32 {
    if (extent == 0) return error.UnsupportedSourceTableGeometry;
    const links = try a.alloc(std.ArrayList(Link), @as(usize, count) + 1);
    @memset(links, .empty);
    try connect(a, links, 0, count, extent, counter);
    for (cells) |cell| {
        const start = if (horizontal) cell.column else cell.row;
        const span = if (horizontal) cell.column_span else cell.row_span;
        try connect(a, links, start, start + span, if (horizontal) cell.width else cell.height, counter);
    }
    const positions = try a.alloc(?i64, links.len);
    @memset(positions, null);
    positions[0] = 0;
    const queue = try a.alloc(u32, links.len);
    var read: usize = 0;
    var written: usize = 1;
    queue[0] = 0;
    while (read < written) : (read += 1) {
        const from = queue[read];
        for (links[from].items) |link| {
            const value = positions[from].? + link.delta;
            if (value < 0 or value > extent) return error.UnsupportedSourceTableGeometry;
            if (positions[link.node]) |previous| {
                if (previous != value) return error.UnsupportedSourceTableGeometry;
            } else {
                positions[link.node] = value;
                queue[written] = link.node;
                written += 1;
            }
        }
    }
    const result = try a.alloc(u32, links.len);
    var previous: usize = 0;
    result[0] = 0;
    for (1..links.len) |i| {
        if (positions[i]) |end| {
            const start: u32 = @intCast(positions[previous].?);
            if (end <= start or end - start < i - previous) return error.UnsupportedSourceTableGeometry;
            for (previous + 1..i + 1) |j|
                result[j] = start + @as(u32, @intCast((@as(u64, @intCast(end - start)) * (j - previous)) / (i - previous)));
            previous = i;
        } else if (links[i].items.len != 0) return error.UnsupportedSourceTableSplitGeometry;
    }
    return result;
}
fn connect(a: std.mem.Allocator, links: []std.ArrayList(Link), start: u32, end: u32, value: u32, counter: ?*usize) !void {
    if (start >= end or end >= links.len) return error.InvalidSourceTableGrid;
    if (counter) |links_count| links_count.* += 2;
    try links[start].append(a, .{ .node = end, .delta = value });
    try links[end].append(a, .{ .node = start, .delta = -@as(i64, value) });
}
