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

// Two real package sections, deliberately identical form-node ordinals but
// different values. A copied Session/Section is not the cross-section oracle.
fn distinctSectionInput() ![]u8 {
    const f = @import("test_package_fixture.zig");
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run>";
    const suffix = "</p:run></p:p></s:sec>";
    return f.storedZip(a, &.{
        .{ .name = "mimetype", .data = @import("package.zig").mime },
        .{ .name = "META-INF/container.xml", .data = f.package_container },
        .{ .name = "Contents/content.hpf", .data = f.structure_hpf },
        .{ .name = "Contents/header.xml", .data = f.structure_header },
        .{ .name = "Contents/chapter-A.xml", .data = prefix ++ "<p:checkBtn enabled='1' editable='1' value='CHECKED'/><p:t>section A</p:t>" ++ suffix },
        .{ .name = "Contents/chapter-B.xml", .data = prefix ++ "<p:checkBtn enabled='1' editable='1' value='UNCHECKED'/><p:t>section B</p:t>" ++ suffix },
        .{ .name = "Contents/extra.xml", .data = "<misc/>" },
    });
}

fn checkDistinctForms(session: *editor.Session) !void {
    // OPF spine order is B, A; querying both catches wrong-section slot reuse.
    try std.testing.expectEqual(.unchecked, try session.checkBoxState(0, 3));
    try std.testing.expectEqual(.checked, try session.checkBoxState(1, 3));
}

fn checkParagraphBorrow(session: *editor.Session, section: usize, scope: *Scope) !void {
    var value = try display.read(a, &session.sections[section], session.options);
    defer value.deinit(a);
    try std.testing.expect(value.owned == null);
    try std.testing.expect(value.paragraphs.ptr == scope.cache.paragraphs.ptr);
}

test "paragraph read scope distinct real sections preserve forms and paragraph owners in both teardown orders" {
    for ([_]bool{ false, true }) |close_first_owner_first| {
        const bytes = try distinctSectionInput();
        defer a.free(bytes);
        var session = try editor.open(a, bytes, .{});
        defer session.deinit();
        try std.testing.expectEqual(@as(usize, 2), session.sections.len);
        try checkDistinctForms(&session);
        var first = try Scope.init(&session, 0);
        var first_live = true;
        defer if (first_live) first.deinit();
        // A scope prepared before another attach must recheck the same slot.
        var same = try Scope.init(&session, 0);
        defer same.deinit();
        try first.attach();
        try std.testing.expectError(error.ReadObservationScopeActive, same.attach());
        try std.testing.expectError(error.ReadObservationScopeActive, Scope.init(&session, 0));
        var second = try Scope.init(&session, 1);
        var second_live = true;
        defer if (second_live) second.deinit();
        try second.attach();
        try std.testing.expectError(error.ReadObservationScopeActive, Scope.init(&session, 1));
        try std.testing.expect(session.form_read_context == &first.forms);
        try checkDistinctForms(&session);
        try std.testing.expect(first.forms.choices != null);
        try std.testing.expect(second.forms.choices == null);
        try checkParagraphBorrow(&session, 0, &first);
        try checkParagraphBorrow(&session, 1, &second);
        if (close_first_owner_first) {
            first.deinit();
            first_live = false;
            try std.testing.expect(session.form_read_context == null);
            try std.testing.expect(session.sections[0].paragraph_query_cache == null);
            try checkParagraphBorrow(&session, 1, &second);
            try checkDistinctForms(&session);
            second.deinit();
            second_live = false;
        } else {
            second.deinit();
            second_live = false;
            try std.testing.expect(session.form_read_context == &first.forms);
            try std.testing.expect(session.sections[1].paragraph_query_cache == null);
            try checkParagraphBorrow(&session, 0, &first);
            try checkDistinctForms(&session);
            first.deinit();
            first_live = false;
        }
        try std.testing.expect(session.form_read_context == null);
        try std.testing.expect(session.header_read_context == null);
        try std.testing.expect(session.sections[0].paragraph_query_cache == null);
        try std.testing.expect(session.sections[1].paragraph_query_cache == null);
        try checkDistinctForms(&session);
        const after = try session.save();
        defer a.free(after);
        try std.testing.expectEqualSlices(u8, bytes, after);
    }
}

test "paragraph read scope distinct sections preserve foreign form slot in both teardown orders" {
    for ([_]bool{ false, true }) |close_first_owner_first| {
        const bytes = try distinctSectionInput();
        defer a.free(bytes);
        var session = try editor.open(a, bytes, .{});
        defer session.deinit();
        var first = try Scope.init(&session, 0);
        var first_live = true;
        defer if (first_live) first.deinit();
        try first.attach();
        var second = try Scope.init(&session, 1);
        var second_live = true;
        defer if (second_live) second.deinit();
        try second.attach();
        var foreign = @import("form_read_context.zig").Context.init(&session, 1);
        defer foreign.deinit();
        session.form_read_context = &foreign;
        defer session.form_read_context = null;
        if (close_first_owner_first) {
            first.deinit();
            first_live = false;
            try std.testing.expect(session.form_read_context == &foreign);
            second.deinit();
            second_live = false;
        } else {
            second.deinit();
            second_live = false;
            try std.testing.expect(session.form_read_context == &foreign);
            first.deinit();
            first_live = false;
        }
        try std.testing.expect(session.form_read_context == &foreign);
        try std.testing.expect(session.sections[0].paragraph_query_cache == null);
        try std.testing.expect(session.sections[1].paragraph_query_cache == null);
        try checkDistinctForms(&session);
        // The still-published foreign slot continues to exclude its own section.
        try std.testing.expectError(error.ReadObservationScopeActive, Scope.init(&session, 1));
        session.mutation_serial += 1;
        try std.testing.expectError(error.StaleParagraphReadScope, session.checkBoxState(1, 3));
    }
}

test "paragraph read scope different section attach preserves an already published foreign form owner" {
    const bytes = try distinctSectionInput();
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var foreign = @import("form_read_context.zig").Context.init(&session, 1);
    defer foreign.deinit();
    session.form_read_context = &foreign;
    defer session.form_read_context = null;
    try std.testing.expectError(error.ReadObservationScopeActive, Scope.init(&session, 1));
    var scope = try Scope.init(&session, 0);
    var live = true;
    defer if (live) scope.deinit();
    try scope.attach();
    try std.testing.expect(session.form_read_context == &foreign);
    try checkDistinctForms(&session);
    try checkParagraphBorrow(&session, 0, &scope);
    scope.deinit();
    live = false;
    try std.testing.expect(session.form_read_context == &foreign);
    try std.testing.expect(session.sections[0].paragraph_query_cache == null);
    try checkDistinctForms(&session);
}
