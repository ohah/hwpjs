const std = @import("std");
const Source = @import("../text_source.zig").Source;
const records = @import("../record.zig");
const body = @import("reader.zig");
const fields = @import("field_start.zig");

fn expectAscii(actual: []const u8, expected: []const u8) !void {
    try std.testing.expectEqual(expected.len * 2, actual.len);
    for (expected, 0..) |unit, i| try std.testing.expectEqual(@as(u16, unit), std.mem.readInt(u16, actual[i * 2 ..][0..2], .little));
}

test "formula command actual chart fields preserve expression format cache and common envelope" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwp", a, .limited(2_000_000));
    defer a.free(bytes);
    var source = try Source.open(a, bytes);
    defer source.deinit();
    const section = try source.decodeSection(a, 0);
    defer a.free(section);
    var tree = try @import("tree.zig").Tree.parse(a, section, source.header.version(), .{});
    defer tree.deinit(a);
    var groups = try @import("list_groups.zig").Groups.build(a, tree);
    defer groups.deinit(a);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{section});
    defer document.deinit(a);
    const formula_cell = @import("formula_cell.zig");
    try std.testing.expectError(error.FormulaOutsideTable, formula_cell.locate(tree, groups, 0, .observed8));
    try std.testing.expectError(error.InvalidParagraph, formula_cell.locate(tree, groups, tree.nodes.len, .observed8));
    const positions = [_]usize{ 23, 29, 35, 64, 70, 76, 129, 130, 131, 132, 156, 162, 168 };
    const cached = [_][]const u8{ "67.5", "73.9", "93.4", "659,100", "731,000", "523,500", "245", "136", "152", "464", "266.00", "287.75", "224.00" };
    var iterator = records.Iterator.init(section, .{});
    var count: usize = 0;
    var paragraph: usize = 0;
    var seen_paragraph = false;
    var node: usize = 0;
    while (try iterator.next()) |record| : (node += 1) {
        if (record.tag == @intFromEnum(body.Tag.paragraph_header)) {
            if (seen_paragraph) paragraph += 1;
            seen_paragraph = true;
        }
        if (record.tag != @intFromEnum(body.Tag.control_header)) continue;
        const header = try body.ControlHeader.parse(record.payload);
        if (header.id != @import("control_rules.zig").id("%fmu")) continue;
        try std.testing.expect(count < cached.len);
        try std.testing.expectEqual(positions[count], paragraph);
        const properties = try fields.Properties.parse(header.properties);
        try std.testing.expectEqual(@as(u32, 0), properties.attributes);
        try std.testing.expectEqual(@as(u8, 8), properties.other);
        try std.testing.expectEqual(@as(usize, 4), properties.extra.len);
        const command = try properties.formulaView();
        try expectAscii(command.expression, if (count < 6) "SUM(B?:E?)" else if (count < 10) "SUM(?2:?4)" else "AVG(B?:E?)");
        try expectAscii(command.format, if (count < 10) "%g" else "%.2f");
        try expectAscii(command.cached_display, cached[count]);
        const range = try command.range();
        const expected_function: @import("formula_range.zig").Function = if (count < 10) .sum else .average;
        try std.testing.expectEqual(expected_function, range.function);
        const owner = try formula_cell.locate(tree, groups, tree.nodes[node].parent.?, .observed8);
        if (count == 0) {
            const original = tree.nodes[owner.list_node].record.value;
            const damaged = try a.dupe(u8, tree.nodes[owner.list_node].record.framing.payload);
            defer a.free(damaged);
            std.mem.writeInt(u16, damaged[12..14], 0, .little);
            tree.nodes[owner.list_node].record.value = .{ .list_header = try body.ListHeader.parse(damaged) };
            try std.testing.expectError(error.InvalidCellSpan, formula_cell.locate(tree, groups, tree.nodes[node].parent.?, .observed8));
            tree.nodes[owner.list_node].record.value = original;
            const table_original = tree.nodes[owner.table_node].record.value;
            tree.nodes[owner.table_node].record.value = .unknown;
            try std.testing.expectError(error.MissingTableRecord, formula_cell.locate(tree, groups, tree.nodes[node].parent.?, .observed8));
            tree.nodes[owner.table_node].record.value = table_original;
        }
        try std.testing.expectEqual(@as(u32, if (count >= 6 and count < 10) @intCast(count - 5) else 5), owner.origin.column);
        try std.testing.expectEqual(@as(u32, if (count < 6) @intCast(count % 3 + 1) else if (count < 10) 4 else @intCast(count - 9)), owner.origin.row);
        const rectangle = try range.resolve(owner.origin, owner.columns, owner.rows);
        const evaluated = try @import("formula_values.zig").evaluate(tree, groups, owner, range, .observed8, .{});
        const expected_number = try @import("formula_number.zig").parse(command.cached_display);
        try std.testing.expectApproxEqAbs(expected_number, evaluated.value, 0.000001);
        const format = try @import("formula_format.zig").Format.parse(command.format);
        const rendered = try format.render(a, evaluated.value, if (count >= 3 and count < 6) .thousands else .none);
        defer a.free(rendered);
        try expectAscii(command.cached_display, rendered);
        const prepared = try @import("../edit/formula_command_writer.zig").prepare(a, properties, evaluated.value, if (count >= 3 and count < 6) .thousands else .none);
        defer a.free(prepared);
        try std.testing.expectEqualSlices(u8, header.properties, prepared);
        if (count == 0) {
            const Preparation = struct {
                fn run(allocator: std.mem.Allocator, original_properties: fields.Properties, original_bytes: []const u8) !void {
                    const output = @import("../edit/formula_command_writer.zig").prepare(allocator, original_properties, 68.5, .none) catch |err| {
                        const unchanged = try original_properties.withCommand(std.testing.allocator, original_properties.command, original_properties.attributes);
                        defer std.testing.allocator.free(unchanged);
                        try std.testing.expectEqualSlices(u8, original_bytes, unchanged);
                        return err;
                    };
                    defer allocator.free(output);
                    const parsed = try fields.Properties.parse(output);
                    try expectAscii((try parsed.formulaView()).cached_display, "68.5");
                    try std.testing.expectEqual(original_properties.instance_id, parsed.instance_id);
                }
            };
            try std.testing.checkAllAllocationFailures(a, Preparation.run, .{ properties, header.properties });
            try std.testing.expectError(error.InvalidFormulaNumber, @import("../edit/formula_command_writer.zig").prepare(a, properties, std.math.inf(f64), .none));
            try std.testing.expectError(error.InvalidTextSize, properties.withCommand(a, &.{1}, properties.attributes));
            const updated = try @import("../edit/formula_command_writer.zig").prepare(a, properties, 68.5, .none);
            defer a.free(updated);
            const parsed_update = try fields.Properties.parse(updated);
            const updated_view = try parsed_update.formulaView();
            try expectAscii(updated_view.cached_display, "68.5");
            try std.testing.expectEqualSlices(u8, command.expression, updated_view.expression);
            try std.testing.expectEqualSlices(u8, command.format, updated_view.format);
            try std.testing.expectEqual(properties.instance_id, parsed_update.instance_id);
            try std.testing.expectEqual(properties.other, parsed_update.other);
            try std.testing.expectEqualSlices(u8, properties.extra, parsed_update.extra);
            try std.testing.expectEqual(properties.attributes | fields.modified_mask, parsed_update.attributes);
        }
        try std.testing.expectEqual(@as(usize, if (count >= 6 and count < 10) 3 else 4), evaluated.cells);
        const current_reader: @import("../edit/formula_value_reader.zig").Reader = .{ .allocator = a, .section = document.sections[0] };
        const current = try @import("formula_values.zig").evaluateWith(tree, groups, owner, range, .observed8, .{}, current_reader);
        try std.testing.expectApproxEqAbs(expected_number, current.value, 0.000001);
        if (count == 0) {
            const missing_reader: @import("../edit/formula_value_reader.zig").Reader = .{ .allocator = a, .section = .{ .paragraphs = document.sections[0].paragraphs[0..0], .source_record_count = document.sections[0].source_record_count } };
            try std.testing.expectError(error.SourceBindingMismatch, @import("formula_values.zig").evaluateWith(tree, groups, owner, range, .observed8, .{}, missing_reader));
            const numeric = &document.sections[0].paragraphs[19];
            numeric.tokens[0].raw[2] = '2'; // owned model 11.2 -> 12.2
            const changed = try @import("formula_values.zig").evaluateWith(tree, groups, owner, range, .observed8, .{}, current_reader);
            try std.testing.expectApproxEqAbs(@as(f64, 68.5), changed.value, 0.000001);
            const unchanged_source = try @import("formula_values.zig").evaluate(tree, groups, owner, range, .observed8, .{});
            try std.testing.expectApproxEqAbs(@as(f64, 67.5), unchanged_source.value, 0.000001);
            numeric.tokens[0].raw[2] = 'x';
            try std.testing.expectError(error.InvalidFormulaNumber, @import("formula_values.zig").evaluateWith(tree, groups, owner, range, .observed8, .{}, current_reader));
            numeric.tokens[0].raw[2] = '1';
        }
        try std.testing.expectError(error.LimitExceeded, @import("formula_values.zig").evaluate(tree, groups, owner, range, .observed8, .{ .cells = 0 }));
        try std.testing.expectError(error.LimitExceeded, @import("formula_values.zig").evaluate(tree, groups, owner, range, .observed8, .{ .inspections = 0 }));
        if (count >= 6 and count < 10) {
            try std.testing.expectEqual(@as(u32, 1), rectangle.first.row);
            try std.testing.expectEqual(@as(u32, 3), rectangle.last.row);
            try std.testing.expectEqual(owner.origin.column, rectangle.first.column);
        } else {
            try std.testing.expectEqual(@as(u32, 1), rectangle.first.column);
            try std.testing.expectEqual(@as(u32, 4), rectangle.last.column);
            try std.testing.expectEqual(owner.origin.row, rectangle.first.row);
        }
        // Every required common-envelope prefix is rejected, not defaulted.
        for (0..header.properties.len - properties.extra.len) |len| {
            try std.testing.expectError(error.UnexpectedEnd, fields.Properties.parse(header.properties[0..len]));
        }
        count += 1;
    }
    try std.testing.expectEqual(cached.len, count);
}
