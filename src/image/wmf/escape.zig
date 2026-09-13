const std = @import("std");
const records = @import("records.zig");

pub const Escape = struct { function_raw: u16, data: []const u8, padding: ?u8 };

fn validFunction(value: u16) bool {
    return switch (value) {
        0x0001...0x0023,
        0x0025,
        0x0026,
        0x002a,
        0x0100,
        0x0102,
        0x0200...0x0202,
        0x0801,
        0x0c01,
        0x1000...0x1002,
        0x100e...0x1010,
        0x1013...0x101a,
        0x11d8,
        => true,
        else => false,
    };
}

pub fn parse(record: records.Record) !Escape {
    if (record.function != 0x0626) return error.InvalidWmfEscapeFunction;
    if (record.parameters.len < 4 or record.parameters.len % 2 != 0 or
        record.size_words != 3 + record.parameters.len / 2) return error.InvalidWmfEscapeSize;
    const function = std.mem.readInt(u16, record.parameters[0..2], .little);
    if (!validFunction(function)) return error.UnsupportedWmfEscapeFunction;
    const count: usize = std.mem.readInt(u16, record.parameters[2..4], .little);
    const padded_count = count + count % 2;
    if (record.parameters.len != 4 + padded_count) return error.InvalidWmfEscapeSize;
    return .{
        .function_raw = function,
        .data = record.parameters[4 .. 4 + count],
        .padding = if (count % 2 != 0) record.parameters[4 + count] else null,
    };
}
