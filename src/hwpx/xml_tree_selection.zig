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
    const Context = struct {
        allocator: std.mem.Allocator,
        tree: *const tree_mod.Tree,
        frames: []Frame,
        policy: selection.Policy,
        max_attribute_bytes: usize,
        fn ignore(_: *anyopaque, _: @import("xml_part_content.zig").OrderedEvent) anyerror!void {}
        fn open(raw: *anyopaque, index: usize, tag: @import("../xml/root.zig").tags.Tag, scope: *const @import("../xml/root.zig").namespaces.State) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            if (index == 0) {
                self.frames[0] = .{};
                return;
            }
            const element = self.tree.elements[index];
            const parent_index = element.parent orelse return error.InvalidSectionTreeDepth;
            if (parent_index >= index) return error.InvalidSectionTreeDepth;
            const parent = self.frames[parent_index];
            var frame: Frame = .{
                .active = parent.active,
                .in_text = parent.in_text or element.is(document_xml.paragraph_uri, "t"),
            };
            if (self.tree.part_kind == .master_page and parent_index == 0) {
                frame.active = element.is(document_xml.paragraph_uri, "subList");
            }
            if (frame.active and parent.kind == .switch_element) {
                const is_case = element.is(document_xml.paragraph_uri, "case");
                const is_default = !is_case and element.is(document_xml.paragraph_uri, "default");
                if (is_case or is_default) {
                    frame.kind = .branch;
                    // Reuse the exact policy against the current parser scope;
                    // no per-case replay of the indexed ancestor prefix.
                    frame.active = try selection.choose(self.allocator, tag, scope, is_case, self.max_attribute_bytes, self.policy, &self.frames[parent_index].selected);
                }
            } else if (frame.active and (parent.kind == .run or parent.kind == .branch) and element.is(document_xml.paragraph_uri, "switch")) {
                frame.kind = .switch_element;
            }
            if (frame.active and !parent.in_text and element.is(document_xml.paragraph_uri, "run")) frame.kind = .run;
            self.frames[index] = frame;
        }
    };
    var context: Context = .{ .allocator = a, .tree = tree, .frames = frames, .policy = policy, .max_attribute_bytes = max_attribute_bytes };
    try tree.visitOrdered(a, .{ .context = &context, .on_event = Context.ignore, .on_open_tag = Context.open });
    return frames;
}
