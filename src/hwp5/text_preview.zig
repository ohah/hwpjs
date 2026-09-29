//! Bounded, read-only HWP5 paragraph-token preview. Not a document model.
const std = @import("std");
const Source = @import("text_source.zig").Source;
const Tree = @import("body/tree.zig").Tree;
const children = @import("body/paragraph_children.zig");

const max_output = 64 * 1024 * 1024;

/// H5T1 + version + section count; section(index,count);
/// paragraph(node,parent,declared units,text-present,count);
/// token(kind,start UTF-16 unit,raw byte length,raw bytes). All integers little-endian u32.
/// The caller owns the returned bytes. Unknown records remain in the source file, not here.
pub fn encode(backing: std.mem.Allocator, input: []const u8) ![]u8 {
    var arena = std.heap.ArenaAllocator.init(backing);
    defer arena.deinit();
    const a = arena.allocator();
    var source = try Source.open(backing, input);
    defer source.deinit();

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
    return backing.dupe(u8, out.items);
}

fn cast(value: usize) !u32 {
    return std.math.cast(u32, value) orelse error.LimitExceeded;
}
fn word(a: std.mem.Allocator, out: *std.ArrayList(u8), value: u32) !void {
    var bytes: [4]u8 = undefined;
    std.mem.writeInt(u32, &bytes, value, .little);
    try append(a, out, &bytes);
}
fn append(a: std.mem.Allocator, out: *std.ArrayList(u8), bytes: []const u8) !void {
    if (bytes.len > max_output - out.items.len) return error.LimitExceeded;
    try out.appendSlice(a, bytes);
}
