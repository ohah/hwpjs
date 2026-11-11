//! Source-bound form text. XML framing/escaping stays in shared XML modules.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Change = @import("xml_source_writer.zig").Change;
const uri = @import("document_xml.zig").paragraph_uri;
pub const max_units = 65535;
pub const max_bytes = 196605;
pub fn target(tree: *const Tree, node: usize) !usize {
    if (node >= tree.elements.len) return error.InvalidFormNode;
    const kind = @import("run_anchor.zig").kind(tree, node) orelse return error.InvalidFormNode;
    if (kind != .edit_box and kind != .combo_box) return error.NotTextForm;
    var found: ?usize = null;
    var child = tree.elements[node].first_child;
    while (child) |index| {
        const element = tree.elements[index];
        if (element.is(uri, "text")) {
            if (found != null) return error.DuplicateFormText;
            if (element.first_child != null) return error.UnsupportedFormTextContent;
            found = index;
        }
        child = element.next_sibling;
    }
    return found orelse error.MissingFormText;
}
pub fn readValue(a: std.mem.Allocator, tree: *const Tree, node: usize) ![]u8 {
    const Reader = struct {
        a: std.mem.Allocator,
        leaf: usize,
        text: std.ArrayList(u8) = .empty,
        fn content(raw: *anyopaque, event: Tree.ContentEvent) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            if (event.parent_index != self.leaf) return;
            const decoded = try event.value.toUtf8(self.a, max_bytes -| self.text.items.len);
            defer self.a.free(decoded);
            try self.text.appendSlice(self.a, decoded);
        }
    };
    var reader: Reader = .{ .a = a, .leaf = try target(tree, node) };
    defer reader.text.deinit(a);
    try tree.visitContent(a, .{ .context = &reader, .on_content = Reader.content });
    return reader.text.toOwnedSlice(a);
}
pub fn validateValue(a: std.mem.Allocator, tree: *const Tree, node: usize, text: []const u8) !void {
    _ = try target(tree, node);
    if (text.len > max_bytes) return error.LimitExceeded;
    var attrs = try @import("form_attribute_values.zig").read(a, tree, node, .{});
    defer attrs.deinit(a);
    if (attrs.boolean(.enabled) == false or attrs.boolean(.editable) == false) return error.FormValueProtected;
    if (attrs.boolean(.enabled) == null or attrs.boolean(.editable) == null) return error.MissingFormEditPermission;
    if (attrs.kind == .edit_box) {
        if (attrs.boolean(.readOnly) == true) return error.FormValueProtected;
        if (attrs.boolean(.readOnly) == null or attrs.boolean(.numOnly) == null) return error.MissingFormTextMode;
    } else if (attrs.boolean(.editEnable) != true) return error.FormValueProtected;
    var offset: usize = 0;
    var units: usize = 0;
    while (try @import("../text/scalars.zig").read(text, offset, .utf8)) |scalar| {
        units += if (scalar.value > 0xffff) @as(usize, 2) else 1;
        if (units > max_units) return error.LimitExceeded;
        if (attrs.kind == .edit_box) {
            if (attrs.boolean(.numOnly) == true and (scalar.value < '0' or scalar.value > '9')) return error.FormNumberOnly;
            if ((scalar.value == '\r' or scalar.value == '\n') and attrs.boolean(.multiLine) != true) return error.FormSingleLine;
        }
        offset = scalar.end;
    }
    if (attrs.integer(.maxLength)) |limit| if (units > limit) return error.FormTextTooLong;
    const checked = try @import("../xml/text_writer.zig").encode(a, text, max_bytes * 6);
    a.free(checked);
}
pub fn prepare(a: std.mem.Allocator, tree: *const Tree, node: usize, text: []const u8, limit: usize) ![]Change {
    try validateValue(a, tree, node, text);
    var changes: std.ArrayList(Change) = .empty;
    errdefer changes.deinit(a);
    try @import("xml_leaf_text_changes.zig").append(a, tree, try target(tree, node), text, &changes);
    _ = limit;
    return changes.toOwnedSlice(a);
}
