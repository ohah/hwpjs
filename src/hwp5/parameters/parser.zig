const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const string = @import("../utf16_string.zig");
pub const types = @import("types.zig");
pub const Options = types.Options;
pub const Node = types.Node;
/// Owns a preorder node index only; wire bytes and strings borrow the input.
pub const Document = struct {
    nodes: []Node,
    consumed: usize,
    extra: []const u8,
    pub fn deinit(self: *Document, a: std.mem.Allocator) void {
        a.free(self.nodes);
        self.* = undefined;
    }
    pub fn parse(a: std.mem.Allocator, bytes: []const u8, options: Options) !Document {
        try options.validate();
        var p: Parser = .{ .a = a, .r = .{ .bytes = bytes }, .options = options };
        errdefer p.nodes.deinit(a);
        try p.node(null, null, false, 0);
        return .{ .nodes = try p.nodes.toOwnedSlice(a), .consumed = p.r.offset, .extra = bytes[p.r.offset..] };
    }
};
const Parser = struct {
    a: std.mem.Allocator,
    r: Reader,
    options: Options,
    nodes: std.ArrayList(Node) = .empty,
    fn count(self: *Parser) !u16 {
        const n = try self.r.readInt(i16);
        if (n < 0) return error.NegativeParameterCount;
        return @intCast(n);
    }
    fn node(self: *Parser, parent: ?usize, inherited_id: ?u16, id_on_wire: bool, depth: u8) anyerror!void {
        if (depth > self.options.max_depth) return error.ParameterDepthLimit;
        if (self.nodes.items.len >= self.options.max_nodes) return error.ParameterNodeLimit;
        const start = self.r.offset;
        const id = if (id_on_wire) try self.r.readInt(u16) else inherited_id;
        const kind: ?u16 = if (parent != null) try self.r.readInt(u16) else null;
        const index = self.nodes.items.len;
        try self.nodes.append(self.a, .{ .item_id = id, .wire_type = kind, .id_on_wire = id_on_wire, .parent = parent, .subtree_end = undefined, .raw = undefined, .value = undefined });
        const value: types.Value = switch (kind orelse 0x8000) {
            0 => .{ .null_value = if (self.options.null_layout == .spec_u32) try self.r.readInt(u32) else null },
            1 => .{ .string = try string.read(&self.r) },
            2...9 => .{ .integer = try self.r.readInt(u32) },
            0x8002 => .{ .binary_id = try self.r.readInt(u16) },
            0x8000 => blk: {
                const set: types.Set = .{ .id = try self.r.readInt(u16), .count = try self.count(), .reserved = if (self.options.header_layout == .observed6) try self.r.readInt(u16) else null };
                for (0..set.count) |_| try self.node(index, null, true, depth + 1);
                break :blk .{ .set = set };
            },
            0x8001 => blk: {
                const n = try self.count();
                const array: types.Array = .{ .count = n, .shared_id = if (n > 0) try self.r.readInt(u16) else null };
                for (0..n) |_| try self.node(index, array.shared_id, false, depth + 1);
                break :blk .{ .array = array };
            },
            else => return error.UnsupportedParameterType,
        };
        // Recursive append may reallocate; never retain pointers into nodes across it.
        self.nodes.items[index].value = value;
        self.nodes.items[index].raw = self.r.bytes[start..self.r.offset];
        self.nodes.items[index].subtree_end = self.nodes.items.len;
    }
};
