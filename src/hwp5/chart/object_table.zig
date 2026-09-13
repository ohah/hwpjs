const std = @import("std");
const Reader = @import("../../binary/reader.zig").Reader;
const Types = @import("type_table.zig").Table;
const strings = @import("string_object.zig");
const ids = @import("object_ids.zig");
const values = @import("value_object.zig");
pub const Options = struct {
    max_objects: usize = 1000000,
    max_references: usize = 1000000,
    max_string_bytes: usize = 65535,
    max_total_string_bytes: usize = 16 * 1024 * 1024,
};
pub const Entry = union(enum) { other, string: strings.String, number: values.Number };
pub const Reference = struct { value: strings.String, introduced: bool, start: usize, end: usize };
pub const ValueReference = struct { value: values.Value, introduced: bool, start: usize, end: usize };
pub const ReferenceSpan = struct { object_id: u32, introduced: bool, start: usize, end: usize };

/// Owns only its map. Every registered String borrows caller-retained input.
/// Caller must register prior objects completely for the selected scope.
pub const Table = struct {
    allocator: std.mem.Allocator,
    options: Options,
    entries: std.AutoHashMapUnmanaged(u32, Entry) = .empty,
    /// Every successfully parsed value-reference site in wire order. This is
    /// the authoritative source for relocating an inline definition safely.
    references: std.ArrayListUnmanaged(ReferenceSpan) = .empty,
    string_bytes: usize = 0,
    pub fn init(a: std.mem.Allocator, options: Options) Table {
        return .{ .allocator = a, .options = options };
    }
    pub fn deinit(self: *Table) void {
        self.references.deinit(self.allocator);
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
    pub fn registerInitialString(self: *Table, value: strings.String, start: usize, end: usize) !void {
        if (start > end or end - start < 4) return error.InvalidChartStringDefinitionSpan;
        if (self.references.items.len >= self.options.max_references) return error.LimitExceeded;
        try self.references.ensureUnusedCapacity(self.allocator, 1);
        try self.registerString(value);
        self.references.appendAssumeCapacity(.{ .object_id = value.object_id, .introduced = true, .start = start, .end = end });
    }
    pub fn registerNumber(self: *Table, value: values.Number) !void {
        try self.checkNew(value.object_id);
        try self.entries.put(self.allocator, value.object_id, .{ .number = value });
    }
    pub fn registerInitialNumber(self: *Table, value: values.Number, start: usize, end: usize) !void {
        if (start > end or end - start < 4) return error.InvalidChartValueDefinitionSpan;
        if (self.references.items.len >= self.options.max_references) return error.LimitExceeded;
        try self.references.ensureUnusedCapacity(self.allocator, 1);
        try self.registerNumber(value);
        self.references.appendAssumeCapacity(.{ .object_id = value.object_id, .introduced = true, .start = start, .end = end });
    }
    /// Known strings consume only the object ID; unknown IDs start an inline
    /// definition. No byte-pattern fallback. On error the reader and this map's
    /// logical contents/accounting are unchanged; types may have changed.
    pub fn readStringObservedV1(self: *Table, reader: *Reader, types: *Types, max_bytes: usize) !Reference {
        const ref = try self.readValue(reader, types, max_bytes, false);
        return .{ .value = ref.value.string, .introduced = ref.introduced, .start = ref.start, .end = ref.end };
    }
    /// String/Double values share one identity scope. Numbers consume an object
    /// slot but no String byte budget. Null and Other are not value references.
    pub fn readValueObservedV1(self: *Table, reader: *Reader, types: *Types, max_bytes: usize) !ValueReference {
        return self.readValue(reader, types, max_bytes, true);
    }
    fn readValue(self: *Table, reader: *Reader, types: *Types, max_bytes: usize, allow_number: bool) !ValueReference {
        const start = reader.offset;
        var next = reader.*;
        const id = try ids.readInline(&next);
        if (self.references.items.len >= self.options.max_references) return error.LimitExceeded;
        const limit = @min(@min(max_bytes, self.options.max_string_bytes), 65535);
        if (self.entries.get(id)) |entry| {
            const value: values.Value = switch (entry) {
                .other => return error.UnsupportedChartObjectReference,
                .string => |s| blk: {
                    if (s.bytes.len > limit) return error.LimitExceeded;
                    break :blk .{ .string = s };
                },
                .number => |n| if (allow_number) .{ .number = n } else return error.UnsupportedChartObjectReference,
            };
            try self.references.ensureUnusedCapacity(self.allocator, 1);
            self.references.appendAssumeCapacity(.{ .object_id = id, .introduced = false, .start = start, .end = next.offset });
            reader.* = next;
            return .{ .value = value, .introduced = false, .start = start, .end = next.offset };
        }
        try self.checkNew(id);
        if (self.string_bytes > self.options.max_total_string_bytes) return error.LimitExceeded;
        next = reader.*;
        const remaining = @min(limit, self.options.max_total_string_bytes - self.string_bytes);
        const value: values.Value = if (allow_number) try values.readObservedV1(&next, types, remaining) else .{ .string = try values.readStringObservedV1(&next, types, remaining) };
        try self.references.ensureUnusedCapacity(self.allocator, 1);
        switch (value) {
            .string => |s| try self.registerString(s),
            .number => |n| try self.registerNumber(n),
        }
        self.references.appendAssumeCapacity(.{ .object_id = id, .introduced = true, .start = start, .end = next.offset });
        reader.* = next;
        return .{ .value = value, .introduced = true, .start = start, .end = next.offset };
    }
};
