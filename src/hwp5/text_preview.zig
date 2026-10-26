//! Bounded, read-only HWP5 paragraph-token preview. Not a document model.
const std = @import("std");
const Source = @import("text_source.zig").Source;
const Tree = @import("body/tree.zig").Tree;
const children = @import("body/paragraph_children.zig");

const wire = @import("text_preview_wire.zig");
const append = wire.append;
const word = wire.word;
const cast = wire.cast;

/// H5T1 + version + section count; section(index,count);
/// paragraph(node,parent,declared units,text-present,count);
/// token(kind,start UTF-16 unit,raw byte length,raw bytes). All integers little-endian u32.
/// The caller owns the returned bytes. Unknown records remain in the source file, not here.
pub fn encode(backing: std.mem.Allocator, input: []const u8) ![]u8 {
    return (try encodeDetailed(backing, input)).bytes;
}

pub const Encoded = struct { bytes: []u8, distribution: bool, declared_sections: u16 };
pub fn encodeDetailed(backing: std.mem.Allocator, input: []const u8) !Encoded {
    var source = try Source.openReadOnly(backing, input);
    defer source.deinit();
    return encodeSource(backing, &source);
}

pub fn encodeAvailableDetailed(backing: std.mem.Allocator, input: []const u8) !Encoded {
    var source = try Source.openAvailableReadOnly(backing, input);
    defer source.deinit();
    return encodeSource(backing, &source);
}

fn encodeSource(backing: std.mem.Allocator, source: *const Source) !Encoded {
    var arena = std.heap.ArenaAllocator.init(backing);
    defer arena.deinit();
    const a = arena.allocator();

    var out: std.ArrayList(u8) = .empty;
    try append(a, &out, "H5T1");
    try word(a, &out, source.header.version().raw);
    try word(a, &out, source.section_count);
    for (0..source.section_count) |section_index| {
        var section_arena = std.heap.ArenaAllocator.init(backing);
        defer section_arena.deinit();
        const section_allocator = section_arena.allocator();
        const decoded = try source.decodeSection(section_allocator, section_index);
        var tree = try Tree.parseTextPreview(section_allocator, decoded, source.header.version(), .{});
        defer tree.deinit(section_allocator);
        try word(a, &out, @intCast(section_index));
        const count_pos = out.items.len;
        try word(a, &out, 0);
        var count: u32 = 0;
        for (tree.nodes, 0..) |node, node_index| {
            if (node.record.value != .header) continue;
            const header_record = node.record.value.header;
            const parts = try children.collect(tree, node_index);
            try word(a, &out, try cast(node_index));
            try word(a, &out, if (node.parent) |parent| try cast(parent) else std.math.maxInt(u32));
            try word(a, &out, header_record.characterUnits());
            try word(a, &out, @intFromBool(parts.text_node != null));
            const tokens_pos = out.items.len;
            try word(a, &out, 0);
            var token_count: u32 = 0;
            if (parts.text_node) |text_node| {
                const value = tree.nodes[text_node].record.value.text;
                try value.validateCount(header_record);
                var tokens = value.tokens();
                while (try tokens.next()) |token| {
                    try word(a, &out, if (token.value == .control) 1 else 0);
                    try word(a, &out, try cast(token.start_unit));
                    try word(a, &out, try cast(token.raw.len));
                    try append(a, &out, token.raw);
                    token_count = try std.math.add(u32, token_count, 1);
                }
            }
            std.mem.writeInt(u32, out.items[tokens_pos..][0..4], token_count, .little);
            count = try std.math.add(u32, count, 1);
        }
        std.mem.writeInt(u32, out.items[count_pos..][0..4], count, .little);
    }
    return .{ .bytes = try backing.dupe(u8, out.items), .distribution = source.header.has(.distribution), .declared_sections = source.declared_section_count };
}
