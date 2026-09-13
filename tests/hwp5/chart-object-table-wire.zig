const std = @import("std");
const int = @import("resource-probe.zig").int;
const Table = @import("hwpjs").hwp5.chart_object_table.Table;

pub fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), table: *const Table) !void {
    const ids = try a.alloc(u32, table.entries.count());
    defer a.free(ids);
    var it = table.entries.keyIterator();
    var i: usize = 0;
    while (it.next()) |id| : (i += 1) ids[i] = id.*;
    std.mem.sort(u32, ids, {}, std.sort.asc(u32));
    try int(a, out, u32, @intCast(ids.len));
    for (ids) |id| {
        try int(a, out, u32, id);
        switch (table.entries.get(id).?) {
            .other => try int(a, out, u8, 0),
            .string => |s| {
                try int(a, out, u8, 1);
                try int(a, out, u32, s.object_id);
                try int(a, out, u32, @intCast(s.bytes.len));
                try out.appendSlice(a, s.bytes);
                try int(a, out, u8, s.trailer);
            },
            .number => |n| {
                try int(a, out, u8, 2);
                try int(a, out, u32, n.object_id);
                try int(a, out, u64, n.bits);
                try int(a, out, u16, n.trailer);
            },
        }
    }
}
