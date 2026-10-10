//! Owned current definitions/results. Reading never edits or recomputes a model.
const std = @import("std");
const model = @import("../../model/document.zig");
pub const Row = struct { source_node: u32, paragraph: u32, formula: []u8, last_result: []u8, derived: bool };

pub fn deinit(a: std.mem.Allocator, rows: []Row) void {
    for (rows) |row| {
        a.free(row.formula);
        a.free(row.last_result);
    }
    a.free(rows);
}

fn utf8(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    if (bytes.len % 2 != 0) return error.UnexpectedEnd;
    const units = try a.alloc(u16, bytes.len / 2);
    defer a.free(units);
    for (units, 0..) |*unit, index| unit.* = std.mem.nativeToLittle(u16, std.mem.readInt(u16, bytes[index * 2 ..][0..2], .little));
    return std.unicode.utf16LeToUtf8Alloc(a, units);
}

pub fn read(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: model.Section) ![]Row {
    const bindings = try @import("field_bindings.zig").collect(a, source, version, section);
    defer a.free(bindings);
    var out: std.ArrayList(Row) = .empty;
    errdefer {
        for (out.items) |row| {
            a.free(row.formula);
            a.free(row.last_result);
        }
        out.deinit(a);
    }
    var remaining: usize = 32 * 1024 * 1024;
    for (bindings) |binding| {
        if (binding.span.field_id != @import("../body/control_rules.zig").id("%fmu")) continue;
        const view = try binding.properties.formulaView();
        const paragraph = section.paragraphs[binding.span.begin.paragraph];
        const current = try @import("../../model/formula_result_values.zig").find(paragraph.formula_results orelse &.{}, binding.source_node);
        const expression = if (current) |value| value.expression orelse view.expression else view.expression;
        const text = try utf8(a, expression);
        defer a.free(text);
        const formula = try a.alloc(u8, text.len + 1);
        errdefer a.free(formula);
        formula[0] = '=';
        @memcpy(formula[1..], text);
        const result = if (current) |value|
            try (try @import("../body/formula_format.zig").Format.parse(view.format)).render(a, value.value, value.grouping)
        else
            try utf8(a, view.cached_display);
        errdefer a.free(result);
        const cost = std.math.add(usize, formula.len, result.len) catch return error.LimitExceeded;
        if (cost > remaining) return error.LimitExceeded;
        remaining -= cost;
        try out.append(a, .{ .source_node = binding.source_node, .paragraph = @intCast(binding.span.begin.paragraph), .formula = formula, .last_result = result, .derived = current != null });
    }
    return out.toOwnedSlice(a);
}
