const records = @import("records.zig");
const color_ref = @import("color_ref.zig");

pub fn parse(record: records.Record, policy: color_ref.ReservedPolicy) !color_ref.ColorRef {
    if (record.function != 0x0209) return error.InvalidWmfTextColorFunction;
    if (record.size_words != 5 or record.parameters.len != 4) return error.InvalidWmfTextColorSize;
    return color_ref.parse(record.parameters[0..4], policy);
}
