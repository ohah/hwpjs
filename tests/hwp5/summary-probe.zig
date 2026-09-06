const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var doc = try core.hwp5.summary_information.Document.parse(a, bytes, limit);
    defer doc.deinit(a);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    inline for (std.meta.fields(@TypeOf(doc.stats))) |f| try int(a, &out, u32, @intCast(@field(doc.stats, f.name)));
    for (doc.properties) |p| {
        try int(a, &out, u32, p.id);
        try int(a, &out, u32, @intCast(p.offset));
        try int(a, &out, u32, @intCast(p.raw.len));
        switch (p.value) {
            .i32 => |v| {
                try int(a, &out, u32, 3);
                try int(a, &out, i32, v);
            },
            .filetime => |v| {
                try int(a, &out, u32, 64);
                try int(a, &out, u64, v);
            },
            .utf16 => |v| {
                try int(a, &out, u32, 31);
                try int(a, &out, u32, @intCast(v.len / 2));
                try out.appendSlice(a, v);
                for (0..(4 - v.len % 4) % 4) |_| try out.append(a, 0);
            },
            .dictionary, .unsupported => |v| try out.appendSlice(a, v),
        }
        try out.appendSlice(a, p.extra);
    }
    return out.toOwnedSlice(a);
}
