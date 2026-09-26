const std = @import("std");
const part_tree = @import("xml_part_tree.zig");
const Budget = @import("equation_fields.zig").Budget;
const ShapeChild = @import("equation_shape.zig").Child;

const Builder = struct {
    shape_child_index: usize,
    content: std.ArrayList(u8) = .empty,
};

/// Captures direct text/CDATA of shapeComment, not descendant element text.
/// The original XML remains available on the owning shape child.
pub const Capture = struct {
    temp_a: std.mem.Allocator,
    owned_a: std.mem.Allocator,
    indices: std.AutoHashMapUnmanaged(usize, usize) = .empty,
    builders: std.ArrayList(Builder) = .empty,
    max_comment_bytes: usize,
    budget: *Budget,
    total_bytes: *usize,

    pub fn deinit(self: *Capture) void {
        self.indices.deinit(self.temp_a);
    }

    pub fn register(self: *Capture, element_index: usize, shape_child_index: usize) !void {
        try self.builders.append(self.owned_a, .{ .shape_child_index = shape_child_index });
        try self.indices.put(self.temp_a, element_index, self.builders.items.len - 1);
    }

    pub fn onContent(self: *Capture, event: part_tree.Tree.ContentEvent) !void {
        const index = self.indices.get(event.parent_index) orelse return;
        const builder = &self.builders.items[index];
        const remaining = @min(self.max_comment_bytes -| builder.content.items.len, self.budget.max -| self.budget.used);
        const decoded = try event.value.toUtf8(self.temp_a, remaining);
        defer self.temp_a.free(decoded);
        if (decoded.len > remaining) return error.LimitExceeded;
        try self.budget.note(decoded.len);
        try builder.content.appendSlice(self.owned_a, decoded);
        self.total_bytes.* += decoded.len;
    }

    pub fn finish(self: *Capture, children: []ShapeChild) !void {
        for (self.builders.items) |*builder| {
            children[builder.shape_child_index].comment_value = try builder.content.toOwnedSlice(self.owned_a);
        }
    }
};
