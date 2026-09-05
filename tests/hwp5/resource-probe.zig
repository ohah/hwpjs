const std = @import("std");
const core = @import("hwpjs");

pub fn decode(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const header = try core.hwp5.Header.parse(try r.take(256));
    const item_size = try r.readInt(u32);
    const item = try core.hwp5.docinfo.BinData.parse(try r.take(item_size));
    return core.hwp5.bin_data_stream.decode(a, &header, item, bytes[r.offset..], limit);
}

pub fn int(a: std.mem.Allocator, out: *std.ArrayList(u8), comptime T: type, value: T) !void {
    var b: [@sizeOf(T)]u8 = undefined;
    std.mem.writeInt(T, &b, value, .little);
    try out.appendSlice(a, &b);
}
pub fn string(a: std.mem.Allocator, out: *std.ArrayList(u8), bytes: []const u8) !void {
    try int(a, out, u16, @intCast(bytes.len / 2));
    try out.appendSlice(a, bytes);
}
/// Test-only reconstruction from typed fields, independently compared to input.
pub fn payload(a: std.mem.Allocator, out: *std.ArrayList(u8), value: core.hwp5.docinfo.Value) !void {
    switch (value) {
        .bin_data => |b| {
            try int(a, out, u16, b.attributes);
            switch (b.data) {
                .link => |v| {
                    try string(a, out, v.absolute_utf16);
                    try string(a, out, v.relative_utf16);
                },
                .embedding => |v| {
                    try int(a, out, u16, v.id);
                    try string(a, out, v.extension_utf16);
                },
                .storage => |id| try int(a, out, u16, id),
                .unknown => |raw| try out.appendSlice(a, raw),
            }
            try out.appendSlice(a, b.extra);
        },
        .face_name => |f| {
            try int(a, out, u8, f.attributes);
            try string(a, out, f.name_utf16);
            if (f.substitute) |s| {
                try int(a, out, u8, s.kind);
                try string(a, out, s.name_utf16);
            }
            if (f.type_info) |info| try out.appendSlice(a, &info);
            if (f.default_utf16) |name| try string(a, out, name);
            try out.appendSlice(a, f.extra);
        },
        else => unreachable,
    }
}
pub fn report(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const version = try r.readInt(u32);
    const result = try core.hwp5.resources.inspect(bytes[r.offset..], .{ .raw = version }, .{ .max_records = limit });
    try result.validate();
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    try int(a, &out, u32, @intCast(result.bin_data_count));
    try int(a, &out, u32, @intCast(result.face_name_count));
    for (0..7) |i| try int(a, &out, i32, result.fontCount(@enumFromInt(i)));
    return out.toOwnedSlice(a);
}
