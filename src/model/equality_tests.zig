const std = @import("std");
const model = @import("document.zig");
const equality = @import("equality.zig");

test "model equality observes all metadata owned values null empty and floating bits" {
    const a = std.testing.allocator;
    var raw = [_]u8{ 65, 0, 13, 0 };
    var tokens = [_]model.Token{.{ .start_unit = 0, .kind = .text, .encoding = .utf16le, .raw = &raw }};
    var runs = [_]model.CharacterRun{.{ .start_unit = 0, .char_shape_id = 1 }};
    var ranges = [_]model.TextRange{.{ .start_unit = 0, .end_unit = 1, .tag = 2 }};
    var fields = [_]model.FieldAttributes{.{ .source_node = 3, .attributes = 0 }};
    var results = [_]model.FormulaResult{.{ .source_node = 4, .value = 0.0, .grouping = .none }};
    var paragraphs = [_]model.Paragraph{.{ .source_node = 1, .parent_node = null, .declared_units = 2, .text_present = true, .para_shape_id = 0, .style_id = 0, .tokens = &tokens, .character_runs = &runs, .range_tags = &ranges, .field_attributes = &fields, .formula_results = &results, .deferred_direct_records = 0 }};
    var sections = [_]model.Section{.{ .paragraphs = &paragraphs, .source_record_count = 5 }};
    const before: model.Document = .{ .format = .hwp5, .sections = &sections };
    var copies = [_]model.Section{try @import("clone.zig").section(a, sections[0])};
    defer copies[0].deinit(a);
    const after: model.Document = .{ .format = .hwp5, .sections = &copies };
    try std.testing.expect(equality.document(before, after));
    const p = &copies[0].paragraphs[0];
    inline for (std.meta.fields(model.Paragraph)) |field| {
        switch (@typeInfo(field.type)) {
            .int => {
                const saved = @field(p, field.name);
                @field(p, field.name) ^= 1;
                try std.testing.expect(!equality.document(before, after));
                @field(p, field.name) = saved;
            },
            .bool => {
                @field(p, field.name) = !@field(p, field.name);
                try std.testing.expect(!equality.document(before, after));
                @field(p, field.name) = !@field(p, field.name);
            },
            .optional => |optional| switch (@typeInfo(optional.child)) {
                .int => {
                    const saved = @field(p, field.name);
                    @field(p, field.name) = if (saved == null) 0 else null;
                    try std.testing.expect(!equality.document(before, after));
                    @field(p, field.name) = saved;
                },
                else => {},
            },
            else => {},
        }
    }
    p.tokens[0].raw[0] = 66;
    try std.testing.expect(!equality.document(before, after));
    p.tokens[0].raw[0] = 65;
    p.tokens[0].start_unit = 1;
    try std.testing.expect(!equality.document(before, after));
    p.tokens[0].start_unit = 0;
    p.character_runs[0].char_shape_id = 2;
    try std.testing.expect(!equality.document(before, after));
    p.character_runs[0].char_shape_id = 1;
    p.range_tags.?[0].tag = 3;
    try std.testing.expect(!equality.document(before, after));
    p.range_tags.?[0].tag = 2;
    p.field_attributes.?[0].attributes = 0x8000;
    try std.testing.expect(!equality.document(before, after));
    p.field_attributes.?[0].attributes = 0;
    p.formula_results.?[0].modified = true;
    try std.testing.expect(!equality.document(before, after));
    p.formula_results.?[0].modified = false;
    p.formula_results.?[0].value = @bitCast(@as(u64, 0x8000000000000000));
    try std.testing.expect(!equality.document(before, after));
    results[0].value = @bitCast(@as(u64, 0x7ff8000000000001));
    p.formula_results.?[0].value = results[0].value;
    try std.testing.expect(equality.document(before, after));
    p.formula_results.?[0].value = @bitCast(@as(u64, 0x7ff8000000000002));
    try std.testing.expect(!equality.document(before, after));
    p.formula_results.?[0].value = results[0].value;
    const owned = p.range_tags;
    p.range_tags = null;
    paragraphs[0].range_tags = ranges[0..0];
    try std.testing.expect(!equality.document(before, after));
    p.range_tags = owned;
    paragraphs[0].range_tags = &ranges;
    try std.testing.expect(equality.document(before, after));
}
