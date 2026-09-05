const std = @import("std");
const h = @import("header.zig");
pub const Header = h.Header;
const Allocator = std.mem.Allocator;

pub const Options = @import("types.zig").Options;
pub const Entry = @import("types.zig").Entry;
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
        var arena = std.heap.ArenaAllocator.init(backing);
        errdefer arena.deinit();
        const a = arena.allocator();
        var file: File = .{ .arena = undefined, .bytes = try a.dupe(u8, input), .header = header, .entries = &.{} };
        var allocation: Allocation = .{ .a = a, .sectors = .{ .bytes = file.bytes, .header = header } };
        try allocation.init();
        const directory = try allocation.chain(header.directory_start, null);
        file.entries = try @import("directory.zig").parse(a, directory, header, options.max_entries);
        try @import("directory_tree.zig").build(a, file.entries, options.max_path_bytes);
        try @import("streams.zig").read(a, &allocation, file.entries, options);
        file.arena = arena;
        return file;
    }
};
