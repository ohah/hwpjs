const std = @import("std");
const anchors = @import("created_table_anchor.zig");
const model = @import("../../model/document.zig");

test "HWP5 table anchor rejects scalar control and ambiguous provenance boundaries" {
    const a = std.testing.allocator;
    var text = [_]u8{ 0x3d, 0xd8, 0, 0xde, 13, 0 };
    var tokens = [_]model.Token{.{ .start_unit = 0, .kind = .text, .encoding = .utf16le, .raw = &text }};
    var paragraphs = [_]model.Paragraph{.{ .source_node = 0, .parent_node = null, .declared_units = 3, .text_present = true, .para_shape_id = 0, .style_id = 0, .tokens = &tokens, .character_runs = &.{}, .deferred_direct_records = 0 }};
    var section: model.Section = .{ .paragraphs = &paragraphs, .source_record_count = 20 };
    _ = try anchors.capture(a, &section, 0, 0);
    _ = try anchors.capture(a, &section, 0, 2);
    try std.testing.expectError(error.SplitSurrogatePair, anchors.capture(a, &section, 0, 1));
    try std.testing.expectError(error.InvalidTextPosition, anchors.capture(a, &section, 0, 3));
    try std.testing.expectError(error.InvalidParagraph, anchors.capture(a, &section, 1, 0));
    try std.testing.expectError(error.MissingParagraphSource, anchors.resolve(a, &section, .{ .host = .{ .original_node = 19 }, .unit = 0 }));
    var control = [_]u8{ 9, 0, 0xa0, 0x0f, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 9, 0, 13, 0 };
    tokens[0].raw = &control;
    _ = try anchors.capture(a, &section, 0, 0);
    _ = try anchors.capture(a, &section, 0, 8);
    for (1..8) |unit| try std.testing.expectError(error.SplitControlToken, anchors.capture(a, &section, 0, @intCast(unit)));
    tokens[0].encoding = .utf8;
    try std.testing.expectError(error.SourceBindingMismatch, anchors.capture(a, &section, 0, 0));
    tokens[0].encoding = .utf16le;
    paragraphs[0].source_node = 20;
    try std.testing.expectError(error.SourceBindingMismatch, anchors.capture(a, &section, 0, 0));
    paragraphs[0].source_node = 0;
    paragraphs[0].header_template = 0;
    try std.testing.expectError(error.SourceBindingMismatch, anchors.capture(a, &section, 0, 0));
    paragraphs[0].source_node = null;
    try std.testing.expectError(error.SourceBindingMismatch, anchors.capture(a, &section, 0, 0));
    paragraphs[0].instance_id = 7;
    paragraphs[0].header_template = 20;
    try std.testing.expectError(error.SourceBindingMismatch, anchors.capture(a, &section, 0, 0));
    paragraphs[0].header_template = 0;
    const generated = try anchors.capture(a, &section, 0, 0);
    var duplicates = [_]model.Paragraph{ paragraphs[0], paragraphs[0] };
    section.paragraphs = &duplicates;
    try std.testing.expectError(error.SourceBindingMismatch, anchors.resolve(a, &section, generated));
    try std.testing.expectError(error.SourceBindingMismatch, anchors.resolve(a, &section, .{ .host = .{ .generated_instance = 0 }, .unit = 0 }));
}

test "HWP5 table anchor follows actual original and generated paragraphs after split" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const info = try source.decodeDocInfo(a, 4_000_000);
    defer a.free(info);
    const counts = try @import("../docinfo/resources.zig").inspect(info, source.header.version(), .{});
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer document.deinit(a);
    const original = try anchors.capture(a, &document.sections[0], 2, 0);
    try @import("structure_session.zig").split(a, &.{raw}, &document, source.header.version(), .{ .section = 0, .paragraph = 1, .at_unit = 0 }, counts.count(.char_shape), 4_000_000);
    try std.testing.expectEqual(@as(usize, 3), try anchors.resolve(a, &document.sections[0], original));
    const generated = try anchors.capture(a, &document.sections[0], 2, 0);
    try std.testing.expect(generated.host == .generated_instance);
    try std.testing.expectEqual(@as(usize, 2), try anchors.resolve(a, &document.sections[0], generated));
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, section: *const model.Section, anchor: anchors.Anchor) !void {
            try std.testing.expectEqual(@as(usize, 2), try anchors.resolve(allocator, section, anchor));
        }
    }.run, .{ &document.sections[0], generated });
    // Generated IDs must not alias even an original paragraph's serialized ID.
    document.sections[0].paragraphs[0].instance_id = generated.host.generated_instance;
    try std.testing.expectError(error.SourceBindingMismatch, anchors.resolve(a, &document.sections[0], generated));
}
