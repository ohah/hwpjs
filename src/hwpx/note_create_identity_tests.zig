//! Physical package ID inventory and strict native resource references.
const std = @import("std");
const editor = @import("editor_session.zig");
const histories = @import("editor_history.zig");
const owner = @import("note_create_owner.zig");
const support = @import("note_create_test_support.zig");
const a = std.testing.allocator;
test "HWPX N02 create paragraph identity excludes unlisted physical XML ids" {
    const initial = try @import("note_delete_fixtures.zig").create(a, "", @import("note_delete_fixtures.zig").continuous);
    defer a.free(initial);
    var archive = try @import("../zip/archive.zig").open(a, initial, .{});
    defer archive.deinit();
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    var sources: std.ArrayList(@import("../zip/store_writer.zig").Source) = .empty;
    for (archive.entries) |entry| {
        const bytes = try archive.decode(entry, 4_000_000);
        defer a.free(bytes);
        try sources.append(scratch, .{ .name = entry.name, .bytes = try scratch.dupe(u8, bytes) });
    }
    const orphan = "<x:retained xmlns:x='urn:opaque'><x:unknown id='1' instid='2'/><x:unknown id='+0003'/></x:retained>";
    try sources.append(scratch, .{ .name = "Other/not-in-manifest.xml", .bytes = orphan });
    const input = try @import("../zip/store_writer.zig").write(a, sources.items, .{});
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try histories.History.initV2(&session, .{});
    defer history.deinit();
    var observed = try owner.observe(&session, .{ .section = 0, .paragraph = try support.physicalHost(&session, 0) }, 0, history.revision());
    defer observed.deinit(a);
    var receipt: @import("note_create_caret.zig").Receipt = undefined;
    const create = support.request(&observed, .foot, &receipt);
    try std.testing.expect(try history.apply(&session, support.command(&create)));
    for ([_]u32{ 1, 2, 3 }) |occupied| try std.testing.expect(receipt.paragraph_id != occupied);
    const output = try session.save();
    defer a.free(output);
    try support.otherParts(a, input, output);
    var saved = try @import("../zip/archive.zig").open(a, output, .{});
    defer saved.deinit();
    const raw = try saved.decode(saved.find("Other/not-in-manifest.xml").?, 4_000_000);
    defer a.free(raw);
    try std.testing.expectEqualStrings(orphan, raw);
}
test "HWPX N02 create missing resource ids never substitute native zero defaults" {
    const input = try @import("note_delete_fixtures.zig").create(a, "", @import("note_delete_fixtures.zig").continuous);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try histories.History.initV2(&session, .{});
    defer history.deinit();
    var observed = try owner.observe(&session, .{ .section = 0, .paragraph = try support.physicalHost(&session, 0) }, 0, history.revision());
    defer observed.deinit(a);
    var receipt: @import("note_create_caret.zig").Receipt = .{ .section = 999, .paragraph_id = 999, .number = -1, .kind = .foot };
    const before = try session.save();
    defer a.free(before);
    for (0..3) |field| {
        var create = support.request(&observed, .foot, &receipt);
        switch (field) {
            0 => create.resources.paragraph = 999,
            1 => create.resources.character = 999,
            else => create.resources.style = 999,
        }
        try support.expectedError(error.UnresolvedNoteProtectionResource, history.apply(&session, support.command(&create)));
        try std.testing.expectEqual(@as(usize, 999), receipt.section);
        const after = try session.save();
        defer a.free(after);
        try std.testing.expectEqualSlices(u8, before, after);
    }
}
