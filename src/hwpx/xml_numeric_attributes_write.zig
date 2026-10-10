//! Compatibility adapter; generic source surgery has one implementation.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
pub fn write(a: std.mem.Allocator, tree: *const Tree, node: usize, comptime names: []const []const u8, comptime Value: type, values: [names.len]Value, comptime equal: anytype, comptime serialize: anytype, max_bytes: usize) ![]u8 {
    return @import("xml_bound_attributes_write.zig").write(a, tree, node, names, Value, values, equal, serialize, max_bytes) catch |err| switch (err) {
        error.MissingXmlAttribute => error.MissingXmlNumericAttribute,
        else => err,
    };
}
