const std = @import("std");
const records = @import("records.zig");

pub const RectL = struct { left: i32, top: i32, right: i32, bottom: i32 };
pub const SizeL = struct { width: i32, height: i32 };
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

fn rect(bytes: []const u8) RectL {
    return .{
        .left = std.mem.readInt(i32, bytes[0..4], .little),
        .top = std.mem.readInt(i32, bytes[4..8], .little),
        .right = std.mem.readInt(i32, bytes[8..12], .little),
        .bottom = std.mem.readInt(i32, bytes[12..16], .little),
    };
}

fn size(bytes: []const u8) SizeL {
    return .{ .width = std.mem.readInt(i32, bytes[0..4], .little), .height = std.mem.readInt(i32, bytes[4..8], .little) };
}

pub fn parse(record: records.Record, stream_size: usize) !Header {
    if (record.kind != 1) return error.InvalidEmfHeaderType;
    if (record.bytes.len < 88) return error.InvalidEmfHeaderSize;
    if (std.mem.readInt(u32, record.bytes[40..44], .little) != 0x464d4520)
        return error.InvalidEmfSignature;
    if (std.mem.readInt(u16, record.bytes[58..60], .little) != 0)
        return error.InvalidEmfHeaderReserved;
    const declared_bytes = std.mem.readInt(u32, record.bytes[48..52], .little);
    if (declared_bytes != stream_size) return error.InvalidEmfDeclaredBytes;
    return .{
        .size = record.size,
        .bounds = rect(record.bytes[8..24]),
        .frame = rect(record.bytes[24..40]),
        .version = std.mem.readInt(u32, record.bytes[44..48], .little),
        .bytes = declared_bytes,
        .records = std.mem.readInt(u32, record.bytes[52..56], .little),
        .handles = std.mem.readInt(u16, record.bytes[56..58], .little),
        .description_characters = std.mem.readInt(u32, record.bytes[60..64], .little),
        .description_offset = std.mem.readInt(u32, record.bytes[64..68], .little),
        .palette_entries = std.mem.readInt(u32, record.bytes[68..72], .little),
        .device = size(record.bytes[72..80]),
        .millimeters = size(record.bytes[80..88]),
    };
}
