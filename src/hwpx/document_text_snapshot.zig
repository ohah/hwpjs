//! Complete Native read through the canonical current serializer. Live typed
//! pending stores remain live; rendered/source owner association is observation
//! provenance only and never a legacy setter coordinate or edit permission.
const std = @import("std");
const editor = @import("editor_session.zig");
const common = @import("../model/document_text_snapshot.zig");

/// Request-local provenance. Both the text and anchor arrays belong to the
/// snapshot arena. A source writer must still admit its current metadata and
/// verify the source axis; these arrays do not confer mutation authority.
pub const Observation = struct {
    snapshot: common.Snapshot,
    pending_positions: []const []const []const u32,
    owner: *const editor.Session,
    source_pointer: [*]u8,
    sections_pointer: [*]editor.Section,
    serial: u64,
    active: bool,
    pub fn deinit(self: *Observation) void {
        self.snapshot.deinit();
        self.* = undefined;
    }
    pub fn assertCurrent(self: *const Observation, live: *const editor.Session) !void {
        if (live != self.owner or live.source.ptr != self.source_pointer or
            live.sections.ptr != self.sections_pointer or live.sections.len != self.pending_positions.len or
            live.mutation_serial != self.serial or live.history_transaction_active != self.active)
            return error.StaleDocumentTextSnapshot;
        try self.snapshot.validateComplete();
    }
};

pub fn read(a: std.mem.Allocator, live: *const editor.Session, lifetime: @import("../model/formatting_binding.zig").State, revision: ?u32) !common.Snapshot {
    // Ownership of all observation storage transfers with the snapshot. Public
    // JSON continues to serialize only its existing read DTO fields.
    const observation = try observe(a, live, lifetime, revision);
    return observation.snapshot;
}

pub fn observe(a: std.mem.Allocator, live: *const editor.Session, lifetime: @import("../model/formatting_binding.zig").State, revision: ?u32) !Observation {
    var inventory = try @import("document_text_inventory.zig").read(a, live);
    defer inventory.deinit();
    var receipts: @import("created_table_placement_receipts.zig").Receipts = .{};
    defer receipts.deinit(live.allocator);
    const bytes = try live.saveWithTablePlacements(&receipts);
    defer live.allocator.free(bytes);
    var saved = try editor.open(a, bytes, live.options);
    defer saved.deinit();
    var proof = try @import("created_table_read_placements.zig").verify(a, live, &saved, &inventory, &receipts);
    defer proof.deinit();
    var result = try common.Snapshot.init(a, .hwpx, lifetime, revision, inventory.coverage);
    errdefer result.deinit();
    const owned = result.arena.allocator();
    const pending = try owned.alloc([]const []const u32, proof.pending_positions.len);
    for (proof.pending_positions, pending) |section, *copy| {
        const paragraphs = try owned.alloc([]const u32, section.len);
        for (section, paragraphs) |positions, *row| row.* = try owned.dupe(u32, positions);
        copy.* = paragraphs;
    }
    for (saved.sections, proof.owners, 0..) |*section, owners, section_index| {
        var physical = try @import("display_current_paragraphs.zig").read(a, section, saved.options);
        defer physical.deinit(a);
        if (physical.paragraphs.len != owners.len) return error.IncompleteDocumentTextSnapshot;
        const read_limits = try @import("document_text_read_options.zig").fromSession(saved.options);
        var read_context = try @import("control_text_read_context.zig").Context.init(a, &section.tree, physical.paragraphs, read_limits);
        defer read_context.deinit();
        for (physical.paragraphs, owners, 0..) |*paragraph, owner, current_index| {
            const observed = try read_context.copyVisibleText(a, current_index, paragraph.template_element, read_limits.max_bytes);
            defer a.free(observed);
            const source: common.Source = switch (owner) {
                .source => |index| .{ .paragraph = index },
                .cell => |cell| .{ .created_cell = cell },
            };
            try result.append(section_index, source, observed);
        }
    }
    try result.validateComplete();
    try inventory.assertCurrent(live);
    try proof.assertCurrent(live, &saved);
    return .{ .snapshot = result, .pending_positions = pending, .owner = live, .source_pointer = live.source.ptr, .sections_pointer = live.sections.ptr, .serial = live.mutation_serial, .active = live.history_transaction_active };
}
