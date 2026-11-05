//! Read-only memoization lasts one query/preflight, and dies before History starts.
const std = @import("std");
const m = @import("formatting_patch.zig");
const p = @import("formatting_projection.zig");
pub fn Scope(comptime Backend: type) type {
    return struct {
        const Self = @This();
        const CheckedKey = struct { owner: m.Owner, range: m.Range };
        backend: Backend,
        allocator: std.mem.Allocator,
        owners: std.AutoHashMapUnmanaged(m.Owner, m.Owner) = .empty,
        authorized: std.AutoHashMapUnmanaged(m.Owner, void) = .empty,
        checked: std.AutoHashMapUnmanaged(CheckedKey, void) = .empty,
        span_rows: std.AutoHashMapUnmanaged(m.Owner, []p.Span) = .empty,
        characters: std.StringHashMapUnmanaged(p.Observation) = .empty,
        paragraphs: std.StringHashMapUnmanaged(p.Observation) = .empty,
        // All lists, keys, values and span snapshots use the caller's scoped arena.
        pub fn owner(self: *Self, value: m.Owner) !m.Owner {
            if (self.owners.get(value)) |known| return known;
            const result = try self.backend.owner(value);
            try self.owners.put(self.allocator, value, result);
            return result;
        }
        pub fn validateRange(self: *Self, value: m.Owner, range: m.Range) !void {
            const key: CheckedKey = .{ .owner = value, .range = range };
            if (self.checked.contains(key)) return;
            try self.backend.validateRange(value, range);
            try self.checked.put(self.allocator, key, {});
        }
        pub fn authorize(self: *Self, value: m.Owner, ranges: []const m.Range, field: []const u8) !void {
            if (!self.authorized.contains(value)) {
                try self.backend.authorizeOwner(value);
                try self.authorized.put(self.allocator, value, {});
            }
            try self.backend.authorizeField(self.allocator, value, field);
            if (std.mem.startsWith(u8, field, "character.")) {
                if (ranges.len == 0) return error.CharacterRangeRequired;
                for (ranges) |range| try self.validateRange(value, range);
            }
        }
        pub fn spans(self: *Self, a: std.mem.Allocator, value: m.Owner) ![]p.Span {
            if (self.span_rows.get(value)) |known| return a.dupe(p.Span, known);
            const values = try self.backend.spans(self.allocator, value);
            try self.span_rows.put(self.allocator, value, values);
            return a.dupe(p.Span, values);
        }
        pub fn characterField(self: *Self, _: std.mem.Allocator, id: u32, field: []const u8) !p.Observation {
            const key = try std.fmt.allocPrint(self.allocator, "{d}:{s}", .{ id, field });
            if (self.characters.get(key)) |known| return known;
            const value = try self.backend.characterField(self.allocator, id, field);
            try self.characters.put(self.allocator, key, value);
            return value;
        }
        pub fn paragraphField(self: *Self, _: std.mem.Allocator, value: m.Owner, field: []const u8) !p.Observation {
            const key = try std.fmt.allocPrint(self.allocator, "{d}:{d}:{s}", .{ value.section, value.paragraph, field });
            if (self.paragraphs.get(key)) |known| return known;
            const result = try self.backend.paragraphField(self.allocator, value, field);
            try self.paragraphs.put(self.allocator, key, result);
            return result;
        }
    };
}
