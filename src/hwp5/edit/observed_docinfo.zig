//! Explicit source-preserving decoding; never repairs or synthesizes resources.
const resources = @import("../docinfo/resources.zig");

pub const Diagnostics = struct {
    absent_carets: usize,
    unresolved_font_types: usize,
    unresolved_style_characters: usize,
    unresolved_character_tails: usize,
    absent_fill_additionals: usize,
    resource_count_mismatch: bool,
};
pub const Inspected = struct { report: resources.Report, diagnostics: Diagnostics };

test "observed DocInfo negative declarations cannot hide behind an earlier positive count mismatch" {
    const std = @import("std");
    var bytes = @as([120]u8, @splat(0));
    std.mem.writeInt(u32, bytes[0..4], 17 | (72 << 20), .little);
    std.mem.writeInt(i32, bytes[36..40], 2, .little); // border count2, actual1
    std.mem.writeInt(u32, bytes[76..80], 20 | (1 << 10) | (40 << 20), .little);
    const version: @import("../version.zig").Version = .{ .raw = 0x05000302 };
    try std.testing.expect((try inspect(&bytes, version)).diagnostics.resource_count_mismatch);
    for (0..18) |slot| {
        const offset = 4 + slot * 4;
        const previous = std.mem.readInt(i32, bytes[offset..][0..4], .little);
        std.mem.writeInt(i32, bytes[offset..][0..4], -1, .little);
        try std.testing.expectError(error.NegativeMappingCount, inspect(&bytes, version));
        std.mem.writeInt(i32, bytes[offset..][0..4], previous, .little);
    }
}

pub fn inspect(bytes: []const u8, version: @import("../version.zig").Version) !Inspected {
    const report = try resources.inspectWithDecodingPolicy(bytes, version, .{}, .{
        .caret = .observed_absent,
        .font_type = .observed_short_hft,
        .style_character = .observed_absent,
        .character_tail = .observed_unresolved_four_bytes,
        .fill_additional = .observed_absent,
    });
    // Count mismatches may be retained, but cannot mask a later invalid count.
    const Field = @import("../docinfo/id_mappings.zig").Field;
    inline for (@import("../../reflection.zig").fields(Field)) |field| {
        const id: Field = @fromBackingInt(@intCast(field.value));
        if (report.mappings.get(id)) |count| if (count < 0) return error.NegativeMappingCount;
    }
    try report.validate();
    var mismatch = false;
    report.validateKnownCounts() catch |err| switch (err) {
        error.ResourceCountMismatch => mismatch = true,
        else => return err,
    };
    return .{ .report = report, .diagnostics = .{
        .absent_carets = report.absent_caret_count,
        .unresolved_font_types = report.unresolved_font_type_count,
        .unresolved_style_characters = report.unresolved_style_character_count,
        .unresolved_character_tails = report.unresolved_character_tail_count,
        .absent_fill_additionals = report.absent_fill_additional_count,
        .resource_count_mismatch = mismatch,
    } };
}
