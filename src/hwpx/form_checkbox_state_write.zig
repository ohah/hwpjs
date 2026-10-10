//! Checkbox state source write only. No script execution or radio-group policy.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const attributes = @import("form_attribute_values.zig");
pub const State = attributes.ButtonState;
fn equal(a: std.mem.Allocator, raw: @import("../xml/attribute_value.zig").Value, state: State) !bool {
    const text = try raw.toUtf8(a, 65536);
    defer a.free(text);
    return std.mem.eql(u8, text, attributes.stateText(state));
}
fn serialize(a: std.mem.Allocator, quote: u8, state: State) ![]u8 {
    return std.fmt.allocPrint(a, "{c}{s}{c}", .{ quote, attributes.stateText(state), quote });
}
pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, state: State, limit: usize) ![]u8 {
    if (tree.source.len > limit) return error.LimitExceeded;
    var value = try attributes.read(a, tree, node, .{});
    defer value.deinit(a);
    if (value.kind != .check_button) return error.NotCheckBoxForm;
    if (value.boolean(.enabled) == false or value.boolean(.editable) == false) return error.FormValueProtected;
    if (value.boolean(.enabled) == null or value.boolean(.editable) == null) return error.MissingFormEditPermission;
    _ = try value.buttonState();
    if (state == .indeterminate and value.boolean(.triState) != true) return error.FormTriStateUnsupported;
    const tag = @import("xml_bound_attributes_write.zig").write(a, tree, node, &.{"value"}, State, .{state}, equal, serialize, limit) catch |err| switch (err) {
        error.MissingXmlAttribute => return error.MissingFormState,
        else => return err,
    };
    defer a.free(tag);
    const span = tree.elements[node].start_tag;
    return @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = span.start, .end = span.end, .text = "", .serialized_xml = tag }}, limit);
}
