const std = @import("std");
const records = @import("records.zig");

pub const Kind = enum { background, raster_operation, polygon_fill };
pub const Mode = struct { kind: Kind, raw: u16, reserved: ?u16 };

fn function(kind: Kind) u16 {
    return switch (kind) {
        .background => 0x0102,
        .raster_operation => 0x0104,
        .polygon_fill => 0x0106,
    };
}

fn valid(kind: Kind, raw: u16) bool {
    return switch (kind) {
        .background, .polygon_fill => raw == 1 or raw == 2,
        .raster_operation => raw >= 1 and raw <= 16,
    };
}

pub fn parse(record: records.Record, kind: Kind) !Mode {
    if (record.function != function(kind)) return error.InvalidWmfModeFunction;
    if (!((record.size_words == 4 and record.parameters.len == 2) or
        (record.size_words == 5 and record.parameters.len == 4))) return error.InvalidWmfModeSize;
    const raw = std.mem.readInt(u16, record.parameters[0..2], .little);
    if (!valid(kind, raw)) return error.UnsupportedWmfMode;
    return .{
        .kind = kind,
        .raw = raw,
        .reserved = if (record.parameters.len == 4) std.mem.readInt(u16, record.parameters[2..4], .little) else null,
    };
}
