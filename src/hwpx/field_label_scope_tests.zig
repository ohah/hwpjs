//! Read/edit permission stays local; unresolved markers are never repaired.
const std = @import("std");
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const known = "<p:p><p:run><p:ctrl><p:fieldBegin id='101' type='CLICK_HERE'/></p:ctrl><p:t>known</p:t><p:ctrl><p:fieldEnd beginIDRef='101'/></p:ctrl></p:run></p:p>";
const unresolved = "<p:p><p:run><p:ctrl><p:fieldBegin id='102' type='CLICK_HERE'/></p:ctrl><p:t>unknown</p:t></p:run></p:p>";

test "field local source filtering retains crossing and empty paragraphs without outside targets" {
    const a = std.testing.allocator;
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, prefix ++
        "<p:p/>" ++
        "<p:p><p:run><p:ctrl><p:fieldBegin id='101' type='CLICK_HERE'/></p:ctrl><p:t>A</p:t></p:run></p:p>" ++
        "<p:p><p:run><p:t></p:t></p:run></p:p>" ++
        "<p:p><p:run><p:t>B</p:t><p:ctrl><p:fieldEnd beginIDRef='101'/></p:ctrl></p:run></p:p>" ++
        "<p:p><p:run><p:t>after</p:t></p:run></p:p></s:sec>");
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    var begin: ?u32 = null;
    for (1..6) |paragraph| {
        const targets = try session.fieldLabels(0, paragraph);
        defer a.free(targets);
        if (paragraph == 1 or paragraph == 5) {
            try std.testing.expectEqual(@as(usize, 0), targets.len);
            continue;
        }
        try std.testing.expectEqual(@as(usize, 1), targets.len);
        if (begin) |identity| try std.testing.expectEqual(identity, targets[0].begin_element) else begin = targets[0].begin_element;
        try std.testing.expectEqual(@as(u32, 0), targets[0].start);
        try std.testing.expectEqual(@as(u32, if (paragraph == 3) 0 else 1), targets[0].end);
        try std.testing.expectEqual(targets[0].begin_element, (try @import("field_label_range_target.zig").select(&session, 0, paragraph, 0, 0)).?.begin_element);
    }
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}

test "field label local lease preserves unknown diagnostics and all failed allocations" {
    const a = std.testing.allocator;
    const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, prefix ++ known ++ "<p:subList>" ++ unresolved ++ "</p:subList></s:sec>");
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    try std.testing.expect(session.source_fields != null);
    try std.testing.expectEqual(@as(usize, 1), session.source_fields.?.report.unmatched_begins);
    var failing = std.testing.FailingAllocator.init(a, .{ .fail_index = 0 });
    var borrowed = session;
    borrowed.allocator = failing.allocator();
    var cached = try @import("source_field_analysis.zig").leaseForLabels(&borrowed, 0);
    defer cached.deinit(borrowed.allocator);
    try std.testing.expect(!cached.owned);
    try std.testing.expect(try @import("source_field_analysis.zig").hasFields(&borrowed, 0));
    try std.testing.expectError(error.InvalidFieldLinks, @import("source_field_analysis.zig").lease(&borrowed));
    try std.testing.expect(!failing.has_induced_failure);
    var sections = [_]@import("editor_session.zig").Section{session.sections[0]};
    var changed = session;
    changed.sections = &sections;
    changed.sections[0].tree.source = changed.sections[0].tree.source[0 .. changed.sections[0].tree.source.len - 1];
    try std.testing.expectError(error.SourceBindingMismatch, @import("source_field_analysis.zig").leaseForLabels(&changed, 0));
    try std.testing.expectError(error.SourceBindingMismatch, @import("source_field_analysis.zig").lease(&changed));
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, input: []const u8) !void {
            var current = try @import("editor_session.zig").open(allocator, input, .{});
            defer current.deinit();
            try std.testing.expect(current.source_fields != null);
            try std.testing.expectEqual(@as(usize, 1), current.source_fields.?.report.unmatched_begins);
            try std.testing.expectEqual(@as(usize, 1), current.source_fields.?.fields.len);
        }
    }.run, .{bytes});
    try std.testing.expectError(error.InvalidFieldLinks, @import("source_field_analysis.zig").lease(&session));
    const labels = try session.fieldLabels(0, 1);
    defer a.free(labels);
    try std.testing.expectEqual(@as(usize, 1), labels.len);
    const blocked = try session.fieldLabels(0, 2);
    defer a.free(blocked);
    try std.testing.expectEqual(@as(usize, 0), blocked.len);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("editor_session.zig").Session) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            proxy.source_fields = null;
            var view = try @import("source_field_analysis.zig").leaseForLabels(&proxy, 0);
            defer view.deinit(allocator);
            try std.testing.expect(view.owned);
            try std.testing.expectEqual(@as(usize, 1), view.source.report.unmatched_begins);
            try std.testing.expectEqual(@as(usize, 1), view.source.fields.len);
            const target = (try @import("field_label_range_target.zig").select(&proxy, 0, 1, 0, 0)).?;
            try std.testing.expectEqual(@as(u32, 5), target.end);
            try std.testing.expect(proxy.source_fields == null);
        }
    }.run, .{&session});
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, bytes, unchanged);
    try std.testing.expect(try session.spliceFieldLabel(0, 1, labels[0].begin_element, 0, 0, "앞😀"));
    try std.testing.expectEqualStrings("앞😀known", session.sections[0].sites.items[0].text);
    try std.testing.expectEqualStrings("unknown", session.sections[0].sites.items[1].text);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectError(error.InvalidFieldLinks, @import("source_field_analysis.zig").lease(&reopened));
    // Reopening makes persisted XML the source; pending dirty edits are empty.
    try std.testing.expectEqual(@as(usize, 0), reopened.sections[0].field_dirty.items.len);
    var view = try @import("source_field_analysis.zig").leaseForLabels(&reopened, 0);
    defer view.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), view.source.report.unmatched_begins);
    try std.testing.expectEqual(true, view.source.report.markers[view.source.fields[0].begin_marker].begin.?.dirty.?);
}

test "nested label empty children and unsupported ancestors never grant parent overwrite" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "CLICK_HERE", "UNKNOWN" }, 0..) |kind, ordinal| {
        const xml = try std.fmt.allocPrint(a, "{s}<p:p><p:run><p:ctrl><p:fieldBegin id='101' type='{s}'/></p:ctrl><p:t>A</p:t><p:ctrl><p:fieldBegin id='102' type='CLICK_HERE'/></p:ctrl><p:t></p:t><p:ctrl><p:fieldEnd beginIDRef='102'/></p:ctrl><p:ctrl><p:fieldEnd beginIDRef='101'/></p:ctrl></p:run></p:p></s:sec>", .{ prefix, kind });
        defer a.free(xml);
        const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
        defer a.free(bytes);
        var session = try @import("editor_session.zig").open(a, bytes, .{});
        defer session.deinit();
        const labels = try session.fieldLabels(0, 1);
        defer a.free(labels);
        if (ordinal == 0) {
            try std.testing.expectEqual(@as(usize, 2), labels.len);
            const child = (try @import("field_label_range_target.zig").select(&session, 0, 1, 1, 1)).?;
            try std.testing.expectEqual(labels[1].begin_element, child.begin_element);
            try std.testing.expectEqual(child.start, child.end);
            try std.testing.expectError(error.ProtectedFieldRange, session.spliceFieldLabel(0, 1, labels[0].begin_element, 1, 0, "blocked"));
            try std.testing.expectError(error.ProtectedFieldRange, session.spliceFieldLabel(0, 1, labels[0].begin_element, 0, 1, "blocked"));
        } else {
            try std.testing.expectEqual(@as(usize, 0), labels.len);
            try std.testing.expectEqual(null, try @import("field_label_range_target.zig").select(&session, 0, 1, 1, 1));
        }
        const saved = try session.save();
        defer a.free(saved);
        try std.testing.expectEqualSlices(u8, bytes, saved);
    }
}

test "field label local lease rejects root unknown and unresolved own-list overlap" {
    const a = std.testing.allocator;
    for ([_][]const u8{
        prefix ++ known ++ unresolved ++ "</s:sec>",
        prefix ++ "<p:subList>" ++ unresolved ++ known ++ "</p:subList></s:sec>",
    }, 0..) |xml, ordinal| {
        const bytes = try @import("test_formula_fixture.zig").zipWithSection(a, xml);
        defer a.free(bytes);
        var session = try @import("editor_session.zig").open(a, bytes, .{});
        defer session.deinit();
        if (ordinal == 0) {
            try std.testing.expectError(error.InvalidFieldLinks, session.fieldLabels(0, 1));
        } else {
            const labels = try session.fieldLabels(0, 2);
            defer a.free(labels);
            try std.testing.expectEqual(@as(usize, 0), labels.len);
        }
        const saved = try session.save();
        defer a.free(saved);
        try std.testing.expectEqualSlices(u8, bytes, saved);
    }
}
