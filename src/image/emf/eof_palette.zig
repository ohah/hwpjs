const std = @import("std");
const records = @import("records.zig");
const eof = @import("eof.zig");
const log_palette_entry = @import("log_palette_entry.zig");

pub const Entry = log_palette_entry.Entry;
pub const Palette = struct {
    undefined_before: []const u8,
    entry_bytes: []const u8,
    undefined_after: []const u8,
    count: usize,

    pub fn entry(self: Palette, index: usize) !Entry {
        if (index >= self.count) return error.EmfPaletteIndexOutOfBounds;
        return log_palette_entry.parse(self.entry_bytes[index * 4 ..][0..4]);
    }
};

pub fn parse(record: records.Record, value: eof.Eof) !Palette {
    const content_end = record.bytes.len - 4;
    if (value.palette_entries == 0) return .{
        .undefined_before = record.bytes[16..content_end],
        .entry_bytes = &.{},
        .undefined_after = &.{},
        .count = 0,
    };
    if (value.palette_offset < 16) return error.InvalidEmfPaletteOffset;
    const offset: usize = value.palette_offset;
    if (offset > content_end) return error.InvalidEmfPaletteOffset;
    const byte_count = @as(u64, value.palette_entries) * 4;
    if (byte_count > std.math.maxInt(usize)) return error.InvalidEmfPaletteRange;
    const count: usize = @intCast(byte_count);
    if (count > content_end - offset) return error.InvalidEmfPaletteRange;
    const end = offset + count;
    return .{
        .undefined_before = record.bytes[16..offset],
        .entry_bytes = record.bytes[offset..end],
        .undefined_after = record.bytes[end..content_end],
        .count = value.palette_entries,
    };
}
