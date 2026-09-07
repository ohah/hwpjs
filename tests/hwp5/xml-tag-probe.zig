const std = @import("std");
const core = @import("hwpjs");
fn word(out: *std.ArrayList(u8), a: std.mem.Allocator, value: usize) !void {
    var b: [4]u8 = undefined;
    std.mem.writeInt(u32, &b, @intCast(value), .little);
    try out.appendSlice(a, &b);
}
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const encoding: core.xml.input.Encoding = switch (try r.readInt(u8)) {
        0 => .utf8,
        1 => .utf16le,
        2 => .utf16be,
        else => return error.InvalidXmlEncoding,
    };
    const options: core.xml.tags.Options = .{
        .max_bytes = try r.readInt(u32),
        .max_name_bytes = try r.readInt(u32),
        .max_attributes = try r.readInt(u32),
        .max_references = try r.readInt(u32),
        .references = .{ .max_bytes = try r.readInt(u32), .max_name_bytes = try r.readInt(u32) },
    };
    var input = try core.xml.input.Input.init(bytes[r.offset..], encoding, .{ .max_characters = limit });
    var tag = try core.xml.tags.parse(a, &input, options);
    defer tag.deinit(a);
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    for ([_]usize{ @intFromEnum(tag.kind), tag.raw.len, tag.name.raw.len, tag.attributes.len, tag.references, tag.unresolved, input.offset, input.remaining }) |v| try word(&out, a, v);
    try out.appendSlice(a, tag.raw);
    try out.appendSlice(a, tag.name.raw);
    for (tag.attributes) |attr| {
        for ([_]usize{ attr.name.raw.len, attr.value.raw.len, attr.value.stats.scalars, attr.value.stats.references, attr.value.stats.unresolved }) |v| try word(&out, a, v);
        try out.appendSlice(a, attr.name.raw);
        try out.appendSlice(a, attr.value.raw);
        var it = try attr.value.iterator();
        while (try it.next()) |part| switch (part) {
            .literal => |c| {
                try word(&out, a, 0);
                try word(&out, a, c);
            },
            .reference => |ref| switch (ref.value) {
                .numeric => |c| {
                    try word(&out, a, 1);
                    try word(&out, a, c);
                },
                .predefined => |c| {
                    try word(&out, a, 2);
                    try word(&out, a, c);
                },
                .unresolved => |name| {
                    try word(&out, a, 3);
                    try word(&out, a, name.raw.len);
                    try out.appendSlice(a, name.raw);
                },
            },
        };
    }
    return out.toOwnedSlice(a);
}
