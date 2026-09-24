const std = @import("std");
const tree_mod = @import("xml_part_tree.zig");
const document_xml = @import("document_xml.zig");
const selection = @import("compatibility_selection.zig");

pub const Kind = enum { other, run, switch_element, branch };
pub const Frame = struct {
    active: bool = true,
    kind: Kind = .other,
    selected: selection.State = .{},
    in_text: bool = false,
};

/// Marks the same run/branch-direct switch scope used by the streaming text
/// scanner. Master-page activity begins only at root-direct hp:subList nodes.
/// The caller owns the returned frames; inactive XML was already syntax-checked
/// while constructing the tree and is not semantically decoded here.
pub fn build(a: std.mem.Allocator, tree: *const tree_mod.Tree, policy: selection.Policy, max_attribute_bytes: usize) ![]Frame {
    try selection.validate(policy);
    if (tree.part_kind != .section and tree.part_kind != .master_page) return error.InvalidPartKind;
    if (tree.elements.len == 0) return error.InvalidPartKind;
    const frames = try a.alloc(Frame, tree.elements.len);
    errdefer a.free(frames);
    frames[0] = .{};
    for (tree.elements[1..], 1..) |element, index| {
        const parent_index = element.parent orelse return error.InvalidSectionTreeDepth;
        if (parent_index >= index) return error.InvalidSectionTreeDepth;
        const parent = frames[parent_index];
        var frame: Frame = .{
            .active = parent.active,
            .in_text = parent.in_text or element.is(document_xml.paragraph_uri, "t"),
        };
        if (tree.part_kind == .master_page and parent_index == 0) {
            frame.active = element.is(document_xml.paragraph_uri, "subList");
        }
        if (frame.active and parent.kind == .switch_element) {
            const is_case = element.is(document_xml.paragraph_uri, "case");
            const is_default = !is_case and element.is(document_xml.paragraph_uri, "default");
            if (is_case or is_default) {
                frame.kind = .branch;
                frame.active = try selection.chooseTree(a, tree, index, is_case, max_attribute_bytes, policy, &frames[parent_index].selected);
            }
        } else if (frame.active and (parent.kind == .run or parent.kind == .branch) and element.is(document_xml.paragraph_uri, "switch")) {
            frame.kind = .switch_element;
        }
        // The streaming scanner treats descendants of hp:t as inline control
        // content, even if one of them has the expanded name hp:run.
        if (frame.active and !parent.in_text and element.is(document_xml.paragraph_uri, "run")) frame.kind = .run;
        frames[index] = frame;
    }
    return frames;
}
