//! Authoritative pending checkbox scalars. Never stores a mutable XML cache.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const writer = @import("form_checkbox_state_write.zig");
pub const Entry = struct { form_node: usize, state: writer.State };
pub const Values = std.ArrayList(Entry);
fn original(a: std.mem.Allocator, tree: *const Tree, node: usize) !writer.State {
    var value = try @import("form_attribute_values.zig").read(a, tree, node, .{});
    defer value.deinit(a);
    if (value.kind != .check_button) return error.NotCheckBoxForm;
    return (try value.buttonState()) orelse error.MissingFormState;
}
fn entry(values: *const Values, node: usize) !?usize {
    var found: ?usize = null;
    for (values.items, 0..) |value, index| if (value.form_node == node) {
        if (found != null) return error.DuplicateFormStateEdit;
        found = index;
    };
    return found;
}
pub fn read(a: std.mem.Allocator, tree: *const Tree, values: *const Values, node: usize) !writer.State {
    const source = try original(a, tree, node);
    return if (try entry(values, node)) |index| values.items[index].state else source;
}
pub fn set(a: std.mem.Allocator, tree: *const Tree, values: *Values, node: usize, state: writer.State, limit: usize) !bool {
    const validated = try writer.write(a, tree, node, state, limit);
    defer a.free(validated);
    const source = try original(a, tree, node);
    const index = try entry(values, node);
    const current = if (index) |at| values.items[at].state else source;
    if (current == state) return false;
    if (index) |at| {
        if (source == state) _ = values.orderedRemove(at) else values.items[at].state = state;
    } else {
        if (values.items.len >= 100000) return error.LimitExceeded;
        try values.append(a, .{ .form_node = node, .state = state });
    }
    return true;
}
