//! Explicit observed28 source pair; no clipping or inferred missing defaults.
const std = @import("std");
pub const Source = struct {
    kind: @import("../body/note_control.zig").Kind,
    source_node: usize,
    owner_node: usize,
    flags: u32,
    user_char: u16,
    prefix: u16,
    suffix: u16,
    start_number: u16,
    separator_length: i32,
    above: i16,
    below: i16,
    between: i16,
    line_type: u8,
    line_width: u8,
    color: u32,
    extra_bytes: usize,
    extra_nonzero: bool,
};
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version) ![2]Source {
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    const owner = try @import("../body/section_validation.zig").definitionOwner(tree);
    var values: [2]Source = undefined;
    var count: usize = 0;
    for (tree.nodes, 0..) |node, index| {
        if (node.record.value != .note_shape) continue;
        if (node.parent != owner) return error.OrphanSectionRecord;
        if (count >= 2) return error.ExcessNoteShapes;
        const shape = node.record.value.note_shape;
        var nonzero = false;
        for (shape.extra) |byte| if (byte != 0) {
            nonzero = true;
            break;
        };
        values[count] = .{ .kind = if (count == 0) .footnote else .endnote, .source_node = index, .owner_node = owner, .flags = shape.flags, .user_char = shape.user_char, .prefix = shape.prefix, .suffix = shape.suffix, .start_number = shape.start_number, .separator_length = shape.separator_length, .above = shape.above, .below = shape.below, .between = shape.between, .line_type = shape.line_type, .line_width = shape.line_width, .color = shape.color, .extra_bytes = shape.extra.len, .extra_nonzero = nonzero };
        count += 1;
    }
    if (count != 2) return error.MissingNoteShapes;
    return values;
}
test "HWP5 note shape sources actual signed separator and unchanged allocation failure results" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const expected = try read(a, raw, source.header.version());
    try std.testing.expectEqual(@as(i32, -1), expected[0].separator_length);
    try std.testing.expectEqual(@as(i16, 850), expected[0].above);
    try std.testing.expectEqual(@as(i16, 567), expected[0].below);
    try std.testing.expectEqual(@as(i16, 283), expected[0].between);
    try std.testing.expectEqual(@as(i32, 14692344), expected[1].separator_length);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, values: [2]Source) !void {
            try std.testing.expectEqualDeep(values, try read(allocator, bytes, version));
        }
    }.run, .{ raw, source.header.version(), expected });
}
