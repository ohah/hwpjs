//! Owned resource values; cell IDs remain one based and source colors stay raw.
const std = @import("std");
const version_mod = @import("../version.zig");
const border = @import("../docinfo/border_fill.zig");
const fill = @import("../docinfo/fill.zig");
const Gradient = @import("drawing_gradient_source.zig").Gradient;
pub const Source = struct {
    id: u32,
    record_index: usize,
    attributes: u16,
    borders: [5]@import("../docinfo/border_line.zig").Border,
    fill_flags: u32,
    fill_known: bool,
    pattern: ?fill.Pattern = null,
    gradient: ?Gradient = null,
    image: ?fill.Image = null,
    alpha: ?@import("../docinfo/fill_alpha.zig").Alpha = null,
    additional_present: ?bool = null,
    additional_bytes: ?usize = null,
    extra_bytes: ?usize = null,
    unknown_fill_bytes: ?usize = null,
};

pub fn deinit(a: std.mem.Allocator, rows: []Source) void {
    for (rows) |row| if (row.gradient) |gradient| gradient.deinit(a);
    a.free(rows);
}

// Only border resources are decoded here. Framing and fill interpretation are shared.
pub fn read(a: std.mem.Allocator, raw: []const u8, version: version_mod.Version, max_styles: usize) ![]Source {
    try version.requireSupported();
    var records = @import("../record.zig").Iterator.init(raw, .{});
    var rows: std.ArrayList(Source) = .empty;
    errdefer {
        for (rows.items) |row| if (row.gradient) |gradient| gradient.deinit(a);
        rows.deinit(a);
    }
    var record_index: usize = 0;
    while (try records.next()) |record| : (record_index += 1) {
        if (record.tag != 20) continue;
        if (record.level != 1) return error.InvalidDocInfoLevel;
        if (rows.items.len >= max_styles or rows.items.len >= std.math.maxInt(u32)) return error.LimitExceeded;
        const parsed = try border.BorderFill.parseWithAdditionalPolicy(record.payload, .observed_absent);
        var row: Source = .{ .id = @intCast(rows.items.len + 1), .record_index = record_index, .attributes = parsed.attributes, .borders = parsed.borders, .fill_flags = parsed.fill.flags, .fill_known = parsed.fill.data == .known };
        errdefer if (row.gradient) |gradient| gradient.deinit(a);
        switch (parsed.fill.data) {
            .unknown => |bytes| row.unknown_fill_bytes = bytes.len,
            .known => |known| {
                row.pattern = known.pattern;
                row.gradient = if (known.gradient) |gradient| try Gradient.copy(a, gradient, known.blurCenter()) else null;
                row.image = known.image;
                row.additional_present = known.additional_present;
                row.additional_bytes = known.additional.len;
                row.extra_bytes = known.extra.len;
                const alpha_bytes: usize = @popCount(parsed.fill.flags & 7);
                if (alpha_bytes > 0 and known.extra.len == alpha_bytes) {
                    var reader: @import("../../binary/reader.zig").Reader = .{ .bytes = known.extra };
                    row.alpha = try @import("../docinfo/fill_alpha.zig").Alpha.read(&reader, parsed.fill.flags);
                    row.extra_bytes = known.extra.len - reader.offset;
                }
            },
        }
        try rows.append(a, row);
    }
    return rows.toOwnedSlice(a);
}
