const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn validate(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const version = core.hwp5.Version{ .raw = try r.readInt(u32) };
    const shapes = try r.readInt(u32);
    const hlen = try r.readInt(u32);
    const h = try core.hwp5.body.Header.parse(try r.take(hlen), version);
    var it = try core.hwp5.body.Iterator.init(bytes[r.offset..], version, .{ .max_records = limit });
    var m: core.hwp5.body.Metadata = .{};
    while (try it.next()) |record| switch (record.value) {
        .char_runs => |v| {
            if (m.runs != null) return error.DuplicateMetadataRecord;
            m.runs = v;
        },
        .line_segments => |v| {
            if (m.lines != null) return error.DuplicateMetadataRecord;
            m.lines = v;
        },
        .range_tags => |v| {
            if (m.ranges != null) return error.DuplicateMetadataRecord;
            m.ranges = v;
        },
        else => return error.UnexpectedMetadataRecord,
    };
    try m.validate(h, shapes);
    return a.alloc(u8, 0);
}
pub fn payload(a: std.mem.Allocator, out: *std.ArrayList(u8), v: core.hwp5.body.Value) !void {
    switch (v) {
        .char_runs => |rows| {
            for (0..rows.count()) |i| {
                const r = rows.get(i).?;
                try int(a, out, u32, r.start);
                try int(a, out, u32, r.char_shape_id);
            }
        },
        .range_tags => |rows| {
            for (0..rows.count()) |i| {
                const r = rows.get(i).?;
                try int(a, out, u32, r.start);
                try int(a, out, u32, r.end);
                try int(a, out, u32, (@as(u32, r.kind()) << 24) | r.data());
            }
        },
        .line_segments => |rows| {
            for (0..rows.count()) |i| {
                const r = rows.get(i).?;
                try int(a, out, u32, r.start);
                try int(a, out, i32, r.y);
                try int(a, out, i32, r.height);
                try int(a, out, i32, r.text_height);
                try int(a, out, i32, r.baseline);
                try int(a, out, i32, r.spacing);
                try int(a, out, i32, r.x);
                try int(a, out, i32, r.width);
                try int(a, out, u32, r.flags);
            }
        },
        else => unreachable,
    }
}
