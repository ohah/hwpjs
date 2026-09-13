const std = @import("std");
const records = @import("records.zig");

pub const Alignment = struct { raw: u16, reserved: ?u16 };

fn valid(raw: u16) bool {
    if ((raw & ~@as(u16, 0x011f)) != 0) return false;
    const horizontal = raw & 0x0006;
    const vertical = raw & 0x0018;
    return (horizontal == 0 or horizontal == 2 or horizontal == 6) and
        (vertical == 0 or vertical == 8 or vertical == 0x18);
}

pub fn parse(record: records.Record) !Alignment {
    if (record.function != 0x012e) return error.InvalidWmfTextAlignFunction;
    if (!((record.size_words == 4 and record.parameters.len == 2) or
        (record.size_words == 5 and record.parameters.len == 4))) return error.InvalidWmfTextAlignSize;
    const raw = std.mem.readInt(u16, record.parameters[0..2], .little);
    if (!valid(raw)) return error.UnsupportedWmfTextAlignment;
    return .{
        .raw = raw,
        .reserved = if (record.parameters.len == 4) std.mem.readInt(u16, record.parameters[2..4], .little) else null,
    };
}
