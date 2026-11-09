//! Synthetic no-intent currentHeader contracts. Never deinit a returned view.
const std = @import("std");
const a = std.testing.allocator;
const editor = @import("editor_session.zig");
const Context = @import("header_read_context.zig").Context;
const Tree = @import("xml_part_tree.zig").Tree;
const save = @import("header_resource_save.zig");
const parse = @import("header_tree.zig").parse;
const fixture = @import("test_formula_fixture.zig");
const section = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'/>";
const opening = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'>";
const prefix = opening ++ "<h:refList>";
const suffix = "</h:refList></h:head>";
const tiny = prefix ++ "<h:charProperties><h:charPr id='7'/></h:charProperties>" ++ suffix;
const editable = prefix ++
    "<h:fontfaces itemCnt='1'><h:fontface lang='HANGUL' fontCnt='1'><h:font id='0' face='A' type='TTF'/></h:fontface></h:fontfaces>" ++
    "<h:paraProperties itemCnt='1'><h:paraPr id='9'><h:align horizontal='LEFT'/></h:paraPr></h:paraProperties>" ++
    "<h:charProperties itemCnt='1'><h:charPr id='7' height='1000'><h:fontRef hangul='0'/></h:charPr></h:charProperties>" ++ suffix;

fn trust(session: *editor.Session) void {
    @import("display_resource_generation.zig").openOwned(session);
}

fn canonical(session: *const editor.Session) !Tree {
    const replacement = try save.replacementWithFonts(a, session.source, &session.paragraph_resources, &session.character_resources, &session.font_resources, session.options.max_xml_bytes);
    defer a.free(replacement.bytes);
    return parse(a, replacement.bytes, 0, .{ .max_xml_bytes = session.options.max_xml_bytes });
}

fn same(expected: *const Tree, actual: *const Tree) !void {
    try std.testing.expectEqualSlices(u8, expected.source, actual.source);
    try std.testing.expectEqualDeep(expected.elements, actual.elements);
    try std.testing.expectEqualDeep(expected.uris, actual.uris);
    try std.testing.expectEqualDeep(expected.xml_report, actual.xml_report);
    try std.testing.expectEqual(expected.part_kind, actual.part_kind);
    try std.testing.expectEqual(expected.section_ordinal, actual.section_ordinal);
    try std.testing.expectEqual(@as(usize, 0), actual.item_index);
}

fn aliases(original: *const Tree, actual: *const Tree) !void {
    try std.testing.expect(original.source.ptr == actual.source.ptr);
    try std.testing.expect(original.elements.ptr == actual.elements.ptr);
    try std.testing.expect(original.uris.ptr == actual.uris.ptr);
    for (original.uris, actual.uris) |left, right| try std.testing.expect(left.ptr == right.ptr);
    for (original.elements, actual.elements) |left, right| {
        try std.testing.expect(left.name.local.raw.ptr == right.name.local.raw.ptr);
        try std.testing.expect(left.name.uri.ptr == right.name.uri.ptr);
    }
}

fn borrowed(context: *Context, expected: *const Tree, allow_batch: bool) !void {
    const actual = try context.currentHeader(allow_batch);
    try same(expected, actual);
    try aliases(&context.owner.original_header.?, actual);
    try std.testing.expect(context.source_current_view != null);
    try std.testing.expect(actual == &context.source_current_view.?);
    try std.testing.expect(context.current_tree == null);
    try std.testing.expect(context.batch_tree == null);
    try std.testing.expect(context.original_tree == null);
    try std.testing.expect(context.resources_value != null);
}

fn fallback(context: *Context, expected: *const Tree, allow_batch: bool) !void {
    const actual = try context.currentHeader(allow_batch);
    try same(expected, actual);
    if (context.owner.original_header) |original| {
        try std.testing.expect(actual.source.ptr != original.source.ptr);
        try std.testing.expect(actual.elements.ptr != original.elements.ptr);
    }
    try std.testing.expect(context.source_current_view == null);
    if (allow_batch and context.owner.formatting_batch != null) {
        try std.testing.expect(context.batch_tree != null);
        try std.testing.expect(actual == &context.batch_tree.?);
    } else {
        try std.testing.expect(context.current_tree != null);
        try std.testing.expect(actual == &context.current_tree.?);
    }
}

fn compareHeader(xml: []const u8) !void {
    const seed = try fixture.zipWithSectionHeader(a, section, xml);
    defer a.free(seed);
    // Keep the fixture's ZIP entries but place the header second in the actual
    // manifest. Spine order still selects the header before the section.
    const manifest = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
        "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
        "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
        "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
    const bytes = try @import("../zip/replace_writer.zig").write(a, seed, &.{.{ .entry_index = 2, .bytes = manifest }}, .{});
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    trust(&session);
    try std.testing.expectEqual(@as(usize, 1), session.original_header.?.item_index);
    var expected = try canonical(&session);
    defer expected.deinit(a);
    try std.testing.expectEqualSlices(u8, xml, expected.source);
    const original_source = session.original_header.?.source.ptr;
    for ([_]bool{ false, true }) |allow_batch| {
        var context = Context.init(&session);
        defer context.deinit();
        try borrowed(&context, &expected, allow_batch);
        const first = try context.currentHeader(allow_batch);
        try borrowed(&context, &expected, !allow_batch);
        try std.testing.expect(first == try context.currentHeader(allow_batch));
    }
    // Context teardown must leave every cached owner usable and Session-owned.
    try std.testing.expectEqual(@as(usize, 1), session.original_header.?.item_index);
    try std.testing.expect(original_source == session.original_header.?.source.ptr);
    try std.testing.expectEqualSlices(u8, xml, session.original_header.?.source);
    var after = Context.init(&session);
    defer after.deinit();
    try borrowed(&after, &expected, false);
}

test "unedited header view canonical bytes counts extensions encodings and borrowed lifetime" {
    for ([_][]const u8{
        editable,
        tiny,
        prefix ++ "<h:charProperties itemCnt='0001'><h:charPr id='7'/></h:charProperties>" ++ suffix,
        prefix ++ "<h:charProperties itemCnt='&#49;'><h:charPr id='7'/></h:charProperties>" ++ suffix,
        prefix ++ "<h:charProperties itemCnt='99'><h:charPr id='7'/></h:charProperties>" ++ suffix,
        prefix ++ "<h:charProperties itemCnt='0'/>" ++ suffix,
        prefix ++ "<h:charProperties><h:charPr id='300'/><h:charPr id='7'/></h:charProperties>" ++
            "<!--keep--><x:item xmlns:x='urn:first' x:v='&amp;'><![CDATA[opaque]]></x:item>" ++
            "<x:item xmlns:x='urn:second'/><plain xmlns=''/>" ++ suffix,
        "\xef\xbb\xbf" ++ tiny,
    }) |xml| try compareHeader(xml);
    inline for (.{ std.builtin.Endian.little, std.builtin.Endian.big }) |order| {
        const xml = try a.alloc(u8, 2 + tiny.len * 2);
        defer a.free(xml);
        @memcpy(xml[0..2], if (order == .little) "\xff\xfe" else "\xfe\xff");
        for (tiny, 0..) |byte, index| std.mem.writeInt(u16, xml[2 + index * 2 ..][0..2], byte, order);
        try compareHeader(xml);
    }
}

test "unedited header view inventory errors precede zero one and exact byte limits" {
    const Case = struct { xml: []const u8, failure: ?anyerror = null };
    for ([_]Case{
        .{ .xml = tiny },
        .{ .xml = opening ++ "</h:head>", .failure = error.MissingReferenceList },
        .{ .xml = prefix ++ "<h:charProperties><h:charPr id='7'/><h:charPr id='7'/></h:charProperties>" ++ suffix, .failure = error.DuplicateResourceId },
        .{ .xml = prefix ++ "<h:charProperties><h:charPr/></h:charProperties>" ++ suffix, .failure = error.MissingResourceId },
        .{ .xml = prefix ++ "<h:charProperties><h:charPr id='bad'/></h:charProperties>" ++ suffix, .failure = error.InvalidResourceId },
        .{ .xml = prefix ++ "<h:charProperties itemCnt='bad'/>" ++ suffix, .failure = error.InvalidResourceCount },
    }) |case| {
        const bytes = try fixture.zipWithSectionHeader(a, section, case.xml);
        defer a.free(bytes);
        var session = try editor.open(a, bytes, .{});
        defer session.deinit();
        trust(&session);
        for ([_]usize{ 0, 1, case.xml.len - 1, case.xml.len }) |limit| {
            session.options.max_xml_bytes = limit;
            for ([_]bool{ false, true }) |allow_batch| {
                var context = Context.init(&session);
                defer context.deinit();
                const failure: ?anyerror = if (case.failure) |err| err else if (limit < case.xml.len) error.LimitExceeded else null;
                if (failure) |err| {
                    try std.testing.expectError(err, canonical(&session));
                    try std.testing.expectError(err, context.currentHeader(allow_batch));
                    try std.testing.expect(context.source_current_view == null);
                    try std.testing.expect(context.current_tree == null);
                } else {
                    var expected = try canonical(&session);
                    defer expected.deinit(a);
                    try borrowed(&context, &expected, allow_batch);
                }
            }
        }
    }
}

test "unedited header view raw missing cache binding mismatch and occupied slot retain writer" {
    const bytes = try fixture.zipWithSectionHeader(a, section, tiny);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    var expected = try canonical(&session);
    defer expected.deinit(a);
    const duplicate = try a.dupe(u8, session.source);
    defer a.free(duplicate);
    const binding = session.original_header_source;
    for (0..4) |mode| {
        // Each copy borrows Session owners; only Context owns fresh allocations.
        var copy = session;
        copy.display_resource_trusted = mode != 0;
        switch (mode) {
            0 => {},
            1 => copy.original_header = null,
            2 => copy.original_header_source = duplicate,
            3 => copy.original_header_source = binding[0 .. binding.len - 1],
            else => unreachable,
        }
        for ([_]bool{ false, true }) |allow_batch| {
            var context = Context.init(&copy);
            defer context.deinit();
            try fallback(&context, &expected, allow_batch);
        }
    }
    var context = Context.init(&session);
    defer context.deinit();
    try fallback(&context, &expected, false);
    const owned = (try context.currentHeader(false)).source.ptr;
    trust(&session);
    try fallback(&context, &expected, true);
    try std.testing.expect(owned == (try context.currentHeader(true)).source.ptr);
}

test "unedited header view trust toggles foreign and raw in place sources observe current bytes" {
    const bytes = try fixture.zipWithSectionHeader(a, section, tiny);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    trust(&session);
    var expected = try canonical(&session);
    defer expected.deinit(a);
    {
        var context = Context.init(&session);
        defer context.deinit();
        try borrowed(&context, &expected, false);
        session.display_resource_trusted = false;
        // An existing non-owning view is not permission to keep borrowing.
        const raw = try context.currentHeader(true);
        try same(&expected, raw);
        try std.testing.expect(raw.source.ptr != session.original_header.?.source.ptr);
        try std.testing.expect(context.current_tree != null);
    }
    const changed = prefix ++ "<h:charProperties><h:charPr id='8'/></h:charProperties>" ++ suffix;
    const changed_zip = try fixture.zipWithSectionHeader(a, section, changed);
    defer a.free(changed_zip);
    trust(&session);
    var copy = session;
    copy.source = changed_zip;
    var changed_expected = try canonical(&copy);
    defer changed_expected.deinit(a);
    {
        var foreign = Context.init(&copy);
        defer foreign.deinit();
        try fallback(&foreign, &changed_expected, false);
    }
    session.display_resource_trusted = false;
    try std.testing.expectEqual(session.source.len, changed_zip.len);
    @memcpy(session.source, changed_zip);
    {
        var raw = Context.init(&session);
        defer raw.deinit();
        try fallback(&raw, &changed_expected, true);
    }
    try std.testing.expectEqualStrings(tiny, session.original_header.?.source);
}

test "unedited header view mutation source and option stale fences precede cached results" {
    const bytes = try fixture.zipWithSectionHeader(a, section, tiny);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    trust(&session);
    const source = session.source;
    const duplicate = try a.dupe(u8, source);
    defer a.free(duplicate);
    const limit = session.options.max_xml_bytes;
    for ([_]bool{ false, true }) |warm| {
        var context = Context.init(&session);
        defer context.deinit();
        if (warm) _ = try context.currentHeader(false);
        for (0..4) |mode| {
            switch (mode) {
                0 => session.mutation_serial += 1,
                1 => session.options.max_xml_bytes = 1,
                2 => session.source = duplicate,
                3 => session.source = source[0 .. source.len - 1],
                else => unreachable,
            }
            for ([_]bool{ false, true }) |allow_batch| try std.testing.expectError(error.StaleHeaderReadContext, context.currentHeader(allow_batch));
            if (mode == 0) session.mutation_serial -= 1;
            session.options.max_xml_bytes = limit;
            session.source = source;
        }
        _ = try context.currentHeader(true);
    }
}

test "unedited header view each resource intent including noop and active batch uses writer" {
    const bytes = try fixture.zipWithSectionHeader(a, section, editable);
    defer a.free(bytes);
    for (0..3) |kind| for ([_]bool{ false, true }) |noop| {
        var session = try editor.open(a, bytes, .{});
        defer session.deinit();
        trust(&session);
        switch (kind) {
            0 => _ = try session.paragraph_resources.add(a, &.{9}, 9, if (noop) .LEFT else .RIGHT),
            1 => _ = try session.character_resources.add(a, &.{7}, 7, if (noop) .{} else .{ .size = 2400, .bold = true }),
            2 => _ = try session.font_resources.add(a, .hangul, 1, if (noop) "A" else "New Font", 128),
            else => unreachable,
        }
        var expected = try canonical(&session);
        defer expected.deinit(a);
        try std.testing.expect(!std.mem.eql(u8, editable, expected.source));
        for ([_]bool{ false, true }) |active_batch| {
            var batch: @import("formatting_batch_context.zig").Context = .{};
            defer batch.deinit(a);
            if (active_batch) try session.beginFormattingBatch(&batch);
            defer if (active_batch) session.endFormattingBatch(&batch);
            for ([_]bool{ false, true }) |allow_batch| {
                var context = Context.init(&session);
                defer context.deinit();
                try fallback(&context, &expected, allow_batch);
            }
        }
    };
    // A batch disables the borrow even with absolutely no resource intents,
    // including when the caller asks for the non-batch current projection.
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    trust(&session);
    var expected = try canonical(&session);
    defer expected.deinit(a);
    var batch: @import("formatting_batch_context.zig").Context = .{};
    defer batch.deinit(a);
    try session.beginFormattingBatch(&batch);
    defer session.endFormattingBatch(&batch);
    var context = Context.init(&session);
    defer context.deinit();
    try fallback(&context, &expected, false);
    try fallback(&context, &expected, true);
    try std.testing.expect(context.current_tree.?.source.ptr != context.batch_tree.?.source.ptr);
}

fn allocationProbe(allocator: std.mem.Allocator, owner: *const editor.Session) !void {
    // Copy only the allocator binding. Never deinit this borrowed Session copy.
    var copy = owner.*;
    copy.allocator = allocator;
    var context = Context.init(&copy);
    defer context.deinit();
    const actual = try context.currentHeader(false);
    try std.testing.expectEqualStrings(tiny, actual.source);
    try aliases(&owner.original_header.?, actual);
    try std.testing.expect(context.current_tree == null);
    try std.testing.expect(context.source_current_view != null);
    _ = try context.currentHeader(true);
}

test "unedited header view cold OOM warm allocation freedom and tiny allocation sweep" {
    const bytes = try fixture.zipWithSectionHeader(a, section, tiny);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    trust(&session);
    var failing = std.testing.FailingAllocator.init(a, .{ .fail_index = 0 });
    var copy = session;
    copy.allocator = failing.allocator();
    {
        var context = Context.init(&copy);
        defer context.deinit();
        try std.testing.expectError(error.OutOfMemory, context.currentHeader(false));
        try std.testing.expect(context.source_current_view == null);
        try std.testing.expect(context.current_tree == null);
    }
    // Only inventory preparation allocates: after warming it, deny every
    // subsequent allocation through the very same allocator instance.
    var warm_allocator = std.testing.FailingAllocator.init(a, .{});
    copy.allocator = warm_allocator.allocator();
    {
        var context = Context.init(&copy);
        defer context.deinit();
        _ = try context.originalResources();
        warm_allocator.fail_index = warm_allocator.alloc_index;
        for ([_]bool{ false, true, false }) |allow_batch| {
            const actual = try context.currentHeader(allow_batch);
            try aliases(&session.original_header.?, actual);
            try std.testing.expectEqual(@as(usize, 0), actual.item_index);
        }
        try std.testing.expect(!warm_allocator.has_induced_failure);
    }
    var fixed_growth = std.testing.FailingAllocator.init(a, .{ .resize_fail_index = 0 });
    try std.testing.checkAllAllocationFailures(fixed_growth.allocator(), allocationProbe, .{&session});
    try std.testing.expectEqualStrings(tiny, session.original_header.?.source);
}
