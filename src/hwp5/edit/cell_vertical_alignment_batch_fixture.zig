//! New hwpjs-only decoded fixture; no raw/reference/expected JSON input.
const std = @import("std");
const framing = @import("../record.zig");
pub const version = @import("cell_vertical_alignment_test_fixture.zig").version;
pub const Mode = enum { plain, merged_top, multiparagraph_first, protected_last, reserved_last };
fn records(raw: []const u8) !struct { table: framing.Record, lists: [4]framing.Record } {
    var it = framing.Iterator.init(raw, .{});
    var table: ?framing.Record = null;
    var lists: [4]framing.Record = undefined;
    var count: usize = 0;
    while (try it.next()) |record| {
        if (record.tag == 77) table = record;
        if (record.tag == 72) {
            if (count >= lists.len) return error.InvalidOwnFixture;
            lists[count] = record;
            count += 1;
        }
    }
    if (table == null or count != 4) return error.InvalidOwnFixture;
    return .{ .table = table.?, .lists = lists };
}
fn offset(record: framing.Record) usize {
    return record.offset + record.raw.len - record.payload.len;
}
pub fn make(a: std.mem.Allocator, mode: Mode) ![]u8 {
    const raw = try @import("cell_vertical_alignment_test_fixture.zig").make(a);
    var returned_raw = false;
    defer if (!returned_raw) a.free(raw);
    if (mode == .plain) {
        returned_raw = true;
        return raw;
    }
    const found = try records(raw);
    if (mode == .protected_last or mode == .reserved_last) {
        std.mem.writeInt(u32, raw[offset(found.lists[3]) + 4 ..][0..4], if (mode == .protected_last) 1 << 17 else 0x60, .little);
        returned_raw = true;
        return raw;
    }
    const first = found.lists[0];
    const second = found.lists[1];
    if (mode == .merged_top) {
        const begin = second.offset;
        const end = found.lists[2].offset;
        const result = try a.alloc(u8, raw.len - (end - begin));
        @memcpy(result[0..begin], raw[0..begin]);
        @memcpy(result[begin..], raw[end..]);
        // observed8 + CELL fields column span/width; first row has one owner.
        std.mem.writeInt(u16, result[offset(first) + 12 ..][0..2], 2, .little);
        std.mem.writeInt(u32, result[offset(first) + 16 ..][0..4], 20000, .little);
        std.mem.writeInt(u16, result[offset(found.table) + 18 ..][0..2], 1, .little);
        return result;
    }
    const begin = first.offset + first.raw.len;
    const end = second.offset;
    const paragraph = raw[begin..end];
    const result = try a.alloc(u8, raw.len + paragraph.len);
    errdefer a.free(result);
    @memcpy(result[0..end], raw[0..end]);
    @memcpy(result[end..][0..paragraph.len], paragraph);
    @memcpy(result[end + paragraph.len ..], raw[end..]);
    std.mem.writeInt(u16, result[offset(first)..][0..2], 2, .little);
    var it = framing.Iterator.init(paragraph, .{});
    const header = (try it.next()) orelse return error.InvalidOwnFixture;
    if (header.tag != 66) return error.InvalidOwnFixture;
    std.mem.writeInt(u32, result[end + offset(header) + 18 ..][0..4], 9000, .little);
    return result;
}
/// Independent framing + official mask oracle. No batch Entry offsets or writer.
pub fn expected(a: std.mem.Allocator, raw: []const u8, selected: []const usize, value: u2) ![]u8 {
    const out = try a.dupe(u8, raw);
    errdefer a.free(out);
    var it = framing.Iterator.init(raw, .{});
    var index: usize = 0;
    var matched: usize = 0;
    while (try it.next()) |record| {
        if (record.tag != 72) continue;
        for (selected) |wanted| if (wanted == index) {
            const at = offset(record) + 4;
            const old = std.mem.readInt(u32, out[at..][0..4], .little);
            std.mem.writeInt(u32, out[at..][0..4], (old & ~@as(u32, 0x60)) | (@as(u32, value) << 5), .little);
            matched += 1;
        };
        index += 1;
    }
    if (matched != selected.len) return error.InvalidOwnFixture;
    return out;
}
