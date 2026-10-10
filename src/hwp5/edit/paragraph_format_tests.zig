const std = @import("std");
const edit = @import("style_preservation.zig");

test "HWP5 paragraph display session matches fixture raw resource fields and owns snapshot" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    const session = try edit.Session.open(a, bytes);
    defer session.close();
    const shapes = try session.paragraphShapes(a);
    defer a.free(shapes);
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const encoded = try source.file.readStream(a, "/DocInfo");
    const decoded = try @import("../stream.zig").decode(a, &source.header, encoded, 4_000_000);
    defer a.free(decoded);
    var iterator = @import("../record.zig").Iterator.init(decoded, .{});
    var count: usize = 0;
    while (try iterator.next()) |record| {
        if (record.tag != 25) continue;
        const raw = record.payload;
        const shape = shapes[count];
        try std.testing.expectEqual(@as(u32, @intCast(count)), shape.id);
        try std.testing.expectEqual(@as(u3, @truncate(std.mem.readInt(u32, raw[0..4], .little) >> 2)), shape.alignment);
        const values = [_]i32{ shape.left, shape.right, shape.indent, shape.before, shape.after, shape.legacy_spacing };
        for (values, 0..) |value, index| try std.testing.expectEqual(std.mem.readInt(i32, raw[4 + index * 4 ..][0..4], .little), value);
        if (shape.modern_spacing) |spacing| {
            try std.testing.expectEqual(std.mem.readInt(u32, raw[46..50], .little), spacing.attributes);
            try std.testing.expectEqual(std.mem.readInt(i32, raw[50..54], .little), spacing.value);
        }
        count += 1;
    }
    try std.testing.expectEqual(session.paragraphShapeCount(), count);
    try std.testing.expectEqual(count, shapes.len);
    const original = shapes[0];
    shapes[0].left = 123456;
    const fresh = try session.paragraphShapes(a);
    defer a.free(fresh);
    try std.testing.expectEqualDeep(original, fresh[0]);
    const saved = try session.save(a, .{});
    defer a.free(saved.bytes);
    try std.testing.expectEqualSlices(u8, bytes, saved.bytes);
}

test "HWP5 paragraph format changes only source reference and preserves history on refusal" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    const session = try edit.Session.open(a, bytes);
    defer session.close();
    const count = session.paragraphShapeCount();
    try std.testing.expect(count > 1);
    const before = try session.paragraphShapeId(0, 1);
    const next: u32 = if (before == 0) 1 else 0;
    var history = try @import("editor_history.zig").History.init(a, session, 8, 4_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(session, .{ .set_paragraph_format = .{ .section = 0, .paragraph = 1, .para_shape_id = next } }));
    try std.testing.expectEqual(next, try session.paragraphShapeId(0, 1));
    try std.testing.expectError(error.LayoutReflowRequired, session.save(a, .{}));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    try std.testing.expectEqual(next, try reopened.paragraphShapeId(0, 1));
    var original_source = try @import("../text_source.zig").Source.open(a, bytes);
    defer original_source.deinit();
    var saved_source = try @import("../text_source.zig").Source.open(a, saved.bytes);
    defer saved_source.deinit();
    const raw = try original_source.decodeSection(a, 0);
    defer a.free(raw);
    const output = try saved_source.decodeSection(a, 0);
    defer a.free(output);
    var iterator = @import("../record.zig").Iterator.init(raw, .{});
    var paragraph: usize = 0;
    var offset: ?usize = null;
    while (try iterator.next()) |record| if (record.tag == 66) {
        if (paragraph == 1) offset = record.offset + record.raw.len - record.payload.len + @import("../body/paragraph_header.zig").Header.para_shape_id_offset;
        paragraph += 1;
    };
    const at = offset orelse return error.MissingParagraph;
    try std.testing.expectEqualSlices(u8, raw[0..at], output[0..at]);
    try std.testing.expectEqualSlices(u8, raw[at + 2 ..], output[at + 2 ..]);
    try std.testing.expect(try history.undo(session));
    try std.testing.expectError(error.InvalidParagraphShapeReference, history.apply(session, .{ .set_paragraph_format = .{ .section = 0, .paragraph = 1, .para_shape_id = @intCast(count) } }));
    try std.testing.expectError(error.InvalidParagraphShapeReference, session.apply(.{ .set_paragraph_format = .{ .section = 0, .paragraph = 1, .para_shape_id = 65536 } }));
    try std.testing.expectError(error.InvalidParagraph, session.apply(.{ .set_paragraph_format = .{ .section = 0, .paragraph = 99999, .para_shape_id = next } }));
    try std.testing.expectError(error.InvalidSection, session.apply(.{ .set_paragraph_format = .{ .section = 99999, .paragraph = 1, .para_shape_id = next } }));
    try std.testing.expect(!try history.apply(session, .{ .set_paragraph_format = .{ .section = 0, .paragraph = 1, .para_shape_id = before } }));
    const restored = try session.save(a, .{});
    defer a.free(restored.bytes);
    try std.testing.expectEqualSlices(u8, bytes, restored.bytes);
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
    try session.apply(.{ .split_paragraph = .{ .section = 0, .paragraph = 1, .at_unit = 0 } });
    try std.testing.expectEqual(next, try session.paragraphShapeId(0, 2));
    const split_saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(split_saved.bytes);
    const split_reopened = try edit.Session.open(a, split_saved.bytes);
    defer split_reopened.close();
    try std.testing.expectEqual(next, try split_reopened.paragraphShapeId(0, 1));
    try std.testing.expectEqual(next, try split_reopened.paragraphShapeId(0, 2));
}
