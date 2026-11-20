const std = @import("std");
const editor = @import("editor_session.zig");
const analysis = @import("source_field_analysis.zig");
const fixture = @embedFile("test_fixtures/document_text_selected_run.xml");

test "document text batch delegation selected field facts never replace the strict raw lease" {
    const a = std.testing.allocator;
    const bytes = try @import("document_text_test_fixture.zig").inputWithSection(a, fixture);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    try @import("test_expect_owned_error.zig").expect(a, error.InvalidFieldLinks, analysis.leaseForExterior(&session));
    var selected = try analysis.selectedForExterior(&session);
    defer selected.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), selected.fields.len);
    try std.testing.expectEqual(@as(usize, 0), selected.report.duplicate_begin_ids);
    try std.testing.expect(session.source_fields == null);
    try @import("test_expect_owned_error.zig").expect(a, error.InvalidFieldLinks, analysis.leaseForExterior(&session));
    try std.testing.expectEqualSlices(u8, bytes, session.source);
    session.history_delta_managed = true;
    var history = try @import("editor_history.zig").History.initV2(&session, .{ .max_entries = 8 });
    defer history.deinit();
    var lifetime: @import("../model/formatting_binding.zig").State = .{ .epoch = 7, .opened = true };
    const name = try lifetime.session(a);
    defer a.free(name);
    const before = try session.save();
    defer a.free(before);
    const service: @import("document_replace_all.zig").Service = .{ .session = &session, .history = &history, .lifetime = &lifetime };
    try std.testing.expect(try service.apply(a, .{ .binding = .{ .session = name, .revision = history.revision() }, .query = "BASE", .replacement = "안전😀" }));
    var observed = try @import("document_text_snapshot.zig").observe(a, &session, lifetime, history.revision());
    defer observed.deinit();
    try std.testing.expectEqualStrings("안전😀LABEL", observed.snapshot.rows.items[0].text);
    try std.testing.expectEqualStrings("KEEP", observed.snapshot.rows.items[1].text);
    try @import("test_expect_owned_error.zig").expect(a, error.InvalidFieldLinks, analysis.leaseForExterior(&session));
    const after = try session.save();
    defer a.free(after);
    try std.testing.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try std.testing.expectEqualSlices(u8, before, undone);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, after, redone);
}

test "document text batch delegation exterior refusal is atomic for label and mixed matches" {
    const a = std.testing.allocator;
    const bytes = try @import("document_text_test_fixture.zig").inputWithSection(a, fixture);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try @import("editor_history.zig").History.initV2(&session, .{ .max_entries = 8 });
    defer history.deinit();
    var lifetime: @import("../model/formatting_binding.zig").State = .{ .epoch = 7, .opened = true };
    const name = try lifetime.session(a);
    defer a.free(name);
    const before = try session.save();
    defer a.free(before);
    const revision = history.revision();
    const service: @import("document_replace_all.zig").Service = .{ .session = &session, .history = &history, .lifetime = &lifetime };
    for ([_][]const u8{ "LABEL", "A" }) |query| {
        try std.testing.expectError(error.ProtectedFieldRange, service.apply(a, .{ .binding = .{ .session = name, .revision = revision }, .query = query, .replacement = "changed" }));
        const after = try session.save();
        defer a.free(after);
        try std.testing.expectEqualSlices(u8, before, after);
        try std.testing.expectEqual(revision, history.revision());
        try @import("test_expect_owned_error.zig").expect(a, error.InvalidFieldLinks, analysis.leaseForExterior(&session));
    }
}

test "document text batch delegation fieldid never substitutes for begin id or its explicit reference" {
    const a = std.testing.allocator;
    const section_xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>" ++
        "<p:p><p:run><p:ctrl><p:fieldBegin id='7' fieldid='42' type='HYPERLINK'/></p:ctrl><p:t>one</p:t><p:ctrl><p:fieldEnd beginIDRef='7' fieldid='42'/></p:ctrl></p:run></p:p><p:p><p:run><p:ctrl><p:fieldBegin id='8' fieldid='42' type='HYPERLINK'/></p:ctrl><p:t>two</p:t><p:ctrl><p:fieldEnd beginIDRef='8' fieldid='42'/></p:ctrl></p:run></p:p>" ++
        "</s:sec>";
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, section_xml);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var selected = try analysis.selectedForExterior(&session);
    defer selected.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), selected.fields.len);
    try std.testing.expectEqual(@as(usize, 0), selected.report.duplicate_begin_ids);
    const duplicate_section_xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>" ++
        "<p:p><p:run><p:ctrl><p:fieldBegin id='7' fieldid='42' type='HYPERLINK'/></p:ctrl><p:t>one</p:t><p:ctrl><p:fieldEnd beginIDRef='7' fieldid='42'/></p:ctrl></p:run></p:p><p:p><p:run><p:ctrl><p:fieldBegin id='7' fieldid='43' type='HYPERLINK'/></p:ctrl><p:t>two</p:t><p:ctrl><p:fieldEnd beginIDRef='7' fieldid='43'/></p:ctrl></p:run></p:p>" ++
        "</s:sec>";
    const bad_bytes = try @import("test_formula_fixture.zig").zipWithSection(a, duplicate_section_xml);
    defer a.free(bad_bytes);
    var bad = try editor.open(a, bad_bytes, .{});
    defer bad.deinit();
    try @import("test_expect_owned_error.zig").expect(a, error.InvalidFieldLinks, analysis.selectedForExterior(&bad));
}
