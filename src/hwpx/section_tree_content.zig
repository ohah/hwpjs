const std = @import("std");
const xml = @import("../xml/root.zig");
const document_xml = @import("document_xml.zig");

/// Raw content borrows the section tree. CDATA delimiters are not included in
/// View.raw; View.toUtf8 performs the common XML decoding when requested.
pub const Event = struct {
    parent_index: usize,
    value: xml.text_content.View,
};

pub const Visitor = struct {
    context: *anyopaque,
    on_content: *const fn (*anyopaque, Event) anyerror!void,
};

/// Replays the common XML parser over the owned source, connecting each text
/// or CDATA run to its exact indexed parent without another retained table.
pub fn visit(a: std.mem.Allocator, tree: anytype, visitor: Visitor) !void {
    const Context = struct {
        allocator: std.mem.Allocator,
        tree: @TypeOf(tree),
        visitor: Visitor,
        next_element: usize = 0,
        stack: std.ArrayList(usize) = .empty,

        fn deinit(self: *@This()) void {
            self.stack.deinit(self.allocator);
        }

        fn matches(self: *const @This(), raw: []const u8, span: anytype) bool {
            const base = @intFromPtr(self.tree.source.ptr);
            const ptr = @intFromPtr(raw.ptr);
            return ptr >= base and ptr - base <= self.tree.source.len and
                raw.len <= self.tree.source.len - (ptr - base) and
                span.start == ptr - base and span.end == ptr - base + raw.len;
        }

        fn onTag(raw: *anyopaque, tag: xml.tags.Tag, _: *const xml.namespaces.State, depth: usize) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            if (tag.kind == .end) {
                if (depth == 0 or depth != self.stack.items.len) return error.InvalidSectionTreeDepth;
                const index = self.stack.pop().?;
                const node = self.tree.elements[index];
                const span = node.end_tag orelse return error.InvalidSourceSpan;
                if (!self.matches(tag.raw, span) or node.end != span.end) return error.InvalidSourceSpan;
                return;
            }
            if (depth != self.stack.items.len + 1 or self.next_element >= self.tree.elements.len) return error.InvalidSectionTreeDepth;
            const index = self.next_element;
            const node = self.tree.elements[index];
            if (!self.matches(tag.raw, node.start_tag)) return error.InvalidSourceSpan;
            if (tag.kind == .empty and (node.end_tag != null or node.end != node.start_tag.end)) return error.InvalidSourceSpan;
            if (tag.kind == .start and node.end_tag == null) return error.InvalidSourceSpan;
            const parent: ?usize = if (self.stack.items.len == 0) null else self.stack.items[self.stack.items.len - 1];
            if (node.parent != parent) return error.InvalidSectionTreeDepth;
            self.next_element += 1;
            if (tag.kind == .start) try self.stack.append(self.allocator, index);
        }

        fn onContent(raw: *anyopaque, value: xml.text_content.View, depth: usize) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            if (depth == 0 or depth != self.stack.items.len) return error.InvalidSectionTreeDepth;
            try self.visitor.on_content(self.visitor.context, .{ .parent_index = self.stack.items[depth - 1], .value = value });
        }
    };
    var context: Context = .{ .allocator = a, .tree = tree, .visitor = visitor };
    defer context.deinit();
    var options = document_xml.Options{};
    options.max_elements = tree.xml_report.elements;
    options.max_events = tree.xml_report.events;
    options.max_attributes = tree.xml_report.attributes;
    options.max_references = tree.xml_report.references;
    options.max_depth = tree.xml_report.max_depth;
    const report = try document_xml.visitBytes(a, tree.source, tree.source.len, options, .{ .context = &context, .on_tag = Context.onTag, .on_content = Context.onContent });
    if (context.next_element != tree.elements.len or context.stack.items.len != 0 or !std.meta.eql(report, tree.xml_report)) return error.InvalidSectionTreeDepth;
}
