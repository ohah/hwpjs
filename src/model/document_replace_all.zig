//! Native derives all matches from the complete current inventory. A client
//! cannot omit a protected owner by submitting only a subset of edit groups.
const std = @import("std");
const inventory = @import("document_text_snapshot.zig");
const independent = @import("independent_text_edits.zig");
const transaction = @import("text_transaction.zig");
pub const Request = struct {
    binding: @import("formatting_patch.zig").Binding,
    query: []const u8,
    replacement: []const u8,
};
pub const Group = struct { row: *const inventory.Row, edits: []const independent.Edit };
pub const Plan = struct {
    arena: std.heap.ArenaAllocator,
    groups: []const Group,
    match_count: u32,
    pub fn deinit(self: *Plan) void {
        self.arena.deinit();
        self.* = undefined;
    }
};
pub fn prepare(a: std.mem.Allocator, snapshot: *const inventory.Snapshot, request: Request) !Plan {
    try snapshot.validateComplete();
    if (request.binding.revision == null or request.binding.revision != snapshot.binding.revision or
        !std.mem.eql(u8, request.binding.session, snapshot.binding.session)) return error.StaleDocumentTextReference;
    const replacement_units = try independent.utf16Units(request.replacement);
    if (request.replacement.len > transaction.limits.inserted_bytes) return error.LimitExceeded;
    var matcher = try @import("../text/literal_matcher.zig").Matcher.init(a, request.query);
    defer matcher.deinit(a);
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const owned = arena.allocator();
    var groups: std.ArrayList(Group) = .empty;
    var match_count: u32 = 0;
    var inserted_bytes: usize = 0;
    var output_units: usize = snapshot.text_units;
    for (snapshot.rows.items) |*row| {
        var edits: std.ArrayList(independent.Edit) = .empty;
        var matches = matcher.scan(row.text);
        while (matches.next()) |match| {
            if (match_count == transaction.limits.edits_count or request.replacement.len > transaction.limits.inserted_bytes - inserted_bytes) return error.LimitExceeded;
            match_count += 1;
            inserted_bytes += request.replacement.len;
            output_units -= matcher.query_units;
            output_units = std.math.add(usize, output_units, replacement_units) catch return error.LimitExceeded;
            try edits.append(owned, .{ .start = match.start, .end = match.end, .text = request.replacement, .expected = request.query });
        }
        if (edits.items.len != 0) try groups.append(owned, .{ .row = row, .edits = try edits.toOwnedSlice(owned) });
    }
    // Test the final simultaneous output, not a prefix before later deletions.
    if (output_units > transaction.limits.text_units) return error.LimitExceeded;
    return .{ .arena = arena, .groups = try groups.toOwnedSlice(owned), .match_count = match_count };
}
