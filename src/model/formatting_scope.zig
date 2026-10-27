//! Read-only memoization lasts one query/preflight, and dies before History starts.
const std = @import("std");
const m = @import("formatting_patch.zig");
const p = @import("formatting_projection.zig");
pub fn Scope(comptime Backend: type) type {
    return struct {
        const Self = @This();
        backend: Backend,
        allocator: std.mem.Allocator,
        owners: std.ArrayList(m.Owner) = .empty,
        authorized: std.ArrayList(m.Owner) = .empty,
        checked: std.ArrayList(struct { owner: m.Owner, range: m.Range }) = .empty,
        span_rows: std.ArrayList(struct { owner: m.Owner, values: []p.Span }) = .empty,
        characters: std.ArrayList(struct { id: u32, field: []const u8, value: p.Observation }) = .empty,
        paragraphs: std.ArrayList(struct { owner: m.Owner, field: []const u8, value: p.Observation }) = .empty,
        // All lists, keys, values and span snapshots use the caller's scoped arena.
        pub fn owner(self: *Self, value: m.Owner) !m.Owner {
            for (self.owners.items) |known| if (std.meta.eql(known, value)) return known;
            const result = try self.backend.owner(value);
            try self.owners.append(self.allocator, result);
            return result;
        }
        pub fn validateRange(self: *Self, value: m.Owner, range: m.Range) !void {
            for (self.checked.items) |known| if (std.meta.eql(known.owner, value) and std.meta.eql(known.range, range)) return;
            try self.backend.validateRange(value, range);
            try self.checked.append(self.allocator, .{ .owner = value, .range = range });
        }
        pub fn authorize(self: *Self, value: m.Owner, ranges: []const m.Range, field: []const u8) !void {
            var found = false;
            for (self.authorized.items) |known| if (std.meta.eql(known, value)) {
                found = true;
                break;
            };
            if (!found) {
                try self.backend.authorizeOwner(value);
                try self.authorized.append(self.allocator, value);
            }
            try self.backend.authorizeField(self.allocator, value, field);
            if (std.mem.startsWith(u8, field, "character.")) {
                if (ranges.len == 0) return error.CharacterRangeRequired;
                for (ranges) |range| try self.validateRange(value, range);
            }
        }
        pub fn spans(self: *Self, a: std.mem.Allocator, value: m.Owner) ![]p.Span {
            for (self.span_rows.items) |known| if (std.meta.eql(known.owner, value)) return a.dupe(p.Span, known.values);
            const values = try self.backend.spans(self.allocator, value);
            try self.span_rows.append(self.allocator, .{ .owner = value, .values = values });
            return a.dupe(p.Span, values);
        }
        pub fn characterField(self: *Self, _: std.mem.Allocator, id: u32, field: []const u8) !p.Observation {
            for (self.characters.items) |known| if (known.id == id and std.mem.eql(u8, known.field, field)) return known.value;
            const value = try self.backend.characterField(self.allocator, id, field);
            try self.characters.append(self.allocator, .{ .id = id, .field = try self.allocator.dupe(u8, field), .value = value });
            return value;
        }
        pub fn paragraphField(self: *Self, _: std.mem.Allocator, value: m.Owner, field: []const u8) !p.Observation {
            for (self.paragraphs.items) |known| if (std.meta.eql(known.owner, value) and std.mem.eql(u8, known.field, field)) return known.value;
            const result = try self.backend.paragraphField(self.allocator, value, field);
            try self.paragraphs.append(self.allocator, .{ .owner = value, .field = try self.allocator.dupe(u8, field), .value = result });
            return result;
        }
    };
}
