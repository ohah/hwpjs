const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const strings = @import("string_object.zig");
const ids = @import("object_ids.zig");
pub const Options = struct {
    max_objects: usize = 1000000,
    max_string_bytes: usize = 65535,
    max_total_string_bytes: usize = 16 * 1024 * 1024,
};
pub const Entry = union(enum) { other, string: strings.String };
pub const Reference = struct { value: strings.String, introduced: bool, start: usize, end: usize };

/// Owns only its map. Every registered String borrows caller-retained input.
/// Caller must register prior objects completely for the selected scope.
pub const Table = struct {
    allocator: std.mem.Allocator,
    options: Options,
    entries: std.AutoHashMapUnmanaged(u32, Entry) = .empty,
    string_bytes: usize = 0,
    pub fn init(a: std.mem.Allocator, options: Options) Table {
        return .{ .allocator = a, .options = options };
    }
    pub fn deinit(self: *Table) void {
        self.entries.deinit(self.allocator);
        self.* = undefined;
    }
    fn checkNew(self: *const Table, id: u32) !void {
        try ids.requireInline(id);
        if (self.entries.contains(id)) return error.DuplicateChartObjectId;
        if (self.entries.count() >= self.options.max_objects) return error.LimitExceeded;
    }
    pub fn registerOther(self: *Table, id: u32) !void {
        try self.checkNew(id);
        try self.entries.put(self.allocator, id, .other);
    }
    pub fn registerString(self: *Table, value: strings.String) !void {
        try self.checkNew(value.object_id);
        if (value.bytes.len > @min(self.options.max_string_bytes, 65535) or self.string_bytes > self.options.max_total_string_bytes or
            value.bytes.len > self.options.max_total_string_bytes - self.string_bytes) return error.LimitExceeded;
        try self.entries.put(self.allocator, value.object_id, .{ .string = value });
        self.string_bytes += value.bytes.len;
    }
    /// Known strings consume only the object ID; unknown IDs start an inline
    /// definition. No byte-pattern fallback. On error the reader and this map's
    /// logical contents/accounting are unchanged; types may have changed.
    pub fn readStringObservedV1(self: *Table, reader: *Reader, types: *Types, max_bytes: usize) !Reference {
        const start = reader.offset;
        var next = reader.*;
        const id = try ids.readInline(&next);
        const limit = @min(@min(max_bytes, self.options.max_string_bytes), 65535);
        if (self.entries.get(id)) |entry| {
            const value = switch (entry) {
                .other => return error.UnsupportedChartObjectReference,
                .string => |s| s,
            };
            if (value.bytes.len > limit) return error.LimitExceeded;
            reader.* = next;
            return .{ .value = value, .introduced = false, .start = start, .end = next.offset };
        }
        try self.checkNew(id);
        if (self.string_bytes > self.options.max_total_string_bytes) return error.LimitExceeded;
        next = reader.*;
        const value = try strings.readObservedV1(&next, types, @min(limit, self.options.max_total_string_bytes - self.string_bytes));
        try self.registerString(value);
        reader.* = next;
        return .{ .value = value, .introduced = true, .start = start, .end = next.offset };
    }
};
