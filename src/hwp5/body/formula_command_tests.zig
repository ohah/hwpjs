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
        const displayed_bytes = try @import("../edit/plain_text_content.zig").textBytes(a, document.sections[0].paragraphs[paragraph]);
        defer a.free(displayed_bytes);
        const displayed_span = try @import("field_span.zig").find(displayed_bytes, header.id, 0);
        try expectAscii(displayed_bytes[@as(usize, displayed_span.start_unit) * 2 .. @as(usize, displayed_span.end_unit) * 2], cached[count]);
        const end_byte = @as(usize, displayed_span.end_unit) * 2;
        try std.testing.expectEqual(@as(u8, 8), displayed_bytes[end_byte + 5]);
        if (count == 0) {
            const damaged_text = try a.dupe(u8, displayed_bytes);
            defer a.free(damaged_text);
            damaged_text[end_byte + 5] = 9;
            try std.testing.expectError(error.FieldMarkerMismatch, @import("field_span.zig").find(damaged_text, header.id, 0));
            damaged_text[end_byte + 5] = 8;
            damaged_text[end_byte + 2] = 'x';
            try std.testing.expectError(error.FieldMarkerMismatch, @import("field_span.zig").find(damaged_text, header.id, 0));
            try std.testing.expectError(error.UnsupportedCrossParagraphField, @import("field_span.zig").find(displayed_bytes[0..end_byte], header.id, 0));
            try std.testing.expectError(error.SourceBindingMismatch, @import("field_span.zig").find(displayed_bytes, header.id, 1));
        }
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
        const derived_record = try @import("../edit/formula_record_writer.zig").prepare(a, record, node, .{ .source_node = @intCast(node), .value = evaluated.value, .grouping = if (count >= 3 and count < 6) .thousands else .none }, section.len);
        defer a.free(derived_record);
        try std.testing.expectEqualSlices(u8, record.raw, derived_record);
        var derived_display = try @import("../edit/formula_display_writer.zig").prepare(a, displayed_bytes, properties, .{ .source_node = @intCast(node), .value = evaluated.value, .grouping = if (count >= 3 and count < 6) .thousands else .none }, 0);
        defer derived_display.deinit(a);
        try std.testing.expectEqualSlices(u8, displayed_bytes, derived_display.bytes);
        if (count == 0) {
            const replacement: @import("../../model/document.zig").FormulaResult = .{ .source_node = @intCast(node), .value = 123.45, .grouping = .none };
            const changed_record = try @import("../edit/formula_record_writer.zig").prepare(a, record, node, replacement, section.len);
            defer a.free(changed_record);
            var changed_iterator = records.Iterator.init(changed_record, .{});
            const changed_entry = (try changed_iterator.next()).?;
            try std.testing.expectEqual(record.level, changed_entry.level);
            try std.testing.expectEqual(record.tag, changed_entry.tag);
            try std.testing.expect((try changed_iterator.next()) == null);
            const changed_header = try body.ControlHeader.parse(changed_entry.payload);
            const changed_properties = try fields.Properties.parse(changed_header.properties);
            try expectAscii((try changed_properties.formulaView()).cached_display, "123.45");
            try std.testing.expectEqual(properties.instance_id, changed_properties.instance_id);
            try std.testing.expectEqualSlices(u8, properties.extra, changed_properties.extra);
            try std.testing.expectError(error.SourceBindingMismatch, @import("../edit/formula_record_writer.zig").prepare(a, record, node + 1, replacement, section.len));
            try std.testing.expectError(error.LimitExceeded, @import("../edit/formula_record_writer.zig").prepare(a, record, node, replacement, 0));
            var changed_display = try @import("../edit/formula_display_writer.zig").prepare(a, displayed_bytes, properties, replacement, 0);
            defer changed_display.deinit(a);
            const replacement_start = @as(usize, changed_display.start_unit) * 2;
            const replacement_end = replacement_start + @as(usize, changed_display.added_units) * 2;
            try expectAscii(changed_display.bytes[replacement_start..replacement_end], "123.45");
            try std.testing.expectEqualSlices(u8, displayed_bytes[0..replacement_start], changed_display.bytes[0..replacement_start]);
            try std.testing.expectEqualSlices(u8, displayed_bytes[@as(usize, changed_display.end_unit) * 2 ..], changed_display.bytes[replacement_end..]);
            var changed_paragraph = try @import("../../model/clone.zig").paragraph(a, document.sections[0].paragraphs[paragraph]);
            defer changed_paragraph.deinit(a);
            var range_bytes: [12]u8 = undefined;
            std.mem.writeInt(u32, range_bytes[0..4], changed_display.start_unit, .little);
            std.mem.writeInt(u32, range_bytes[4..8], changed_display.end_unit, .little);
            std.mem.writeInt(u32, range_bytes[8..12], 42, .little);
            const synthetic_ranges = try body.Ranges.parse(&range_bytes);
            try @import("../edit/formula_display_apply.zig").applyDraft(a, &changed_paragraph, properties, replacement, 0, synthetic_ranges, 100_000);
            const changed_text = try @import("../edit/plain_text_content.zig").textBytes(a, changed_paragraph);
            defer a.free(changed_text);
            try std.testing.expectEqualSlices(u8, changed_display.bytes, changed_text);
            try std.testing.expectEqual(@as(u32, @intCast(changed_text.len / 2)), changed_paragraph.declared_units);
            try std.testing.expectEqual(changed_display.start_unit, changed_paragraph.range_tags.?[0].start_unit);
            try std.testing.expectEqual(changed_display.start_unit + changed_display.added_units, changed_paragraph.range_tags.?[0].end_unit);
            try std.testing.expectEqual(@as(u32, 42), changed_paragraph.range_tags.?[0].tag);
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
            const Transaction = struct {
                tree: @import("tree.zig").Tree,
                groups: @import("list_groups.zig").Groups,
                owner: @import("formula_cell.zig").Owner,
                range: @import("formula_range.zig").Range,
                properties: fields.Properties,
                field_node: u32,
                source_bytes: []const u8,
                version: @import("../version.zig").Version,
                reject: bool,

                fn prepare(allocator: std.mem.Allocator, draft: *@import("../../model/document.zig").Section, self: @This()) !void {
                    draft.paragraphs[19].tokens[0].raw[2] = '2';
                    const reader: @import("../edit/formula_value_reader.zig").Reader = .{ .allocator = allocator, .section = draft.* };
                    const result = try @import("formula_values.zig").evaluateWith(self.tree, self.groups, self.owner, self.range, .observed8, .{}, reader);
                    const output = try @import("../edit/formula_command_writer.zig").prepare(allocator, self.properties, result.value, .none);
                    defer allocator.free(output);
                    try expectAscii((try (try fields.Properties.parse(output)).formulaView()).cached_display, "68.5");
                    const results = try allocator.alloc(@import("../../model/document.zig").FormulaResult, 1);
                    results[0] = .{ .source_node = self.field_node, .value = result.value, .grouping = .none };
                    if (draft.paragraphs[23].formula_results) |old| allocator.free(old);
                    draft.paragraphs[23].formula_results = results;
                    // Fixture has no range tags in this numeric result paragraph.
                    try @import("../edit/formula_display_apply.zig").applyDraft(allocator, &draft.paragraphs[23], self.properties, results[0], 0, null, 100_000);
                    const displayed = try @import("../edit/plain_text_content.zig").textBytes(allocator, draft.paragraphs[23]);
                    defer allocator.free(displayed);
                    const span = try @import("field_span.zig").find(displayed, @import("control_rules.zig").id("%fmu"), 0);
                    try expectAscii(displayed[@as(usize, span.start_unit) * 2 .. @as(usize, span.end_unit) * 2], "68.5");
                    results[0].value = 69.5;
                    const mismatch = @import("../edit/text_section_writer.zig").write(allocator, self.source_bytes, draft.*, self.version, 8 * 1024 * 1024);
                    if (mismatch) |unexpected| {
                        allocator.free(unexpected);
                        return error.ExpectedFormulaDisplayMismatch;
                    } else |err| {
                        if (err != error.FormulaDisplayMismatch) return err;
                    }
                    results[0].value = result.value;
                    const serialized = try @import("../edit/text_section_writer.zig").write(allocator, self.source_bytes, draft.*, self.version, 8 * 1024 * 1024);
                    defer allocator.free(serialized);
                    var records_out = records.Iterator.init(serialized, .{});
                    var checked = false;
                    while (try records_out.next()) |entry| {
                        if (entry.tag != @intFromEnum(body.Tag.control_header)) continue;
                        const h = try body.ControlHeader.parse(entry.payload);
                        if (h.id != @import("control_rules.zig").id("%fmu")) continue;
                        try expectAscii((try (try fields.Properties.parse(h.properties)).formulaView()).cached_display, "68.5");
                        checked = true;
                        break;
                    }
                    try std.testing.expect(checked);
                    if (self.reject) return error.RejectedFormulaTransaction;
                }

                fn allocationFailures(allocator: std.mem.Allocator, target: *@import("../../model/document.zig").Section, self: @This()) !void {
                    const previous_tokens = target.paragraphs[19].tokens.ptr;
                    @import("../../model/transaction.zig").apply(allocator, target, self, prepare) catch |err| {
                        try std.testing.expect(previous_tokens == target.paragraphs[19].tokens.ptr);
                        try std.testing.expectEqual(@as(u8, '1'), target.paragraphs[19].tokens[0].raw[2]);
                        try std.testing.expect(target.paragraphs[23].formula_results == null);
                        return err;
                    };
                    try std.testing.expectEqual(@as(u8, '2'), target.paragraphs[19].tokens[0].raw[2]);
                    try std.testing.expectApproxEqAbs(@as(f64, 68.5), target.paragraphs[23].formula_results.?[0].value, 0.000001);
                    allocator.free(target.paragraphs[23].formula_results.?);
                    target.paragraphs[23].formula_results = null;
                    try @import("../edit/formula_display_apply.zig").applyDraft(std.testing.allocator, &target.paragraphs[23], self.properties, .{ .source_node = self.field_node, .value = 67.5, .grouping = .none }, 0, null, 100_000);
                    target.paragraphs[19].tokens[0].raw[2] = '1';
                }
            };
            const transaction: Transaction = .{ .tree = tree, .groups = groups, .owner = owner, .range = range, .properties = properties, .field_node = @intCast(node), .source_bytes = section, .version = source.header.version(), .reject = true };
            const original_tokens = document.sections[0].paragraphs[19].tokens.ptr;
            try std.testing.expectError(error.RejectedFormulaTransaction, @import("../../model/transaction.zig").apply(a, &document.sections[0], transaction, Transaction.prepare));
            try std.testing.expect(original_tokens == document.sections[0].paragraphs[19].tokens.ptr);
            try std.testing.expectEqual(@as(u8, '1'), document.sections[0].paragraphs[19].tokens[0].raw[2]);
            var accepted = transaction;
            accepted.reject = false;
            try std.testing.checkAllAllocationFailures(a, Transaction.allocationFailures, .{ &document.sections[0], accepted });
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
    var recalculated = try @import("../../model/clone.zig").section(a, document.sections[0]);
    defer recalculated.deinit(a);
    recalculated.paragraphs[19].tokens[0].raw[2] = '2';
    try std.testing.expectEqual(@as(usize, 13), try @import("../edit/formula_recalculate.zig").applyDraft(a, section, source.header.version(), &recalculated, 100_000, .{}));
    const output = try @import("../edit/text_section_writer.zig").write(a, section, recalculated, source.header.version(), 8 * 1024 * 1024);
    defer a.free(output);
    var output_records = records.Iterator.init(output, .{});
    var formula_count: usize = 0;
    while (try output_records.next()) |entry| {
        if (entry.tag != @intFromEnum(body.Tag.control_header)) continue;
        const h = try body.ControlHeader.parse(entry.payload);
        if (h.id != @import("control_rules.zig").id("%fmu")) continue;
        try std.testing.expect(formula_count < cached.len);
        try expectAscii((try (try fields.Properties.parse(h.properties)).formulaView()).cached_display, if (formula_count == 0) "68.5" else cached[formula_count]);
        formula_count += 1;
    }
    try std.testing.expectEqual(@as(usize, 13), formula_count);
    var untouched = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{section});
    defer untouched.deinit(a);
    try std.testing.expectEqual(@as(usize, 13), try @import("../edit/formula_recalculate.zig").applyDraft(a, section, source.header.version(), &untouched.sections[0], 100_000, .{ .cells = 48, .inspections = groups.items.len * 48 }));
    for (untouched.sections[0].paragraphs) |p| {
        try std.testing.expect(p.formula_results == null);
        try std.testing.expect(p.range_tags == null);
    }
    const unchanged_section = try @import("../edit/text_section_writer.zig").write(a, section, untouched.sections[0], source.header.version(), section.len);
    defer a.free(unchanged_section);
    try std.testing.expectEqualSlices(u8, section, unchanged_section);
    var insufficient = try @import("../../model/clone.zig").section(a, untouched.sections[0]);
    defer insufficient.deinit(a);
    try std.testing.expectError(error.LimitExceeded, @import("../edit/formula_recalculate.zig").applyDraft(a, section, source.header.version(), &insufficient, 100_000, .{ .cells = 47, .inspections = groups.items.len * 48 }));
    const Session = @import("../edit/style_preservation.zig").Session;
    const editor = try Session.open(a, bytes);
    defer editor.close();
    try editor.apply(.{ .splice_text = .{ .section = 0, .paragraph = 19, .start_unit = 1, .end_unit = 2, .utf8 = "2" } });
    const number_text = try editor.copyText(a, 0, 19);
    defer a.free(number_text);
    try expectAscii(number_text, "12.2\r");
    const formula_text = try editor.copyText(a, 0, 23);
    defer a.free(formula_text);
    const formula_span = try @import("field_span.zig").find(formula_text, @import("control_rules.zig").id("%fmu"), 0);
    try expectAscii(formula_text[@as(usize, formula_span.start_unit) * 2 .. @as(usize, formula_span.end_unit) * 2], "68.5");
    try std.testing.expectError(error.InvalidFormulaNumber, editor.apply(.{ .splice_text = .{ .section = 0, .paragraph = 19, .start_unit = 1, .end_unit = 2, .utf8 = "x" } }));
    const retained_number = try editor.copyText(a, 0, 19);
    defer a.free(retained_number);
    try std.testing.expectEqualSlices(u8, number_text, retained_number);
    const saved = try editor.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try Session.open(a, saved.bytes);
    defer reopened.close();
    const reopened_text = try reopened.copyText(a, 0, 23);
    defer a.free(reopened_text);
    try std.testing.expectEqualSlices(u8, formula_text, reopened_text);
}
