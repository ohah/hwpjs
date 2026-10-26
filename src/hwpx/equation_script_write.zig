//! Immutable equation-script source writing; Session/history integration is separate.
const std = @import("std");
const trees = @import("xml_part_tree.zig");
const uri = @import("document_xml.zig").paragraph_uri;
const Change = @import("xml_source_writer.zig").Change;
pub const Options = struct {
    max_script_bytes: usize = (@import("equation.zig").Options{}).max_script_bytes,
    max_output_bytes: usize = 128 * 1024 * 1024,
    selection: @import("compatibility_selection.zig").Policy = .{ .mode = .selected },
};

fn read(a: std.mem.Allocator, tree: *const trees.Tree, leaf: usize, limit: usize) ![]u8 {
    const Reader = struct {
        a: std.mem.Allocator,
        leaf: usize,
        limit: usize,
        text: std.ArrayList(u8) = .empty,
        fn content(raw: *anyopaque, event: trees.Tree.ContentEvent) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            if (event.parent_index != self.leaf) return;
            const remaining = self.limit -| self.text.items.len;
            const decoded = try event.value.toUtf8(self.a, remaining);
            defer self.a.free(decoded);
            if (decoded.len > remaining) return error.LimitExceeded;
            try self.text.appendSlice(self.a, decoded);
        }
    };
    var reader: Reader = .{ .a = a, .leaf = leaf, .limit = limit };
    defer reader.text.deinit(a);
    try tree.visitContent(a, .{ .context = &reader, .on_content = Reader.content });
    return reader.text.toOwnedSlice(a);
}

/// Validated, unique direct script identity shared by reads and writes.
pub fn target(a: std.mem.Allocator, tree: *const trees.Tree, equation: usize, options: Options) !usize {
    if (tree.part_kind != .section or @import("run_anchor.zig").kind(tree, equation) != .equation) return error.InvalidEquationNode;
    if (tree.elements[equation].name.local.encoding != .utf8) return error.UnsupportedEditEncoding;
    if (options.selection.mode != .selected) return error.InvalidEquationSelection;
    const frames = try @import("xml_tree_selection.zig").build(a, tree, options.selection, 4096);
    defer a.free(frames);
    if (!frames[equation].active or frames[equation].in_text) return error.InactiveEquationNode;
    var leaf: ?usize = null;
    var child = tree.elements[equation].first_child;
    while (child) |index| {
        const element = tree.elements[index];
        if (element.is(uri, "script")) {
            if (leaf != null) return error.DuplicateEquationScript;
            if (element.first_child != null) return error.InvalidEquationScriptChild;
            leaf = index;
        }
        child = element.next_sibling;
    }
    return leaf orelse error.MissingEquationScript;
}

pub fn validateValue(a: std.mem.Allocator, value: []const u8, options: Options) !void {
    if (value.len > options.max_script_bytes) return error.LimitExceeded;
    const encoded = try @import("../xml/text_writer.zig").encode(a, value, options.max_output_bytes);
    defer a.free(encoded);
}

/// Caller owns the normalized original script, never an editable XML cache.
pub fn readValue(a: std.mem.Allocator, tree: *const trees.Tree, equation: usize, options: Options) ![]u8 {
    return read(a, tree, try target(a, tree, equation, options), options.max_script_bytes);
}

/// Returns owned XML, leaving the tree and all non-script source bytes intact.
/// Does not interpret math syntax or recalculate baseline/size/version fields.
pub fn write(a: std.mem.Allocator, tree: *const trees.Tree, equation: usize, value: []const u8, options: Options) ![]u8 {
    const changes = try prepare(a, tree, equation, value, options);
    defer a.free(changes);
    return @import("xml_source_writer.zig").write(a, tree.source, changes, options.max_output_bytes);
}

/// Owned change list borrowing value; keep value alive through serialization.
pub fn prepare(a: std.mem.Allocator, tree: *const trees.Tree, equation: usize, value: []const u8, options: Options) ![]Change {
    const leaf = try target(a, tree, equation, options);
    try validateValue(a, value, options);
    const current = try read(a, tree, leaf, options.max_script_bytes);
    defer a.free(current);
    if (std.mem.eql(u8, current, value)) {
        return a.alloc(Change, 0);
    }
    var changes: std.ArrayList(Change) = .empty;
    defer changes.deinit(a);
    try @import("xml_leaf_text_changes.zig").append(a, tree, leaf, value, &changes);
    return changes.toOwnedSlice(a);
}
