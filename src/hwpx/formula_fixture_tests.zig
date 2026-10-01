const std = @import("std");
const parameters = @import("parameter_lists.zig");
const read = @import("formula_parameters.zig").read;

test "HWPX formula parameters project all thirteen actual chart formulas without cached evaluation" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var document = try @import("package.zig").inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    const trees = [_]@import("xml_part_tree.zig").Tree{tree};
    var report = try parameters.inspect(a, &trees, .{});
    defer report.deinit();
    var count: usize = 0;
    // Independent Python ElementTree/Decimal calculation from source cells,
    // not LastResult or command cached display.
    const expected_values = [_]f64{ 67.5, 73.9, 93.4, 659100, 731000, 523500, 245, 136, 152, 464, 266, 287.75, 224 };
    const expected_cells = [_]usize{ 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 4, 4, 4 };
    const expected_display = [_][]const u8{ "67.5", "73.9", "93.4", "659,100", "731,000", "523,500", "245", "136", "152", "464", "266.00", "287.75", "224.00" };
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    var markers = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer markers.deinit();
    const field_ranges = try @import("field_text_ranges.zig").build(a, &trees, &markers);
    defer a.free(field_ranges);
    const field_output = @import("formula_field_output.zig");
    var all_prepared: std.ArrayList(field_output.Prepared) = .empty;
    defer {
        for (all_prepared.items) |*item| item.deinit(a);
        all_prepared.deinit(a);
    }
    for (report.roots) |root| {
        const view = (try read(&report, 0, root.parent_element_index)) orelse continue;
        if (view.formula == null) continue;
        try std.testing.expect(view.command != null and view.result_format != null and view.last_result != null);
        try std.testing.expect(std.mem.startsWith(u8, view.formula.?, "="));
        const expression = try @import("formula_expression.zig").parse(a, view);
        const owner = try @import("formula_cell_owner.zig").read(a, &tree, root.parent_element_index);
        _ = try expression.range.resolve(owner.origin, owner.columns, owner.rows);
        const result = try @import("formula_values.zig").evaluate(a, &tree, &sites, root.parent_element_index, expression.range, .{});
        try std.testing.expect(result.cells > 0 and std.math.isFinite(result.value));
        if (count >= expected_values.len) return error.UnexpectedFormulaCount;
        try std.testing.expectApproxEqAbs(expected_values[count], result.value, 0.000000001);
        try std.testing.expectEqual(expected_cells[count], result.cells);
        const display = try @import("formula_output.zig").render(a, expression, view, result.value);
        defer a.free(display);
        try std.testing.expectEqualStrings(expected_display[count], display);
        var result_range: ?@import("field_text_ranges.zig").Range = null;
        for (field_ranges) |candidate| {
            if (markers.markers[candidate.begin_marker].element_index == root.parent_element_index) result_range = candidate;
        }
        var prepared = try @import("formula_result_sites.zig").prepare(a, &tree, &sites, result_range orelse return error.MissingFormulaResultSite, display);
        defer prepared.deinit(a);
        try std.testing.expectEqualStrings(display, prepared.items[0].text);
        var whole_field = try field_output.prepare(a, &tree, &sites, &report, result_range.?, root.parent_element_index, "42.00");
        all_prepared.append(a, whole_field) catch |err| {
            whole_field.deinit(a);
            return err;
        };
        const updated_xml = try @import("formula_field_output.zig").write(a, &tree, &sites, &report, result_range.?, root.parent_element_index, "42.00", .{}, tree.source.len + 4096);
        defer a.free(updated_xml);
        var updated_tree = try @import("xml_part_tree.zig").parse(a, updated_xml, .section, 0, 0, .{});
        defer updated_tree.deinit(a);
        const updated_trees = [_]@import("xml_part_tree.zig").Tree{updated_tree};
        var updated_parameters = try parameters.inspect(a, &updated_trees, .{});
        defer updated_parameters.deinit();
        const updated_view = (try read(&updated_parameters, 0, root.parent_element_index)).?;
        try std.testing.expectEqualStrings("42.00", updated_view.last_result.?);
        try std.testing.expect(std.mem.endsWith(u8, updated_view.command.?, ",;;42.00"));
        try std.testing.expectEqualStrings(view.formula.?, updated_view.formula.?);
        const dirty = (try updated_tree.attributeValue(a, root.parent_element_index, "", "dirty")).?;
        const dirty_text = try dirty.toUtf8(a, 16);
        defer a.free(dirty_text);
        try std.testing.expectEqualStrings("1", dirty_text);
        var updated_sites = try @import("text_sites.zig").collect(a, &updated_tree, .{});
        defer updated_sites.deinit(a);
        for (prepared.items, 0..) |item, ordinal| {
            try std.testing.expectEqualStrings(if (ordinal == 0) "42.00" else "", updated_sites.items[item.site_index].text);
            try std.testing.expectEqualStrings(sites.items[item.site_index].text, (try @import("formula_parameters.zig").read(&report, 0, root.parent_element_index)).?.last_result.?);
        }
        if (count == 0) {
            const rectangle = try expression.range.resolve(owner.origin, owner.columns, owner.rows);
            const table_fields = @import("table_xml_fields.zig");
            var changed = false;
            for (sites.items) |*site| {
                var cursor = tree.elements[site.element_index].parent;
                var cell: ?usize = null;
                while (cursor) |index| : (cursor = tree.elements[index].parent) {
                    if (table_fields.childIs(&tree, index, "tc")) {
                        cell = index;
                        break;
                    }
                }
                const cell_index = cell orelse continue;
                const cell_row = tree.elements[cell_index].parent orelse continue;
                if (tree.elements[cell_row].parent != owner.table) continue;
                var missing: usize = 0;
                var duplicate: usize = 0;
                const address = table_fields.uniqueChild(&tree, cell_index, "cellAddr", &missing, &duplicate) orelse continue;
                const column = try table_fields.optionalUnsigned(a, &tree, address, "colAddr", 4096) orelse continue;
                const row = try table_fields.optionalUnsigned(a, &tree, address, "rowAddr", 4096) orelse continue;
                if (column != rectangle.first.column or row != rectangle.first.row) continue;
                const original_number = try @import("formula_cell_number.zig").read(a, &tree, &sites, cell_index);
                const original_text = site.text;
                site.text = try a.dupe(u8, "100");
                defer {
                    a.free(site.text);
                    site.text = original_text;
                }
                const updated = try @import("formula_values.zig").evaluate(a, &tree, &sites, root.parent_element_index, expression.range, .{});
                try std.testing.expectApproxEqAbs(result.value - original_number + 100, updated.value, 0.000000001);
                const pending = try @import("formula_section_prepare.zig").prepare(a, &trees, 0, &sites, .{});
                defer {
                    for (pending) |*field| field.deinit(a);
                    a.free(pending);
                }
                try std.testing.expectEqual(@as(usize, 1), pending.len);
                try std.testing.expectEqual(root.parent_element_index, pending[0].begin);
                try std.testing.expect(!std.mem.eql(u8, view.last_result.?, "100"));
                changed = true;
                break;
            }
            try std.testing.expect(changed);
            try std.testing.expectApproxEqAbs(result.value, (try @import("formula_values.zig").evaluate(a, &tree, &sites, root.parent_element_index, expression.range, .{})).value, 0.000000001);
        }
        try std.testing.expectError(error.LimitExceeded, @import("formula_values.zig").evaluate(a, &tree, &sites, root.parent_element_index, expression.range, .{ .cells = 0 }));
        try std.testing.expectError(error.LimitExceeded, @import("formula_values.zig").evaluate(a, &tree, &sites, root.parent_element_index, expression.range, .{ .inspections = 0 }));
        count += 1;
    }
    try std.testing.expectEqual(@as(usize, 13), count);
    const calculated = try @import("formula_section_prepare.zig").prepare(a, &trees, 0, &sites, .{ .only_changed = false });
    defer {
        for (calculated) |*field| field.deinit(a);
        a.free(calculated);
    }
    try std.testing.expectEqual(@as(usize, 13), calculated.len);
    for (calculated, expected_display) |field, expected| try std.testing.expectEqualStrings(expected, field.result.items[0].text);
    const unchanged = try @import("formula_section_prepare.zig").prepare(a, &trees, 0, &sites, .{});
    defer {
        for (unchanged) |*field| field.deinit(a);
        a.free(unchanged);
    }
    try std.testing.expectEqual(@as(usize, 0), unchanged.len);
    const unchanged_xml = try field_output.writeMany(a, &tree, &sites, unchanged, .{}, tree.source.len + 8192);
    defer a.free(unchanged_xml);
    try std.testing.expectEqualStrings(tree.source, unchanged_xml);
    try std.testing.expectError(error.LimitExceeded, @import("formula_section_prepare.zig").prepare(a, &trees, 0, &sites, .{ .max_fields = 0 }));
    // Every individual observed range fits four cells, but the whole section
    // must not receive a fresh four-cell allowance for every field.
    try std.testing.expectError(error.LimitExceeded, @import("formula_section_prepare.zig").prepare(a, &trees, 0, &sites, .{ .evaluation = .{ .cells = 4 } }));
    const all_xml = try field_output.writeMany(a, &tree, &sites, all_prepared.items, .{}, tree.source.len + 8192);
    defer a.free(all_xml);
    const entry_index = document.manifest.items[tree.item_index].entry_index orelse return error.ExternalSpineXml;
    const unchanged_zip = try @import("../zip/replace_writer.zig").write(a, bytes, &.{.{ .entry_index = entry_index, .bytes = unchanged_xml }}, .{});
    defer a.free(unchanged_zip);
    try std.testing.expectEqualSlices(u8, bytes, unchanged_zip);
    const saved = try @import("../zip/replace_writer.zig").write(a, bytes, &.{.{ .entry_index = entry_index, .bytes = all_xml }}, .{});
    defer a.free(saved);
    var reopened = try @import("package.zig").inspectDocument(a, saved, .{});
    defer reopened.deinit(a);
    var all_tree = try reopened.readSectionTree(a, 0, .{});
    defer all_tree.deinit(a);
    try std.testing.expectEqualStrings(all_xml, all_tree.source);
    try std.testing.expectEqual(document.archive.entries.len, reopened.archive.entries.len);
    for (document.archive.entries, reopened.archive.entries, 0..) |before, after, index| {
        try std.testing.expectEqualStrings(before.name, after.name);
        if (index == entry_index) continue;
        const original_payload = try document.archive.decode(before, 4_000_000);
        defer a.free(original_payload);
        const saved_payload = try reopened.archive.decode(after, 4_000_000);
        defer a.free(saved_payload);
        try std.testing.expectEqualSlices(u8, original_payload, saved_payload);
    }
    const all_trees = [_]@import("xml_part_tree.zig").Tree{all_tree};
    var all_parameters = try parameters.inspect(a, &all_trees, .{});
    defer all_parameters.deinit();
    for (all_prepared.items) |field| {
        const view = (try read(&all_parameters, 0, field.begin)).?;
        try std.testing.expectEqualStrings("42.00", view.last_result.?);
    }
}
