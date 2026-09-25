const std = @import("std");
const header = @import("../../image/wmf/header.zig");
const records = @import("../../image/wmf/records.zig");

pub const Options = struct {
    max_bytes: usize = 64 * 1024 * 1024,
    placeable_size_layout: header.SizeLayout = .specified,
    records: records.Options = .{},
};

/// Framing evidence only; no retained WMF records or rendered image.
pub const Report = struct {
    images: usize = 0,
    bytes: usize = 0,
    records: usize = 0,
    placeable_images: usize = 0,
    trailing_zero_words: usize = 0,
    extension_disagreements: usize = 0,

    pub fn plus(self: Report, other: Report) !Report {
        var result: Report = .{};
        inline for (std.meta.fields(Report)) |field| {
            @field(result, field.name) = std.math.add(usize, @field(self, field.name), @field(other, field.name)) catch return error.LimitExceeded;
        }
        return result;
    }
};

pub fn inspect(bytes: []const u8, options: Options, remaining_bytes: usize) !Report {
    if (bytes.len > options.max_bytes or bytes.len > remaining_bytes) return error.LimitExceeded;
    const placeable = std.mem.startsWith(u8, bytes, &.{ 0xd7, 0xcd, 0xc6, 0x9a });
    const parsed = if (placeable) blk: {
        const h = try header.parse(bytes, options.placeable_size_layout);
        break :blk try records.validate(bytes, h, options.records);
    } else blk: {
        const h = try header.parseStandard(bytes);
        break :blk try records.validate(bytes, h, options.records);
    };
    return .{
        .images = 1,
        .bytes = bytes.len,
        .records = parsed.count,
        .placeable_images = @intFromBool(placeable),
        .trailing_zero_words = parsed.trailing_zero_words,
    };
}
