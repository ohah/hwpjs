//! Prepare resource and reference values before committing either owner.
const std = @import("std");
const model = @import("../../model/document.zig");
const Values = @import("paragraph_resource_values.zig").Values;
pub fn apply(a: std.mem.Allocator, document: *model.Document, decoded: []const u8, version: @import("../version.zig").Version, original_count: usize, section: usize, index: usize, alignment: u32, limit: usize) !void {
    return applyWithMargins(a, document, decoded, version, original_count, section, index, alignment, .{}, limit);
}
pub fn applyWithMargins(a: std.mem.Allocator, document: *model.Document, decoded: []const u8, version: @import("../version.zig").Version, original_count: usize, section: usize, index: usize, alignment: ?u32, patch: model.ParagraphMarginPatch, limit: usize) !void {
    return applyWithProperties(a, document, decoded, version, original_count, section, index, alignment, patch, null, limit);
}
pub fn applyWithProperties(a: std.mem.Allocator, document: *model.Document, decoded: []const u8, version: @import("../version.zig").Version, original_count: usize, section: usize, index: usize, alignment: ?u32, patch: model.ParagraphMarginPatch, requested_spacing: ?model.ParagraphSpacing, limit: usize) !void {
    if (alignment) |value| if (value > 5) return error.InvalidParagraphAlignment;
    if (requested_spacing) |value| if (value.kind > 3) return error.InvalidParagraphSpacing;
    if (section >= document.sections.len) return error.InvalidSection;
    if (index >= document.sections[section].paragraphs.len) return error.InvalidParagraph;
    const selected = &document.sections[section].paragraphs[index];
    const borrowed: Values = .{ .entries = .{ .items = document.paragraph_resources, .capacity = document.paragraph_resources.len, .pointer_stability = .{} } };
    const current = try borrowed.write(a, decoded, version, original_count, limit);
    defer a.free(current);
    const shapes = try @import("paragraph_display_shapes.zig").read(a, current, version, original_count + document.paragraph_resources.len);
    defer a.free(shapes);
    if (selected.para_shape_id >= shapes.len) return error.InvalidParagraphShapeReference;
    const current_shape = shapes[selected.para_shape_id];
    const effective_alignment: u32 = alignment orelse current_shape.alignment;
    if (effective_alignment > 5) return error.InvalidParagraphAlignment;
    var unchanged = current_shape.alignment == effective_alignment;
    inline for (@import("../../reflection.zig").fields(model.ParagraphMarginPatch)) |field| if (@field(patch, field.name)) |value| {
        unchanged = unchanged and @field(current_shape, field.name) == value;
    };
    if (requested_spacing) |value| {
        const current_spacing = @import("paragraph_spacing_values.zig").effective(current_shape);
        if (current_shape.modern_spacing == null and value.kind == 3) return error.UnsupportedParagraphSpacing;
        unchanged = unchanged and std.meta.eql(current_spacing, value);
    }
    if (unchanged) return;
    var source_id: u32 = selected.para_shape_id;
    var margins: model.ParagraphMarginPatch = .{};
    var spacing: ?model.ParagraphSpacing = null;
    if (source_id >= original_count) {
        const intent = document.paragraph_resources[source_id - original_count];
        source_id = intent.source_id;
        margins = intent.margins;
        spacing = intent.spacing;
    }
    inline for (@import("../../reflection.zig").fields(model.ParagraphMarginPatch)) |field| if (@field(patch, field.name)) |value| {
        @field(margins, field.name) = value;
    };
    if (requested_spacing) |value| spacing = value;
    var pending = try borrowed.clone(a);
    defer pending.deinit(a);
    const id = try pending.addWithProperties(a, original_count, source_id, effective_alignment, margins, spacing);
    const verified = try pending.write(a, decoded, version, original_count, limit);
    defer a.free(verified);
    const entries = try pending.entries.toOwnedSlice(a);
    a.free(document.paragraph_resources);
    document.paragraph_resources = entries;
    selected.para_shape_id = id;
}

test "HWP5 paragraph alignment apply remains atomic at every allocation failure" {
    const a = std.testing.allocator;
    var input: std.ArrayList(u8) = .empty;
    defer input.deinit(a);
    var mapping: [60]u8 = @splat(0);
    std.mem.writeInt(i32, mapping[52..56], 1, .little);
    try @import("../record_writer.zig").append(a, &input, 17, 0, &mapping, 4096);
    try @import("../record_writer.zig").append(a, &input, 25, 1, &@as([42]u8, @splat(0)), 4096);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, decoded: []const u8) !void {
            var paragraphs = [_]model.Paragraph{.{ .source_node = 0, .parent_node = null, .declared_units = 0, .text_present = false, .para_shape_id = 0, .style_id = 0, .tokens = &.{}, .character_runs = &.{}, .deferred_direct_records = 0 }};
            var sections = [_]model.Section{.{ .paragraphs = &paragraphs, .source_record_count = 1 }};
            var document: model.Document = .{ .format = .hwp5, .sections = &sections };
            defer allocator.free(document.paragraph_resources);
            applyWithMargins(allocator, &document, decoded, .{ .raw = 0x05000000 }, 1, 0, 0, 3, .{ .indent = -2000, .before = 0 }, 4096) catch |err| {
                try std.testing.expectEqual(@as(u16, 0), paragraphs[0].para_shape_id);
                try std.testing.expectEqual(@as(usize, 0), document.paragraph_resources.len);
                return err;
            };
            apply(allocator, &document, decoded, .{ .raw = 0x05000000 }, 1, 0, 0, 2, 4096) catch |err| {
                try std.testing.expectEqual(@as(u16, 1), paragraphs[0].para_shape_id);
                try std.testing.expectEqual(@as(usize, 1), document.paragraph_resources.len);
                try std.testing.expectEqual(@as(u3, 3), document.paragraph_resources[0].alignment);
                try std.testing.expectEqual(@as(?i32, -2000), document.paragraph_resources[0].margins.indent);
                return err;
            };
            apply(allocator, &document, decoded, .{ .raw = 0x05000000 }, 1, 0, 0, 3, 4096) catch |err| {
                try std.testing.expectEqual(@as(u16, 2), paragraphs[0].para_shape_id);
                try std.testing.expectEqual(@as(usize, 2), document.paragraph_resources.len);
                return err;
            };
            try std.testing.expectEqual(@as(u16, 1), paragraphs[0].para_shape_id);
            try std.testing.expectEqual(@as(usize, 2), document.paragraph_resources.len);
            try std.testing.expectEqual(@as(?i32, -2000), document.paragraph_resources[1].margins.indent);
            try std.testing.expectEqual(@as(?i32, 0), document.paragraph_resources[1].margins.before);
            try std.testing.expectError(error.LimitExceeded, apply(allocator, &document, decoded, .{ .raw = 0x05000000 }, 1, 0, 0, 1, 1));
            try std.testing.expectEqual(@as(u16, 1), paragraphs[0].para_shape_id);
            try std.testing.expectEqual(@as(usize, 2), document.paragraph_resources.len);
        }
    }.run, .{input.items});
}
