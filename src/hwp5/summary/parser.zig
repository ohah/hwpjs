const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
pub const Header = @import("header.zig").Header;
pub const Value = @import("value.zig").Value;
pub const Property = struct { id: u32, offset: usize, raw: []const u8, value: Value, extra: []const u8 };
pub const Stats = struct { properties: usize = 0, strings: usize = 0, filetimes: usize = 0, integers: usize = 0, dictionaries_deferred: usize = 0, unsupported_types: usize = 0, trailing_bytes: usize = 0, unknown_ids: usize = 0 };
/// Owns property array only. All raw/value/extra bytes borrow the input stream.
/// Single HWP property set; this is not a complete general MS-OLEPS parser.
pub const Document = struct {
    raw: []const u8,
    header: Header,
    properties: []Property,
    extra: []const u8,
    stats: Stats,
    pub fn deinit(self: *Document, a: std.mem.Allocator) void {
        a.free(self.properties);
        self.* = undefined;
    }
    pub fn parse(a: std.mem.Allocator, bytes: []const u8, max_properties: usize) !Document {
        const h = try Header.parse(bytes);
        var r: Reader = .{ .bytes = bytes[h.set_offset..] };
        const size = try r.readInt(u32);
        if (size < 8 or size > r.bytes.len) return error.InvalidSummarySize;
        r.bytes = r.bytes[0..size];
        const count = try r.readInt(u32);
        if (count > max_properties) return error.LimitExceeded;
        if (count > (size - 8) / 8) return error.UnexpectedEnd;
        const begin = 8 + @as(usize, count) * 8;
        const properties = try a.alloc(Property, count);
        errdefer a.free(properties);
        var ids: std.AutoHashMap(u32, void) = .init(a);
        defer ids.deinit();
        for (properties, 0..) |*p, i| {
            const id = try r.readInt(u32);
            const offset = try r.readInt(u32);
            if (offset % 4 != 0 or offset < begin or offset >= size or (i > 0 and offset <= properties[i - 1].offset)) return error.InvalidSummaryOffset;
            if ((try ids.getOrPut(id)).found_existing) return error.DuplicateSummaryProperty;
            p.* = .{ .id = id, .offset = offset, .raw = &.{}, .value = undefined, .extra = &.{} };
        }
        const gap = if (count > 0) properties[0].offset - begin else size - begin;
        var stats: Stats = .{ .properties = count, .trailing_bytes = bytes.len - h.set_offset - size + h.set_offset - h.raw.len + gap };
        for (properties, 0..) |*p, i| {
            const end = if (i + 1 < properties.len) properties[i + 1].offset else size;
            p.raw = r.bytes[p.offset..end];
            const parsed = try @import("value.zig").parse(p.id, p.raw);
            p.value = parsed.value;
            try @import("rules.zig").validate(p.id, p.value);
            if (!@import("rules.zig").known(p.id)) stats.unknown_ids += 1;
            p.extra = parsed.extra;
            stats.trailing_bytes += p.extra.len;
            switch (p.value) {
                .utf16 => stats.strings += 1,
                .filetime => stats.filetimes += 1,
                .i32 => stats.integers += 1,
                .dictionary => stats.dictionaries_deferred += 1,
                .unsupported => stats.unsupported_types += 1,
            }
        }
        return .{ .raw = bytes, .header = h, .properties = properties, .extra = bytes[h.set_offset + size ..], .stats = stats };
    }
};
