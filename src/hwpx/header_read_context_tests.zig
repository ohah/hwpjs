//! Synthetic package observations through real Session and attached Scope.
//! No filesystem fixtures; returned DTO values and error order are the oracle.
const std = @import("std");
const a = std.testing.allocator;
const editor = @import("editor_session.zig");
const headers = @import("header_read_context.zig");
const Scope = @import("paragraph_read_scope.zig").Scope;
const shapes = @import("character_style_resources.zig");
const fonts = @import("font_creation.zig");
const metrics = @import("character_font_metrics.zig");
const strike = @import("character_strike_snapshot.zig");
const underline = @import("character_underline_snapshot.zig");
const section = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7'><p:t>abc</p:t></p:run></p:p></s:sec>";
const prefix = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList>";
const suffix = "</h:refList></h:head>";
const character_rows = "<h:charProperties itemCnt='3'>" ++
    "<h:charPr id='300' height='0'><h:strikeout shape='FUTURE'/><h:underline shape='FUTURE' color='opaque'/></h:charPr>" ++
    "<h:charPr id='7' height='1200'><h:bold/><h:fontRef hangul='9'/><h:ratio hangul='0' latin='120'/><h:spacing hangul='-8'/><h:relSz/><h:strikeout shape='DOT'/><h:underline type='BOTTOM' shape='WAVE' color='#123456'/></h:charPr>" ++
    "<h:charPr id='0'/></h:charProperties>";
const font_rows = "<h:fontfaces itemCnt='1'><h:fontface lang='HANGUL' fontCnt='2'><h:font id='9' face='한글 &amp; Font' type='TTF'><h:typeInfo weight='7'/></h:font><h:font id='40'/></h:fontface></h:fontfaces>";
const header = prefix ++ font_rows ++ character_rows ++ suffix;
const tiny_header = prefix ++ "<h:fontfaces><h:fontface lang='HANGUL'><h:font id='9' face='A'><h:typeInfo weight='7'/></h:font></h:fontface></h:fontfaces><h:charProperties itemCnt='1'><h:charPr id='7'><h:underline type='BOTTOM' shape='SOLID' color='#123456'/></h:charPr></h:charProperties>" ++ suffix;

fn fixture(header_xml: []const u8) ![]u8 {
    return @import("test_formula_fixture.zig").zipWithSectionHeader(a, section, header_xml);
}

// Every allocation has a caller-side lifetime, including nested font/underline strings.
fn compare(session: *editor.Session, reverse: bool) !void {
    const expected_shapes = try shapes.displayShapes(session);
    defer a.free(expected_shapes);
    const expected_fonts = try fonts.list(session);
    defer @import("../model/font_face_value.zig").deinit(a, expected_fonts);
    const expected_metadata = try fonts.metadata(session);
    defer @import("font_face_metadata.zig").deinit(a, expected_metadata);
    const expected_metrics = try metrics.list(session);
    defer a.free(expected_metrics);
    const expected_strike = try strike.read(session);
    defer a.free(expected_strike);
    const expected_underline = try underline.readFull(session);
    defer underline.deinit(a, expected_underline);
    {
        var scope = try Scope.init(session, 0);
        defer scope.deinit();
        try scope.attach();
        // Warm via different consumers before repeating all observations.
        if (reverse) {
            const warm = try underline.readFull(session);
            defer underline.deinit(a, warm);
            _ = try scope.headers.currentHeader(false);
        } else {
            const warm = try shapes.displayShapes(session);
            defer a.free(warm);
        }
        for (0..2) |_| {
            const actual_shapes = try shapes.displayShapes(session);
            defer a.free(actual_shapes);
            try std.testing.expectEqualDeep(expected_shapes, actual_shapes);
            const actual_fonts = try fonts.list(session);
            defer @import("../model/font_face_value.zig").deinit(a, actual_fonts);
            try std.testing.expectEqualDeep(expected_fonts, actual_fonts);
            const actual_metadata = try fonts.metadata(session);
            defer @import("font_face_metadata.zig").deinit(a, actual_metadata);
            try std.testing.expectEqualDeep(expected_metadata, actual_metadata);
            const actual_metrics = try metrics.list(session);
            defer a.free(actual_metrics);
            try std.testing.expectEqualDeep(expected_metrics, actual_metrics);
            const actual_strike = try strike.read(session);
            defer a.free(actual_strike);
            try std.testing.expectEqualDeep(expected_strike, actual_strike);
            const actual_underline = try underline.readFull(session);
            defer underline.deinit(a, actual_underline);
            try std.testing.expectEqualDeep(expected_underline, actual_underline);
        }
    }
    try std.testing.expect(session.header_read_context == null);
    try std.testing.expect(session.sections[0].paragraph_query_cache == null);
}

test "header read context cached and uncached DTOs preserve sparse absent unknown values and call order" {
    const bytes = try fixture(header);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    try compare(&session, false);
    try compare(&session, true);
    const values = try shapes.displayShapes(&session);
    defer a.free(values);
    try std.testing.expectEqual(@as(usize, 3), values.len);
    for (values, [_]u32{ 0, 7, 300 }) |value, id| try std.testing.expectEqual(@as(?u32, id), value.id);
    try std.testing.expect(values[0].height == null);
    try std.testing.expectEqual(@as(?i32, 0), values[2].height);
    const strikes = try strike.read(&session);
    defer a.free(strikes);
    try std.testing.expectEqual(@as(?bool, false), strikes[0].enabled);
    try std.testing.expectEqual(@as(?bool, true), strikes[1].enabled);
    try std.testing.expectEqual(@as(?bool, null), strikes[2].enabled);
    const lines = try underline.readFull(&session);
    defer underline.deinit(a, lines);
    try std.testing.expect(!lines[0].present);
    try std.testing.expectEqual(@import("character_underline_values.zig").Kind.none, lines[0].kind.?);
    try std.testing.expect(lines[2].present and lines[2].kind == null);
    try std.testing.expectEqualStrings("FUTURE", lines[2].shape.?);
    const measured = try metrics.list(&session);
    defer a.free(measured);
    try std.testing.expect(measured[0].values.ratio == null);
    try std.testing.expectEqual(@as(?i32, 0), measured[1].values.ratio.?[0]);
    try std.testing.expectEqual(@as(?i32, -8), measured[1].values.spacing.?[0]);
    try std.testing.expectEqualDeep(@as(metrics.Languages, @splat(null)), measured[1].values.relativeSize.?);
    try std.testing.expectEqualSlices(u8, bytes, session.source);
}

test "header read context returned slices and nested strings remain independent after scope closes" {
    const bytes = try fixture(header);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var scope = try Scope.init(&session, 0);
    var attached = true;
    defer if (attached) scope.deinit();
    try scope.attach();
    const first = try shapes.displayShapes(&session);
    defer a.free(first);
    const second = try shapes.displayShapes(&session);
    defer a.free(second);
    try std.testing.expect(first.ptr != second.ptr);
    first[1].height = -99;
    const fresh = try shapes.displayShapes(&session);
    defer a.free(fresh);
    try std.testing.expectEqual(@as(?i32, 1200), fresh[1].height);
    const names = try fonts.list(&session);
    defer @import("../model/font_face_value.zig").deinit(a, names);
    const other_names = try fonts.list(&session);
    defer @import("../model/font_face_value.zig").deinit(a, other_names);
    for (names, other_names) |left, right| if (left.name) |name| {
        try std.testing.expect(name.ptr != right.name.?.ptr);
        name[0] = 'X';
    };
    const lines = try underline.readFull(&session);
    defer underline.deinit(a, lines);
    const other_lines = try underline.readFull(&session);
    defer underline.deinit(a, other_lines);
    try std.testing.expect(lines[1].shape.?.ptr != other_lines[1].shape.?.ptr);
    try std.testing.expect(lines[1].color.?.ptr != other_lines[1].color.?.ptr);
    lines[1].shape.?[0] = 'X';
    lines[1].color.?[0] = 'X';
    const fresh_lines = try underline.readFull(&session);
    defer underline.deinit(a, fresh_lines);
    try std.testing.expectEqualStrings("WAVE", fresh_lines[1].shape.?);
    try std.testing.expectEqualStrings("#123456", fresh_lines[1].color.?);
    scope.deinit();
    attached = false;
    try std.testing.expect(session.header_read_context == null);
    try std.testing.expectEqual(@as(?i32, 1200), second[1].height);
    try std.testing.expectEqualStrings("한글 & Font", other_names[0].name.?);
    try std.testing.expectEqualStrings("WAVE", other_lines[1].shape.?);
}

const Query = enum { shapes, fonts, metadata, metrics, strike, underline };
fn query(session: *const editor.Session, kind: Query) !void {
    const allocator = session.allocator;
    switch (kind) {
        .shapes => allocator.free(try shapes.displayShapes(session)),
        .fonts => @import("../model/font_face_value.zig").deinit(allocator, try fonts.list(session)),
        .metadata => @import("font_face_metadata.zig").deinit(allocator, try fonts.metadata(session)),
        .metrics => allocator.free(try metrics.list(session)),
        .strike => allocator.free(try strike.read(session)),
        .underline => underline.deinit(allocator, try underline.readFull(session)),
    }
}

test "header read context errors stay lazy and consumer specific in both query orders" {
    const Case = struct { body: []const u8, bad: Query, expected: anyerror };
    for ([_]Case{
        .{ .body = "<h:charPr id='7'><h:ratio/><h:ratio/></h:charPr>", .bad = .metrics, .expected = error.DuplicateCharacterFontMetrics },
        .{ .body = "<h:charPr id='7'><h:spacing hangul='2147483648'/></h:charPr>", .bad = .metrics, .expected = error.InvalidXmlSigned32 },
        .{ .body = "<h:charPr id='7'><h:underline type='FUTURE'/></h:charPr>", .bad = .underline, .expected = error.InvalidCharacterUnderlineKind },
        .{ .body = "<h:charPr id='7'><h:underline/><h:underline/></h:charPr>", .bad = .underline, .expected = error.DuplicateCharacterUnderline },
        .{ .body = "<h:charPr id='7'><h:strikeout/><h:strikeout/></h:charPr>", .bad = .strike, .expected = error.DuplicateCharacterStrikeElement },
    }) |case| {
        const xml = try std.mem.concat(a, u8, &.{ prefix, "<h:charProperties itemCnt='1'>", case.body, "</h:charProperties>", suffix });
        defer a.free(xml);
        const bytes = try fixture(xml);
        defer a.free(bytes);
        var session = try editor.open(a, bytes, .{});
        defer session.deinit();
        try std.testing.expectError(case.expected, query(&session, case.bad));
        for ([_]bool{ false, true }) |warm_first| {
            var scope = try Scope.init(&session, 0);
            defer scope.deinit();
            try scope.attach();
            if (warm_first) try query(&session, .shapes);
            try std.testing.expectError(case.expected, query(&session, case.bad));
            try query(&session, .shapes);
            try std.testing.expectError(case.expected, query(&session, case.bad));
        }
    }
}

test "header read context inventory errors remain lazy through scope and lease creation" {
    const bytes = try fixture("<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'/>");
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var owned = try headers.lease(&session);
    defer owned.deinit();
    try std.testing.expect(owned == .owned);
    try std.testing.expect(owned.get().document_value == null);
    try std.testing.expectError(error.MissingReferenceList, query(&session, .shapes));
    var scope = try Scope.init(&session, 0);
    defer scope.deinit();
    try scope.attach();
    try std.testing.expect(scope.headers.document_value == null);
    var borrowed = try headers.lease(&session);
    defer borrowed.deinit();
    try std.testing.expect(borrowed == .borrowed);
    try std.testing.expectError(error.MissingReferenceList, query(&session, .shapes));
    try std.testing.expectError(error.MissingReferenceList, query(&session, .fonts));
    try std.testing.expectError(error.MissingReferenceList, query(&session, .shapes));
}

test "header read context exact Session authority stale serial and allocator fallback" {
    const bytes = try fixture(header);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var scope = try Scope.init(&session, 0);
    defer scope.deinit();
    try scope.attach();
    try query(&session, .shapes);
    try std.testing.expect((try headers.lookup(&session)).? == &scope.headers);
    var copy = session;
    try std.testing.expect(try headers.lookup(&copy) == null);
    var owned = try headers.lease(&copy);
    defer owned.deinit();
    try std.testing.expect(owned == .owned);
    // Override on the exact owner exercises allocator validation separately
    // from the Session-copy guard. Restore before freeing owned Session state.
    var failing = std.testing.FailingAllocator.init(a, .{ .fail_index = 0 });
    session.allocator = failing.allocator();
    defer session.allocator = a;
    try std.testing.expect(try headers.lookup(&session) == null);
    {
        var fallback = try headers.lease(&session);
        defer fallback.deinit();
        try std.testing.expect(fallback == .owned);
        try std.testing.expect(fallback.get().document_value == null);
    }
    try std.testing.expectError(error.OutOfMemory, query(&session, .shapes));
    session.allocator = a;
    try query(&session, .shapes);
    session.mutation_serial += 1;
    try std.testing.expectError(error.StaleHeaderReadContext, query(&session, .shapes));
    try std.testing.expectError(error.StaleHeaderReadContext, scope.headers.originalHeader());
    // Copies must derive independently even when their inherited slot is stale.
    copy.mutation_serial = session.mutation_serial;
    try query(&copy, .shapes);
}

test "header read context source identity length and XML limit reject stale observations" {
    const bytes = try fixture(tiny_header);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var scope = try Scope.init(&session, 0);
    defer scope.deinit();
    try scope.attach();
    const original = session.source;
    const duplicate = try a.dupe(u8, original);
    defer a.free(duplicate);
    session.source = duplicate;
    defer session.source = original;
    try std.testing.expectError(error.StaleHeaderReadContext, headers.lookup(&session));
    session.source = original[0 .. original.len - 1];
    try std.testing.expectError(error.StaleHeaderReadContext, headers.lookup(&session));
    session.source = original;
    const limit = session.options.max_xml_bytes;
    session.options.max_xml_bytes = limit - 1;
    defer session.options.max_xml_bytes = limit;
    try std.testing.expectError(error.StaleHeaderReadContext, headers.lookup(&session));
    session.options.max_xml_bytes = limit;
    try query(&session, .shapes);
}

test "header read context distinct actual sections own independent slots and teardown" {
    const bytes = try @import("test_package_fixture.zig").syntheticStructureZip(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='2'><h:refList>" ++ character_rows ++ suffix, section);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    try std.testing.expectEqual(@as(usize, 2), session.sections.len);
    var first = try Scope.init(&session, 0);
    var first_live = true;
    defer if (first_live) first.deinit();
    try first.attach();
    try std.testing.expectError(error.ReadObservationScopeActive, Scope.init(&session, 0));
    var second = try Scope.init(&session, 1);
    var second_live = true;
    defer if (second_live) second.deinit();
    try second.attach();
    try std.testing.expect(session.header_read_context == &first.headers);
    try query(&session, .shapes);
    first.deinit();
    first_live = false;
    try std.testing.expect(session.header_read_context == null);
    try std.testing.expect(session.sections[0].paragraph_query_cache == null);
    try std.testing.expect(session.sections[1].paragraph_query_cache == &second.cache);
    try query(&session, .shapes);
    // A foreign replacement survives second's teardown (second never owned it).
    var foreign = headers.Context.init(&session);
    defer foreign.deinit();
    session.header_read_context = &foreign;
    defer session.header_read_context = null;
    second.deinit();
    second_live = false;
    try std.testing.expect(session.header_read_context == &foreign);
    try std.testing.expect(session.sections[1].paragraph_query_cache == null);
}

test "header read context scope teardown preserves a replacement header owner" {
    const bytes = try fixture(tiny_header);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var replacement = headers.Context.init(&session);
    defer replacement.deinit();
    {
        var scope = try Scope.init(&session, 0);
        defer scope.deinit();
        try scope.attach();
        try query(&session, .shapes);
        session.header_read_context = &replacement;
    }
    defer session.header_read_context = null;
    try std.testing.expect(session.header_read_context == &replacement);
    try std.testing.expect(session.sections[0].paragraph_query_cache == null);
    try query(&session, .shapes);
}

fn allocationProbe(allocator: std.mem.Allocator, bytes: []const u8, kind: Query) !void {
    // Opening is deliberately outside the failure sweep; scope/query allocations
    // are tiny, while Session owners keep their original testing allocator.
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    session.allocator = allocator;
    defer session.allocator = a;
    defer {
        std.debug.assert(session.header_read_context == null);
        std.debug.assert(session.sections[0].paragraph_query_cache == null);
    }
    var scope = try Scope.init(&session, 0);
    defer scope.deinit();
    try scope.attach();
    try query(&session, kind);
    try query(&session, kind);
}

test "header read context tiny first query partial cleanup OOM sweep" {
    const bytes = try fixture(tiny_header);
    defer a.free(bytes);
    // In-place resize/remap success depends on neighboring allocations. Keep
    // those optional operations unavailable so each injected index is stable.
    var fixed_growth = std.testing.FailingAllocator.init(a, .{ .resize_fail_index = 0 });
    inline for (.{ Query.shapes, Query.fonts, Query.metadata, Query.metrics, Query.strike, Query.underline }) |kind| {
        try std.testing.checkAllAllocationFailures(fixed_growth.allocator(), allocationProbe, .{ bytes, kind });
    }
}

test "header managed edit invalidates old context and new scope observes current values" {
    const bytes = try fixture(tiny_header);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    {
        var old = try Scope.init(&session, 0);
        defer old.deinit();
        try old.attach();
        try query(&session, .shapes);
        try std.testing.expect(try session.setCharacterProperties(0, 1, 0, 1, .{ .size = 2400, .bold = true }));
        try std.testing.expectError(error.StaleHeaderReadContext, query(&session, .shapes));
    }
    try compare(&session, true);
    const current = try shapes.displayShapes(&session);
    defer a.free(current);
    var found = false;
    for (current) |value| if (value.id != 7 and value.height == 2400 and value.bold) {
        found = true;
    };
    try std.testing.expect(found);
}

test "header read context font ensure cannot silently change resources during a borrow" {
    const bytes = try fixture(tiny_header);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    {
        var scope = try Scope.init(&session, 0);
        defer scope.deinit();
        try scope.attach();
        try query(&session, .fonts);
        try std.testing.expectEqual(@as(u32, 9), try fonts.ensure(&session, .hangul, "A"));
        try std.testing.expectError(error.ReadObservationScopeActive, fonts.ensure(&session, .hangul, "New header font"));
        try std.testing.expectEqual(@as(usize, 0), session.font_resources.entries.items.len);
    }
    _ = try fonts.ensure(&session, .hangul, "New header font");
    try compare(&session, true);
}
