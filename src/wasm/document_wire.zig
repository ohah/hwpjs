const std = @import("std");
const Reader = @import("../binary/reader.zig").Reader;
const writer = @import("../cfb/writer.zig");
const schema = @import("abi_schema.zig").document;
const put = @import("../cfb/writer_directory.zig").put;
const h = @import("../cfb/header.zig");
pub const Document = struct { version: u16, nodes: []writer.Node };

/// Arena-owned nodes, borrowing bytes; discard the arena on failure.
pub fn decode(a: std.mem.Allocator, bytes: []const u8) !Document {
    var r: Reader = .{ .bytes = bytes };
    const version = try r.readInt(u32);
    if (version != 3 and version != 4) return error.UnsupportedVersion;
    const count = try r.readInt(u32);
    if (count == 0 or count > 1_000_000 or count > (bytes.len - r.offset) / schema.node_bytes) return error.InvalidDocument;
    const nodes = try a.alloc(writer.Node, count);
    for (nodes) |*node| {
        const data = try r.take(schema.node_bytes);
        const kind = try h.int(u32, data, schema.kind);
        if (kind > 255 or try h.int(u32, data, schema.reserved) != 0) return error.InvalidDocument;
        const name = try r.take(try h.int(u32, data, schema.name_len));
        const content = try r.take(try h.int(u32, data, schema.content_len));
        node.* = .{ .name = name, .content = content, .kind = @intCast(kind), .parent = try h.int(u32, data, schema.parent), .state = try h.int(u32, data, schema.state), .created = try h.int(u64, data, schema.created), .modified = try h.int(u64, data, schema.modified), .clsid = data[schema.clsid..][0..16].* };
    }
    if (r.offset != bytes.len) return error.InvalidDocument;
    return .{ .version = @intCast(version), .nodes = nodes };
}

pub fn encode(a: std.mem.Allocator, file: *const @import("../cfb/reader.zig").File) ![]u8 {
    const nodes = try file.toNodes(a);
    defer a.free(nodes);
    var size: usize = schema.header_bytes;
    for (nodes) |entry| {
        size = try std.math.add(usize, size, schema.node_bytes);
        size = try std.math.add(usize, size, entry.name.len);
        size = try std.math.add(usize, size, entry.content.len);
    }
    const out = try a.alloc(u8, size);
    @memset(out, 0);
    put(u32, out, 0, file.header.major);
    put(u32, out, 4, @intCast(nodes.len));
    var offset: usize = schema.header_bytes;
    for (nodes) |entry| {
        const raw = out[offset..][0..schema.node_bytes];
        put(u32, raw, schema.parent, entry.parent);
        put(u32, raw, schema.kind, entry.kind);
        put(u32, raw, schema.state, entry.state);
        put(u64, raw, schema.created, entry.created);
        put(u64, raw, schema.modified, entry.modified);
        @memcpy(raw[schema.clsid..][0..16], &entry.clsid);
        put(u32, raw, schema.name_len, @intCast(entry.name.len));
        put(u32, raw, schema.content_len, @intCast(entry.content.len));
        offset += schema.node_bytes;
        @memcpy(out[offset..][0..entry.name.len], entry.name);
        offset += entry.name.len;
        @memcpy(out[offset..][0..entry.content.len], entry.content);
        offset += entry.content.len;
    }
    return out;
}

fn allocationFailure(a: std.mem.Allocator) !void {
    const nodes = [_]writer.Node{ .{ .name = "Root Entry", .kind = 5 }, .{ .name = "Data", .parent = 0, .content = "hello" } };
    const bytes = try writer.write(a, &nodes, .{});
    defer a.free(bytes);
    var file = try @import("../cfb/reader.zig").File.open(a, bytes, .{ .strict = true });
    defer file.deinit();
    const wire = try encode(a, &file);
    defer a.free(wire);
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const document = try decode(arena.allocator(), wire);
    const output = try writer.write(a, document.nodes, .{ .version = document.version });
    defer a.free(output);
    try std.testing.expectEqualSlices(u8, bytes, output);
}

test "document bridge preserves ownership under every allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, allocationFailure, .{});
}
