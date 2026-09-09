const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
const Header = core.image.jpeg_adobe.Header;

pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize, mode: u32) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    if (mode == 274) {
        try append(a, &out, try Header.parse(bytes), limit);
    } else if (mode == 275) {
        var reader: core.Reader = .{ .bytes = bytes };
        const maximum = try reader.readInt(u32);
        var report = try core.image.jpeg_adobe_inspection.inspect(a, bytes[reader.offset..], .{ .max_adobe_markers = maximum });
        defer report.deinit(a);
        if (limit < 4) return error.LimitExceeded;
        try int(a, &out, u32, @intCast(report.headers.len));
        for (report.headers) |h| try append(a, &out, h, limit);
    } else {
        var reader: core.Reader = .{ .bytes = bytes };
        const components = try reader.readInt(u8);
        const h = try Header.parse(bytes[reader.offset..]);
        const encoding = try h.printEncoding(components);
        if (limit < 4) return error.LimitExceeded;
        try int(a, &out, u32, @intFromEnum(encoding));
    }
    return out.toOwnedSlice(a);
}

fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), h: Header, limit: usize) !void {
    if (@as(u64, out.items.len) + 24 + h.extra.len > limit) return error.LimitExceeded;
    for ([_]u32{ h.version, h.flags0, h.flags1, @intFromEnum(h.transform), @intCast(h.extra.len), @intFromBool(h.hasPrintIdentifier()) }) |n| try int(a, out, u32, n);
    try out.appendSlice(a, h.extra);
}
