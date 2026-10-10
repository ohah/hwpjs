//! Character attribute source surgery only; callers own value semantics.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;

pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, comptime name: []const u8, value: []const u8, limit: usize) ![]u8 {
    comptime {
        if (!std.mem.eql(u8, name, "textColor") and !std.mem.eql(u8, name, "shadeColor")) @compileError("Unreviewed character attribute");
    }
    const fragment = tree.sourceOf(node);
    if (fragment.len > limit) return error.LimitExceeded;
    const attribute = try tree.attributeValue(a, node, "", name);
    const replacement = if (attribute) |raw| try std.fmt.allocPrint(a, "{c}{s}{c}", .{ raw.raw[0], value, raw.raw[0] }) else try std.fmt.allocPrint(a, " {s}=\"{s}\"", .{ name, value });
    defer a.free(replacement);
    const start = if (attribute) |raw| @intFromPtr(raw.raw.ptr) - @intFromPtr(fragment.ptr) else tree.elements[node].start_tag.end - tree.elements[node].start_tag.start - (if (tree.elements[node].end_tag == null) @as(usize, 2) else @as(usize, 1));
    return @import("xml_source_writer.zig").write(a, fragment, &.{.{ .start = start, .end = start + if (attribute) |raw| raw.raw.len else @as(usize, 0), .text = "", .serialized_xml = replacement }}, limit);
}
