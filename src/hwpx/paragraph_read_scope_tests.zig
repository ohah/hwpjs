const std = @import("std");
const a = std.testing.allocator;
const editor = @import("editor_session.zig");
const Scope = @import("paragraph_read_scope.zig").Scope;
const display = @import("display_current_paragraphs.zig");
const xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>abc</p:t></p:run></p:p></s:sec>";

fn compare(session: *editor.Session) !void {
    var expected = try display.readUncached(a, &session.sections[0], session.options);
    defer expected.deinit(a);
    var scope = try Scope.init(session, 0);
    defer scope.deinit();
    try scope.attach();
    try std.testing.expectError(error.ReadObservationScopeActive, Scope.init(session, 0));
    var denied = std.testing.FailingAllocator.init(a, .{ .fail_index = 0 });
    var actual = try display.read(denied.allocator(), &session.sections[0], session.options);
    defer actual.deinit(a);
    try std.testing.expect(actual.owned == null);
    try std.testing.expect(actual.paragraphs.ptr == scope.cache.paragraphs.ptr);
    if (session.sections[0].structure_values) |values| {
        try std.testing.expect(scope.view.owned == null);
        try std.testing.expect(actual.paragraphs.ptr == values.paragraphs.ptr);
    }
    try std.testing.expectEqual(expected.paragraphs.len, actual.paragraphs.len);
    for (expected.paragraphs, actual.paragraphs) |left, right| {
        try std.testing.expectEqual(left.template_element, right.template_element);
        try std.testing.expectEqual(left.sites.items.len, right.sites.items.len);
        for (left.sites.items, right.sites.items) |ls, rs| try std.testing.expectEqualStrings(ls.text, rs.text);
    }
}

test "paragraph read scope untouched edited undo and structural values" {
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    try compare(&session);
    var history = try @import("editor_history.zig").History.init(&session, 8, 1000000);
    defer history.deinit();
    try std.testing.expect(try history.apply(&session, .{ .kind = .plain, .section = 0, .paragraph = 1, .start = 1, .deleted = 1, .inserted = "XYZ" }));
    try compare(&session);
    try std.testing.expect(try history.undo(&session));
    try compare(&session);
    try std.testing.expect(try session.splitParagraph(0, 1, 1, 0));
    try std.testing.expect(session.sections[0].structure_values != null);
    try compare(&session);
    // Borrowed structure_values survive scope teardown.
    try compare(&session);
}

fn allocationProbe(allocator: std.mem.Allocator, bytes: []const u8) !void {
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    session.allocator = allocator;
    defer session.allocator = a;
    var scope = Scope.init(&session, 0) catch |err| {
        try std.testing.expect(session.sections[0].paragraph_query_cache == null);
        return err;
    };
    defer scope.deinit();
    try scope.attach();
}
test "paragraph read scope OOM rollback invalid section stale serial and exact owner" {
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(bytes);
    try std.testing.checkAllAllocationFailures(a, allocationProbe, .{bytes});
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    try std.testing.expectError(error.InvalidSectionIndex, Scope.init(&session, 1));
    var scope = try Scope.init(&session, 0);
    try scope.attach();
    session.mutation_serial += 1;
    try std.testing.expectError(error.StaleParagraphReadScope, display.read(a, &session.sections[0], session.options));
    var foreign = scope.cache;
    session.sections[0].paragraph_query_cache = &foreign;
    scope.deinit();
    try std.testing.expect(session.sections[0].paragraph_query_cache == &foreign);
    session.sections[0].paragraph_query_cache = null;
}

test "paragraph read scope raw serial mutation rejects stale borrowed values" {
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var scope = try Scope.init(&session, 0);
    try scope.attach();
    try std.testing.expect(try session.splice(0, 1, 0, 1, "changed"));
    try std.testing.expectError(error.StaleParagraphReadScope, display.read(a, &session.sections[0], session.options));
    scope.deinit();
    try compare(&session);
}

test "paragraph read scope snapshot retains editable ownership without observation lease" {
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var scope = try Scope.init(&session, 0);
    try scope.attach();
    var checkpoint = try @import("editor_checkpoint.zig").capture(&session, 1000000);
    defer checkpoint.deinit();
    scope.deinit();
    try std.testing.expect(try session.splice(0, 1, 0, 1, "changed"));
    try checkpoint.exchange(&session);
    try std.testing.expect(session.sections[0].paragraph_query_cache == null);
    var view = try display.read(a, &session.sections[0], session.options);
    defer view.deinit(a);
    try std.testing.expectEqualStrings("abc", view.paragraphs[0].sites.items[0].text);
}

test "paragraph read scope proxy Section cannot inherit original observation authority" {
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var scope = try Scope.init(&session, 0);
    defer scope.deinit();
    try scope.attach();
    const sections = try a.dupe(editor.Section, session.sections);
    defer a.free(sections);
    var view = try display.read(a, &sections[0], session.options);
    defer view.deinit(a);
    try std.testing.expect(view.owned != null);
    try std.testing.expect(view.paragraphs.ptr != scope.cache.paragraphs.ptr);
    // A proxy also does not consult the original serial guard.
    session.mutation_serial += 1;
    var fresh = try display.read(a, &sections[0], session.options);
    defer fresh.deinit(a);
    try std.testing.expect(fresh.owned != null);
}

test "paragraph read scope raw Zig distinct sections have independent leases" {
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    // Borrow backing owners; only observation Views are owned by these scopes.
    var sections = [_]editor.Section{ session.sections[0], session.sections[0] };
    var proxy = session;
    proxy.sections = &sections;
    var first = try Scope.init(&proxy, 0);
    defer first.deinit();
    try first.attach();
    try std.testing.expectError(error.ReadObservationScopeActive, Scope.init(&proxy, 0));
    var second = try Scope.init(&proxy, 1);
    defer second.deinit();
    try second.attach();
    try std.testing.expect(sections[0].paragraph_query_cache == &first.cache);
    try std.testing.expect(sections[1].paragraph_query_cache == &second.cache);
}
