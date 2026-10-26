//! Controlled derived-file construction, not the public insertion command.
const std = @import("std");

test "HWP5 created table real fixture rebuild opens and preserves original section prefix" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const before = try a.dupe(u8, input);
    defer a.free(before);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    try std.testing.expectEqualSlices(u8, input, source.file.bytes);
    try std.testing.expectEqual(@as(u16, 1), source.section_count);
    const version = source.header.version();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const info = try source.decodeDocInfo(a, 4_000_000);
    defer a.free(info);
    const counts = try @import("../docinfo/resources.zig").inspect(info, version, .{});
    try counts.validateKnownCounts();
    try std.testing.expect(counts.count(.char_shape) > 0 and counts.count(.para_shape) > 0 and counts.count(.style) > 0 and counts.count(.border_fill) > 0);
    var original = try @import("../body/tree.zig").Tree.parse(a, raw, version, .{});
    defer original.deinit(a);
    var last_root: ?usize = null;
    var original_paragraphs: usize = 0;
    for (original.nodes, 0..) |node, index| {
        if (node.record.value == .header) {
            original_paragraphs += 1;
            if (node.parent == null) last_root = index;
        }
        if (node.record.value == .control_header) {
            const id = node.record.value.control_header.id;
            const rules = @import("../body/control_rules.zig");
            try std.testing.expect(id == rules.section_id or id == rules.column_id);
        }
    }
    const ids = try @import("instance_ids.zig").manyFromSections(a, &.{raw}, version, &.{}, 8, 4096);
    defer a.free(ids);
    var table = try @import("../../model/created_table.zig").create(a, 11, ids[7], try @import("../../model/table_creation_plan.zig").create(2, 3, 21600, 3600, 6), ids[1..7], .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 6);
    defer table.deinit(a);
    _ = try table.replaceText(a, 1, 2, "새 셀😀", 100);
    const options: @import("created_table_records.zig").Options = .{
        .common = .{ .flags = 0x6a2211, .offset_y = 0, .offset_x = 0, .z_order = 0, .margins = .{ 0, 0, 0, 0 }, .prevent_page_break = false, .description = "새 표" },
        .table = .{ .page_break = 1, .repeat_header = false, .cell_spacing = 0, .margins = .{ 0, 0, 0, 0 } },
        .cell = .{ .layout = .observed8, .unknown = 0, .attributes = 0, .margins = .{ 0, 0, 0, 0 } },
    };
    const resources: @import("created_table_records.zig").Resources = .{ .paragraphs = .{ .char_shapes = counts.count(.char_shape), .para_shapes = counts.count(.para_shape), .styles = counts.count(.style) }, .border_count = counts.count(.border_fill) };
    const fragment = try @import("created_table_records.zig").write(a, &table, version, options, resources, 1, .{ .max_cells = 6, .max_bytes = 4_000_000 });
    defer a.free(fragment);
    var section: std.ArrayList(u8) = .empty;
    defer section.deinit(a);
    try section.appendSlice(a, raw);
    const last = original.nodes[last_root.?].record.framing;
    const count_at = last.offset + last.raw.len - last.payload.len;
    const old_count = std.mem.readInt(u32, section.items[count_at..][0..4], .little);
    std.mem.writeInt(u32, section.items[count_at..][0..4], old_count & 0x7fffffff, .little);
    var expected_prefix = try a.dupe(u8, raw);
    defer a.free(expected_prefix);
    std.mem.writeInt(u32, expected_prefix[count_at..][0..4], old_count & 0x7fffffff, .little);
    var host: [24]u8 = @splat(0);
    std.mem.writeInt(u32, host[0..4], 0x80000009, .little);
    std.mem.writeInt(u32, host[4..8], 1 << 11, .little);
    std.mem.writeInt(u16, host[12..14], 1, .little);
    std.mem.writeInt(u32, host[18..22], ids[0], .little);
    const framing = @import("../record_writer.zig");
    try framing.append(a, &section, 66, 0, host[0..if (version.raw >= 0x05000302) @as(usize, 24) else 22], 4_000_000);
    var anchor: [18]u8 = @splat(0);
    std.mem.writeInt(u16, anchor[0..2], 11, .little);
    std.mem.writeInt(u32, anchor[2..6], @import("../body/control_rules.zig").table_id, .little);
    std.mem.writeInt(u16, anchor[14..16], 11, .little);
    std.mem.writeInt(u16, anchor[16..18], 13, .little);
    try framing.append(a, &section, 67, 1, &anchor, 4_000_000);
    try framing.append(a, &section, 68, 1, &.{ 0, 0, 0, 0, 0, 0, 0, 0 }, 4_000_000);
    try section.appendSlice(a, fragment);
    try std.testing.expectEqualSlices(u8, expected_prefix, section.items[0..raw.len]);
    const stored = if (source.header.has(.compressed)) try @import("../../compression/raw_deflate.zig").encodeStored(a, section.items, 4_000_000) else try a.dupe(u8, section.items);
    defer a.free(stored);
    const saved = try @import("../../cfb/stream_replace.zig").rebuildExact(a, &source.file, "/BodyText/Section0", stored, .{ .max_output_bytes = 4_000_000 });
    defer a.free(saved);
    var reopened = try @import("../text_source.zig").Source.open(a, saved);
    defer reopened.deinit();
    const decoded = try reopened.decodeSection(a, 0);
    defer a.free(decoded);
    try std.testing.expectEqualSlices(u8, section.items, decoded);
    var tree = try @import("../body/tree.zig").Tree.parse(a, decoded, version, .{});
    defer tree.deinit(a);
    try std.testing.expectEqual(original_paragraphs + 7, (try @import("../body/paragraphs.zig").inspect(tree, resources.paragraphs)).paragraphs);
    try std.testing.expectEqual(@as(usize, 6), (try @import("../body/table_validation.zig").inspect(a, tree, .{ .list_layout = .observed8, .zone_layout = .spec_column_first, .border_count = resources.border_count })).cells);
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    const changed_stream = (try source.file.findExact("/BodyText/Section0")).?;
    var old_entries: usize = 0;
    var new_entries: usize = 0;
    for (reopened.file.entries) |entry| if (entry.kind != 0) {
        new_entries += 1;
    };
    for (source.file.entries, 0..) |entry, index| {
        if (entry.kind == 0) continue;
        old_entries += 1;
        const path = try source.file.rootRelativePath(index);
        const target = try reopened.file.findExact(path) orelse return error.StreamNotFound;
        const other = reopened.file.entries[target];
        try std.testing.expectEqual(entry.kind, other.kind);
        try std.testing.expectEqualSlices(u8, entry.name, other.name);
        try std.testing.expectEqualDeep(entry.clsid, other.clsid);
        try std.testing.expectEqual(entry.state, other.state);
        try std.testing.expectEqual(entry.created, other.created);
        try std.testing.expectEqual(entry.modified, other.modified);
        if (entry.kind == 2 and index != changed_stream) try std.testing.expectEqualSlices(u8, entry.content, other.content);
    }
    try std.testing.expectEqual(old_entries, new_entries);
    // Reopened cells use the existing editor/history; creation itself is not
    // yet a native history command. Its baseline here is the derived CFB.
    const session = try @import("style_preservation.zig").Session.open(a, saved);
    defer session.close();
    try std.testing.expectEqual(original_paragraphs + 7, try session.paragraphCount(0));
    const last_cell = original_paragraphs + 6;
    const original_text = try session.copyText(a, 0, last_cell);
    defer a.free(original_text);
    const expected_text = std.unicode.utf8ToUtf16LeStringLiteral("새 셀😀\r");
    try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(expected_text[0..expected_text.len]), original_text);
    const unchanged = try session.save(a, .{});
    defer a.free(unchanged.bytes);
    try std.testing.expectEqualSlices(u8, saved, unchanged.bytes);
    var history = try @import("editor_history.zig").History.init(a, session, 8, 4_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(session, .{ .splice_text = .{ .section = 0, .paragraph = last_cell, .start_unit = 0, .end_unit = 0, .utf8 = "확인" } }));
    try std.testing.expectError(error.LayoutReflowRequired, session.save(a, .{}));
    const edited = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(edited.bytes);
    const fresh = try @import("style_preservation.zig").Session.open(a, edited.bytes);
    defer fresh.close();
    const edited_text = try fresh.copyText(a, 0, last_cell);
    defer a.free(edited_text);
    const expected_edit = std.unicode.utf8ToUtf16LeStringLiteral("확인새 셀😀\r");
    try std.testing.expectEqualSlices(u8, std.mem.sliceAsBytes(expected_edit[0..expected_edit.len]), edited_text);
    try std.testing.expect(try history.undo(session));
    const undone = try session.save(a, .{});
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, saved, undone.bytes);
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, edited.bytes, redone.bytes);
    try std.testing.expectEqualSlices(u8, before, input);
    const on_disk = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(on_disk);
    try std.testing.expectEqualSlices(u8, before, on_disk);
}
