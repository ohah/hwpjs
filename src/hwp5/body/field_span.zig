//! Structural local field spans. This does not grant an editing policy.
const std = @import("std");
const controls = @import("control_rules.zig");
const Text = @import("text.zig").Text;
pub const Span = struct { start_unit: u32, end_unit: u32 };

/// Ordinal counts starts of the requested type. Validate the complete paragraph
/// even after finding the requested field; nested labels remain caller policy.
pub fn find(bytes: []const u8, field_id: u32, ordinal: usize) !Span {
    const Open = struct { id: u32, start: u32, selected: bool };
    var stack: [32]Open = undefined;
    var depth: usize = 0;
    var matched: usize = 0;
    var found: ?Span = null;
    var tokens = (try Text.parse(bytes)).tokens();
    while (try tokens.next()) |token| {
        if (token.value != .control) continue;
        const c = token.value.control;
        if (c.code == 3) {
            const id = std.mem.readInt(u32, c.data[0..4], .little);
            if (controls.expectedCode(id) != 3) return error.UnsupportedSectionControl;
            if (depth == stack.len) return error.LimitExceeded;
            stack[depth] = .{ .id = id, .start = @intCast(token.start_unit + token.raw.len / 2), .selected = id == field_id and matched == ordinal };
            depth += 1;
            if (id == field_id) matched += 1;
        } else if (c.code == 4) {
            if (depth == 0) return error.UnsupportedCrossParagraphField;
            depth -= 1;
            const opened = stack[depth];
            const id = std.mem.readInt(u32, c.data[0..4], .little);
            // Actual chart formula ends use 0x08 instead of '%'. This observed
            // variant is not an arbitrary high-byte wildcard for other fields.
            const formula_variant = opened.id == controls.id("%fmu") and id == ((opened.id & 0x00ffffff) | 0x08000000);
            if (id != opened.id and id != (opened.id & 0x00ffffff) and !formula_variant) return error.FieldMarkerMismatch;
            if (opened.selected) found = .{ .start_unit = opened.start, .end_unit = @intCast(token.start_unit) };
        }
    }
    if (depth != 0) return error.UnsupportedCrossParagraphField;
    return found orelse error.SourceBindingMismatch;
}
