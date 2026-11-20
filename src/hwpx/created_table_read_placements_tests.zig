//! Canonical serializer/actual saved Native tree, not copied XML or UI hints.
const std = @import("std");
const editor = @import("editor_session.zig");
const inventory_mod = @import("document_text_inventory.zig");
const placements = @import("created_table_read_placements.zig");
const Receipts = @import("created_table_placement_receipts.zig").Receipts;
const a = std.testing.allocator;
fn verifyCase(allocator: std.mem.Allocator, live: *const editor.Session, saved: *const editor.Session, inventory: *const inventory_mod.Inventory, receipts: *const Receipts) !void {
    var proof = try placements.verify(allocator, live, saved, inventory, receipts);
    defer proof.deinit();
    try std.testing.expectEqual(@as(usize, 4), proof.owners[0].len);
    try std.testing.expectEqual(@as(usize, 0), proof.owners[0][0].source);
    try std.testing.expectEqual(@as(usize, 1), proof.owners[0][1].source);
    try std.testing.expectEqual(@as(u32, 0), proof.owners[0][2].cell.column);
    try std.testing.expectEqual(@as(u32, 1), proof.owners[0][3].cell.column);
    try std.testing.expectEqual(@as(usize, 2), proof.pending_positions[0].len);
    try std.testing.expectEqual(@as(usize, 0), proof.pending_positions[0][0].len);
    try std.testing.expectEqualSlices(u32, &.{2}, proof.pending_positions[0][1]);
    var physical = try @import("display_current_paragraphs.zig").read(allocator, &saved.sections[0], saved.options);
    defer physical.deinit(allocator);
    const observed = try @import("document_text_read_projection.zig").text(allocator, &saved.sections[0].tree, &physical.paragraphs[1], live.options.max_text_bytes);
    defer allocator.free(observed);
    const edits = try @import("document_text_source_axis.zig").map(allocator, observed, inventory.sections[0].sources[1].text, proof.pending_positions[0][1], &.{
        .{ .start = 0, .end = 2, .text = "한", .expected = "😀" },
    });
    defer allocator.free(edits);
    try std.testing.expectEqual(@as(u32, 0), edits[0].start);
    try std.testing.expectEqual(@as(u32, 2), edits[0].end);
    try proof.assertCurrent(live, saved);
}
test "document text HX canonical receipt read proof includes every pending cell without a write grant" {
    const fixture = try @import("document_text_test_fixture.zig").Fixture.create(a, 2);
    defer fixture.deinit();
    var receipts: Receipts = .{};
    defer receipts.deinit(a);
    const bytes = try fixture.session.saveWithTablePlacements(&receipts);
    defer a.free(bytes);
    var saved = try editor.open(a, bytes, fixture.session.options);
    defer saved.deinit();
    var inventory = try inventory_mod.read(a, &fixture.session);
    defer inventory.deinit();
    try verifyCase(a, &fixture.session, &saved, &inventory, &receipts);
    try @import("../testing/allocation_failures.zig").check(verifyCase, .{
        @as(*const editor.Session, &fixture.session),    @as(*const editor.Session, &saved),
        @as(*const inventory_mod.Inventory, &inventory), @as(*const Receipts, &receipts),
    });
    // A borrowed read-only view changes no source/model owner and grants no edit.
    var readonly = fixture.session;
    readonly.history_delta_managed = false;
    var read_inventory = try inventory_mod.read(a, &readonly);
    defer read_inventory.deinit();
    try verifyCase(a, &readonly, &saved, &read_inventory, &receipts);
    try std.testing.expectEqual(@as(usize, 1), fixture.session.sections[0].created_tables.entries.items.len);
    const after = try fixture.session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, bytes, after);
}
test "document text HX read placement refuses forged emission host unit tag and duplicate receipts" {
    const fixture = try @import("document_text_test_fixture.zig").Fixture.create(a, 2);
    defer fixture.deinit();
    var receipts: Receipts = .{};
    defer receipts.deinit(a);
    const bytes = try fixture.session.saveWithTablePlacements(&receipts);
    defer a.free(bytes);
    var saved = try editor.open(a, bytes, fixture.session.options);
    defer saved.deinit();
    var inventory = try inventory_mod.read(a, &fixture.session);
    defer inventory.deinit();
    const original = receipts.items.items[0];
    inline for (.{ "source_unit", "current_host", "current_unit", "saved_unit", "table_start" }) |field| {
        receipts.items.items[0] = original;
        @field(receipts.items.items[0], field) += 1;
        try std.testing.expectError(error.SourceBindingMismatch, placements.verify(a, &fixture.session, &saved, &inventory, &receipts));
    }
    receipts.items.items[0] = original;
    try receipts.items.append(a, original);
    try std.testing.expectError(error.SourceBindingMismatch, placements.verify(a, &fixture.session, &saved, &inventory, &receipts));
}
