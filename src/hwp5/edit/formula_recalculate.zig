//! Recalculate observed plain-cell SUM/AVG fields in a transaction-owned draft.
const std = @import("std");
const model = @import("../../model/document.zig");
const body = @import("../body/reader.zig");
pub const Limits = @import("../body/formula_values.zig").Limits;

/// The caller discards the entire draft on failure. Formula dependencies and
/// unsupported numeric grammars are errors, never stale-cache inputs.
pub fn applyDraft(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: *model.Section, char_count: usize, limits: Limits) !usize {
    var tree = try @import("../body/tree.zig").Tree.parse(a, source, version, .{});
    defer tree.deinit(a);
    var groups = try @import("../body/list_groups.zig").Groups.build(a, tree);
    defer groups.deinit(a);
    var remaining = limits;
    var processed: usize = 0;
    for (tree.nodes, 0..) |node, source_node| {
        if (node.record.framing.tag != @intFromEnum(body.Tag.control_header)) continue;
        const header = try body.ControlHeader.parse(node.record.framing.payload);
        if (header.id != @import("../body/control_rules.zig").id("%fmu")) continue;
        const parent = node.parent orelse return error.SourceBindingMismatch;
        var paragraph: ?*model.Paragraph = null;
        for (section.paragraphs) |*p| {
            const paragraph_node = p.source_node orelse continue;
            if (paragraph_node != parent) continue;
            if (paragraph != null) return error.SourceBindingMismatch;
            paragraph = p;
        }
        const p = paragraph orelse return error.SourceBindingMismatch;
        const parts = try @import("../body/paragraph_children.zig").collect(tree, parent);
        try parts.metadata.validate(tree.nodes[parent].record.value.header, char_count);
        const properties = try @import("../body/field_start.zig").Properties.parse(header.properties);
        const view = try properties.formulaView();
        const owner = try @import("../body/formula_cell.zig").locate(tree, groups, parent, .observed8);
        const reader: @import("formula_value_reader.zig").Reader = .{ .allocator = a, .section = section.* };
        const evaluated = try @import("../body/formula_values.zig").evaluateWith(tree, groups, owner, try view.range(), .observed8, remaining, reader);
        remaining.cells -= evaluated.cells;
        const cost = std.math.mul(usize, groups.items.len, evaluated.cells) catch return error.LimitExceeded;
        if (cost > remaining.inspections) return error.LimitExceeded;
        remaining.inspections -= cost;
        // Preserve only a validated observed grouping convention; no other=8
        // flag inference. Cached numbers are NOT arithmetic dependency inputs.
        const grouping: model.NumberGrouping = if (std.mem.indexOf(u8, view.cached_display, &.{ ',', 0 }) != null) .thousands else .none;
        const cached_number = try @import("../body/formula_number.zig").parse(view.cached_display);
        const original = try @import("formula_command_writer.zig").prepare(a, properties, cached_number, grouping);
        defer a.free(original);
        if (!std.mem.eql(u8, original, header.properties)) return error.UnsupportedFormulaFormat;
        const result: model.FormulaResult = .{ .source_node = @intCast(source_node), .value = evaluated.value, .grouping = grouping, .modified = true };
        var ordinal: usize = 0;
        var child = parent + 1;
        while (child < source_node) {
            const earlier = tree.nodes[child];
            if (earlier.record.framing.tag == @intFromEnum(body.Tag.control_header) and (try body.ControlHeader.parse(earlier.record.framing.payload)).id == header.id) ordinal += 1;
            child = earlier.subtree_end;
        }
        if (p.formula_results == null) {
            const current_command = try @import("formula_command_writer.zig").prepare(a, properties, result.value, grouping);
            defer a.free(current_command);
            const before = try @import("plain_text_content.zig").textBytes(a, p.*);
            defer a.free(before);
            var display = try @import("formula_display_writer.zig").prepare(a, before, properties, result, ordinal);
            defer display.deinit(a);
            if (std.mem.eql(u8, current_command, header.properties) and std.mem.eql(u8, display.bytes, before)) {
                processed += 1;
                continue;
            }
        }
        try @import("formula_display_apply.zig").applyDraft(a, p, properties, result, ordinal, parts.metadata.ranges, char_count);
        if (p.range_tags == null) p.range_tags = try @import("text_ranges.zig").prepare(a, null, parts.metadata.ranges, (try partsText(tree, parts)), 0, 0, 0);
        const old = p.formula_results orelse &.{};
        var index: ?usize = null;
        for (old, 0..) |previous, i| if (previous.source_node == source_node) {
            if (index != null) return error.SourceBindingMismatch;
            index = i;
        };
        const results = try a.alloc(model.FormulaResult, old.len + @as(usize, if (index == null) 1 else 0));
        @memcpy(results[0..old.len], old);
        results[index orelse old.len] = result;
        if (p.formula_results) |owned| a.free(owned);
        p.formula_results = results;
        processed += 1;
    }
    return processed;
}

fn partsText(tree: @import("../body/tree.zig").Tree, parts: @import("../body/paragraph_children.zig").Children) ![]const u8 {
    return tree.nodes[parts.text_node orelse return error.UnsupportedMissingText].record.value.text.raw;
}
