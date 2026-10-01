//! Structural local field spans. This does not grant an editing policy.
const std = @import("std");
const controls = @import("control_rules.zig");
const Text = @import("text.zig").Text;
pub const Span = struct { start_unit: u32, end_unit: u32 };
const Edit = struct { start_unit: u32, end_unit: u32 };

/// Ordinal counts starts of the requested type. Validate the complete paragraph
/// even after finding the requested field; nested labels remain caller policy.
pub fn find(bytes: []const u8, field_id: u32, ordinal: usize) !Span {
    return (try scan(bytes, field_id, ordinal, false, null)) orelse error.SourceBindingMismatch;
}

pub fn validateEditable(bytes: []const u8) !void {
    _ = try scan(bytes, 0, 0, true, null);
}

pub fn protectFormulaLabels(bytes: []const u8, start: u32, end: u32) !void {
    _ = try scan(bytes, 0, 0, true, .{ .start_unit = start, .end_unit = end });
}

fn scan(bytes: []const u8, field_id: u32, ordinal: usize, editable: bool, edit: ?Edit) !?Span {
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
            if (editable and id != controls.id("%hlk") and id != controls.id("%fmu")) return error.UnsupportedSectionControl;
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
            if (edit) |e| {
                if (opened.id == controls.id("%fmu")) {
                    const overlaps = if (e.start_unit == e.end_unit)
                        e.start_unit >= opened.start and e.start_unit <= token.start_unit
                    else
                        e.start_unit < token.start_unit and e.end_unit > opened.start;
                    if (overlaps) return error.ReadOnlyFormulaResult;
                }
            }
        }
    }
    if (depth != 0) return error.UnsupportedCrossParagraphField;
    return found;
}

test "formula label protection validates both edges and exact end identity" {
    var bytes = [_]u8{0} ** 38;
    std.mem.writeInt(u16, bytes[0..2], 'a', .little);
    std.mem.writeInt(u16, bytes[2..4], 3, .little);
    std.mem.writeInt(u32, bytes[4..8], controls.id("%fmu"), .little);
    std.mem.writeInt(u16, bytes[16..18], 3, .little);
    std.mem.writeInt(u16, bytes[18..20], '9', .little);
    std.mem.writeInt(u16, bytes[20..22], 4, .little);
    std.mem.writeInt(u32, bytes[22..26], (controls.id("%fmu") & 0x00ffffff) | 0x08000000, .little);
    std.mem.writeInt(u16, bytes[34..36], 4, .little);
    std.mem.writeInt(u16, bytes[36..38], 13, .little);
    try validateEditable(&bytes);
    try protectFormulaLabels(&bytes, 0, 0);
    try protectFormulaLabels(&bytes, 18, 18);
    try std.testing.expectError(error.ReadOnlyFormulaResult, protectFormulaLabels(&bytes, 9, 9));
    try std.testing.expectError(error.ReadOnlyFormulaResult, protectFormulaLabels(&bytes, 10, 10));
    try std.testing.expectError(error.ReadOnlyFormulaResult, protectFormulaLabels(&bytes, 9, 10));
    std.mem.writeInt(u32, bytes[22..26], (controls.id("%fmu") & 0x00ffffff) | 0x09000000, .little);
    try std.testing.expectError(error.FieldMarkerMismatch, validateEditable(&bytes));
    try std.testing.expectError(error.FieldMarkerMismatch, protectFormulaLabels(&bytes, 0, 0));
}
