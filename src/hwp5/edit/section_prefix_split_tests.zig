//! Synthetic first-paragraph split contracts; no external fixtures.
const std = @import("std");
const split = @import("section_prefix_split.zig");
const a = std.testing.allocator;
const version: @import("../version.zig").Version = .{ .raw = 0x05000107 };

fn sectionBytes() ![]u8 {
    const input = try @import("../../new_document/root.zig").hwp5(a);
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    return source.decodeSection(a, 0);
}

test "new document section prefix paired draft preserves anchors rejects relocation and allocation failures" {
    const raw = try sectionBytes();
    defer a.free(raw);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{raw});
    defer document.deinit(a);
    const p = document.sections[0].paragraphs[0];
    var draft = try split.prepare(a, raw, version, p, 16, 1, 1);
    defer draft.deinit(a);
    const left = try @import("plain_text.zig").textBytes(a, draft.left);
    defer a.free(left);
    const original = try @import("plain_text.zig").textBytes(a, p);
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, original, left);
    const right = try @import("plain_text.zig").textBytes(a, draft.right);
    defer a.free(right);
    try std.testing.expectEqualSlices(u8, &.{ 13, 0 }, right);
    try std.testing.expectEqual(p.source_node, draft.left.source_node);
    try std.testing.expect(draft.right.source_node == null);
    try std.testing.expectEqual(p.source_node, draft.right.header_template);
    for (0..16) |at| try std.testing.expectError(error.UnsupportedSectionAnchorRelocation, split.prepare(a, raw, version, p, @intCast(at), 1, 1));
    try std.testing.expectError(error.InvalidParagraphInstanceId, split.prepare(a, raw, version, p, 16, 0, 1));
    try std.testing.expectError(error.InvalidTextPosition, split.prepare(a, raw, version, p, 17, 1, 1));
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, paragraph: @import("../../model/document.zig").Paragraph) !void {
            var value = try split.prepare(allocator, bytes, version, paragraph, 16, 1, 1);
            defer value.deinit(allocator);
        }
    }.run, .{ raw, p });
}

test "new document section prefix template rejects opaque child and foreign or duplicate controls" {
    const raw = try sectionBytes();
    defer a.free(raw);
    const Tree = @import("../body/tree.zig").Tree;
    var original = try Tree.parseTextPreview(a, raw, version, .{});
    defer original.deinit(a);
    try split.validateTemplate(original, 0);
    var page_index: ?usize = null;
    var column_index: ?usize = null;
    for (original.nodes, 0..) |node, index| {
        if (node.record.framing.tag == 73) page_index = index;
        if (node.record.framing.tag == 71 and (try @import("../body/control_header.zig").Header.parse(node.record.framing.payload)).id == @import("../body/control_rules.zig").column_id) column_index = index;
    }
    const page = original.nodes[page_index.?].record.framing;
    const column = original.nodes[column_index.?].record.framing;
    for ([_]u32{ @import("../body/control_rules.zig").section_id, @import("../body/control_rules.zig").id("zzzz") }) |id| {
        const changed = try a.dupe(u8, raw);
        defer a.free(changed);
        const at = column.offset + column.raw.len - column.payload.len;
        std.mem.writeInt(u32, changed[at..][0..4], id, .little);
        var tree = try Tree.parseTextPreview(a, changed, version, .{});
        defer tree.deinit(a);
        try std.testing.expectError(error.UnsupportedStructuralControl, split.validateTemplate(tree, 0));
    }
    const unknown_bytes = try a.dupe(u8, raw);
    defer a.free(unknown_bytes);
    const word = std.mem.readInt(u32, unknown_bytes[page.offset..][0..4], .little);
    std.mem.writeInt(u32, unknown_bytes[page.offset..][0..4], (word & ~@as(u32, 0x3ff)) | 511, .little);
    var tree = try Tree.parseTextPreview(a, unknown_bytes, version, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.UnsupportedStructuralControl, split.validateTemplate(tree, 0));
    try std.testing.expectError(error.UnsupportedStructuralControl, split.validateTemplate(original, 1));
}

fn sectionControlBytes(a2: std.mem.Allocator, bytes: []const u8) ![]u8 {
    var source = try @import("../text_source.zig").Source.open(a2, bytes);
    defer source.deinit();
    const raw = try source.decodeSection(a2, 0);
    defer a2.free(raw);
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a2, raw, version, .{});
    defer tree.deinit(a2);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a2);
    var controls: usize = 0;
    for (tree.nodes) |node| {
        if (node.record.framing.tag != 71) continue;
        try std.testing.expectEqual(@as(?usize, 0), node.parent);
        controls += 1;
        const end = node.subtree_end;
        const last = tree.nodes[end - 1].record.framing;
        try out.appendSlice(a2, raw[node.record.framing.offset .. last.offset + last.raw.len]);
    }
    try std.testing.expectEqual(@as(usize, 2), controls);
    return out.toOwnedSlice(a2);
}

test "new document generated continuation clears only section mask and rejects invalid header templates" {
    const raw = try sectionBytes();
    defer a.free(raw);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{raw});
    defer document.deinit(a);
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, raw, version, .{});
    defer tree.deinit(a);
    var draft = try split.prepare(a, raw, version, document.sections[0].paragraphs[0], 16, 1, 1);
    defer draft.deinit(a);
    var template = tree.nodes[0].record.framing;
    const header = try a.dupe(u8, template.payload);
    defer a.free(header);
    const source_mask = std.mem.readInt(u32, header[4..8], .little);
    const extra_bit: u32 = 1 << 29;
    std.mem.writeInt(u32, header[4..8], source_mask | extra_bit, .little);
    template.payload = header;
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    const records = @import("paragraph_records.zig");
    try records.append(a, &out, template, 0, draft.right, version, 1, true, 4096);
    var it = @import("../record.zig").Iterator.init(out.items, .{});
    const emitted = (try it.next()).?;
    try std.testing.expectEqual((source_mask | extra_bit) & ~@as(u32, 1 << 2), std.mem.readInt(u32, emitted.payload[4..8], .little));
    try std.testing.expectEqual(source_mask | extra_bit, std.mem.readInt(u32, header[4..8], .little));
    try std.testing.expectEqual(source_mask, std.mem.readInt(u32, tree.nodes[0].record.framing.payload[4..8], .little));
    out.clearRetainingCapacity();
    template.payload = header[0..21];
    try std.testing.expectError(error.UnexpectedEnd, records.append(a, &out, template, 0, draft.right, version, 1, true, 4096));
    try std.testing.expectEqual(@as(usize, 0), out.items.len);
    var extension: [23]u8 = @splat(0);
    @memcpy(extension[0..22], header);
    template.payload = &extension;
    try std.testing.expectError(error.UnsupportedParagraphExtension, records.append(a, &out, template, 0, draft.right, version, 1, true, 4096));
    try std.testing.expectEqual(@as(usize, 0), out.items.len);
}

test "new document section prefix save retains exact control subtrees only on left after text and repeated Enter" {
    const edit = @import("style_preservation.zig");
    const input = try @import("../../new_document/root.zig").hwp5(a);
    defer a.free(input);
    const before = try sectionControlBytes(a, input);
    defer a.free(before);
    const session = try edit.Session.open(a, input);
    defer session.close();
    try session.apply(.{ .splice_text = .{ .section = 0, .paragraph = 0, .start_unit = 16, .end_unit = 16, .utf8 = "AB한😀" } });
    try session.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = 0, .at_unit = 18 } });
    try session.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = 0, .at_unit = 16 } });
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const after = try sectionControlBytes(a, saved.bytes);
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    try std.testing.expectEqual(@as(usize, 3), try reopened.paragraphCount(0));
    const middle = try reopened.copyText(a, 0, 1);
    defer a.free(middle);
    try std.testing.expectEqualSlices(u8, &.{ 'A', 0, 'B', 0, 13, 0 }, middle);
    const last = try reopened.copyText(a, 0, 2);
    defer a.free(last);
    try std.testing.expectEqualSlices(u8, &.{ 0x5c, 0xd5, 0x3d, 0xd8, 0x00, 0xde, 13, 0 }, last);
}
