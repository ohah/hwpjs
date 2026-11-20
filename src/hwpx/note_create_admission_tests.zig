//! Declared product regressions. This file has not been compiled or executed.
const std = @import("std");
const editor = @import("editor_session.zig");
const histories = @import("editor_history.zig");
const api = @import("note_create.zig");
const owner = @import("note_create_owner.zig");
const caret_api = @import("note_create_caret.zig");
const fixtures = @import("note_delete_fixtures.zig");
const Kind = @import("note_bodies.zig").Kind;
const a = std.testing.allocator;
const format: @import("note_create_profile.zig").Format = .{ .number_type = "DIGIT", .user_char = "", .prefix_char = "", .suffix_char = ")", .superscript = false };
const support = @import("note_create_test_support.zig");
const shape = support.shape;
const request = support.request;
const command = support.command;
const otherParts = support.otherParts;
const expectedError = support.expectedError;
const physicalHost = support.physicalHost;
test "HWPX N02 create rejects protected following internal field without losing prior redo" {
    const base = try @import("note_protection_fixtures.zig").base(a, fixtures.foot ++ fixtures.foot_second);
    defer a.free(base);
    const input = try @import("note_protection_fixtures.zig").prefixField(a, base, true);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try histories.History.initV2(&session, .{});
    defer history.deinit();
    const rows = try @import("paragraph_text_snapshot.zig").read(a, &session, 0);
    defer @import("paragraph_text_snapshot.zig").free(a, rows);
    var prior: ?usize = null;
    for (rows) |row| if (std.mem.eql(u8, row.text, "priorredo")) {
        prior = row.paragraph;
    };
    try std.testing.expect(try history.apply(&session, .{ .kind = .plain, .paragraph = prior orelse return error.MissingTestRedoParagraph, .start = 0, .deleted = 0, .inserted = "R" }));
    const redo_bytes = try session.save();
    defer a.free(redo_bytes);
    try std.testing.expect(try history.undo(&session));
    const before = try session.save();
    defer a.free(before);
    var observed = try owner.observe(&session, .{ .section = 0, .paragraph = session.sections[0].first_paragraph }, 0, history.revision());
    defer observed.deinit(a);
    var receipt: caret_api.Receipt = .{ .section = 999, .paragraph_id = 999, .number = -1, .kind = .foot };
    const create = request(&observed, .foot, &receipt);
    const revision = history.revision();
    try std.testing.expectError(error.ProtectedFieldRange, history.apply(&session, command(&create)));
    try std.testing.expectEqual(revision, history.revision());
    try std.testing.expectEqual(@as(usize, 999), receipt.section);
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, redo_bytes, redone);
}
test "HWPX N02 create requires explicit missing policy and preserves existing policy" {
    const input = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try histories.History.initV2(&session, .{});
    defer history.deinit();
    var observed = try owner.observe(&session, .{ .section = 0, .paragraph = session.sections[0].first_paragraph }, 0, history.revision());
    defer observed.deinit(a);
    var receipt: caret_api.Receipt = undefined;
    var create = request(&observed, .foot, &receipt);
    try std.testing.expectError(error.MissingExplicitNoteCreatePolicy, history.apply(&session, command(&create)));
    const explicit = [_]@import("note_create_policy.zig").Initial{.{ .section = 0, .shape = shape(.foot) }};
    create.initial_policies = &explicit;
    try std.testing.expect(try history.apply(&session, command(&create)));
    var second = try owner.observe(&session, .{ .section = 0, .paragraph = session.sections[0].first_paragraph }, 0, history.revision());
    defer second.deinit(a);
    var next = request(&second, .foot, &receipt);
    next.initial_policies = &explicit;
    try std.testing.expectError(error.ExistingNotePolicyMustBePreserved, history.apply(&session, command(&next)));
}
test "HWPX N02 create rejects forged lease physical target and UTF16 half surrogate" {
    const input = try fixtures.create(a, "", fixtures.continuous);
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    var observed = try owner.observe(&session, .{ .section = 0, .paragraph = session.sections[0].first_paragraph }, 0, 7);
    defer observed.deinit(a);
    var lease = observed.lease;
    lease.serial += 1;
    try std.testing.expectError(error.StaleNoteCreateOwner, owner.validate(&session, lease, observed.target(), 7));
    var target = observed.target();
    target.physical_paragraph = 0;
    try std.testing.expectError(error.InvalidNoteCreateOwner, owner.validate(&session, observed.lease, target, 7));
    try std.testing.expectError(error.InvalidPictureInsertionPosition, @import("../image/image_insertion.zig").byteOffset("😀", 1));
}
test "HWPX N02 create preserves unrelated prefix suffix locked known and unknown caches" {
    const cache_values = [_][]const u8{
        "<hp:linesegarray><hp:lineseg textpos='0' vertpos='0' vertsize='100' textheight='100' baseline='80' spacing='0' horzpos='0' horzsize='500' flags='0'/></hp:linesegarray>",
        "<hp:linesegarray xmlns:x='urn:opaque' x:keep='yes'><x:leaf/></hp:linesegarray>",
    };
    for (cache_values) |cache| for ([_][]const u8{ "1", "malformed" }) |lexical| for ([_]bool{ false, true }) |prefix| {
        const original = try fixtures.create(a, "", fixtures.continuous);
        defer a.free(original);
        const outside = try std.fmt.allocPrint(a, "<hp:p id='98766' paraPrIDRef='0' styleIDRef='0' lock='{s}'><hp:run charPrIDRef='0'><hp:t>outside</hp:t></hp:run>{s}</hp:p>", .{ lexical, cache });
        defer a.free(outside);
        const input = try @import("note_protection_fixtures.zig").withOutside(a, original, if (prefix) outside else "", if (prefix) "" else outside);
        defer a.free(input);
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        session.history_delta_managed = true;
        var history = try histories.History.initV2(&session, .{});
        defer history.deinit();
        var observed = try owner.observe(&session, .{ .section = 0, .paragraph = try physicalHost(&session, 0) }, 0, history.revision());
        defer observed.deinit(a);
        var receipt: caret_api.Receipt = undefined;
        const create = request(&observed, .foot, &receipt);
        try std.testing.expect(try history.apply(&session, command(&create)));
        try std.testing.expect(std.mem.indexOf(u8, session.sections[0].tree.source, outside) != null);
        const output = try session.save();
        defer a.free(output);
        try otherParts(a, input, output);
    };
}
test "HWPX N02 create rejects selected resource locks and malformed booleans" {
    for ([_][]const u8{ "charPr", "paraPr", "style", "styles" }) |local| for ([_][]const u8{ "true", "malformed" }) |lexical| {
        const base = try fixtures.create(a, "", fixtures.continuous);
        defer a.free(base);
        const input = try @import("note_protection_fixtures.zig").resourceLock(a, base, local, lexical);
        defer a.free(input);
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        session.history_delta_managed = true;
        var history = try histories.History.initV2(&session, .{});
        defer history.deinit();
        var observed = try owner.observe(&session, .{ .section = 0, .paragraph = try physicalHost(&session, 0) }, 0, history.revision());
        defer observed.deinit(a);
        var receipt: caret_api.Receipt = .{ .section = 999, .paragraph_id = 999, .number = -1, .kind = .foot };
        const create = request(&observed, .foot, &receipt);
        try expectedError(if (std.mem.eql(u8, lexical, "true")) error.NoteDeleteReadOnly else error.InvalidXmlBoolean, history.apply(&session, command(&create)));
        const after = try session.save();
        defer a.free(after);
        try std.testing.expectEqualSlices(u8, input, after);
        try std.testing.expectEqual(@as(usize, 999), receipt.section);
    };
}
