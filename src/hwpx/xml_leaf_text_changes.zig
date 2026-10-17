//! Prepare direct leaf text edits, keeping intervening comments/PI untouched.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Change = @import("xml_source_writer.zig").Change;

pub fn append(a: std.mem.Allocator, tree: *const Tree, node: usize, replacement: []const u8, changes: *std.ArrayList(Change)) !void {
    if ((try @import("../xml/encoding.zig").select(tree.source, null)).encoding != .utf8) return error.UnsupportedXmlEncoding;
    if (node >= tree.elements.len or tree.elements[node].first_child != null) return error.InvalidSourceSpan;
    const Context = struct {
        allocator: std.mem.Allocator,
        tree: *const Tree,
        node: usize,
        replacement: []const u8,
        changes: *std.ArrayList(Change),
        found: bool = false,
        fn onContent(raw: *anyopaque, event: Tree.ContentEvent) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            if (event.parent_index != self.node) return;
            const base = @intFromPtr(self.tree.source.ptr);
            const pointer = @intFromPtr(event.value.raw.ptr);
            if (pointer < base or pointer - base > self.tree.source.len) return error.InvalidSourceSpan;
            var start = pointer - base;
            if (event.value.raw.len > self.tree.source.len - start) return error.InvalidSourceSpan;
            var end = start + event.value.raw.len;
            if (event.value.kind == .cdata) {
                if (start < 9 or self.tree.source.len - end < 3) return error.InvalidSourceSpan;
                start -= 9;
                end += 3;
                if (!std.mem.eql(u8, self.tree.source[start..][0..9], "<![CDATA[") or !std.mem.eql(u8, self.tree.source[end - 3 .. end], "]]>")) return error.InvalidSourceSpan;
            }
            try self.changes.append(self.allocator, .{ .start = start, .end = end, .text = if (self.found) "" else self.replacement });
            self.found = true;
        }
    };
    var context: Context = .{ .allocator = a, .tree = tree, .node = node, .replacement = replacement, .changes = changes };
    try tree.visitContent(a, .{ .context = &context, .on_content = Context.onContent });
    if (!context.found) {
        const element = tree.elements[node];
        try changes.append(a, if (element.end_tag != null)
            .{ .start = element.start_tag.end, .end = element.start_tag.end, .text = replacement }
        else
            .{ .start = element.start_tag.start, .end = element.start_tag.end, .text = replacement, .expand_empty_element = true });
    }
}
