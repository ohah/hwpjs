const std = @import("std");
const model = @import("../../model/document.zig");
const resolver = @import("field_paragraph_source.zig");

fn failures(a: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, paragraph: model.Paragraph, expected: usize) !void {
    try std.testing.expectEqual(expected, try resolver.resolve(a, bytes, version, paragraph));
    try std.testing.expect(paragraph.source_node == null);
}

test "generated field ownership accepts validated plain templates but rejects forged original fields and parents under failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwp", a, .limited(2_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.openReadOnly(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
    defer document.deinit(a);
    var generated = document.sections[0].paragraphs[1];
    const template = generated.source_node.?;
    generated.source_node = null;
    generated.header_template = template;
    generated.instance_id = 42;
    generated.deferred_direct_records = 0;
    try @import("../../testing/allocation_failures.zig").check(failures, .{ bytes, source.header.version(), generated, template });
    var invalid = generated;
    invalid.instance_id = 0;
    try std.testing.expectError(error.UnsupportedStructuralControl, resolver.resolve(a, bytes, source.header.version(), invalid));
    invalid = generated;
    invalid.header_template = null;
    try std.testing.expectError(error.MissingParagraphSource, resolver.resolve(a, bytes, source.header.version(), invalid));
    invalid = generated;
    invalid.parent_node = 0;
    try std.testing.expectError(error.SourceBindingMismatch, resolver.resolve(a, bytes, source.header.version(), invalid));
    invalid = generated;
    invalid.header_template = 118;
    try std.testing.expectError(error.SourceBindingMismatch, resolver.resolve(a, bytes, source.header.version(), invalid));
    invalid = generated;
    invalid.header_template = document.sections[0].paragraphs[23].source_node;
    try std.testing.expectError(error.SourceBindingMismatch, resolver.resolve(a, bytes, source.header.version(), invalid));
    invalid.parent_node = document.sections[0].paragraphs[23].parent_node;
    try std.testing.expectError(error.UnsupportedStructuralControl, resolver.resolve(a, bytes, source.header.version(), invalid));
    invalid = generated;
    invalid.tokens = document.sections[0].paragraphs[23].tokens;
    try std.testing.expectError(error.UnsupportedTextControl, resolver.resolve(a, bytes, source.header.version(), invalid));
}
