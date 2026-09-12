const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const declaration = @import("type_declaration.zig");
pub const Options = struct {
    max_types: usize = 65536,
    max_name_bytes: usize = 65535,
    max_total_name_bytes: usize = 4 * 1024 * 1024,
};
pub const Reference = struct {
    id: u32,
    declaration: declaration.Declaration,
    introduced: bool,
};

/// One table per caller-established chart serialization scope. Owns names;
/// references survive input release and map growth, but not table deinit.
pub const Table = struct {
    allocator: std.mem.Allocator,
    options: Options,
    definitions: std.AutoHashMapUnmanaged(u32, declaration.Declaration) = .empty,
    name_bytes: usize = 0,

    pub fn init(a: std.mem.Allocator, options: Options) Table {
        return .{ .allocator = a, .options = options };
    }
    pub fn deinit(self: *Table) void {
        var it = self.definitions.valueIterator();
        while (it.next()) |value| self.allocator.free(value.raw_name);
        self.definitions.deinit(self.allocator);
        self.* = undefined;
    }
    /// Caller has established a non-null type-reference position. Reads u32 ID
    /// and, only for a new ID, the explicitly observed 16-bit declaration.
    /// Does not consume object IDs, infer null references, or locate object data.
    /// Failure preserves the cursor, definitions and name-byte accounting.
    pub fn readObserved16(self: *Table, reader: *Reader) !Reference {
        var next = reader.*;
        const id = try next.readInt(u32);
        if (self.definitions.get(id)) |value| {
            reader.* = next;
            return .{ .id = id, .declaration = value, .introduced = false };
        }
        if (self.definitions.count() >= self.options.max_types or self.name_bytes > self.options.max_total_name_bytes)
            return error.LimitExceeded;
        const limit = @min(self.options.max_name_bytes, self.options.max_total_name_bytes - self.name_bytes);
        const value = try declaration.readObserved16(&next, limit);
        const name = try self.allocator.dupe(u8, value.raw_name);
        errdefer self.allocator.free(name);
        const owned: declaration.Declaration = .{ .raw_name = name, .version = value.version };
        try self.definitions.put(self.allocator, id, owned);
        self.name_bytes += name.len; // Bounded by the remaining total above.
        reader.* = next;
        return .{ .id = id, .declaration = owned, .introduced = true };
    }
};
