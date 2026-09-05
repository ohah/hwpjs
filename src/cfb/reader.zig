const std = @import("std");
const h = @import("header.zig");
pub const Header = h.Header;
const Allocator = std.mem.Allocator;

pub const Options = @import("types.zig").Options;
pub const Entry = @import("types.zig").Entry;
pub const writer = @import("writer.zig");
const Sectors = @import("sectors.zig").Sectors;
const Allocation = @import("allocation.zig").Allocation;
/// Owns all returned data; input may be released after open. No filesystem/clock dependency.
pub const File = struct {
    arena: std.heap.ArenaAllocator,
    bytes: []const u8,
    header: Header,
    entries: []Entry,

    pub fn deinit(self: *File) void {
        self.arena.deinit();
        self.* = undefined;
    }

    pub fn find(self: *const File, allocator: Allocator, path: []const u8) !?usize {
        return @import("find.zig").find(allocator, self.entries, path);
    }
    pub fn findExact(self: *const File, path: []const u8) !?usize {
        return @import("name_order.zig").find(self.entries, path);
    }

    /// Caller frees the array; names/content borrow this File until deinit.
    pub fn toNodes(self: *const File, allocator: Allocator) ![]writer.Node {
        const map = try allocator.alloc(u32, self.entries.len);
        defer allocator.free(map);
        var count: usize = 0;
        for (self.entries, 0..) |e, i| {
            map[i] = h.free;
            if (e.kind == 0) continue;
            map[i] = @intCast(count);
            count += 1;
        }
        const nodes = try allocator.alloc(writer.Node, count);
        for (self.entries, 0..) |e, i| {
            if (e.kind == 0) continue;
            nodes[map[i]] = .{ .name = e.name, .kind = e.kind, .parent = if (e.parent == h.free) h.free else map[e.parent], .clsid = e.clsid, .state = e.state, .created = e.created, .modified = e.modified, .content = e.content };
        }
        return nodes;
    }

    pub fn readStream(self: *const File, allocator: Allocator, path: []const u8) ![]const u8 {
        const index = try self.find(allocator, path) orelse return error.StreamNotFound;
        if (self.entries[index].kind != 2) return error.NotAStream;
        return self.entries[index].content;
    }

    pub fn rawHeader(self: *const File) []const u8 {
        return self.bytes[0..self.header.sector_size];
    }

    pub fn sectorCount(self: *const File) usize {
        return (Sectors{ .bytes = self.bytes, .header = self.header }).count();
    }

    /// Includes a trailing partial sector, as legacy raw.sectors does.
    pub fn rawSector(self: *const File, id: usize) ![]const u8 {
        return (Sectors{ .bytes = self.bytes, .header = self.header }).get(id);
    }

    pub fn open(backing: Allocator, input: []const u8, options: Options) !File {
        if (input.len > options.max_input_bytes) return error.LimitExceeded;
        const header = try Header.parse(input);
        if (options.strict) try @import("strict.zig").header(input, header);
        var arena = std.heap.ArenaAllocator.init(backing);
        errdefer arena.deinit();
        const a = arena.allocator();
        var file: File = .{ .arena = undefined, .bytes = try a.dupe(u8, input), .header = header, .entries = &.{} };
        var allocation: Allocation = .{ .a = a, .sectors = .{ .bytes = file.bytes, .header = header }, .strict = options.strict };
        try allocation.init();
        const directory = try allocation.chain(header.directory_start, null);
        file.entries = try @import("directory.zig").parse(a, directory, header, options.max_entries);
        try @import("directory_tree.zig").build(a, file.entries, options.max_path_bytes);
        if (options.strict) try @import("strict.zig").directory(a, directory, file.entries, header.major);
        try @import("streams.zig").read(a, &allocation, file.entries, options);
        if (options.strict) try allocation.validateOwnership();
        file.arena = arena;
        return file;
    }
};
