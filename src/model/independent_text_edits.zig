//! Ordered edits on one immutable UTF-16 coordinate axis. Format adapters still
//! own source identity, scalar boundaries, controls, policy and actual mutation.
const std = @import("std");

pub const Edit = struct {
    start: u32,
    end: u32,
    text: []const u8,
    expected: ?[]const u8 = null,
};
pub const Limits = struct {
    max_edits: usize = 4096,
    max_inserted_bytes: usize = 4 * 1024 * 1024,
    max_output_units: u32 = 4 * 1024 * 1024,
};
pub const Totals = struct {
    deleted_units: u32 = 0,
    inserted_units: u32 = 0,
    inserted_bytes: usize = 0,
    output_units: u32,
};

pub fn utf16Units(text: []const u8) !u32 {
    var it = (try std.unicode.Utf8View.init(text)).iterator();
    var units: u32 = 0;
    while (it.nextCodepoint()) |point|
        units = std.math.add(u32, units, if (point > 0xffff) 2 else 1) catch return error.LimitExceeded;
    return units;
}

/// Linear in edit count plus submitted replacement/expected text. No sorting,
/// copying, source reads or authority is hidden in this structural validator.
/// Output work can exceed input length and is explicitly budgeted here.
pub fn validate(edits: []const Edit, before_units: u32, limits: Limits) !Totals {
    if (edits.len > limits.max_edits) return error.LimitExceeded;
    var result: Totals = .{ .output_units = before_units };
    var previous: ?Edit = null;
    for (edits) |edit| {
        if (edit.start > edit.end or edit.end > before_units) return error.InvalidTextPosition;
        if (previous) |old| {
            if (edit.start < old.end or (edit.start == old.start and old.start == old.end))
                return error.OverlappingTextEdits;
        }
        if (edit.text.len > limits.max_inserted_bytes -| result.inserted_bytes) return error.LimitExceeded;
        const inserted = try utf16Units(edit.text);
        const deleted = edit.end - edit.start;
        if (edit.expected) |expected| {
            if (try utf16Units(expected) != deleted) return error.ExpectedTextLengthMismatch;
        }
        result.deleted_units = std.math.add(u32, result.deleted_units, deleted) catch return error.LimitExceeded;
        result.inserted_units = std.math.add(u32, result.inserted_units, inserted) catch return error.LimitExceeded;
        result.inserted_bytes += edit.text.len;
        previous = edit;
    }
    // Apply the total deletion before insertion. Intermediate prefix lengths
    // are irrelevant; all coordinates address the original input.
    result.output_units = std.math.add(u32, before_units - result.deleted_units, result.inserted_units) catch return error.LimitExceeded;
    if (result.output_units > limits.max_output_units) return error.LimitExceeded;
    return result;
}

test "independent text edits preserve empty deletion, ordered boundaries and output budgets" {
    const edits = [_]Edit{
        .{ .start = 1, .end = 3, .text = "", .expected = "😀" },
        .{ .start = 3, .end = 3, .text = "한" },
        .{ .start = 6, .end = 7, .text = "XY", .expected = "Z" },
    };
    const value = try validate(&edits, 8, .{});
    try std.testing.expectEqual(@as(u32, 3), value.deleted_units);
    try std.testing.expectEqual(@as(u32, 3), value.inserted_units);
    try std.testing.expectEqual(@as(u32, 8), value.output_units);
    try std.testing.expectEqual(@as(usize, 5), value.inserted_bytes);
    try std.testing.expectError(error.LimitExceeded, validate(&edits, 8, .{ .max_edits = 2 }));
    try std.testing.expectError(error.LimitExceeded, validate(&edits, 8, .{ .max_inserted_bytes = 4 }));
    try std.testing.expectError(error.LimitExceeded, validate(&edits, 8, .{ .max_output_units = 7 }));
    try std.testing.expectEqual(@as(u32, 8), (try validate(&.{}, 8, .{})).output_units);
}

test "independent text edits reject invalid shape without inventing text authority" {
    try std.testing.expectError(error.OverlappingTextEdits, validate(&.{
        .{ .start = 2, .end = 4, .text = "x" },
        .{ .start = 3, .end = 5, .text = "y" },
    }, 10, .{}));
    try std.testing.expectError(error.OverlappingTextEdits, validate(&.{
        .{ .start = 2, .end = 2, .text = "x" },
        .{ .start = 2, .end = 2, .text = "y" },
    }, 10, .{}));
    try std.testing.expectError(error.InvalidTextPosition, validate(&.{.{ .start = 4, .end = 3, .text = "x" }}, 10, .{}));
    try std.testing.expectError(error.InvalidTextPosition, validate(&.{.{ .start = 0, .end = 11, .text = "x" }}, 10, .{}));
    try std.testing.expectError(error.InvalidUtf8, validate(&.{.{ .start = 0, .end = 0, .text = "\xff" }}, 10, .{}));
    try std.testing.expectError(error.ExpectedTextLengthMismatch, validate(&.{.{ .start = 0, .end = 1, .text = "", .expected = "😀" }}, 10, .{}));
    // Source-specific controls are intentionally not classified here.
    try std.testing.expectEqual(@as(u32, 2), try utf16Units("\r\n"));
}
