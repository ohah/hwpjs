//! Derive XML output from authoritative current text and immutable source.
//! Original decoded text is reconstructed transiently, never a mutable cache.
const std = @import("std");
const tree_module = @import("xml_part_tree.zig");
const sites_module = @import("text_sites.zig");
const writer = @import("xml_source_writer.zig");
pub const FieldDirty = struct { element_index: usize, dirty: bool };

/// One shared source-binding and text-change contract for flat/nested saves.
pub fn siteChange(tree: *const tree_module.Tree, before: sites_module.Site, after: sites_module.Site) !?writer.Change {
    if (before.element_index != after.element_index or before.start != after.start or before.end != after.end or before.empty_element != after.empty_element or before.missing_text != after.missing_text or before.anchor_boundary != after.anchor_boundary) return error.InvalidTextSites;
    if (before.element_index >= tree.elements.len or before.start > before.end or before.end > tree.source.len) return error.InvalidTextSites;
    if (std.mem.eql(u8, before.text, after.text)) return null;
    return .{ .start = before.start, .end = before.end, .text = after.text, .expand_empty_element = before.empty_element, .run_opening = if (before.missing_text) tree.elements[before.element_index].start_tag else null };
}

pub fn write(a: std.mem.Allocator, tree: *const tree_module.Tree, current: *const sites_module.Sites, options: sites_module.Options, max_output_bytes: usize) ![]u8 {
    return writeWithFieldDirty(a, tree, current, options, &.{}, max_output_bytes);
}

pub fn writeWithFieldDirty(a: std.mem.Allocator, tree: *const tree_module.Tree, current: *const sites_module.Sites, options: sites_module.Options, fields: []const FieldDirty, max_output_bytes: usize) ![]u8 {
    return writeWithChanges(a, tree, current, options, fields, &.{}, max_output_bytes);
}

/// Extra changes must be prepared against this same immutable tree. They
/// borrow their text until return; the common writer rejects overlaps.
pub fn writeWithChanges(a: std.mem.Allocator, tree: *const tree_module.Tree, current: *const sites_module.Sites, options: sites_module.Options, fields: []const FieldDirty, extra: []const writer.Change, max_output_bytes: usize) ![]u8 {
    var original = try sites_module.collect(a, tree, options);
    defer original.deinit(a);
    if (original.items.len != current.items.len) return error.InvalidTextSites;
    var changes: std.ArrayList(writer.Change) = .empty;
    defer changes.deinit(a);
    try changes.appendSlice(a, extra);
    var tags: std.ArrayList([]u8) = .empty;
    defer {
        for (tags.items) |tag| a.free(tag);
        tags.deinit(a);
    }
    var seen: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer seen.deinit(a);
    for (fields) |field| {
        if ((try seen.getOrPut(a, field.element_index)).found_existing) return error.DuplicateFieldDirty;
        const tag = try @import("field_dirty_tag.zig").write(a, tree, field.element_index, field.dirty, max_output_bytes);
        tags.append(a, tag) catch |err| {
            a.free(tag);
            return err;
        };
        const span = tree.elements[field.element_index].start_tag;
        if (!std.mem.eql(u8, tag, tree.source[span.start..span.end])) try changes.append(a, .{ .start = span.start, .end = span.end, .text = "", .start_tag = tag });
    }
    var total: usize = 0;
    for (original.items, current.items) |before, after| {
        if (after.text.len > options.max_text_bytes -| total) return error.LimitExceeded;
        total += after.text.len;
        if (try siteChange(tree, before, after)) |change| try changes.append(a, change);
    }
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, left: writer.Change, right: writer.Change) bool {
            return left.start < right.start;
        }
    }.less);
    return writer.write(a, tree.source, changes.items, max_output_bytes);
}
