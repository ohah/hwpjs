//! Bounded, read-only HWP5 paragraph-token preview. Not a document model.
const std = @import("std");
const Cfb = @import("../cfb/reader.zig").File;
const observed_repairs = @import("../cfb/observed_repairs.zig");
const Header = @import("file_header.zig").Header;
const docinfo = @import("docinfo/reader.zig");
const Tree = @import("body/tree.zig").Tree;
const children = @import("body/paragraph_children.zig");
const stream = @import("stream.zig");

const max_input = 64 * 1024 * 1024;
const max_stream = 32 * 1024 * 1024;
const max_output = 64 * 1024 * 1024;
const max_sections = 1024;

/// H5T1 + version + section count; section(index,count);
/// paragraph(node,parent,declared units,text-present,count);
/// token(kind,start UTF-16 unit,raw byte length,raw bytes). All integers little-endian u32.
/// The caller owns the returned bytes. Unknown records remain in the source file, not here.
pub fn encode(backing: std.mem.Allocator, input: []const u8) ![]u8 {
    var arena = std.heap.ArenaAllocator.init(backing);
    defer arena.deinit();
    const a = arena.allocator();
    var file = try openCfb(backing, input);
    defer file.deinit();
    const header = try Header.parse(try file.readStream(a, "/FileHeader"));
    try @import("feature_policy.zig").requireSupported(&header, .reject);
    const info = try stream.decode(a, &header, try file.readStream(a, "/DocInfo"), max_stream);
    const section_count = try sectionCount(info, header.version());
    if (section_count == 0 or section_count > max_sections) return error.InvalidSectionCount;
    const body_index = try file.findExact("/BodyText") orelse return error.StreamNotFound;
    if (file.entries[body_index].kind != 1) return error.NotAStorage;
    var found: usize = 0;
    for (file.entries) |entry| {
        if (entry.parent != body_index or entry.kind != 2) continue;
        const index = (try @import("container/numbered_stream.zig").index(u16, "Section", entry.name)) orelse return error.UnexpectedBodyStream;
        if (index >= section_count) return error.SectionCountMismatch;
        found += 1;
    }
    if (found != section_count) return error.SectionCountMismatch;

    var out: std.ArrayList(u8) = .empty;
    try append(a, &out, "H5T1");
    try word(a, &out, header.version().raw);
    try word(a, &out, section_count);
    for (0..section_count) |section_index| {
        var section_arena = std.heap.ArenaAllocator.init(backing);
        defer section_arena.deinit();
        const section_allocator = section_arena.allocator();
        const path = try std.fmt.allocPrint(a, "/BodyText/Section{d}", .{section_index});
        const raw = try file.readStream(a, path);
        const decoded = try stream.decode(section_allocator, &header, raw, max_stream);
        var tree = try Tree.parse(section_allocator, decoded, header.version(), .{});
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

fn openCfb(a: std.mem.Allocator, input: []const u8) !Cfb {
    const limits: @import("../cfb/reader.zig").Options = .{ .strict = true, .max_input_bytes = max_input, .max_stream_bytes = max_stream, .max_total_stream_bytes = max_input };
    return Cfb.open(a, input, limits) catch |strict_err| switch (strict_err) {
        error.InvalidRoot, error.InvalidFat, error.InvalidUnusedEntry, error.UnclaimedMiniSector => {
            const repaired = observed_repairs.open(a, input, limits) catch |repair_err| switch (repair_err) {
                error.OutOfMemory, error.LimitExceeded => return repair_err,
                else => return strict_err,
            };
            return repaired.file;
        },
        else => return strict_err,
    };
}

fn sectionCount(bytes: []const u8, version: @import("version.zig").Version) !u16 {
    var it = try docinfo.Iterator.init(bytes, version, .{});
    var count: ?u16 = null;
    while (try it.next()) |record| {
        if (record.value != .properties) continue;
        if (count != null) return error.DuplicateDocumentProperties;
        count = record.value.properties.section_count;
    }
    return count orelse error.MissingDocumentProperties;
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
