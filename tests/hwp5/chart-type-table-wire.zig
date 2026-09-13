const std = @import("std");
const int = @import("resource-probe.zig").int;
const Table = @import("hwpjs").hwp5.chart_type_table.Table;

// Canonical order belongs to the test wire, not the product hash table.
pub fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), table: *const Table) !void {
    const ids = try a.alloc(u32, table.definitions.count());
    defer a.free(ids);
    var it = table.definitions.keyIterator();
    var i: usize = 0;
    while (it.next()) |id| : (i += 1) ids[i] = id.*;
    std.mem.sort(u32, ids, {}, std.sort.asc(u32));
    try int(a, out, u32, @intCast(ids.len));
    for (ids) |id| {
        const value = table.definitions.get(id).?;
        try int(a, out, u32, id);
        try int(a, out, u16, value.version);
        try int(a, out, u32, @intCast(value.raw_name.len));
        try out.appendSlice(a, value.raw_name);
    }
}
