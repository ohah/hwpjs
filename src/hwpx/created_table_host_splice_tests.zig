const std = @import("std");

fn verifyFailedSplice(a: std.mem.Allocator, session: *const @import("editor_session.zig").Session, before: []const u8, unit: u32) !void {
    // Verification must not reuse the injected failing allocator or deinit owners.
    var view = session.*;
    view.allocator = a;
    const after = try view.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqual(unit, session.sections[0].created_tables.entries.items[0].anchor.unit);
}
test "created table field style leaves unsupported source kinds in their original adapter" {
    const a = std.testing.allocator;
    const editor = @import("editor_session.zig");
    const bytes = try @import("test_formula_fixture.zig").zipWithParagraphs(a, "<p:p><p:run><p:ctrl><p:fieldBegin id='8' type='DATE'/></p:ctrl><p:t>body</p:t><p:ctrl><p:fieldEnd beginIDRef='8'/></p:ctrl></p:run></p:p>");
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var counters: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &session.sections[0].tree, &session.sections[0].sites, session.sections[0].locations, editor.siteOptions(session.options), &counters);
    defer values.deinit(a);
    try @import("character_style_field_positions.zig").retain(&session, 0, &values);
    try std.testing.expect(values.paragraphs[0].field_positions == null);
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}
test "created table field style ownership retains all linked rows under allocation failures" {
    const a = std.testing.allocator;
    const editor = @import("editor_session.zig");
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwpx", a, .limited(4000000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var counters: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &session.sections[0].tree, &session.sections[0].sites, session.sections[0].locations, editor.siteOptions(session.options), &counters);
    defer values.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, original: *const editor.Session, initial: *const @import("paragraph_structure_values.zig").Values) !void {
            var candidate = try initial.clone(allocator);
            defer candidate.deinit(allocator);
            var view = original.*;
            view.allocator = allocator;
            try @import("character_style_field_positions.zig").retain(&view, 0, &candidate);
            for (candidate.paragraphs) |row| try std.testing.expect(row.field_positions != null);
            for (initial.paragraphs) |row| try std.testing.expect(row.field_positions == null);
            for (candidate.paragraphs) |*row| try std.testing.expect(try @import("field_original_passthrough.zig").unchanged(&original.sections[0].tree, row, &original.sections[0].sites));
            const row = &candidate.paragraphs[0];
            const old = row.sites.items[0].text[0];
            row.sites.items[0].text[0] = if (old == 'X') 'Y' else 'X';
            try std.testing.expect(!try @import("field_original_passthrough.zig").unchanged(&original.sections[0].tree, row, &original.sections[0].sites));
            row.sites.items[0].text[0] = old;
        }
    }.run, .{ &session, &values });
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}
test "created table field label allocation failure sweep restores complete saved state" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwpx", a, .limited(4000000));
    defer a.free(bytes);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, input: []const u8) !void {
            var session = try @import("editor_session.zig").open(allocator, input, .{});
            defer session.deinit();
            var table = try @import("created_table_prepare.zig").prepare(&session, 0, 3, 5, 1, 1, 100, 17, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 });
            defer table.deinit(allocator);
            _ = try @import("created_table_session.zig").stage(&session, 0, 3, 5, &table);
            const labels = try session.fieldLabels(0, 3);
            defer allocator.free(labels);
            const before = try session.save();
            defer allocator.free(before);
            _ = session.spliceFieldLabel(0, 3, labels[0].begin_element, 0, 0, "😀") catch |err| {
                try @import("../testing/checked_allocator.zig").run(verifyFailedSplice, .{ &session, before, @as(u32, 5) });
                return err;
            };
            try std.testing.expectEqual(@as(u32, 7), session.sections[0].created_tables.entries.items[0].anchor.unit);
            try std.testing.expectEqualSlices(u8, input, session.source);
        }
    }.run, .{bytes});
}

test "created table after crossing field label shifts atomically with label history" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwpx", a, .limited(4000000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    var table = try @import("created_table_prepare.zig").prepare(&session, 0, 3, 5, 1, 1, 100, 17, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 });
    defer table.deinit(a);
    _ = try @import("created_table_session.zig").stage(&session, 0, 3, 5, &table);
    const labels = try session.fieldLabels(0, 3);
    defer a.free(labels);
    const before = try session.save();
    defer a.free(before);
    var history = try @import("editor_history.zig").History.init(&session, 8, 4000000);
    defer history.deinit();
    const command: @import("editor_history.zig").Command = .{ .kind = .field, .section = 0, .paragraph = 3, .begin_element = labels[0].begin_element, .start = 0, .deleted = 0, .inserted = "😀" };
    try std.testing.expect(try history.apply(&session, command));
    try std.testing.expectEqual(@as(u32, 7), session.sections[0].created_tables.entries.items[0].anchor.unit);
    const after = try session.save();
    defer a.free(after);
    try std.testing.expect(try history.undo(&session));
    var invalid = command;
    invalid.inserted = &.{0};
    try std.testing.expectError(error.InvalidXmlCharacter, history.apply(&session, invalid));
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, before, unchanged);
    try std.testing.expectEqual(@as(u32, 5), session.sections[0].created_tables.entries.items[0].anchor.unit);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, after, redone);
}

test "created table source field exterior insertion and prefix preserve linked labels" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwpx", a, .limited(4000000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    var table = try @import("created_table_prepare.zig").prepare(&session, 0, 2, 0, 1, 1, 100, 17, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 });
    defer table.deinit(a);
    try std.testing.expectError(error.ProtectedFieldRange, @import("created_table_session.zig").stage(&session, 0, 2, 7, &table));
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].created_tables.entries.items.len);
    _ = try @import("created_table_session.zig").stage(&session, 0, 2, 0, &table);
    const labels = try session.fieldLabels(0, 2);
    defer a.free(labels);
    try std.testing.expect(try session.splice(0, 2, 0, 0, "😀"));
    try std.testing.expectEqual(@as(u32, 2), session.sections[0].created_tables.entries.items[0].anchor.unit);
    const after_labels = try session.fieldLabels(0, 2);
    defer a.free(after_labels);
    try std.testing.expectEqual(labels[0].start + 2, after_labels[0].start);
    try std.testing.expectEqual(labels[0].end + 2, after_labels[0].end);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}

test "created table flat formula inputs recalculate reopen and roll back invalid number" {
    try @import("../testing/checked_allocator.zig").run(verifyFlatFormulaInputs, .{});
}

test "created table pending body host permits existing formula result edits and reopened identity" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4000000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    var table = try @import("created_table_prepare.zig").prepare(&session, 0, 1, 0, 1, 1, 100, 17, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 });
    defer table.deinit(a);
    try std.testing.expect(try @import("created_table_session.zig").stage(&session, 0, 1, 0, &table));
    const target = (try @import("formula_result_targets.zig").select(&session, 0, 24, 0, 0)).?;
    try std.testing.expect(try session.spliceManualFormulaResult(0, target.begin_element, 0, 0, "표뒤😀<&"));
    const text = try @import("formula_result_projection.zig").readText(&session, 0, 24);
    defer a.free(text);
    try std.testing.expectEqualStrings("표뒤😀<&67.5", text);
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try @import("editor_session.zig").open(a, saved, .{});
    defer reopened.deinit();
    var current = try @import("formula_current_snapshot.zig").read(a, &reopened, 0);
    defer current.deinit(a);
    try std.testing.expectEqualStrings(text, current.rows[0].values.last_result.?);
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}

fn verifyFlatFormulaInputs(a: std.mem.Allocator) !void {
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4000000));
    defer a.free(bytes);
    for ([_]usize{ 1, 20 }) |host| {
        var session = try @import("editor_session.zig").open(a, bytes, .{});
        defer session.deinit();
        var table = try @import("created_table_prepare.zig").prepare(&session, 0, host, 0, 1, 1, 100, 17, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 });
        defer table.deinit(a);
        if (host == 20) {
            try std.testing.expectError(error.UnsupportedFormulaCellContent, @import("created_table_session.zig").stage(&session, 0, host, 0, &table));
            try std.testing.expectEqual(@as(usize, 0), session.sections[0].created_tables.entries.items.len);
            const unchanged = try session.save();
            defer a.free(unchanged);
            try std.testing.expectEqualSlices(u8, bytes, unchanged);
            continue;
        }
        _ = try @import("created_table_session.zig").stage(&session, 0, host, 0, &table);
        try std.testing.expect(try session.splice(0, 20, 0, 4, "100"));
        var current = try @import("formula_current_snapshot.zig").read(a, &session, 0);
        defer current.deinit(a);
        try std.testing.expectEqualStrings("156.3", current.rows[0].values.last_result.?);
        const saved = try session.save();
        defer a.free(saved);
        try std.testing.expectError(error.InvalidFormulaNumber, session.splice(0, 20, 0, 3, "bad"));
        const refused = try session.save();
        defer a.free(refused);
        try std.testing.expectEqualSlices(u8, saved, refused);
        var reopened = try @import("editor_session.zig").open(a, saved, .{});
        defer reopened.deinit();
        var result = try @import("formula_current_snapshot.zig").read(a, &reopened, 0);
        defer result.deinit(a);
        try std.testing.expectEqualStrings("156.3", result.rows[0].values.last_result.?);
        try std.testing.expectEqualSlices(u8, bytes, session.source);
    }
}

test "created table anchored mode retains structural paragraph protection" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4000000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    _ = try session.splitParagraph(0, 2, 0, 0);
    try std.testing.expect(!try @import("created_table_host_splice.zig").supportsMode(&session, 0, true));
    try std.testing.expect(!try @import("created_table_host_splice.zig").supportsFieldLabelMode(&session, 0));
    try std.testing.expect(try @import("created_table_host_splice.zig").supportsMode(&session, 0, false));
}

test "created table anchored source input shifts table but refuses original object deletion" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4000000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    var table = try @import("created_table_prepare.zig").prepare(&session, 0, 1, 1, 1, 1, 100, 17, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 });
    defer table.deinit(a);
    _ = try @import("created_table_session.zig").stage(&session, 0, 1, 1, &table);
    const before = try session.save();
    defer a.free(before);
    try std.testing.expectError(error.ProtectedInlineControl, session.spliceAnchored(0, 1, 0, 1, ""));
    const refused = try session.save();
    defer a.free(refused);
    try std.testing.expectEqualSlices(u8, before, refused);
    try std.testing.expect(try session.spliceAnchored(0, 1, 0, 0, "😀"));
    try std.testing.expectEqual(@as(u32, 3), session.sections[0].created_tables.entries.items[0].anchor.unit);
    const after = try session.save();
    defer a.free(after);
    var reopened = try @import("editor_session.zig").open(a, after, .{});
    defer reopened.deinit();
    const text = try reopened.anchorText(0, 1);
    defer a.free(text);
    try std.testing.expectEqualStrings("😀\xef\xbf\xbc\xef\xbf\xbc\xef\xbf\xbc", text);
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}

test "created table insertion honors every existing drawing anchor boundary" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4000000));
    defer a.free(bytes);
    for (0..3) |unit| {
        var session = try @import("editor_session.zig").open(a, bytes, .{});
        defer session.deinit();
        var table = try @import("created_table_prepare.zig").prepare(&session, 0, 1, @intCast(unit), 1, 1, 100, 17, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 });
        defer table.deinit(a);
        _ = try @import("created_table_session.zig").stage(&session, 0, 1, @intCast(unit), &table);
        const saved = try session.save();
        defer a.free(saved);
        var reopened = try @import("editor_session.zig").open(a, saved, .{});
        defer reopened.deinit();
        const text = try reopened.anchorText(0, 1);
        defer a.free(text);
        try std.testing.expectEqualStrings("\xef\xbf\xbc\xef\xbf\xbc\xef\xbf\xbc", text);
        try std.testing.expectEqualSlices(u8, bytes, session.source);
    }
}

test "created table host mode allows flat formula sections without mutating source" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4000000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const before = try session.save();
    defer a.free(before);
    try std.testing.expect(try @import("created_table_host_splice.zig").supportsMode(&session, 0, false));
    const after = try session.save();
    defer a.free(after);
    try std.testing.expectEqualSlices(u8, before, after);
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}

test "created table plain host allocation failure sweep restores complete saved state" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4000000));
    defer a.free(bytes);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, input: []const u8) !void {
            var session = try @import("editor_session.zig").open(allocator, input, .{});
            defer session.deinit();
            var table = try @import("created_table_prepare.zig").prepare(&session, 0, 2, 2, 1, 1, 100, 17, .{ .paragraph = 1, .character = 1, .style = 0, .border_fill = 1 });
            defer table.deinit(allocator);
            _ = try @import("created_table_session.zig").stage(&session, 0, 2, 2, &table);
            const before = try session.save();
            defer allocator.free(before);
            _ = session.splice(0, 2, 0, 0, "😀") catch |err| {
                try @import("../testing/checked_allocator.zig").run(verifyFailedSplice, .{ &session, before, @as(u32, 2) });
                return err;
            };
            try std.testing.expectEqual(@as(u32, 4), session.sections[0].created_tables.entries.items[0].anchor.unit);
            try std.testing.expectEqualSlices(u8, input, session.source);
        }
    }.run, .{bytes});
}

test "created table plain host splice rebases Unicode and restores history after late refusal" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(4000000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    var table = try @import("created_table_prepare.zig").prepare(&session, 0, 2, 2, 1, 1, 100, 17, .{ .paragraph = 1, .character = 1, .style = 0, .border_fill = 1 });
    defer table.deinit(a);
    const original = try session.anchorText(0, 2);
    defer a.free(original);
    _ = try table.replaceText(a, 0, 0, "셀😀", 100);
    _ = try @import("created_table_session.zig").stage(&session, 0, 2, 2, &table);
    const host_splice = @import("created_table_host_splice.zig");
    try std.testing.expect(try host_splice.supportsMode(&session, 0, false));
    try std.testing.expect(try host_splice.supportsMode(&session, 0, true));
    try std.testing.expectError(error.InvalidSectionIndex, host_splice.supportsMode(&session, session.sections.len, false));
    const staged = try session.save();
    defer a.free(staged);
    var history = try @import("editor_history.zig").History.init(&session, 8, 4000000);
    defer history.deinit();
    const command: @import("editor_history.zig").Command = .{ .section = 0, .paragraph = 2, .start = 0, .deleted = 0, .inserted = "😀" };
    try std.testing.expect(try history.apply(&session, command));
    try std.testing.expectEqual(@as(u32, 4), session.sections[0].created_tables.entries.items[0].anchor.unit);
    const edited = try session.save();
    defer a.free(edited);
    var reopened = try @import("editor_session.zig").open(a, edited, .{});
    defer reopened.deinit();
    const text = try reopened.anchorText(0, 2);
    defer a.free(text);
    const boundary = try @import("text_site_edit.zig").bytePosition(original, 2);
    const expected = try std.fmt.allocPrint(a, "😀{s}\xef\xbf\xbc{s}", .{ original[0..boundary], original[boundary..] });
    defer a.free(expected);
    try std.testing.expectEqualStrings(expected, text);
    try std.testing.expect(try history.undo(&session));
    try std.testing.expectEqual(@as(u32, 2), session.sections[0].created_tables.entries.items[0].anchor.unit);
    try std.testing.expectError(error.ProtectedCreatedTableAnchor, session.splice(0, 2, 0, 3, ""));
    var refused = command;
    refused.inserted = &.{0};
    try std.testing.expectError(error.InvalidXmlCharacter, history.apply(&session, refused));
    refused.inserted = "";
    try std.testing.expect(!try history.apply(&session, refused));
    session.options.max_output_bytes = staged.len;
    refused.inserted = "길어지는 입력";
    try std.testing.expectError(error.LimitExceeded, history.apply(&session, refused));
    session.options.max_output_bytes = 128 * 1024 * 1024;
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, staged, unchanged);
    try std.testing.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, edited, redone);
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}
