//! Generated continuations never duplicate source section/page/column breaks.
pub fn effective(generated: bool, source_flags: u8) u8 {
    return if (generated) 0 else source_flags;
}

pub fn current(generated: bool, source_flags: u8, intent: ?@import("../../model/paragraph_break.zig").Kind) !u8 {
    const kind = intent orelse return effective(generated, source_flags);
    if (!generated) return error.SourceBindingMismatch;
    return switch (kind) {
        .page => 0x04,
        .column => 0x08,
    };
}

test "explicit flow break encoding preserves original flags and rejects forged source intents" {
    const std = @import("std");
    for ([_]u8{ 0, 1, 2, 4, 8, 0xff }) |source| {
        try std.testing.expectEqual(source, try current(false, source, null));
        try std.testing.expectEqual(@as(u8, 0), try current(true, source, null));
        try std.testing.expectEqual(@as(u8, 4), try current(true, source, .page));
        try std.testing.expectEqual(@as(u8, 8), try current(true, source, .column));
        try std.testing.expectError(error.SourceBindingMismatch, current(false, source, .page));
        try std.testing.expectError(error.SourceBindingMismatch, current(false, source, .column));
    }
}
