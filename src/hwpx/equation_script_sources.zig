//! Immutable source addresses and structural availability, not math validation.
const std = @import("std");
const editor = @import("editor_session.zig");
const uri = @import("document_xml.zig").paragraph_uri;
pub const Issue = enum { inactive, inline_text_descendant, unsupported_encoding, missing_script, multiple_scripts, nested_script };
pub const Site = struct {
    node: usize,
    active: bool,
    script_count: usize,
    script_node: ?usize,
    issue: ?Issue,
};

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section: usize) ![]Site {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const tree = &session.sections[section].tree;
    const policy = editor.siteOptions(session.options);
    const frames = try @import("xml_tree_selection.zig").build(a, tree, policy.branch_policy, policy.max_attribute_bytes);
    defer a.free(frames);
    var output: std.ArrayList(Site) = .empty;
    defer output.deinit(a);
    for (tree.elements, 0..) |element, node| {
        if (@import("run_anchor.zig").kind(tree, node) != .equation) continue;
        if (output.items.len >= (@import("equation.zig").Options{}).max_equations) return error.LimitExceeded;
        var count: usize = 0;
        var first: ?usize = null;
        var nested = false;
        var child = element.first_child;
        while (child) |index| {
            const item = tree.elements[index];
            if (item.is(uri, "script")) {
                count += 1;
                if (first == null) first = index;
                nested = nested or item.first_child != null;
            }
            child = item.next_sibling;
        }
        const issue: ?Issue = if (frames[node].in_text) .inline_text_descendant else if (!frames[node].active) .inactive else if (element.name.local.encoding != .utf8) .unsupported_encoding else if (count == 0) .missing_script else if (count != 1) .multiple_scripts else if (nested) .nested_script else null;
        try output.append(a, .{ .node = node, .active = frames[node].active, .script_count = count, .script_node = first, .issue = issue });
    }
    return output.toOwnedSlice(a);
}
