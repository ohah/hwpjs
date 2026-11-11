//! Selected raw section surgery; only PAGE_DEF scalars and known derived line caches.
const std = @import("std");
const framing = @import("../record.zig");
const t = @import("page_settings_types.zig");
pub fn write(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, values: t.Values) ![]u8 {
    const current = try @import("page_settings_snapshot.zig").read(a, raw, version);
    var it = framing.Iterator.init(raw, .{});
    var index: usize = 0;
    var parents: [1024]u10 = undefined;
    var depth: usize = 0;
    var previous_cache_level: ?u10 = null;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    while (try it.next()) |record| : (index += 1) {
        if (record.level > depth) return error.InvalidRecordHierarchy;
        if (previous_cache_level) |level| if (record.level > level) return error.UnsupportedPageLayoutCache;
        previous_cache_level = null;
        const parent_tag: ?u10 = if (record.level == 0) null else parents[record.level - 1];
        parents[record.level] = record.tag;
        depth = @as(usize, record.level) + 1;
        if (record.tag == 69) {
            if (parent_tag != 66) return error.UnsupportedPageLayoutCache;
            previous_cache_level = record.level;
            if (record.payload.len % 36 != 0) return error.UnsupportedPageLayoutCache;
            var offset: usize = 0;
            while (offset < record.payload.len) : (offset += 36) {
                // Official line-segment tag bits: 0,1,16..21,31 only.
                const flags = std.mem.readInt(u32, record.payload[offset + 32 ..][0..4], .little);
                if (flags & ~@as(u32, 0x803f0003) != 0) return error.UnsupportedPageLayoutCache;
            }
            continue;
        }
        if (record.tag == 66) {
            const header = try @import("../body/paragraph_header.zig").Header.parse(record.payload, version);
            _ = header;
            const start = out.items.len;
            try out.appendSlice(a, record.raw);
            const offset = start + record.raw.len - record.payload.len + @import("../body/paragraph_header.zig").Header.line_segment_count_offset;
            std.mem.writeInt(u16, out.items[offset..][0..2], 0, .little);
        } else if (index == current.source_node) {
            if (record.tag != 73) return error.SourceBindingMismatch;
            const v = values;
            const m = v.margin;
            const payload = try @import("page_settings_payload.zig").prepare(a, record.payload, record.payload, .{ .width = v.width, .height = v.height, .left = m.left, .right = m.right, .top = m.top, .bottom = m.bottom, .header = m.header, .footer = m.footer, .gutter = m.gutter, .orientation = if (v.orientation == .widely) .narrowly else .widely, .binding = switch (v.gutter_type) {
                .left_only => .one_side,
                .left_right => .facing,
                .top_bottom => .top,
            } });
            defer a.free(payload);
            try out.appendSlice(a, record.raw[0 .. record.raw.len - record.payload.len]);
            try out.appendSlice(a, payload);
        } else try out.appendSlice(a, record.raw);
    }
    return out.toOwnedSlice(a);
}
