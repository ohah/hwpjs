const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const uri = @import("document_xml.zig").paragraph_uri;

test "actual chart whole formula split candidates retain all field bytes and cell owners" {
    var checked: @import("../testing/checked_allocator.zig").Debug = .{};
    defer std.testing.expect(checked.deinit() == .ok) catch @panic("formula split test allocator leak");
    const a = checked.allocator();
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const trees = [_]Tree{section.tree};
    var linked = try @import("field_markers.zig").inspect(a, &trees, .{});
    defer linked.deinit();
    var counters: @import("section_text.zig").Report = .{};
    var current = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, .{}, &counters);
    defer current.deinit(a);
    const extras = try @import("paragraph_id_source_parts.zig").read(a, input, 16000000);
    defer {
        for (extras) |*tree| tree.deinit(a);
        a.free(extras);
    }
    const id_trees = try a.alloc(Tree, trees.len + extras.len);
    defer a.free(id_trees);
    @memcpy(id_trees[0..trees.len], &trees);
    @memcpy(id_trees[trees.len..], extras);
    const id = try @import("paragraph_instance_ids.zig").next(a, id_trees, &.{}, 200000);
    var cases: usize = 0;
    for (linked.markers) |marker| {
        if (marker.kind != .begin or !std.mem.eql(u8, marker.begin.?.type_raw orelse "", "FORMULA")) continue;
        const owner = try @import("paragraph_site_owner.zig").ancestor(&section.tree, marker.element_index);
        const index = for (current.paragraphs, 0..) |row, row_index| {
            if (row.template_element == owner) break row_index;
        } else return error.MissingFormulaParagraph;
        const positions = try @import("field_source_positions.zig").build(a, &trees, 0, &current.paragraphs[index], &linked, 200000);
        defer a.free(positions);
        try std.testing.expectEqual(@as(usize, 2), positions.len);
        for ([_]u32{ @intCast(positions[0].unit), @intCast(positions[1].unit) }) |at| {
            var candidate = try @import("field_structure_split.zig").prepareWholeFormula(a, &trees, 0, &current, index, at, at, id, &linked, 16000000, 200000);
            defer candidate.deinit(a);
            const xml = try @import("field_group_xml.zig").writeWholeFormulaDirty(a, &trees, 0, candidate.paragraphs[index .. index + 2], &linked, .{}, &.{}, 16000000, 200000);
            defer a.free(xml);
            const original = section.tree.elements[owner];
            const combined = try std.mem.concat(a, u8, &.{ section.tree.source[0..original.start_tag.start], xml, section.tree.source[original.end..] });
            defer a.free(combined);
            var parsed = try @import("xml_part_tree.zig").parse(a, combined, .section, 0, 0, .{});
            defer parsed.deinit(a);
            var after = try @import("field_markers.zig").inspect(a, &.{parsed}, .{});
            defer after.deinit();
            try std.testing.expectEqual(linked.markers.len, after.markers.len);
            for (linked.markers) |before| {
                const found = for (after.markers) |now| {
                    if (now.kind != before.kind) continue;
                    const same = if (now.kind == .begin) now.begin.?.id == before.begin.?.id else now.end.?.begin_id_ref == before.end.?.begin_id_ref;
                    if (same) break now;
                } else return error.MissingSavedFormulaMarker;
                try std.testing.expectEqualStrings(before.raw_xml, found.raw_xml);
                try std.testing.expect(found.matched_marker_index != null);
                try std.testing.expectEqual(try cellOrdinal(&section.tree, before.element_index), try cellOrdinal(&parsed, found.element_index));
            }
            try std.testing.expectEqual(current.paragraphs.len + 1, paragraphCount(&parsed));
            if (std.testing.environ.getPosix("HWPJS_FORMULA_SPLIT_DUMP")) |directory| {
                if (!std.fs.path.isAbsolute(directory) or directory.len <= 1) return error.InvalidFixtureDumpDirectory;
                const saved = try @import("../zip/replace_writer.zig").write(a, input, &.{.{ .entry_index = section.entry_index, .bytes = combined }}, .{});
                defer a.free(saved);
                const bytes_path = try std.fmt.allocPrint(a, "{s}/case-{d}.hwpx", .{ directory, cases });
                defer a.free(bytes_path);
                const info_path = try std.fmt.allocPrint(a, "{s}/case-{d}.json", .{ directory, cases });
                defer a.free(info_path);
                const info = try std.json.Stringify.valueAlloc(a, .{ .paragraph = current.paragraphs[index].source_ordinal.?, .atUnit = at, .text = "", .dirty = false, .beginId = marker.begin.?.id_raw.? }, .{});
                defer a.free(info);
                try std.Io.Dir.cwd().writeFile(std.testing.io, .{ .sub_path = bytes_path, .data = saved, .flags = .{ .exclusive = true } });
                try std.Io.Dir.cwd().writeFile(std.testing.io, .{ .sub_path = info_path, .data = info, .flags = .{ .exclusive = true } });
            }
            cases += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 26), cases);
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, input, unchanged);
}

fn paragraphCount(tree: *const Tree) usize {
    var count: usize = 0;
    for (tree.elements) |element| if (element.is(uri, "p")) {
        count += 1;
    };
    return count;
}

fn cellOrdinal(tree: *const Tree, element: usize) !usize {
    var parent = tree.elements[element].parent;
    while (parent) |index| {
        if (tree.elements[index].is(uri, "tc")) {
            var ordinal: usize = 0;
            for (tree.elements[0..index]) |node| if (node.is(uri, "tc")) {
                ordinal += 1;
            };
            return ordinal;
        }
        parent = tree.elements[index].parent;
    }
    return error.MissingFormulaCell;
}
