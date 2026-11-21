//! Existing PAGE newNum scalar only; never create a control, owner or authority.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const hp = @import("document_xml.zig").paragraph_uri;
pub const Target = struct {
    section: usize,
    control_node: usize,
    paragraph_node: usize,
    number: u16,
    section_digest: [32]u8,
};
pub const Request = @import("../model/page_restart_edit.zig").Request(Target);
fn owner(tree: *const Tree, node: usize) !usize {
    const ctrl = tree.elements[node].parent orelse return error.UnsupportedPageRestartOwner;
    const run = tree.elements[ctrl].parent orelse return error.UnsupportedPageRestartOwner;
    const paragraph = tree.elements[run].parent orelse return error.UnsupportedPageRestartOwner;
    if (!tree.elements[ctrl].is(hp, "ctrl") or !tree.elements[run].is(hp, "run") or !tree.elements[paragraph].is(hp, "p") or tree.elements[paragraph].parent != 0)
        return error.UnsupportedPageRestartOwner;
    if (tree.elements[ctrl].first_child != node or tree.elements[node].next_sibling != null or !@import("element_whitespace_gaps.zig").empty(tree, ctrl)) return error.UnsupportedPageRestartOwner;
    return paragraph;
}
pub fn capture(a: std.mem.Allocator, tree: *const Tree, node: usize) !Target {
    if (tree.part_kind != .section or tree.section_ordinal == null or node >= tree.elements.len or !tree.elements[node].is(hp, "newNum")) return error.MissingPageRestart;
    if (tree.elements[node].first_child != null or !@import("element_whitespace_gaps.zig").empty(tree, node)) return error.UnsupportedPageRestartOwner;
    const paragraph = try owner(tree, node);
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const fields = try @import("number_controls.zig").restartAt(arena.allocator(), arena.allocator(), tree, node);
    const kind = fields.get(.num_type) orelse return error.UnsupportedPageRestartOwner;
    if (!std.mem.eql(u8, std.mem.trim(u8, kind, " \t\r\n"), "PAGE") or fields.other_attributes != 0) return error.UnsupportedPageRestartOwner;
    const number = fields.num orelse return error.InvalidPageRestartNumber;
    if (number < 1 or number > 65535) return error.InvalidPageRestartNumber;
    // Multiple newNum owners in one paragraph require a separate ordering contract.
    for (tree.elements, 0..) |element, index| {
        if (index == node or !element.is(hp, "newNum")) continue;
        const other_ctrl = element.parent orelse continue;
        const other_run = tree.elements[other_ctrl].parent orelse continue;
        if (tree.elements[other_run].parent == paragraph) return error.AmbiguousPageRestart;
    }
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(tree.source, &digest, .{});
    return .{ .section = tree.section_ordinal.?, .control_node = node, .paragraph_node = paragraph, .number = @intCast(number), .section_digest = digest };
}
pub fn write(a: std.mem.Allocator, tree: *const Tree, target: Target, number: u16, max_bytes: usize) !?[]u8 {
    if (number == 0) return error.InvalidPageRestartNumber;
    if (!std.meta.eql(target, try capture(a, tree, target.control_node))) return error.StalePageRestartSnapshot;
    if (number == target.number) return null;
    var buf: [5]u8 = undefined;
    const scalar = try std.fmt.bufPrint(&buf, "{d}", .{number});
    const tag = try @import("xml_scalar_attributes_upsert.zig").write(a, tree, target.control_node, &.{"num"}, .{scalar}, max_bytes);
    defer a.free(tag);
    const span = tree.elements[target.control_node].start_tag;
    return try @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = span.start, .end = span.end, .text = "", .serialized_xml = tag }}, max_bytes);
}

/// Native one-based paragraph ID from authoritative current order.
/// Display packets use a separate zero-based ordinal; never pass that to Session.
pub fn currentParagraph(a: std.mem.Allocator, session: *const @import("editor_session.zig").Session, target: Target) !usize {
    if (target.section >= session.sections.len) return error.InvalidSection;
    const section = &session.sections[target.section];
    if (!std.meta.eql(target, try capture(a, &section.tree, target.control_node))) return error.StalePageRestartSnapshot;
    if (section.first_paragraph == 0) return error.MissingPageRestartOwner;
    var view = try @import("display_current_paragraphs.zig").read(a, section, session.options);
    defer view.deinit(a);
    var selected: ?usize = null;
    for (view.paragraphs, 0..) |paragraph, ordinal| {
        if (paragraph.template_element != target.paragraph_node) continue;
        if (paragraph.source_ordinal == null or paragraph.generated_id != null or paragraph.pieces != null) return error.UnsupportedPageRestartOwner;
        if (selected != null) return error.AmbiguousPageRestartOwner;
        selected = ordinal;
    }
    const ordinal = selected orelse return error.MissingPageRestartOwner;
    return std.math.add(usize, section.first_paragraph, ordinal);
}
