const std = @import("std");
const records = @import("created_table_records.zig");
const values = @import("created_table_values.zig");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;
const options: records.Options = .{
    .common = .{ .flags = 0x6a2211, .offset_x = 0, .offset_y = 0, .z_order = 0, .margins = .{ 0, 0, 0, 0 }, .prevent_page_break = false, .description = "새 표" },
    .table = .{ .page_break = 1, .repeat_header = false, .cell_spacing = 0, .margins = .{ 0, 0, 0, 0 } },
    .cell = .{ .layout = .observed8, .unknown = 0, .attributes = 0, .margins = .{ 0, 0, 0, 0 } },
};

fn verify(a: std.mem.Allocator, raw: []const u8, section: model.Section, tables: *const values.Values, version: Version, resources: records.Resources) !void {
    const output = try @import("created_table_section.zig").write(a, raw, section, tables, version, resources, .{ .max_cells = 6, .max_bytes = 4_000_000 });
    defer a.free(output);
    var tree = try @import("../body/tree.zig").Tree.parse(a, output, version, .{});
    defer tree.deinit(a);
    var projected = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{output});
    defer projected.deinit(a);
    try std.testing.expectEqual(section.paragraphs.len + 1, projected.sections[0].paragraphs.len);
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    var table_links: usize = 0;
    for (links.items) |link| if (link.id == @import("../body/control_rules.zig").table_id) {
        table_links += 1;
        try std.testing.expectEqual(@as(usize, 0), link.start_unit);
    };
    try std.testing.expectEqual(@as(usize, 1), table_links);
    const before = try @import("plain_text_content.zig").textBytes(a, section.paragraphs[1]);
    defer a.free(before);
    const after = try @import("plain_text_content.zig").textBytes(a, projected.sections[0].paragraphs[1]);
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after[16..]);
    try std.testing.expectEqualSlices(u8, &.{ 11, 0, ' ', 'l', 'b', 't', 0, 0, 0, 0, 0, 0, 0, 0, 11, 0 }, after[0..16]);
}

test "HWP5 generated table section joins actual host text records and owns every allocation failure" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const info = try source.decodeDocInfo(a, 4_000_000);
    defer a.free(info);
    const version = source.header.version();
    const counts = try @import("../docinfo/resources.zig").inspect(info, version, .{});
    const resources: records.Resources = .{ .paragraphs = .{ .char_shapes = counts.count(.char_shape), .para_shapes = counts.count(.para_shape), .styles = counts.count(.style) }, .border_count = counts.count(.border_fill) };
    var document = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{raw});
    defer document.deinit(a);
    var pending_ids = [_]values.Values{.{}};
    var id_plan = try @import("created_table_ids.zig").plan(a, &.{raw}, version, &document, &pending_ids, 1, 4096);
    defer id_plan.deinit(a);
    var table = try @import("../../model/created_table.zig").create(a, id_plan.identity, id_plan.instance_id, try @import("../../model/table_creation_plan.zig").create(1, 1, 21600, 3600, 1), id_plan.paragraph_ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 1);
    defer table.deinit(a);
    try @import("created_table_ids.zig").validate(a, &.{raw}, version, &document, &pending_ids, &table, 4096);
    _ = try table.replaceText(a, 0, 0, "새 표😀", 100);
    var value = try @import("created_table_value.zig").Value.initClone(a, &table, options, 4096);
    defer value.deinit(a);
    var tables: values.Values = .{};
    defer tables.deinit(a);
    try tables.append(a, try @import("created_table_anchor.zig").capture(a, &document.sections[0], 1, 0), &value, 1, 4096);
    const snapshot_sections = try a.alloc(model.Section, 1);
    snapshot_sections[0] = @import("../../model/clone.zig").section(a, document.sections[0]) catch |err| {
        a.free(snapshot_sections);
        return err;
    };
    var snapshot: model.Document = .{ .format = .hwp5, .sections = snapshot_sections };
    defer snapshot.deinit(a);
    try verify(a, raw, document.sections[0], &tables, version, resources);
    try @import("../../testing/allocation_failures.zig").check(verify, .{ raw, document.sections[0], &tables, version, resources });
    try std.testing.expect(@import("../../model/equality.zig").document(document, snapshot));
    const output = try @import("created_table_section.zig").write(a, raw, document.sections[0], &tables, version, resources, .{ .max_cells = 6, .max_bytes = 4_000_000 });
    defer a.free(output);
    const stored = if (source.header.has(.compressed)) try @import("../../compression/raw_deflate.zig").encodeStored(a, output, 4_000_000) else try a.dupe(u8, output);
    defer a.free(stored);
    const saved = try @import("../../cfb/stream_replace.zig").rebuildExact(a, &source.file, "/BodyText/Section0", stored, .{ .max_output_bytes = 4_000_000 });
    defer a.free(saved);
    const session = try @import("style_preservation.zig").Session.open(a, saved);
    defer session.close();
    try std.testing.expectEqual(document.sections[0].paragraphs.len + 1, try session.paragraphCount(0));
    const text = try session.copyText(a, 0, 2);
    defer a.free(text);
    const expected = std.unicode.utf8ToUtf16LeStringLiteral("새 표😀\r");
    try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(expected[0..expected.len]), text);
    const unchanged = try session.save(a, .{});
    defer a.free(unchanged.bytes);
    try std.testing.expectEqualSlices(u8, saved, unchanged.bytes);
    var history = try @import("editor_history.zig").History.init(a, session, 4, 4_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = 2, .start_unit = 0, .end_unit = 0, .utf8 = "편집" } }));
    try std.testing.expect(try history.undo(session));
    const undone = try session.save(a, .{});
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, saved, undone.bytes);
}

test "HWP5 generated table section preserves actual nested end boundaries and same point ordering" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/software.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const info = try source.decodeDocInfo(a, 4_000_000);
    defer a.free(info);
    const version = source.header.version();
    const counts = try @import("../docinfo/resources.zig").inspect(info, version, .{});
    const resources: records.Resources = .{ .paragraphs = .{ .char_shapes = counts.count(.char_shape), .para_shapes = counts.count(.para_shape), .styles = counts.count(.style) }, .border_count = counts.count(.border_fill) };
    var document = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{raw});
    defer document.deinit(a);
    var tree = try @import("../body/tree.zig").Tree.parse(a, raw, version, .{});
    defer tree.deinit(a);
    var original_links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer original_links.deinit(a);
    const section = document.sections[0];
    var pair: ?[2]usize = null;
    for (section.paragraphs, 0..) |root, ri| {
        if (root.parent_node != null) continue;
        for (section.paragraphs, 0..) |nested, ni| {
            if (nested.parent_node != null and tree.nodes[try root.originalNode()].subtree_end == tree.nodes[try nested.originalNode()].subtree_end) pair = .{ ri, ni };
        }
    }
    const hosts = pair orelse return error.TestMissingNestedBoundary;
    var objects: std.ArrayList(u32) = .empty;
    defer objects.deinit(a);
    for (tree.nodes) |node| if (node.record.value == .control_header) {
        const header = node.record.value.control_header;
        const rules = @import("../body/control_rules.zig");
        if (header.id == rules.table_id or header.id == rules.drawing_id or header.id == rules.equation_id) {
            try objects.append(a, (try @import("../body/object_common.zig").Properties.parse(header.properties)).instance_id);
        } else if (rules.expectedCode(header.id) == 3) {
            try objects.append(a, (try @import("../body/field_start.zig").Properties.parse(header.properties)).instance_id);
        }
    };
    const ids = try @import("instance_ids.zig").manyFromSections(a, &.{raw}, version, objects.items, 6, 4096);
    defer a.free(ids);
    var tables: values.Values = .{};
    defer tables.deinit(a);
    var units: [3]u32 = undefined;
    for (0..3) |i| {
        const pi = hosts[if (i == 0) @as(usize, 0) else 1];
        const bytes = try @import("plain_text_content.zig").textBytes(a, section.paragraphs[pi]);
        defer a.free(bytes);
        units[i] = @intCast(bytes.len / 2 - 1);
        var table = try @import("../../model/created_table.zig").create(a, i + 1, ids[i + 3], try @import("../../model/table_creation_plan.zig").create(1, 1, 21600, 3600, 1), ids[i .. i + 1], .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 1);
        defer table.deinit(a);
        var value = try @import("created_table_value.zig").Value.initClone(a, &table, options, 4096);
        defer value.deinit(a);
        try tables.append(a, try @import("created_table_anchor.zig").capture(a, &section, pi, units[i]), &value, 3, 16384);
    }
    const output = try @import("created_table_section.zig").write(a, raw, section, &tables, version, resources, .{ .max_cells = 6, .max_bytes = 4_000_000 });
    defer a.free(output);
    var result = try @import("../body/tree.zig").Tree.parse(a, output, version, .{});
    defer result.deinit(a);
    var links = try @import("../body/control_links.zig").Links.build(a, result);
    defer links.deinit(a);
    try std.testing.expectEqual(original_links.items.len + 3, links.items.len);
    var seen = [_]bool{ false, false, false };
    for (links.items) |link| {
        if (link.id != @import("../body/control_rules.zig").table_id) continue;
        const common = try @import("../body/object_common.zig").Properties.parse(result.nodes[link.control_node].record.value.control_header.properties);
        for (ids[3..6], 0..) |id, i| if (id == common.instance_id) {
            try std.testing.expect(!seen[i]);
            seen[i] = true;
            const host = section.paragraphs[hosts[if (i == 0) @as(usize, 0) else 1]];
            try std.testing.expectEqual(tree.nodes[try host.originalNode()].record.framing.level, result.nodes[link.paragraph_node].record.framing.level);
            try std.testing.expectEqual(host.instance_id, result.nodes[link.paragraph_node].record.value.header.instance_id);
            try std.testing.expectEqual(@as(usize, units[i]) + (if (i == 2) @as(usize, 8) else 0), link.start_unit);
        };
    }
    try std.testing.expectEqualDeep([_]bool{ true, true, true }, seen);
    const view = try @import("created_table_paragraphs.zig").build(a, raw, &section, &tables, version, 0, 10000);
    defer a.free(view);
    var view_index: usize = 0;
    for (result.nodes) |node| if (node.record.value == .header) {
        if (view_index >= view.len) return error.TestUnexpectedParagraph;
        const expected_id: u32 = switch (view[view_index]) {
            .source => |source_ref| section.paragraphs[try @import("created_table_anchor.zig").resolve(a, &section, .{ .host = source_ref.host, .unit = 0 })].instance_id,
            .created_cell => |point| block: {
                for (tables.entries) |entry| if (entry.value.table.identity == point.table) {
                    break :block entry.value.table.cells[@as(usize, point.row) * entry.value.table.plan.columns + point.column].paragraph_id;
                };
                return error.TestMissingCreatedCell;
            },
        };
        try std.testing.expectEqual(expected_id, node.record.value.header.instance_id);
        view_index += 1;
    };
    try std.testing.expectEqual(view.len, view_index);
    const stored = if (source.header.has(.compressed)) try @import("../../compression/raw_deflate.zig").encodeStored(a, output, 4_000_000) else try a.dupe(u8, output);
    defer a.free(stored);
    const saved = try @import("../../cfb/stream_replace.zig").rebuildExact(a, &source.file, "/BodyText/Section0", stored, .{ .max_output_bytes = 4_000_000 });
    defer a.free(saved);
    const session = try @import("style_preservation.zig").Session.open(a, saved);
    defer session.close();
    try std.testing.expectEqual(section.paragraphs.len + 3, try session.paragraphCount(0));
    var ordinal: usize = 0;
    var cells_seen: usize = 0;
    for (result.nodes) |node| if (node.record.value == .header) {
        for (ids[0..3]) |id| if (id == node.record.value.header.instance_id) {
            const cell = try session.copyText(a, 0, ordinal);
            defer a.free(cell);
            try std.testing.expectEqualSlices(u8, &.{ 13, 0 }, cell);
            cells_seen += 1;
        };
        ordinal += 1;
    };
    try std.testing.expectEqual(@as(usize, 3), cells_seen);
}
