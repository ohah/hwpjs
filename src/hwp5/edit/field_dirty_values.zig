//! Prepare owned field attributes without mutating the document or source.
const std = @import("std");
const model = @import("../../model/document.zig");
const controls = @import("../body/control_rules.zig");
pub const Edit = struct { paragraph: usize, start: u32, end: u32 };

pub fn prepare(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: model.Section, owner_paragraph: usize, edit: Edit) ![]model.FieldAttributes {
    if (owner_paragraph >= section.paragraphs.len or edit.paragraph >= section.paragraphs.len) return error.InvalidParagraph;
    if (edit.start > edit.end) return error.InvalidTextRange;
    const bound = try @import("field_bindings.zig").collect(a, source, version, section);
    defer a.free(bound);
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, source, version, .{});
    defer tree.deinit(a);
    const ownership = @import("paragraph_owner.zig");
    var groups = try ownership.inspectGroups(a, tree, version);
    defer groups.deinit(a);
    const target_owner = try ownership.logicalOwner(tree, groups, try section.paragraphs[edit.paragraph].originalNode());
    const field_owner = try ownership.logicalOwner(tree, groups, try section.paragraphs[owner_paragraph].originalNode());
    var rows: std.ArrayList(model.FieldAttributes) = .empty;
    errdefer rows.deinit(a);
    for (bound) |binding| {
        const span = binding.span;
        if (span.begin.paragraph != owner_paragraph or @import("field_result_protection.zig").isDerivedResult(span.field_id)) continue;
        var attributes = binding.properties.attributes;
        if (section.paragraphs[owner_paragraph].field_attributes) |previous| {
            attributes = @import("field_attributes.zig").find(previous, binding.source_node) orelse return error.SourceBindingMismatch;
        }
        if (target_owner == field_owner and edit.paragraph >= span.begin.paragraph and edit.paragraph <= span.end.paragraph) {
            const begin = if (edit.paragraph == span.begin.paragraph) span.begin.unit else 0;
            const end = if (edit.paragraph == span.end.paragraph) span.end.unit else std.math.maxInt(u32);
            const touched = if (edit.start == edit.end) edit.start >= begin and edit.start <= end else edit.start < end and edit.end > begin;
            if (touched) attributes |= @import("../body/field_start.zig").modified_mask;
        }
        try rows.append(a, .{ .source_node = binding.source_node, .attributes = attributes });
    }
    std.mem.sort(model.FieldAttributes, rows.items, {}, lessThan);
    if (section.paragraphs[owner_paragraph].field_attributes) |previous| {
        if (previous.len != rows.items.len) return error.SourceBindingMismatch;
        for (previous, rows.items) |old, row| if (old.source_node != row.source_node) return error.SourceBindingMismatch;
    }
    return rows.toOwnedSlice(a);
}

fn lessThan(_: void, left: model.FieldAttributes, right: model.FieldAttributes) bool {
    return left.source_node < right.source_node;
}

test "field dirty values preserve outside edits and mark cross paragraph owner with allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwp", a, .limited(2_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var doc = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
    defer doc.deinit(a);
    try std.testing.checkAllAllocationFailures(a, allocationCase, .{ bytes, source.header.version(), doc.sections[0] });
}

fn allocationCase(a: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, section: model.Section) !void {
    const bound = try @import("field_bindings.zig").collect(a, bytes, version, section);
    defer a.free(bound);
    const outside = try prepare(a, bytes, version, section, 0, .{ .paragraph = 0, .start = 0, .end = 0 });
    defer a.free(outside);
    try std.testing.expectEqual(@as(usize, 1), outside.len);
    try std.testing.expectEqual(bound[0].properties.attributes, outside[0].attributes);
    const inside = try prepare(a, bytes, version, section, 1, .{ .paragraph = 2, .start = 0, .end = 0 });
    defer a.free(inside);
    try std.testing.expectEqual(@as(usize, 1), inside.len);
    try std.testing.expectEqual(bound[1].properties.attributes | @import("../body/field_start.zig").modified_mask, inside[0].attributes);
    outside[0].attributes |= 0x40000000;
    const ps = try a.dupe(model.Paragraph, section.paragraphs);
    defer a.free(ps);
    ps[0].field_attributes = outside;
    var pending = section;
    pending.paragraphs = ps;
    const preserved = try prepare(a, bytes, version, pending, 0, .{ .paragraph = 0, .start = 0, .end = 0 });
    defer a.free(preserved);
    try std.testing.expectEqual(outside[0].attributes, preserved[0].attributes);
    try std.testing.expect(section.paragraphs[0].field_attributes == null);
    try std.testing.expect(section.paragraphs[1].field_attributes == null);
}

test "reference click field dirty values set only modified bit in memory" {
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
    const selected = bound[0];
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, bytes, source.header.version(), .{});
    defer tree.deinit(a);
    const offset = @intFromPtr(tree.nodes[selected.source_node].record.framing.payload.ptr) - @intFromPtr(bytes.ptr) + 4;
    const changed = try a.dupe(u8, bytes);
    defer a.free(changed);
    const clean = selected.properties.attributes & ~@import("../body/field_start.zig").modified_mask;
    std.mem.writeInt(u32, changed[offset..][0..4], clean, .little);
    const values = try prepare(a, changed, source.header.version(), doc.sections[0], selected.span.begin.paragraph, .{ .paragraph = selected.span.end.paragraph, .start = selected.span.end.unit, .end = selected.span.end.unit });
    defer a.free(values);
    const value = @import("field_attributes.zig").find(values, selected.source_node) orelse return error.TestExpectedEqual;
    try std.testing.expectEqual(clean | @import("../body/field_start.zig").modified_mask, value);
    try std.testing.expectEqual(clean, std.mem.readInt(u32, changed[offset..][0..4], .little));
    try std.testing.expect(doc.sections[0].paragraphs[selected.span.begin.paragraph].field_attributes == null);
}

test "original bookmark field binding and dirty values preserve source and reject wrong end ID" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/추진일정.hwp", a, .limited(16_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var doc = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
    defer doc.deinit(a);
    const bindings = try @import("field_bindings.zig").collect(a, bytes, source.header.version(), doc.sections[0]);
    defer a.free(bindings);
    try std.testing.expectEqual(@as(usize, 1), bindings.len);
    const selected = bindings[0];
    try std.testing.expectEqual(controls.id("%bmk"), selected.span.field_id);
    try std.testing.expectEqual(@as(u32, 32), selected.span.begin.unit);
    try std.testing.expectEqual(@as(u32, 39), selected.span.end.unit);
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, bytes, source.header.version(), .{});
    defer tree.deinit(a);
    const offset = @intFromPtr(tree.nodes[selected.source_node].record.framing.payload.ptr) - @intFromPtr(bytes.ptr) + 4;
    const changed = try a.dupe(u8, bytes);
    defer a.free(changed);
    const clean = selected.properties.attributes & ~@import("../body/field_start.zig").modified_mask;
    std.mem.writeInt(u32, changed[offset..][0..4], clean, .little);
    const paragraph = selected.span.begin.paragraph;
    const outside = try prepare(a, changed, source.header.version(), doc.sections[0], paragraph, .{ .paragraph = paragraph, .start = 0, .end = 0 });
    defer a.free(outside);
    try std.testing.expectEqual(clean, outside[0].attributes);
    const inside = try prepare(a, changed, source.header.version(), doc.sections[0], paragraph, .{ .paragraph = paragraph, .start = 32, .end = 32 });
    defer a.free(inside);
    try std.testing.expectEqual(clean | @import("../body/field_start.zig").modified_mask, inside[0].attributes);
    try std.testing.expectEqual(clean, std.mem.readInt(u32, changed[offset..][0..4], .little));
    try std.testing.expect(doc.sections[0].paragraphs[paragraph].field_attributes == null);
    try std.testing.checkAllAllocationFailures(a, bookmarkAllocationCase, .{ changed, source.header.version(), doc.sections[0], paragraph });
    const token = for (doc.sections[0].paragraphs[paragraph].tokens) |token| {
        if (token.kind == .control and token.start_unit == 39) break token;
    } else return error.TestExpectedEqual;
    const original_end = std.mem.readInt(u32, token.raw[2..6], .little);
    std.mem.writeInt(u32, token.raw[2..6], 0x09626d6b, .little);
    defer std.mem.writeInt(u32, token.raw[2..6], original_end, .little);
    try std.testing.expectError(error.FieldMarkerMismatch, @import("field_bindings.zig").collect(a, changed, source.header.version(), doc.sections[0]));
}

fn bookmarkAllocationCase(a: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, section: model.Section, paragraph: usize) !void {
    const values = try prepare(a, bytes, version, section, paragraph, .{ .paragraph = paragraph, .start = 32, .end = 39 });
    defer a.free(values);
    try std.testing.expectEqual(@as(usize, 1), values.len);
    try std.testing.expect(values[0].attributes & @import("../body/field_start.zig").modified_mask != 0);
}
