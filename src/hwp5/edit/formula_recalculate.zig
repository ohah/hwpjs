//! Recalculate observed plain-cell SUM/AVG fields in a transaction-owned draft.
const std = @import("std");
const model = @import("../../model/document.zig");
const body = @import("../body/reader.zig");
pub const Limits = @import("../body/formula_values.zig").Limits;

/// The caller discards the entire draft on failure. Formula dependencies and
/// unsupported numeric grammars are errors, never stale-cache inputs.
pub fn applyDraft(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: *model.Section, char_count: usize, limits: Limits) !usize {
    return applySelected(a, source, version, section, char_count, limits, null);
}

pub fn applyDraftForParagraph(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: *model.Section, char_count: usize, limits: Limits, paragraph: usize) !usize {
    if (paragraph >= section.paragraphs.len) return error.InvalidParagraph;
    return applySelected(a, source, version, section, char_count, limits, try section.paragraphs[paragraph].originalNode());
}

fn applySelected(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: *model.Section, char_count: usize, limits: Limits, edited_node: ?usize) !usize {
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
        if (edited_node) |edited| {
            if (!(try @import("formula_dependency_scope.zig").affected(tree, groups, owner, view.expression, edited))) continue;
        }
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

test "known table local formula scope preserves outside edit but never skips affected PRODUCT dependencies" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpctl_ParameterSetID_Item_v1.2.hwp", a, .limited(32_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.openReadOnly(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var doc = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
    defer doc.deinit(a);
    const bindings = try @import("field_bindings.zig").collect(a, bytes, source.header.version(), doc.sections[0]);
    defer a.free(bindings);
    const formula = for (bindings) |binding| {
        if (binding.span.field_id == @import("../body/control_rules.zig").id("%fmu")) break binding;
    } else return error.TestExpectedEqual;
    try std.testing.expectEqual(@as(usize, 0), try applyDraftForParagraph(a, bytes, source.header.version(), &doc.sections[0], 65536, .{}, 0));
    var tree = try @import("../body/tree.zig").Tree.parse(a, bytes, source.header.version(), .{});
    defer tree.deinit(a);
    var groups = try @import("../body/list_groups.zig").Groups.build(a, tree);
    defer groups.deinit(a);
    const owner = try @import("../body/formula_cell.zig").locate(tree, groups, try doc.sections[0].paragraphs[formula.span.begin.paragraph].originalNode(), .observed8);
    var dependency: ?usize = null;
    var unrelated: ?usize = null;
    for (doc.sections[0].paragraphs, 0..) |paragraph, index| {
        const site = @import("../body/formula_cell.zig").locate(tree, groups, try paragraph.originalNode(), .observed8) catch continue;
        if (site.control_node != owner.control_node) continue;
        if (site.origin.column == 0 and site.origin.row == 0) dependency = index;
        if (site.origin.column == 1 and site.origin.row == 0) unrelated = index;
    }
    try std.testing.expectEqual(@as(usize, 0), try applyDraftForParagraph(a, bytes, source.header.version(), &doc.sections[0], 65536, .{}, unrelated orelse return error.TestExpectedEqual));
    try std.testing.expectError(error.InvalidFormulaNumber, applyDraftForParagraph(a, bytes, source.header.version(), &doc.sections[0], 65536, .{}, dependency orelse return error.TestExpectedEqual));
    const saved = try @import("text_section_writer.zig").write(a, bytes, doc.sections[0], source.header.version(), 32 * 1024 * 1024);
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
    const unknown = [_]u8{ 'X', 0, '(', 0, ')', 0 };
    const scope = @import("formula_dependency_scope.zig");
    try std.testing.expect(try scope.affected(tree, groups, owner, &unknown, 0));
    const expression = (try formula.properties.formulaView()).expression;
    try std.testing.expectError(error.SourceBindingMismatch, scope.affected(tree, groups, owner, expression, tree.nodes.len));
    const dependency_node = try doc.sections[0].paragraphs[dependency.?].originalNode();
    const dependency_group = for (groups.items) |group| {
        if (group.parent_node == owner.control_node and dependency_node >= group.begin and dependency_node < group.end) break group;
    } else return error.TestExpectedEqual;
    const duplicated = try a.alloc(@import("../body/list_groups.zig").Group, groups.items.len + 1);
    defer a.free(duplicated);
    @memcpy(duplicated[0..groups.items.len], groups.items);
    duplicated[groups.items.len] = dependency_group;
    try std.testing.expectError(error.AmbiguousFormulaCell, scope.affected(tree, .{ .items = duplicated }, owner, expression, dependency_node));
    var empty: [0]@import("../body/list_groups.zig").Group = .{};
    try std.testing.expect(try scope.affected(tree, .{ .items = &empty }, owner, expression, dependency_node));
    var forged_owner = owner;
    forged_owner.table_node = tree.nodes.len;
    try std.testing.expectError(error.SourceBindingMismatch, scope.affected(tree, groups, forged_owner, expression, dependency_node));
}

fn partsText(tree: @import("../body/tree.zig").Tree, parts: @import("../body/paragraph_children.zig").Children) ![]const u8 {
    return tree.nodes[parts.text_node orelse return error.UnsupportedMissingText].record.value.text.raw;
}
