const std = @import("std");
const Session = @import("style_preservation.zig").Session;
const History = @import("editor_history.zig").History;

test "reference click Session saves full CFB reopens and restores undo redo bytes" {
    const a = std.testing.allocator;
    const input = std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue1891/80250_regulatory_analysis.hwpx", a, .limited(16_000_000)) catch |err| switch (err) {
        error.FileNotFound => return error.SkipZigTest,
        else => return err,
    };
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var doc = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
    defer doc.deinit(a);
    const bound = try @import("field_bindings.zig").collect(a, bytes, source.header.version(), doc.sections[0]);
    defer a.free(bound);
    const selected = bound[0].span.begin;
    const editor = try Session.open(a, input);
    defer editor.close();
    var history = try History.init(a, editor, 2, 64_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(editor, .{ .splice_text = .{ .section = 0, .paragraph = selected.paragraph, .start_unit = selected.unit, .end_unit = selected.unit, .utf8 = "검증" } }));
    const current = try editor.copyText(a, 0, selected.paragraph);
    defer a.free(current);
    const saved = try editor.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try Session.open(a, saved.bytes);
    defer reopened.close();
    const recovered = try reopened.copyText(a, 0, selected.paragraph);
    defer a.free(recovered);
    try std.testing.expectEqualSlices(u8, current, recovered);
    try std.testing.expect(try history.undo(editor));
    const original = try editor.save(a, .{});
    defer a.free(original.bytes);
    try std.testing.expectEqualSlices(u8, input, original.bytes);
    try std.testing.expect(!try history.apply(editor, .{ .splice_text = .{ .section = 0, .paragraph = selected.paragraph, .start_unit = selected.unit, .end_unit = selected.unit, .utf8 = "" } }));
    const commands = [_]@import("style_preservation.zig").Command{
        .{ .splice_text = .{ .section = 0, .paragraph = selected.paragraph, .start_unit = selected.unit, .end_unit = selected.unit, .utf8 = "롤백" } },
        .{ .splice_text = .{ .section = 9999, .paragraph = 0, .start_unit = 0, .end_unit = 0, .utf8 = "오류" } },
    };
    try std.testing.expectError(error.InvalidSection, history.applyBatch(editor, &commands));
    const rolled_back = try editor.save(a, .{});
    defer a.free(rolled_back.bytes);
    try std.testing.expectEqualSlices(u8, input, rolled_back.bytes);
    try std.testing.expect(try history.redo(editor));
    const redone = try editor.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}

test "reference click Session character formatting retains text and whole history" {
    const a = std.testing.allocator;
    const input = std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue1891/80250_regulatory_analysis.hwpx", a, .limited(16_000_000)) catch |err| switch (err) {
        error.FileNotFound => return error.SkipZigTest,
        else => return err,
    };
    defer a.free(input);
    const editor = try Session.open(a, input);
    defer editor.close();
    var before: []u8 = undefined;
    var paragraph: usize = 0;
    var selected: ?u32 = null;
    while (paragraph < try editor.paragraphCount(0)) : (paragraph += 1) {
        const candidate = try editor.copyText(a, 0, paragraph);
        var tokens = (try @import("../body/text.zig").Text.parse(candidate)).tokens();
        while (try tokens.next()) |token| {
            if (token.value == .text and token.raw.len != 0) {
                selected = @intCast(token.start_unit);
                break;
            }
        }
        if (selected != null) {
            before = candidate;
            break;
        }
        a.free(candidate);
    }
    const unit = selected orelse return error.TestExpectedEqual;
    defer a.free(before);
    var history = try History.init(a, editor, 2, 64_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(editor, .{ .set_character_format = .{ .section = 0, .paragraph = paragraph, .start_unit = unit, .end_unit = unit + 1, .char_shape_id = 0 } }));
    const saved = try editor.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try Session.open(a, saved.bytes);
    defer reopened.close();
    const recovered = try reopened.copyText(a, 0, paragraph);
    defer a.free(recovered);
    try std.testing.expectEqualSlices(u8, before, recovered);
    try std.testing.expect(try history.undo(editor));
    const original = try editor.save(a, .{});
    defer a.free(original.bytes);
    try std.testing.expectEqualSlices(u8, input, original.bytes);
    try std.testing.expect(try history.redo(editor));
    const redone = try editor.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}
