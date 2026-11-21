//! Synthetic Native contracts; no private documents or GUI proof.
const std = @import("std");
const t = std.testing;
const a = t.allocator;
const contract = @import("model/picture_replacement.zig");
const png = @embedFile("testing/fixtures/image-source-crop/own-quadrants.png");
const jpeg = @embedFile("testing/fixtures/image-source-crop/own-quadrants.jpg");
test "live picture replace strict owner parser rejects quoted integers unknown fields and short digests" {
    const owner: contract.Owner = .{ .format = .hwp5, .section = 0, .pictureNode = 7, .pictureIdentity = "node:7", .sourceSha256 = @splat(1), .resourceSha256 = @splat(2), .resourceLink = "1", .historyRevision = 0, .binding = .{ .session = "s1", .serial = "0" } };
    const bytes = try std.json.Stringify.valueAlloc(a, owner, .{});
    defer a.free(bytes);
    var valid = try contract.parse(a, bytes);
    defer valid.deinit();
    try t.expect(contract.matches(owner, valid.value));
    const unknown = try std.mem.concat(a, u8, &.{ bytes[0 .. bytes.len - 1], ",\"editable\":true}" });
    defer a.free(unknown);
    try t.expectError(error.InvalidPictureReplacementOwner, contract.parse(a, unknown));
    const index = std.mem.indexOf(u8, bytes, "\"pictureNode\":7").?;
    const quoted = try std.mem.concat(a, u8, &.{ bytes[0..index], "\"pictureNode\":\"7\"", bytes[index + "\"pictureNode\":7".len ..] });
    defer a.free(quoted);
    try t.expectError(error.InvalidPictureReplacementOwner, contract.parse(a, quoted));
    const digest = std.mem.indexOf(u8, bytes, "\"sourceSha256\":[").?;
    const end = std.mem.indexOfScalarPos(u8, bytes, digest, ']').? + 1;
    const short = try std.mem.concat(a, u8, &.{ bytes[0..digest], "\"sourceSha256\":[1]", bytes[end..] });
    defer a.free(short);
    try t.expectError(error.InvalidPictureReplacementOwner, contract.parse(a, short));
}
fn h5Baseline() ![]u8 {
    return h5Pictures(1);
}
fn h5Pictures(count: usize) ![]u8 {
    const blank = try @import("new_document/hwp5.zig").create(a);
    var current = blank;
    errdefer a.free(current);
    if (count > 1) {
        const s = try @import("hwp5/edit/style_preservation.zig").Session.open(a, current);
        const prepared = prepare: {
            defer s.close();
            try s.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = 0, .at_unit = 16 } });
            break :prepare try s.save(a, .{ .allow_stale_layout = true });
        };
        a.free(current);
        current = prepared.bytes;
    }
    for (0..count) |index| {
        const out = prepare: {
            const s = try @import("hwp5/edit/style_preservation.zig").Session.open(a, current);
            defer s.close();
            const raw = try s.copyText(a, 0, index);
            defer a.free(raw);
            const text = try @import("image/image_insertion.zig").utf8FromUtf16(a, raw);
            defer a.free(text);
            break :prepare try @import("hwp5/edit/image_insertion_file.zig").prepare(a, current, png, .{ .expected_source_sha256 = contract.hash(current), .target = .{ .section = 0, .paragraph = @intCast(index), .unit = if (index == 0) 16 else 0 }, .expected_text = text, .width = 7200, .height = 3600 });
        };
        a.free(out.resource_path);
        a.free(current);
        current = out.bytes;
    }
    return current;
}
fn hxBaseline() ![]u8 {
    const blank = try @import("new_document/hwpx.zig").create(a);
    defer a.free(blank);
    var s = try @import("hwpx/editor_session.zig").open(a, blank, .{});
    defer s.deinit();
    try t.expect(try s.spliceAnchored(0, 1, 0, 0, "A"));
    try t.expect(try s.splitParagraphAnchored(0, 1, 0, 0));
    const input = try s.save();
    defer a.free(input);
    const out = try @import("hwpx/image_insertion_file.zig").prepare(a, input, png, .{ .expected_source_sha256 = contract.hash(input), .target = .{ .section = 0, .paragraph = 2, .unit = 1 }, .expected_text = "A", .width = 7200, .height = 3600 });
    a.free(out.resource_path);
    return out.bytes;
}
test "live picture replace H5 one history state crop geometry undo redo and stale owner" {
    const input = try h5Baseline();
    defer a.free(input);
    const s = try @import("hwp5/edit/style_preservation.zig").Session.open(a, input);
    defer s.close();
    s.enableHistoryDelta();
    var h = try @import("hwp5/edit/editor_history.zig").History.initV2(a, s, .{});
    defer h.deinit();
    const before = try s.pictureSources(a, 0, .base73);
    defer a.free(before);
    try t.expectEqual(@as(usize, 1), before.len);
    var owner = try s.pictureReplacementOwner(a, 0, @intCast(before[0].picture_node), h.revision(), .{ .session = "s1", .serial = "0" });
    defer owner.deinit(a);
    const request: @import("hwp5/edit/picture_replacement_current.zig").Request = .{ .owner = owner, .image = jpeg, .ticket = try s.historyTicket() };
    try t.expect(try h.apply(s, .{ .replace_picture = request }));
    try t.expectEqual(@as(u32, 1), h.revision());
    const after = try s.pictureSources(a, 0, .base73);
    defer a.free(after);
    var expected = before[0];
    expected.bin_data_id = after[0].bin_data_id;
    try t.expectEqualDeep(expected, after[0]);
    try t.expect(after[0].bin_data_id != before[0].bin_data_id);
    const bytes = try s.binaryResource(a, after[0].bin_data_id, contract.max_image_bytes);
    defer a.free(bytes);
    try t.expectEqualSlices(u8, jpeg, bytes);
    const kept = try s.binaryResource(a, before[0].bin_data_id, contract.max_image_bytes);
    defer a.free(kept);
    try t.expectEqualSlices(u8, png, kept);
    const saved = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try t.expectError(error.StalePictureReplacementOwner, h.apply(s, .{ .replace_picture = request }));
    try t.expect(try h.undo(s));
    const undone = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(undone.bytes);
    try t.expectEqualSlices(u8, input, undone.bytes);
    try t.expect(try h.redo(s));
    const redone = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try t.expectEqualSlices(u8, saved.bytes, redone.bytes);
    const fresh = try @import("hwp5/edit/style_preservation.zig").Session.open(a, saved.bytes);
    defer fresh.close();
    const resource = try fresh.binaryResource(a, after[0].bin_data_id, contract.max_image_bytes);
    defer a.free(resource);
    try t.expectEqualSlices(u8, jpeg, resource);
}
test "live picture replace H5 invalid image and exact byte noop leave history unchanged" {
    const input = try h5Baseline();
    defer a.free(input);
    const s = try @import("hwp5/edit/style_preservation.zig").Session.open(a, input);
    defer s.close();
    s.enableHistoryDelta();
    var h = try @import("hwp5/edit/editor_history.zig").History.initV2(a, s, .{});
    defer h.deinit();
    const sites = try s.pictureSources(a, 0, .base73);
    defer a.free(sites);
    var owner = try s.pictureReplacementOwner(a, 0, @intCast(sites[0].picture_node), 0, .{ .session = "s1", .serial = "0" });
    defer owner.deinit(a);
    var request: @import("hwp5/edit/picture_replacement_current.zig").Request = .{ .owner = owner, .image = "GIF89a", .ticket = try s.historyTicket() };
    try t.expectError(error.UnsupportedReplacementImageFormat, h.apply(s, .{ .replace_picture = request }));
    try t.expectEqual(@as(u32, 0), h.revision());
    request.ticket = try s.historyTicket();
    request.image = png;
    try t.expect(!try h.apply(s, .{ .replace_picture = request }));
    try t.expectEqual(@as(u32, 0), h.revision());
    const saved = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try t.expectEqualSlices(u8, input, saved.bytes);
}
test "live picture replace HX one history state exact crop geometry undo redo and stale owner" {
    const input = try hxBaseline();
    defer a.free(input);
    var s = try @import("hwpx/editor_session.zig").open(a, input, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try @import("hwpx/editor_history.zig").History.initV2(&s, .{});
    defer h.deinit();
    const sites = try @import("hwpx/picture_display_sites.zig").read(a, &s, 0);
    defer a.free(sites);
    const node: u32 = @intCast(sites[0].picture_node);
    const crop = try @import("hwpx/picture_crop_values.zig").read(a, &s.sections[0].tree, node);
    const geometry = try @import("hwpx/picture_dimension_values.zig").read(a, &s.sections[0].tree, node);
    var serial_buffer: [20]u8 = undefined;
    const serial = try std.fmt.bufPrint(&serial_buffer, "{d}", .{s.mutation_serial});
    var owner = try @import("hwpx/picture_replacement_current.zig").observe(a, &s, 0, node, h.revision(), .{ .session = "s1", .serial = serial });
    defer owner.deinit(a);
    const request: contract.Request = .{ .owner = owner, .image = jpeg };
    const command: @import("hwpx/editor_history.zig").Command = .{ .kind = .picture_replace, .picture_replace = &request, .section = 0, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "" };
    try t.expect(try h.apply(&s, command));
    try t.expectEqual(@as(u32, 1), h.revision());
    const current = try @import("hwpx/picture_display_sites.zig").read(a, &s, 0);
    defer a.free(current);
    try t.expectEqual(@as(usize, 1), current.len);
    const after_node = current[0].picture_node;
    try t.expectEqualDeep(crop, try @import("hwpx/picture_crop_values.zig").read(a, &s.sections[0].tree, after_node));
    try t.expectEqualDeep(geometry, try @import("hwpx/picture_dimension_values.zig").read(a, &s.sections[0].tree, after_node));
    const bytes = try @import("hwpx/picture_source_bytes.zig").read(a, &s, 0, after_node, contract.max_image_bytes);
    defer a.free(bytes);
    try t.expectEqualSlices(u8, jpeg, bytes);
    const saved = try s.save();
    defer a.free(saved);
    try t.expectError(error.StalePictureReplacementOwner, h.apply(&s, command));
    try t.expect(try h.undo(&s));
    const undone = try s.save();
    defer a.free(undone);
    try t.expectEqualSlices(u8, input, undone);
    try t.expect(try h.redo(&s));
    const redone = try s.save();
    defer a.free(redone);
    try t.expectEqualSlices(u8, saved, redone);
    try t.expect(s.mutation_serial > try @import("model/formatting_binding.zig").decimal(serial));
}
test "live picture replace H5 two shared pictures keep other owner and original resource" {
    const seed = try h5Pictures(2);
    defer a.free(seed);
    var source = try @import("hwp5/text_source.zig").Source.open(a, seed);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const rows = try @import("hwp5/edit/picture_sources.zig").read(a, raw, source.header.version(), .base73);
    defer a.free(rows);
    try t.expectEqual(@as(usize, 2), rows.len);
    const shared = try @import("hwp5/edit/picture_replacement_current.zig").patch(a, raw, source.header.version(), rows[1].picture_node, rows[1].bin_data_id, rows[0].bin_data_id);
    defer a.free(shared);
    const nodes = try source.file.toNodes(a);
    defer a.free(nodes);
    nodes[try source.file.nodeIndex((try source.file.findExact("/BodyText/Section0")).?)].content = shared;
    const input = try @import("cfb/writer.zig").write(a, nodes, .{ .version = source.file.header.major });
    defer a.free(input);
    const s = try @import("hwp5/edit/style_preservation.zig").Session.open(a, input);
    defer s.close();
    s.enableHistoryDelta();
    var h = try @import("hwp5/edit/editor_history.zig").History.initV2(a, s, .{});
    defer h.deinit();
    var owner = try s.pictureReplacementOwner(a, 0, @intCast(rows[0].picture_node), 0, .{ .session = "s1", .serial = "0" });
    defer owner.deinit(a);
    try t.expect(try h.apply(s, .{ .replace_picture = .{ .owner = owner, .image = jpeg, .ticket = try s.historyTicket() } }));
    const after = try s.pictureSources(a, 0, .base73);
    defer a.free(after);
    var expected_other = rows[1];
    expected_other.bin_data_id = rows[0].bin_data_id;
    try t.expectEqualDeep(expected_other, after[1]);
    const other = try s.binaryResource(a, after[1].bin_data_id, contract.max_image_bytes);
    defer a.free(other);
    try t.expectEqualSlices(u8, png, other);
    try t.expect(after[0].bin_data_id != after[1].bin_data_id);
}
test "live picture replace HX shared resource remains attached to the other unique picture" {
    const seed = try hxBaseline();
    defer a.free(seed);
    var original = try @import("hwpx/editor_session.zig").open(a, seed, .{});
    defer original.deinit();
    const sites = try @import("hwpx/picture_display_sites.zig").read(a, &original, 0);
    defer a.free(sites);
    const tree = &original.sections[0].tree;
    const node = sites[0].picture_node;
    const span = tree.elements[node];
    const tag = try @import("hwpx/xml_scalar_attributes_upsert.zig").write(a, tree, node, &.{"id"}, .{"4294900000"}, 4096);
    defer a.free(tag);
    const duplicate = try std.mem.concat(a, u8, &.{ tag, tree.source[span.start_tag.end..span.end] });
    defer a.free(duplicate);
    const xml = try @import("hwpx/xml_source_writer.zig").write(a, tree.source, &.{.{ .start = span.end, .end = span.end, .text = "", .serialized_xml = duplicate }}, 1024 * 1024);
    defer a.free(xml);
    const input = try @import("zip/replace_writer.zig").write(a, seed, &.{.{ .entry_index = original.sections[0].entry_index, .bytes = xml }}, .{});
    defer a.free(input);
    var s = try @import("hwpx/editor_session.zig").open(a, input, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    var h = try @import("hwpx/editor_history.zig").History.initV2(&s, .{});
    defer h.deinit();
    const before = try @import("hwpx/picture_display_sites.zig").read(a, &s, 0);
    defer a.free(before);
    try t.expectEqual(@as(usize, 2), before.len);
    var serial_buffer: [20]u8 = undefined;
    var owner = try @import("hwpx/picture_replacement_current.zig").observe(a, &s, 0, @intCast(before[0].picture_node), 0, .{ .session = "s1", .serial = try std.fmt.bufPrint(&serial_buffer, "{d}", .{s.mutation_serial}) });
    defer owner.deinit(a);
    const request: contract.Request = .{ .owner = owner, .image = jpeg };
    try t.expect(try h.apply(&s, .{ .kind = .picture_replace, .picture_replace = &request, .section = 0, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "" }));
    const after = try @import("hwpx/picture_display_sites.zig").read(a, &s, 0);
    defer a.free(after);
    const other = try @import("hwpx/picture_source_bytes.zig").read(a, &s, 0, after[1].picture_node, contract.max_image_bytes);
    defer a.free(other);
    try t.expectEqualSlices(u8, png, other);
    const selected = try @import("hwpx/picture_source_bytes.zig").read(a, &s, 0, after[0].picture_node, contract.max_image_bytes);
    defer a.free(selected);
    try t.expectEqualSlices(u8, jpeg, selected);
}
