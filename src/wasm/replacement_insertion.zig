//! Select inserted text from an existing paragraph replacement plan.
const Format = @import("../model/document.zig").Format;
const plans = @import("paragraph_replace_commands.zig");
const text = @import("text_transaction_commands.zig");

pub fn read(comptime format: Format, command: plans.Command(format)) ?text.Input {
    const input: text.Input = if (format == .hwp5) switch (command) {
        .splice_text => |splice| .{ .section = splice.section, .paragraph = splice.paragraph, .start = splice.start_unit, .end = splice.start_unit, .text = splice.utf8 },
        else => return null,
    } else blk: {
        if (command.kind != .plain) return null;
        break :blk .{ .section = command.section, .paragraph = command.paragraph, .start = command.start, .end = command.start, .text = command.inserted };
    };
    return if (input.text.len == 0) null else input;
}
