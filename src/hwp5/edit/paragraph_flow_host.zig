//! Logical source list ownership, not guessed from display text.
const Tree = @import("../body/tree.zig").Tree;
const controls = @import("../body/control_rules.zig");
pub const Host = enum { body, table_cell, table_caption, header, footer, footnote, endnote, master_page, drawing, other };
pub const Context = struct { host: Host, list_node: ?usize };
pub fn read(a: @import("std").mem.Allocator, lists: *@import("../body/table_list_index.zig").Index, flows: @import("../body/paragraph_flows.zig").Flows, template: usize) !Context {
    const tree: Tree = lists.tree;
    if (template >= tree.nodes.len or tree.nodes[template].record.value != .header) return error.SourceBindingMismatch;
    const parent = tree.nodes[template].parent orelse return .{ .host = .body, .list_node = null };
    const list = try flows.get(template);
    const owner = tree.nodes[parent];
    if (owner.record.value == .control_header) {
        const id = owner.record.value.control_header.id;
        if (id == controls.table_id) {
            const entry = try lists.get(a, parent, list);
            return .{ .host = if (entry.kind == .cell) .table_cell else .table_caption, .list_node = list };
        }
        const host: Host = if (id == controls.id("head")) .header else if (id == controls.id("foot")) .footer else if (id == controls.id("fn  ")) .footnote else if (id == controls.id("en  ")) .endnote else if (id == controls.section_id) .master_page else if (id == controls.drawing_id) .drawing else .other;
        return .{ .host = host, .list_node = list };
    }
    return .{ .host = if (owner.record.framing.tag == @import("../body/shape_component.zig").tag) .drawing else .other, .list_node = list };
}
