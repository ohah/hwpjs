//! Immutable caption declarations, not fresh sequence/page evaluation or editing permission.
const std = @import("std");
const Tree = @import("tree.zig").Tree;
const objects = @import("cross_reference_object_target.zig");
const rules = @import("control_rules.zig");
pub const Value = struct {
    header: @import("number_control.zig").Header,
    symbol: u16,
    prefix: u16,
    suffix: u16,
    extra_bytes: usize,
    extra_nonzero: bool,
};
pub const Site = struct { object: objects.Site, caption_numbers: usize = 0, value: ?Value = null };

/// Caller frees the array; all values are scalar and survive tree/source release.
pub fn collect(a: std.mem.Allocator, tree: Tree, section: usize) ![]Site {
    var groups = try @import("list_groups.zig").Groups.build(a, tree);
    defer groups.deinit(a);
    var cursor: @import("list_groups.zig").OwnerCursor = .{ .groups = groups.items };
    var links = try @import("control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    var anchors: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer anchors.deinit(a);
    for (links.items) |link| {
        if (link.header_id != rules.id("atno")) continue;
        if (link.code != 18) return error.UnsupportedAutomaticNumberAnchor;
        const slot = try anchors.getOrPut(a, link.control_node);
        if (slot.found_existing) return error.DuplicateControlBinding;
        slot.value_ptr.* = link.paragraph_node;
    }
    var out: std.ArrayList(Site) = .empty;
    errdefer out.deinit(a);
    for (tree.nodes, 0..) |node, index| {
        if (node.record.value != .control_header or node.record.value.control_header.id != rules.table_id) continue;
        const header = node.record.value.control_header;
        const common = try @import("object_common.zig").Properties.parse(header.properties);
        const lists = try @import("table_lists.zig").Iterator.init(tree, index);
        var site = Site{ .object = .{ .section = section, .record_offset = node.record.framing.offset, .control_id = header.id, .instance_id = common.instance_id } };
        for (cursor.take(index)) |group| {
            if (group.header_node >= lists.table_node) continue;
            const view = try tree.nodes[group.header_node].record.value.list_header.view(.observed8);
            _ = try @import("caption.zig").Caption.parse(view.extra);
            var paragraph = group.begin;
            while (paragraph < group.end) : (paragraph = tree.nodes[paragraph].subtree_end) {
                if (tree.nodes[paragraph].record.value != .header) continue;
                var child = paragraph + 1;
                while (child < tree.nodes[paragraph].subtree_end) : (child = tree.nodes[child].subtree_end) {
                    const value = tree.nodes[child].record.value;
                    if (value != .control_header or value.control_header.id != rules.id("atno")) continue;
                    if ((anchors.get(child) orelse return error.MissingControlBinding) != paragraph) return error.SourceBindingMismatch;
                    const number = try @import("number_control.zig").Auto.parse(value.control_header.properties);
                    var nonzero = false;
                    for (number.extra) |byte| nonzero = nonzero or byte != 0;
                    site.caption_numbers += 1;
                    if (site.value == null) site.value = .{ .header = number.header, .symbol = number.symbol, .prefix = number.prefix, .suffix = number.suffix, .extra_bytes = number.extra.len, .extra_nonzero = nonzero };
                }
            }
        }
        try out.append(a, site);
    }
    return out.toOwnedSlice(a);
}

/// Resolve against ALL object sites first, so an unnumbered duplicate cannot hide.
pub fn storedValue(view: @import("cross_reference_command.zig").View, all_objects: []const objects.Site, sites: []const Site) !Value {
    if (view.external_document != null) return error.UnsupportedExternalCrossReference;
    const semantic = try view.semantics();
    if (semantic.object != .table or semantic.content != .number_or_name) return error.UnsupportedCrossReferenceResultKind;
    const selected = (try objects.resolveCommand(view, all_objects)) orelse return error.UnresolvedCrossReferenceTarget;
    var found: ?Value = null;
    for (sites) |site| {
        if (site.object.section != selected.section or site.object.record_offset != selected.record_offset) continue;
        if (!std.meta.eql(site.object, selected)) return error.SourceBindingMismatch;
        if (site.caption_numbers == 0) return error.MissingCrossReferenceTableNumber;
        if (site.caption_numbers != 1 or found != null) return error.AmbiguousCrossReferenceTableNumber;
        const value = site.value orelse return error.MissingCrossReferenceTableNumber;
        if (value.header.kind() != 4) return error.CrossReferenceNumberKindMismatch;
        found = value;
    }
    return found orelse error.MissingCrossReferenceTableNumber;
}
