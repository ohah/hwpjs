//! Derived CTRL_HEADER output from immutable properties and an owned result.
const std = @import("std");
const model = @import("../../model/document.zig");
const record = @import("../record.zig");
const body = @import("../body/reader.zig");

pub fn prepare(a: std.mem.Allocator, original: record.Record, source_node: usize, result: model.FormulaResult, limit: usize) ![]u8 {
    if (result.source_node != source_node or original.tag != @intFromEnum(body.Tag.control_header)) return error.SourceBindingMismatch;
    const header = try body.ControlHeader.parse(original.payload);
    if (header.id != @import("../body/control_rules.zig").id("%fmu")) return error.SourceBindingMismatch;
    var properties = try @import("../body/field_start.zig").Properties.parse(header.properties);
    if (result.modified) properties.attributes |= @import("../body/field_start.zig").modified_mask;
    const derived = try @import("formula_command_writer.zig").prepare(a, properties, result.value, result.grouping);
    defer a.free(derived);
    if (std.mem.eql(u8, header.properties, derived)) {
        if (original.raw.len > limit) return error.LimitExceeded;
        return a.dupe(u8, original.raw);
    }
    var payload: std.ArrayList(u8) = .empty;
    defer payload.deinit(a);
    try payload.appendSlice(a, original.payload[0..4]);
    try payload.appendSlice(a, derived);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    if (payload.items.len == original.payload.len) {
        if (original.raw.len > limit) return error.LimitExceeded;
        try out.appendSlice(a, original.raw[0 .. original.raw.len - original.payload.len]);
        try out.appendSlice(a, payload.items);
    } else try @import("../record_writer.zig").append(a, &out, original.tag, original.level, payload.items, limit);
    return out.toOwnedSlice(a);
}
