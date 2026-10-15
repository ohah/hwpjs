const std = @import("std");

test "actual chart current formula split composed save keeps live AVG and original model" {
    var checked: @import("../testing/checked_allocator.zig").Debug = .{};
    defer std.testing.expect(checked.deinit() == .ok) catch @panic("composed formula split test allocator leak");
    const a = checked.allocator();
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const trees = [_]@import("xml_part_tree.zig").Tree{section.tree};
    var fields = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer fields.deinit();
    const marker = for (fields.markers) |field| {
        if (field.kind == .begin and std.mem.eql(u8, field.begin.?.type_raw orelse "", "FORMULA")) break field;
    } else return error.MissingFormulaField;
    try std.testing.expect(try session.splice(0, 20, 0, 4, "100"));
    try std.testing.expect(try session.setFormulaDefinition(0, marker.element_index, "=AVG(B?:E?)"));
    const before = try session.save();
    defer a.free(before);
    var counters: @import("section_text.zig").Report = .{};
    const site_options = @import("editor_session.zig").siteOptions(session.options);
    var values = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, site_options, &counters);
    defer values.deinit(a);
    const extras = try @import("paragraph_id_source_parts.zig").read(a, input, session.options.max_xml_bytes -| section.tree.source.len);
    defer {
        for (extras) |*tree| tree.deinit(a);
        a.free(extras);
    }
    const identity_trees = try a.alloc(@import("xml_part_tree.zig").Tree, trees.len + extras.len);
    defer a.free(identity_trees);
    @memcpy(identity_trees[0..trees.len], &trees);
    @memcpy(identity_trees[trees.len..], extras);
    const id = try @import("paragraph_instance_ids.zig").next(a, identity_trees, &.{}, 200000);
    for (1..6) |inside| {
        const unit: u32 = @intCast(inside);
        try std.testing.expectError(error.ProtectedFieldRange, @import("field_source_outside_plan.zig").prepareFormulaSplit(&session, 0, 24, unit, unit));
    }
    try std.testing.expectError(error.ProtectedFieldRange, @import("field_source_outside_plan.zig").prepareFormulaSplit(&session, 0, 24, 0, 6));
    for ([_]u32{ 0, 6 }, 0..) |at, case| {
        const plan = (try @import("field_source_outside_plan.zig").prepareFormulaSplit(&session, 0, 24, at, at)) orelse return error.MissingFormulaSplitCoordinates;
        defer plan.deinit(a);
        var candidate = try @import("field_structure_split.zig").prepareWholeFormula(a, &trees, 0, &values, 23, plan.start, plan.end, id, &fields, 16000000, 200000);
        defer candidate.deinit(a);
        const xml = try @import("paragraph_structure_save.zig").writeWholeFormulaWithDefinitions(a, &trees, 0, &candidate, site_options, &.{}, &section.formula_definitions, 16000000);
        defer a.free(xml);
        const bytes = try @import("../zip/replace_writer.zig").write(a, input, &.{.{ .entry_index = section.entry_index, .bytes = xml }}, .{});
        defer a.free(bytes);
        var reopened = try @import("editor_session.zig").open(a, bytes, .{});
        defer reopened.deinit();
        var current = try @import("formula_current_snapshot.zig").read(a, &reopened, 0);
        defer current.deinit(a);
        try std.testing.expectEqual(@as(usize, 13), current.rows.len);
        try std.testing.expectEqualStrings("39.075", current.rows[0].values.last_result.?);
        try std.testing.expectEqualStrings("=AVG(B?:E?)", current.rows[0].values.formula.?);
        const saved = try reopened.save();
        defer a.free(saved);
        try std.testing.expectEqualSlices(u8, bytes, saved);
        if (std.testing.environ.getPosix("HWPJS_FORMULA_CURRENT_SPLIT_DUMP")) |directory| {
            if (!std.fs.path.isAbsolute(directory) or directory.len <= 1) return error.InvalidFixtureDumpDirectory;
            if (case == 0) {
                const path = try std.fmt.allocPrint(a, "{s}/before.hwpx", .{directory});
                defer a.free(path);
                try std.Io.Dir.cwd().writeFile(std.testing.io, .{ .sub_path = path, .data = before, .flags = .{ .exclusive = true } });
            }
            const path = try std.fmt.allocPrint(a, "{s}/case-{d}.hwpx", .{ directory, case });
            defer a.free(path);
            const info_path = try std.fmt.allocPrint(a, "{s}/case-{d}.json", .{ directory, case });
            defer a.free(info_path);
            const info = try std.json.Stringify.valueAlloc(a, .{ .paragraph = @as(usize, 24), .atUnit = at, .text = "", .dirty = false, .beginId = marker.begin.?.id_raw.? }, .{});
            defer a.free(info);
            try std.Io.Dir.cwd().writeFile(std.testing.io, .{ .sub_path = path, .data = bytes, .flags = .{ .exclusive = true } });
            try std.Io.Dir.cwd().writeFile(std.testing.io, .{ .sub_path = info_path, .data = info, .flags = .{ .exclusive = true } });
        }
    }
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    for ([_]u32{ 0, 6 }) |at| {
        var live = try @import("editor_session.zig").open(a, input, .{});
        defer live.deinit();
        try std.testing.expect(try live.splice(0, 20, 0, 4, "100"));
        try std.testing.expect(try live.setFormulaDefinition(0, marker.element_index, "=AVG(B?:E?)"));
        try std.testing.expectError(error.ProtectedFieldRange, live.splitParagraph(0, 24, 1, 0));
        const refused = try live.save();
        defer a.free(refused);
        try std.testing.expectEqualSlices(u8, before, refused);
        try std.testing.expect(try live.splitParagraph(0, 24, at, 0));
        var live_snapshot = try @import("formula_current_snapshot.zig").read(a, &live, 0);
        defer live_snapshot.deinit(a);
        try std.testing.expectEqual(marker.element_index, live_snapshot.rows[0].begin_element);
        try std.testing.expectEqualStrings("39.075", live_snapshot.rows[0].values.last_result.?);
        const public_bytes = try live.save();
        defer a.free(public_bytes);
        var public_reopened = try @import("editor_session.zig").open(a, public_bytes, .{});
        defer public_reopened.deinit();
        var snapshot = try @import("formula_current_snapshot.zig").read(a, &public_reopened, 0);
        defer snapshot.deinit(a);
        try std.testing.expectEqual(@as(usize, 13), snapshot.rows.len);
        try std.testing.expectEqualStrings("39.075", snapshot.rows[0].values.last_result.?);
        try std.testing.expectEqualStrings("=AVG(B?:E?)", snapshot.rows[0].values.formula.?);
        try std.testing.expect(try live.splice(0, 20, 0, 3, "200"));
        var edited_snapshot = try @import("formula_current_snapshot.zig").read(a, &live, 0);
        defer edited_snapshot.deinit(a);
        try std.testing.expectEqualStrings("64.075", edited_snapshot.rows[0].values.last_result.?);
        try std.testing.expect(try live.setFormulaDefinition(0, marker.element_index, "=SUM(B?:E?)"));
        var changed_snapshot = try @import("formula_current_snapshot.zig").read(a, &live, 0);
        defer changed_snapshot.deinit(a);
        try std.testing.expectEqualStrings("256.3", changed_snapshot.rows[0].values.last_result.?);
    }
}
