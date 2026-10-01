//! Transient display derived from a numeric result, never a mutable label cache.
const std = @import("std");
const model = @import("../../model/document.zig");
const field = @import("../body/field_start.zig");
pub const Prepared = struct {
    bytes: []u8,
    start_unit: u32,
    end_unit: u32,
    added_units: u32,

    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        a.free(self.bytes);
        self.* = undefined;
    }
};

pub fn prepare(a: std.mem.Allocator, before: []const u8, properties: field.Properties, result: model.FormulaResult, ordinal: usize) !Prepared {
    const span = try @import("../body/field_span.zig").find(before, @import("../body/control_rules.zig").id("%fmu"), ordinal);
    const start = @as(usize, span.start_unit) * 2;
    const end = @as(usize, span.end_unit) * 2;
    var label = (try @import("../body/text.zig").Text.parse(before[start..end])).tokens();
    while (try label.next()) |token| if (token.value != .text) return error.UnsupportedFormulaLabel;
    const view = try properties.formulaView();
    const format = try @import("../body/formula_format.zig").Format.parse(view.format);
    const rendered = try format.render(a, result.value, result.grouping);
    defer a.free(rendered);
    const added = std.math.mul(usize, rendered.len, 2) catch return error.LimitExceeded;
    const len = std.math.add(usize, before.len - (end - start), added) catch return error.LimitExceeded;
    if (len > 8 * 1024 * 1024) return error.LimitExceeded;
    const output = try a.alloc(u8, len);
    @memcpy(output[0..start], before[0..start]);
    for (rendered, 0..) |c, i| std.mem.writeInt(u16, output[start + i * 2 ..][0..2], c, .little);
    @memcpy(output[start + added ..], before[end..]);
    return .{ .bytes = output, .start_unit = span.start_unit, .end_unit = span.end_unit, .added_units = @intCast(rendered.len) };
}
