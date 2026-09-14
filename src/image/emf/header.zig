const std = @import("std");
const records = @import("records.zig");
const geometry = @import("geometry.zig");

pub const RectL = geometry.RectL;
pub const SizeL = geometry.SizeL;
pub const Header = struct {
    size: u32,
    bounds: RectL,
    frame: RectL,
    version: u32,
    bytes: u32,
    records: u32,
    handles: u16,
    description_characters: u32,
    description_offset: u32,
    palette_entries: u32,
    device: SizeL,
    millimeters: SizeL,
};

pub fn parse(record: records.Record, stream_size: usize) !Header {
    if (record.kind != .header) return error.InvalidEmfHeaderType;
    if (record.bytes.len < 88) return error.InvalidEmfHeaderSize;
    if (std.mem.readInt(u32, record.bytes[40..44], .little) != 0x464d4520)
        return error.InvalidEmfSignature;
    if (std.mem.readInt(u16, record.bytes[58..60], .little) != 0)
        return error.InvalidEmfHeaderReserved;
    const declared_bytes = std.mem.readInt(u32, record.bytes[48..52], .little);
    if (declared_bytes != stream_size) return error.InvalidEmfDeclaredBytes;
    return .{
        .size = record.size,
        .bounds = try geometry.parseRectL(record.bytes[8..24]),
        .frame = try geometry.parseRectL(record.bytes[24..40]),
        .version = std.mem.readInt(u32, record.bytes[44..48], .little),
        .bytes = declared_bytes,
        .records = std.mem.readInt(u32, record.bytes[52..56], .little),
        .handles = std.mem.readInt(u16, record.bytes[56..58], .little),
        .description_characters = std.mem.readInt(u32, record.bytes[60..64], .little),
        .description_offset = std.mem.readInt(u32, record.bytes[64..68], .little),
        .palette_entries = std.mem.readInt(u32, record.bytes[68..72], .little),
        .device = try geometry.parseSizeL(record.bytes[72..80]),
        .millimeters = try geometry.parseSizeL(record.bytes[80..88]),
    };
}
