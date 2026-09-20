const std = @import("std");
const record = @import("emf_plus_record.zig");
const text_rendering_hint = @import("emf_plus_text_rendering_hint.zig");

pub const SetTextRenderingHint = struct {
    flags: u16,
    hint: text_rendering_hint.TextRenderingHint,
};

pub fn parse(value: record.Record) !SetTextRenderingHint {
    if (value.kind != .set_text_rendering_hint) return error.NotEmfPlusSetTextRenderingHint;
    if (value.size != 12 or value.data_size != 0 or value.data.len != 0)
        return error.InvalidEmfPlusSetTextRenderingHintSize;
    return .{
        .flags = value.flags,
        .hint = try text_rendering_hint.TextRenderingHint.parse(@truncate(value.flags)),
    };
}

fn makeRecord(flags: u16) record.Record {
    return .{
        .offset = 0,
        .kind = .set_text_rendering_hint,
        .flags = flags,
        .size = 12,
        .data_size = 0,
        .data = &.{},
        .bytes = &.{},
    };
}

test "EMF+ SetTextRenderingHint parses every hint and preserves ignored reserved bits" {
    for (0..6) |raw| {
        const flags: u16 = 0xff00 | @as(u16, @intCast(raw));
        const parsed = try parse(makeRecord(flags));
        try std.testing.expectEqual(flags, parsed.flags);
        try std.testing.expectEqual(@as(u8, @intCast(raw)), @intFromEnum(parsed.hint));
    }
    try std.testing.expectEqual(text_rendering_hint.TextRenderingHint.clear_type_grid_fit, (try parse(makeRecord(0x0005))).hint);
}

test "EMF+ SetTextRenderingHint rejects enum type and every size axis" {
    try std.testing.expectError(error.InvalidEmfPlusTextRenderingHint, parse(makeRecord(6)));
    try std.testing.expectError(error.InvalidEmfPlusTextRenderingHint, parse(makeRecord(0x00ff)));
    var wrong_size = makeRecord(0);
    wrong_size.size = 16;
    try std.testing.expectError(error.InvalidEmfPlusSetTextRenderingHintSize, parse(wrong_size));
    var wrong_data_size = makeRecord(0);
    wrong_data_size.data_size = 4;
    try std.testing.expectError(error.InvalidEmfPlusSetTextRenderingHintSize, parse(wrong_data_size));
    var wrong_slice = makeRecord(0);
    wrong_slice.data = &.{0};
    try std.testing.expectError(error.InvalidEmfPlusSetTextRenderingHintSize, parse(wrong_slice));
    var wrong_type = makeRecord(0);
    wrong_type.kind = .set_text_contrast;
    try std.testing.expectError(error.NotEmfPlusSetTextRenderingHint, parse(wrong_type));
}
