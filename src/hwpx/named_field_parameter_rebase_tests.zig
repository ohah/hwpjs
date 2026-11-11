const std = @import("std");
const editor = @import("editor_session.zig");
const histories = @import("editor_history.zig");
const params = @import("named_field_parameters.zig");
const a = std.testing.allocator;
fn fixture() ![]u8 {
    const blank = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(blank);
    var doc = try @import("package.zig").inspectDocument(a, blank, .{});
    defer doc.deinit(a);
    var changes: [2]@import("../zip/replace_writer.zig").Replacement = undefined;
    var used: usize = 0;
    defer for (changes[0..used]) |change| a.free(change.bytes);
    for (doc.archive.entries, 0..) |entry, index| {
        const header = std.mem.eql(u8, entry.name, "Contents/header.xml");
        const section = std.mem.eql(u8, entry.name, "Contents/section0.xml");
        if (!header and !section) continue;
        const source = try doc.archive.decode(entry, 1_000_000);
        defer a.free(source);
        const replacement = if (header)
            try std.mem.replaceOwned(u8, a, source, "</hh:refList>", "<hh:bullets itemCnt='1'><hh:bullet id='7' useImage='0' char='&#x25B6;'><hh:paraHead checkable='0'/></hh:bullet></hh:bullets></hh:refList>")
        else
            try std.mem.replaceOwned(u8, a, source, "</hs:sec>", "<hp:p id='101' paraPrIDRef='0' styleIDRef='0'><hp:run charPrIDRef='0'><hp:t>bullet body</hp:t></hp:run></hp:p>" ++ "<hp:p id=\"102\" paraPrIDRef=\"0\" styleIDRef=\"0\" pageBreak=\"0\" columnBreak=\"0\" merged=\"0\"><hp:run charPrIDRef=\"0\"><hp:ctrl><hp:fieldBegin id=\"1\" type=\"CLICK_HERE\" name=\"cross-feature\" editable=\"1\" dirty=\"1\" zorder=\"-1\" fieldid=\"627272811\"><hp:parameters cnt=\"4\" name=\"\"><hp:integerParam name=\"Prop\">9</hp:integerParam><hp:stringParam name=\"Command\" xml:space=\"preserve\">Clickhere:set:49:Direction:wstring:3:old HelpState:wstring:4:help  </hp:stringParam><hp:stringParam name=\"Direction\">old</hp:stringParam><hp:stringParam name=\"HelpState\">help</hp:stringParam></hp:parameters></hp:fieldBegin></hp:ctrl><hp:t>field</hp:t><hp:ctrl><hp:fieldEnd beginIDRef=\"1\" fieldid=\"627272811\"/></hp:ctrl><hp:t> body</hp:t></hp:run></hp:p>" ++ "</hs:sec>");
        changes[used] = .{ .entry_index = index, .bytes = replacement };
        used += 1;
    }
    try std.testing.expectEqual(@as(usize, 2), used);
    return @import("../zip/replace_writer.zig").write(a, blank, &changes, .{});
}
fn selected(session: *const editor.Session) !usize {
    for (session.sections[0].tree.elements, 0..) |node, i| {
        if (node.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) return i;
    }
    return error.ExpectedField;
}
const update: params.Update = .{ .expected = .{ .direction = "old", .memo = "help" }, .direction = "new", .memo = "new help" };
fn attempt(input: []const u8, offset: ?usize) !usize {
    var failing = std.testing.FailingAllocator.init(a, .{});
    const allocator = failing.allocator();
    var session = try editor.open(allocator, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try histories.History.initV2(&session, .{});
    defer history.deinit();
    const bullet: histories.Command = .{ .kind = .paragraph_bullet, .section = 0, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "", .paragraph_bullet = .{ .id = 7 } };
    try std.testing.expect(try history.apply(&session, bullet));
    var clear = bullet;
    clear.paragraph_bullet = .{ .id = null };
    try std.testing.expect(try history.apply(&session, clear));
    try std.testing.expect(try history.undo(&session));
    const before = try session.save();
    defer allocator.free(before);
    const revision = history.revision();
    const command: histories.Command = .{ .kind = .named_field_parameters, .section = 0, .paragraph = 3, .begin_element = try selected(&session), .expected_field_name = "cross-feature", .field_parameters = &update, .start = 0, .deleted = 0, .inserted = "" };
    const first = failing.alloc_index;
    if (offset) |i| failing.fail_index = first + i;
    const result = history.apply(&session, command);
    const allocations = failing.alloc_index - first;
    failing.fail_index = std.math.maxInt(usize);
    const saved = try session.save();
    defer allocator.free(saved);
    if (offset != null) {
        try std.testing.expectError(error.OutOfMemory, result);
        try std.testing.expectEqual(revision, history.revision());
        try std.testing.expectEqual(@as(usize, 1), history.stats().redoCount);
        try std.testing.expect(!history.stats().poisoned);
        try std.testing.expectEqualSlices(u8, before, saved);
    } else {
        try std.testing.expect(try result);
        try std.testing.expect(try history.undo(&session));
        const undone = try session.save();
        defer allocator.free(undone);
        try std.testing.expectEqualSlices(u8, before, undone);
        try std.testing.expect(try history.redo(&session));
        const redone = try session.save();
        defer allocator.free(redone);
        try std.testing.expectEqualSlices(u8, saved, redone);
    }
    return allocations;
}
test "named field parameter rebase preserves paragraph resources and redo at every allocation failure" {
    const input = try fixture();
    defer a.free(input);
    const count = try attempt(input, null);
    for (0..count) |i| _ = try attempt(input, i);
    std.debug.print("{d} paragraph-format rebase allocation rollback points\n", .{count});
}

test "named field parameter rebase late failure restores pending resources and redo" {
    const input = try fixture();
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try histories.History.initV2(&session, .{});
    defer history.deinit();
    const bullet: histories.Command = .{ .kind = .paragraph_bullet, .section = 0, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "", .paragraph_bullet = .{ .id = 7 } };
    try std.testing.expect(try history.apply(&session, bullet));
    var clear = bullet;
    clear.paragraph_bullet = .{ .id = null };
    try std.testing.expect(try history.apply(&session, clear));
    try std.testing.expect(try history.undo(&session));
    const revision = history.revision();
    const before = try session.save();
    defer a.free(before);
    const command: histories.Command = .{ .kind = .named_field_parameters, .section = 0, .paragraph = 3, .begin_element = try selected(&session), .expected_field_name = "cross-feature", .field_parameters = &update, .start = 0, .deleted = 0, .inserted = "" };
    // The second request still expects the original values after the first wrote.
    try std.testing.expectError(error.NamedFieldParametersMismatch, history.applyBatch(&session, &.{ command, command }));
    try std.testing.expectEqual(revision, history.revision());
    try std.testing.expectEqual(@as(usize, 1), history.stats().redoCount);
    try std.testing.expect(!history.stats().poisoned);
    const restored = try session.save();
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, before, restored);
    try std.testing.expect(try history.redo(&session));
}
