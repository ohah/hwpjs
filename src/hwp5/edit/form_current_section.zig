//! Derive current form payloads from immutable records and owned text intents.
const std = @import("std");
const Value = @import("../../model/form_values.zig").Value;
pub fn writeAll(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, values: []const Value, limit: usize) ![]u8 {
    if (source.len > limit) return error.LimitExceeded;
    var tree = try @import("source_tree.zig").parse(a, source, version, .{});
    defer tree.deinit(a);
    var forms = try @import("../body/form_links.zig").collectObservedUnits(a, tree, .{});
    defer forms.deinit(a);
    var by_node: std.AutoHashMapUnmanaged(usize, Value) = .empty;
    defer by_node.deinit(a);
    var kinds: std.AutoHashMapUnmanaged(usize, @import("../body/form_object.zig").Kind) = .empty;
    defer kinds.deinit(a);
    for (forms.forms.forms) |form| try kinds.put(a, form.object_node, form.envelope.kind());
    for (values) |value| {
        const kind = kinds.get(value.source_node) orelse return error.SourceBindingMismatch;
        switch (value.field) {
            .text => if (kind != .edit and kind != .combo_box) return error.UnsupportedFormTextKind,
            .value => if (kind != .check_box and kind != .radio_button) return error.UnsupportedFormChoiceKind,
        }
        if (value.text.len % 2 != 0) return error.SourceBindingMismatch;
        const entry = try by_node.getOrPut(a, value.source_node);
        if (entry.found_existing) return error.SourceBindingMismatch;
        entry.value_ptr.* = value;
    }
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    for (tree.nodes, 0..) |node, index| {
        const record = node.record.framing;
        if (by_node.get(index)) |value| {
            const field: @import("../body/form_schema.zig").Field = switch (value.field) {
                .text => .text,
                .value => .value,
            };
            const payload = try @import("form_value_payload.zig").prepare(a, record.payload, field, value.text, limit);
            defer a.free(payload);
            if (payload.len == record.payload.len) {
                try append(a, &out, record.raw[0 .. record.raw.len - record.payload.len], limit);
                try append(a, &out, payload, limit);
            } else try @import("../record_writer.zig").append(a, &out, record.tag, record.level, payload, limit);
        } else try append(a, &out, record.raw, limit);
    }
    return out.toOwnedSlice(a);
}
fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), bytes: []const u8, limit: usize) !void {
    if (bytes.len > limit -| out.items.len) return error.LimitExceeded;
    try out.appendSlice(a, bytes);
}
