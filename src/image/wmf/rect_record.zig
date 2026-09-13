const std = @import("std");
const records = @import("records.zig");

pub const Kind = enum { ellipse, rectangle };
pub const Rect = struct { left: i16, top: i16, right: i16, bottom: i16 };
pub const RectRecord = struct { kind: Kind, rect: Rect };

fn function(kind: Kind) u16 {
    return switch (kind) {
        .ellipse => 0x0418,
        .rectangle => 0x041b,
    };
}

pub fn parse(record: records.Record, kind: Kind) !RectRecord {
    if (record.function != function(kind)) return error.InvalidWmfRectFunction;
    if (record.size_words != 7 or record.parameters.len != 8) return error.InvalidWmfRectSize;
    return .{
        .kind = kind,
        .rect = .{
            .bottom = std.mem.readInt(i16, record.parameters[0..2], .little),
            .right = std.mem.readInt(i16, record.parameters[2..4], .little),
            .top = std.mem.readInt(i16, record.parameters[4..6], .little),
            .left = std.mem.readInt(i16, record.parameters[6..8], .little),
        },
    };
}
