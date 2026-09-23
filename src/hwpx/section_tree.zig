const std = @import("std");
const part_tree = @import("xml_part_tree.zig");

pub const Tree = part_tree.Tree;
pub const Options = part_tree.Options;
pub const Element = part_tree.Element;
pub const Span = part_tree.Span;

/// Section-specific root and ordinal policy; indexing and XML replay are
/// shared with the header part through xml_part_tree.zig.
pub fn parse(a: std.mem.Allocator, bytes: []const u8, section_ordinal: usize, item_index: usize, options: Options) !Tree {
    return part_tree.parse(a, bytes, .section, section_ordinal, item_index, options);
}
