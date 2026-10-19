//! Apply authoritative continuation flow intent after structural composition.
//! This module never stores a second editable XML cache.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const model = @import("paragraph_structure_values.zig");
const Kind = @import("../model/paragraph_break.zig").Kind;
const writer = @import("xml_source_writer.zig");

pub fn flags(kind: Kind) [2]bool {
    return .{ kind == .page, kind == .column };
}

pub fn hasIntent(current: *const model.Values) bool {
    for (current.paragraphs) |paragraph| if (paragraph.break_before != null) return true;
    return false;
}

fn id(a: std.mem.Allocator, tree: *const Tree, node: usize) !?u32 {
    const raw = (try tree.attributeValue(a, node, "", "id")) orelse return null;
    return try @import("table_xml_fields.zig").unsigned(a, raw, 4096);
}

pub fn write(a: std.mem.Allocator, original: *const Tree, current: *const model.Values, serialized: []const u8, limit: usize) ![]u8 {
    const Target = struct { kind: Kind, seen: bool = false };
    var targets: std.AutoHashMapUnmanaged(u32, Target) = .empty;
    defer targets.deinit(a);
    const namespace = @import("document_xml.zig");
    for (current.paragraphs) |paragraph| if (paragraph.break_before) |kind| {
        const generated_id = paragraph.generated_id orelse return error.SourceBindingMismatch;
        if (generated_id == 0 or paragraph.source_ordinal != null or paragraph.template_element >= original.elements.len) return error.SourceBindingMismatch;
        const element = original.elements[paragraph.template_element];
        const parent = element.parent orelse return error.UnsupportedParagraphBreakOwner;
        if (!element.is(namespace.paragraph_uri, "p") or parent >= paragraph.template_element or !original.elements[parent].is(namespace.section_uri, "sec")) return error.UnsupportedParagraphBreakOwner;
        const target = try targets.getOrPut(a, generated_id);
        if (target.found_existing) return error.SourceBindingMismatch;
        target.value_ptr.* = .{ .kind = kind };
    };
    // A generated intent must never accidentally target an immutable source ID.
    for (original.elements, 0..) |element, node| {
        if (!element.is(namespace.paragraph_uri, "p")) continue;
        if (try id(a, original, node)) |source_id| if (targets.contains(source_id)) return error.SourceBindingMismatch;
    }
    var tree = try @import("xml_part_tree.zig").parse(a, serialized, original.part_kind, original.section_ordinal, original.item_index, .{ .max_xml_bytes = limit });
    defer tree.deinit(a);
    var changes: std.ArrayList(writer.Change) = .empty;
    defer changes.deinit(a);
    var tags: std.ArrayList([]u8) = .empty;
    defer {
        for (tags.items) |tag| a.free(tag);
        tags.deinit(a);
    }
    for (tree.elements, 0..) |element, node| {
        if (!element.is(namespace.paragraph_uri, "p")) continue;
        const generated_id = (try id(a, &tree, node)) orelse continue;
        const target = targets.getPtr(generated_id) orelse continue;
        if (target.seen) return error.SourceBindingMismatch;
        const parent = element.parent orelse return error.UnsupportedParagraphBreakOwner;
        if (parent >= node or !tree.elements[parent].is(namespace.section_uri, "sec")) return error.UnsupportedParagraphBreakOwner;
        const tag = try @import("xml_boolean_attributes_write.zig").write(a, &tree, node, &.{ "pageBreak", "columnBreak" }, flags(target.kind), limit);
        tags.append(a, tag) catch |err| {
            a.free(tag);
            return err;
        };
        try changes.append(a, .{ .start = element.start_tag.start, .end = element.start_tag.end, .text = "", .start_tag = tag });
        target.seen = true;
    }
    var iterator = targets.valueIterator();
    while (iterator.next()) |target| if (!target.seen) return error.SourceBindingMismatch;
    return writer.write(a, serialized, changes.items, limit);
}
