const std = @import("std");
const core = @import("hwpjs");

pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var input: core.Reader = .{ .bytes = bytes };
    const version = try input.readInt(u32);
    var it = try core.hwp5.docinfo.Iterator.init(bytes[input.offset..], .{ .raw = version }, .{ .max_records = limit });
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    while (try it.next()) |record| {
        try word(a, &out, record.framing.tag);
        switch (record.value) {
            .properties => |p| {
                for ([_]u32{ p.section_count, p.page_start, p.footnote_start, p.endnote_start, p.picture_start, p.table_start, p.equation_start, p.caret_list, p.caret_paragraph, p.caret_character }) |v| try word(a, &out, v);
                try word(a, &out, @intCast(p.extra.len));
                try out.appendSlice(a, p.extra);
            },
            .id_mappings => |m| {
                try word(a, &out, @intCast(m.count()));
                try word(a, &out, @intCast(m.expectedCount()));
                for (0..@min(m.count(), 18)) |i| try word(a, &out, @bitCast(m.get(@enumFromInt(i)).?));
                try out.appendSlice(a, m.extra());
            },
            .bin_data, .face_name => {
                try word(a, &out, @intCast(record.framing.raw.len));
                const header_len = record.framing.raw.len - record.framing.payload.len;
                try out.appendSlice(a, record.framing.raw[0..header_len]);
                try @import("resource-probe.zig").payload(a, &out, record.value);
            },
            .unknown => {
                try word(a, &out, @intCast(record.framing.raw.len));
                try out.appendSlice(a, record.framing.raw);
            },
        }
    }
    return out.toOwnedSlice(a);
}
fn word(a: std.mem.Allocator, out: *std.ArrayList(u8), value: u32) !void {
    var b: [4]u8 = undefined;
    std.mem.writeInt(u32, &b, value, .little);
    try out.appendSlice(a, &b);
}
