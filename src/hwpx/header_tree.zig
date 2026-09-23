const std = @import("std");
const document_xml = @import("document_xml.zig");
const part_tree = @import("xml_part_tree.zig");

pub const Tree = part_tree.Tree;
pub const Options = struct {
    max_xml_bytes: usize = 32 * 1024 * 1024,
    max_nodes: usize = 2_000_000,
    xml: document_xml.Options = .{},
};

/// Header-specific root and 32 MiB byte policy; no section ordinal is
/// invented for a non-section part.
pub fn parse(a: std.mem.Allocator, bytes: []const u8, item_index: usize, options: Options) !Tree {
    return part_tree.parse(a, bytes, .header, null, item_index, .{
        .max_xml_bytes = options.max_xml_bytes,
        .max_nodes = options.max_nodes,
        .xml = options.xml,
    });
}
