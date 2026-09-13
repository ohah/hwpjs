const std = @import("std");
const records = @import("records.zig");

pub const Eof = struct { palette_entries: u32, palette_offset: u32 };

pub fn parse(record: records.Record) !Eof {
    if (record.kind != 14) return error.InvalidEmfEofType;
    if (record.bytes.len < 20) return error.InvalidEmfEofSize;
    if (std.mem.readInt(u32, record.bytes[record.bytes.len - 4 ..][0..4], .little) != record.size)
        return error.InvalidEmfEofSizeLast;
    return .{
        .palette_entries = std.mem.readInt(u32, record.bytes[8..12], .little),
        .palette_offset = std.mem.readInt(u32, record.bytes[12..16], .little),
    };
}
