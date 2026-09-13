const records = @import("records.zig");
const rect = @import("rect.zig");

pub const Kind = enum { ellipse, rectangle };
pub const RectRecord = struct { kind: Kind, rect: rect.Rect };

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
        .rect = rect.readBRTL(record.parameters[0..8]),
    };
}
