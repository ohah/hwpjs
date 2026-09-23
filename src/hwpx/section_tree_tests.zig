const std = @import("std");
const package = @import("package.zig");
const tree = @import("section_tree.zig");
const fixture = @import("test_package_fixture.zig");
const document_xml = @import("document_xml.zig");
const document_structure = @import("document_structure.zig");
const section_text = @import("section_text.zig");

const section_uri = document_xml.section_uri;
const paragraph_uri = document_xml.paragraph_uri;
const section = "<s:sec xmlns:s=\"http://www.hancom.co.kr/hwpml/2011/section\" xmlns:p=\"http://www.hancom.co.kr/hwpml/2011/paragraph\" xmlns:x=\"urn:extension\">" ++
    "<p:p id=\"1\"><p:run><p:t>A&amp;<![CDATA[B]]><x:mark/></p:t></p:run><x:table><p:p/></x:table></p:p>" ++
    "<x:p xmlns:p=\"urn:rebound\"/><p:p xmlns:p=\"urn:rebound\"><p:run/></p:p>" ++
    "</s:sec>";

test "HWPX section tree owns all XML nodes and exact source spans" {
    const a = std.testing.allocator;
    var parsed = try tree.parse(a, section, 3, 9, .{});
    defer parsed.deinit(a);
    try std.testing.expectEqualStrings(section, parsed.source);
    try std.testing.expectEqual(@as(@TypeOf(parsed.part_kind), .section), parsed.part_kind);
    try std.testing.expectEqual(@as(usize, 3), parsed.section_ordinal);
    try std.testing.expectEqual(@as(usize, 9), parsed.item_index);
    try std.testing.expectEqual(@as(usize, 10), parsed.elements.len);
    try std.testing.expectEqual(parsed.xml_report.elements, parsed.elements.len);
    try std.testing.expect(parsed.elements[0].is(section_uri, "sec"));
    try std.testing.expect(parsed.elements[1].is(paragraph_uri, "p"));
    try std.testing.expect(parsed.elements[2].is(paragraph_uri, "run"));
    try std.testing.expect(parsed.elements[3].is(paragraph_uri, "t"));
    try std.testing.expect(parsed.elements[4].is("urn:extension", "mark"));
    try std.testing.expect(parsed.elements[5].is("urn:extension", "table"));
    try std.testing.expect(parsed.elements[6].is(paragraph_uri, "p"));
    try std.testing.expect(parsed.elements[7].is("urn:extension", "p"));
    try std.testing.expect(parsed.elements[8].is("urn:rebound", "p"));
    try std.testing.expect(parsed.elements[9].is("urn:rebound", "run"));
    try std.testing.expectEqual(@as(?usize, null), parsed.elements[0].parent);
    try std.testing.expectEqual(@as(?usize, 1), parsed.elements[0].first_child);
    try std.testing.expectEqual(@as(?usize, 7), parsed.elements[1].next_sibling);
    try std.testing.expectEqual(@as(?usize, 8), parsed.elements[7].next_sibling);
    try std.testing.expectEqual(@as(?usize, 5), parsed.elements[2].next_sibling);
    try std.testing.expectEqual(@as(?usize, 6), parsed.elements[5].first_child);
    try std.testing.expectEqual(@as(?usize, 5), parsed.elements[6].parent);
    try std.testing.expectEqualStrings("<p:p/>", parsed.sourceOf(6));
    try std.testing.expectEqualStrings("<x:mark/>", parsed.sourceOf(4));
    try std.testing.expectEqualStrings("<p:t>A&amp;<![CDATA[B]]><x:mark/></p:t>", parsed.sourceOf(3));
    try std.testing.expectEqualStrings("</p:t>", parsed.source[parsed.elements[3].end_tag.?.start..parsed.elements[3].end_tag.?.end]);
    try std.testing.expect(parsed.elements[4].end_tag == null);
    try std.testing.expect(parsed.elements[3].end_tag != null);
}

test "HWPX section tree attributes preserve absence empty values and namespace scope" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:a='urn:outer' xmlns='urn:default' plain='root'>" ++
        "<p:p xmlns:a='urn:inner' plain='' ref='local' a:ref='&#49;&amp;' xml:lang='ko'/>" ++
        "<p:p a:ref='outer'/>" ++
        "</s:sec>";
    var parsed = try tree.parse(a, source, 0, 0, .{});
    defer parsed.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), parsed.elements.len);
    try std.testing.expectError(error.InvalidElementIndex, parsed.attributeValue(a, 3, "", "plain"));
    const empty = (try parsed.attributeValue(a, 1, "", "plain")).?;
    try std.testing.expectEqualStrings("''", empty.raw);
    const empty_utf8 = try empty.toUtf8(a, 16);
    defer a.free(empty_utf8);
    try std.testing.expectEqualStrings("", empty_utf8);
    try std.testing.expect((try parsed.attributeValue(a, 2, "", "plain")) == null);
    try std.testing.expect((try parsed.attributeValue(a, 1, "urn:outer", "ref")) == null);
    try std.testing.expect((try parsed.attributeValue(a, 1, "urn:default", "plain")) == null);
    const local_ref = (try parsed.attributeValue(a, 1, "", "ref")).?;
    const local_ref_utf8 = try local_ref.toUtf8(a, 16);
    defer a.free(local_ref_utf8);
    try std.testing.expectEqualStrings("local", local_ref_utf8);
    try std.testing.expect((try parsed.attributeValue(a, 1, "urn:inner", "plain")) == null);
    const inner = (try parsed.attributeValue(a, 1, "urn:inner", "ref")).?;
    try std.testing.expectEqualStrings("'&#49;&amp;'", inner.raw);
    const inner_utf8 = try inner.toUtf8(a, 16);
    defer a.free(inner_utf8);
    try std.testing.expectEqualStrings("1&", inner_utf8);
    const language = (try parsed.attributeValue(a, 1, "http://www.w3.org/XML/1998/namespace", "lang")).?;
    const language_utf8 = try language.toUtf8(a, 16);
    defer a.free(language_utf8);
    try std.testing.expectEqualStrings("ko", language_utf8);
    const outer = (try parsed.attributeValue(a, 2, "urn:outer", "ref")).?;
    const outer_utf8 = try outer.toUtf8(a, 16);
    defer a.free(outer_utf8);
    try std.testing.expectEqualStrings("outer", outer_utf8);
    try std.testing.expect((try parsed.attributeValue(a, 1, "http://www.w3.org/2000/xmlns/", "a")) == null);
}

test "HWPX section tree selects a spine section and survives archive release" {
    const a = std.testing.allocator;
    const hpf = "<p:package xmlns:p=\"http://www.idpf.org/2007/opf/\"><p:manifest>" ++
        "<p:item id=\"header\" href=\"Contents/header.xml\" media-type=\"application/xml\"/>" ++
        "<p:item id=\"section\" href=\"Contents/section0.xml\" media-type=\"application/xml\"/>" ++
        "</p:manifest><p:spine><p:itemref idref=\"header\"/><p:itemref idref=\"section\"/></p:spine></p:package>";
    const sources = [_]fixture.Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = hpf },
        .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h=\"http://www.hancom.co.kr/hwpml/2011/head\" secCnt=\"1\"/>" },
        .{ .name = "Contents/section0.xml", .data = section },
    };
    const bytes = try fixture.storedZip(a, &sources);
    var document = try package.inspectDocument(a, bytes, .{});
    try std.testing.expectError(error.SectionOutOfRange, document.readSectionTree(a, 1, .{}));
    try std.testing.expectError(error.LimitExceeded, document.readSectionTree(a, 0, .{ .tree = .{ .max_nodes = 9 } }));
    var parsed = try document.readSectionTree(a, 0, .{});
    document.deinit(a);
    a.free(bytes);
    defer parsed.deinit(a);
    try std.testing.expectEqualStrings(section, parsed.source);
    try std.testing.expectEqual(@as(usize, 0), parsed.section_ordinal);
    try std.testing.expect(parsed.elements[0].is(section_uri, "sec"));
    const id = (try parsed.attributeValue(a, 1, "", "id")).?;
    const id_utf8 = try id.toUtf8(a, 16);
    defer a.free(id_utf8);
    try std.testing.expectEqualStrings("1", id_utf8);
    var chunks: usize = 0;
    const Count = struct {
        fn onContent(raw: *anyopaque, event: tree.Tree.ContentEvent) !void {
            const count: *usize = @ptrCast(@alignCast(raw));
            try std.testing.expectEqual(@as(usize, 3), event.parent_index);
            count.* += 1;
        }
    };
    try parsed.visitContent(a, .{ .context = &chunks, .on_content = Count.onContent });
    try std.testing.expectEqual(@as(usize, 2), chunks);
}

test "HWPX section tree rejects roots, malformed source and exact limits" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.InvalidSectionRoot, tree.parse(a, "<x:sec xmlns:x=\"urn:other\"/>", 0, 0, .{}));
    try std.testing.expectError(error.XmlElementNameMismatch, tree.parse(a, "<s:sec xmlns:s=\"http://www.hancom.co.kr/hwpml/2011/section\"><a></b></s:sec>", 0, 0, .{}));
    try std.testing.expectError(error.UnboundXmlPrefix, tree.parse(a, "<s:sec xmlns:s=\"http://www.hancom.co.kr/hwpml/2011/section\"><x:future/></s:sec>", 0, 0, .{}));
    try std.testing.expectError(error.UnsupportedXmlDtd, tree.parse(a, "<!DOCTYPE sec><s:sec xmlns:s=\"http://www.hancom.co.kr/hwpml/2011/section\"/>", 0, 0, .{}));
    try std.testing.expectError(error.LimitExceeded, tree.parse(a, section, 0, 0, .{ .max_xml_bytes = section.len - 1 }));
    try std.testing.expectError(error.LimitExceeded, tree.parse(a, section, 0, 0, .{ .max_nodes = 9 }));
    var parsed = try tree.parse(a, section, 0, 0, .{ .max_xml_bytes = section.len, .max_nodes = 10 });
    defer parsed.deinit(a);
    try std.testing.expectEqual(@as(usize, 10), parsed.elements.len);
}

test "HWPX namespace profile reports versioned roots as unsupported before document reading" {
    const a = std.testing.allocator;
    const legacy_header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'/>";
    const legacy_section = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'/>";
    const future_header = "<h:head xmlns:h='http://www.owpml.org/owpml/2021/head' secCnt='1'/>";
    const future_section = "<s:sec xmlns:s='http://www.owpml.org/owpml/2021/section'/>";
    try std.testing.expectError(error.UnsupportedHwpxNamespaceProfile, tree.parse(a, future_section, 0, 0, .{}));
    try std.testing.expectError(error.UnsupportedHwpxNamespaceProfile, tree.parse(a, "<sec xmlns='http://www.owpml.org/owpml/2021/section'/>", 0, 0, .{}));
    try std.testing.expectError(error.UnsupportedHwpxNamespaceProfile, tree.parse(a, "<s:sec xmlns:s='http://www.owpml.org/owpml/2024/section'/>", 0, 0, .{}));
    try std.testing.expectError(error.InvalidSectionRoot, tree.parse(a, "<s:sec xmlns:s='http://www.owpml.org/owpml/2021/section/extra'/>", 0, 0, .{}));
    const hpf = "<p:package xmlns:p='http://www.idpf.org/2007/opf/'><p:manifest>" ++
        "<p:item id='header' href='Contents/header.xml' media-type='application/xml'/>" ++
        "<p:item id='section' href='Contents/section0.xml' media-type='application/xml'/>" ++
        "</p:manifest><p:spine><p:itemref idref='header'/><p:itemref idref='section'/></p:spine></p:package>";
    for ([_]struct { header: []const u8, section_xml: []const u8 }{
        .{ .header = legacy_header, .section_xml = future_section },
        .{ .header = future_header, .section_xml = legacy_section },
    }, 0..) |sample, sample_index| {
        const sources = [_]fixture.Source{
            .{ .name = "mimetype", .data = package.mime },
            .{ .name = "META-INF/container.xml", .data = fixture.package_container },
            .{ .name = "Contents/content.hpf", .data = hpf },
            .{ .name = "Contents/header.xml", .data = sample.header },
            .{ .name = "Contents/section0.xml", .data = sample.section_xml },
        };
        const bytes = try fixture.storedZip(a, &sources);
        defer a.free(bytes);
        var document = try package.inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        try std.testing.expectError(error.UnsupportedHwpxNamespaceProfile, document.inspectStructure(a, .{}));
        try std.testing.expectError(error.UnsupportedHwpxNamespaceProfile, document.readSectionTree(a, 0, .{}));
        try std.testing.expectError(error.UnsupportedHwpxNamespaceProfile, document.inspectSectionText(a, .{}, null));
        if (sample_index == 0) {
            const sections = [_]document_structure.Section{.{ .item_index = document.manifest.spine[1].item_index, .xml_bytes = future_section.len, .elements = 1, .direct_paragraphs = 0 }};
            try std.testing.expectError(error.UnsupportedHwpxNamespaceProfile, section_text.inspect(a, document.archive, document.manifest, &sections, .{}, null));
        }
        if (sample_index == 1) try std.testing.expectError(error.InvalidHeaderRoot, document.inspectHeaderResources(a, .{}));
    }
}

test "HWPX section tree spans remain raw UTF16 for both byte orders" {
    const a = std.testing.allocator;
    inline for (.{ std.builtin.Endian.little, std.builtin.Endian.big }) |order| {
        const name = if (order == .little) "UTF-16LE" else "UTF-16BE";
        const ascii = "<?xml version='1.0' encoding='" ++ name ++ "'?><s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'><x id='&#49;'>A&#50;<![CDATA[C]]></x></s:sec>";
        const raw = try a.alloc(u8, 2 + ascii.len * 2);
        defer a.free(raw);
        @memcpy(raw[0..2], if (order == .little) "\xff\xfe" else "\xfe\xff");
        for (ascii, 0..) |character, index| std.mem.writeInt(u16, raw[2 + index * 2 ..][0..2], character, order);
        var parsed = try tree.parse(a, raw, 0, 0, .{});
        defer parsed.deinit(a);
        try std.testing.expectEqualSlices(u8, raw, parsed.source);
        try std.testing.expectEqual(@as(usize, 2), parsed.elements.len);
        try std.testing.expect(parsed.elements[0].is(section_uri, "sec"));
        try std.testing.expect(parsed.elements[1].is("", "x"));
        try std.testing.expectEqual(@as(usize, 2 * "<x id='&#49;'>A&#50;<![CDATA[C]]></x>".len), parsed.sourceOf(1).len);
        const id = (try parsed.attributeValue(a, 1, "", "id")).?;
        const id_utf8 = try id.toUtf8(a, 16);
        defer a.free(id_utf8);
        try std.testing.expectEqualStrings("1", id_utf8);
        const Capture = struct {
            allocator: std.mem.Allocator,
            chunks: std.ArrayList([]u8) = .empty,

            fn onContent(context: *anyopaque, event: tree.Tree.ContentEvent) !void {
                const self: *@This() = @ptrCast(@alignCast(context));
                try std.testing.expectEqual(@as(usize, 1), event.parent_index);
                const bytes = try event.value.toUtf8(self.allocator, 16);
                errdefer self.allocator.free(bytes);
                try self.chunks.append(self.allocator, bytes);
            }
        };
        var capture: Capture = .{ .allocator = a };
        defer {
            for (capture.chunks.items) |bytes| a.free(bytes);
            capture.chunks.deinit(a);
        }
        try parsed.visitContent(a, .{ .context = &capture, .on_content = Capture.onContent });
        try std.testing.expectEqual(@as(usize, 2), capture.chunks.items.len);
        try std.testing.expectEqualStrings("A2", capture.chunks.items[0]);
        try std.testing.expectEqualStrings("C", capture.chunks.items[1]);
    }
}

test "HWPX section tree cleans up on every allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var parsed = try tree.parse(a, section, 0, 0, .{});
            defer parsed.deinit(a);
            try std.testing.expectEqual(@as(usize, 10), parsed.elements.len);
        }
    }.run, .{});
}

test "HWPX section tree attribute lookup cleans up on every allocation failure" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:a='urn:outer'><p:p xmlns:a='urn:inner' a:ref='&#49;&amp;'/></s:sec>";
    var parsed = try tree.parse(a, source, 0, 0, .{});
    defer parsed.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed_tree: *const tree.Tree) !void {
            const value = (try parsed_tree.attributeValue(allocator, 1, "urn:inner", "ref")).?;
            const text = try value.toUtf8(allocator, 16);
            defer allocator.free(text);
            try std.testing.expectEqualStrings("1&", text);
        }
    }.run, .{&parsed});
}

test "HWPX section tree content visits mixed text and CDATA under exact parents" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:extension'>" ++
        "A<!-- ignored --><p:p>B&amp;<p:run><p:t>X<![CDATA[Y]]><x:mark/><?pi ignored?>Z</p:t></p:run>T</p:p>Q</s:sec>";
    var parsed = try tree.parse(a, source, 0, 0, .{});
    defer parsed.deinit(a);
    const Collector = struct {
        allocator: std.mem.Allocator,
        events: std.ArrayList(tree.Tree.ContentEvent) = .empty,

        fn onContent(raw: *anyopaque, event: tree.Tree.ContentEvent) !void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            try self.events.append(self.allocator, event);
        }
    };
    var collector: Collector = .{ .allocator = a };
    defer collector.events.deinit(a);
    try parsed.visitContent(a, .{ .context = &collector, .on_content = Collector.onContent });
    try std.testing.expectEqual(@as(usize, 7), collector.events.items.len);
    const parents = [_]usize{ 0, 1, 3, 3, 3, 1, 0 };
    const expected = [_][]const u8{ "A", "B&", "X", "Y", "Z", "T", "Q" };
    for (collector.events.items, 0..) |event, index| {
        try std.testing.expectEqual(parents[index], event.parent_index);
        try std.testing.expectEqual(if (index == 3) @as(@TypeOf(event.value.kind), .cdata) else .char_data, event.value.kind);
        const bytes = try event.value.toUtf8(a, 16);
        defer a.free(bytes);
        try std.testing.expectEqualStrings(expected[index], bytes);
    }
    const Failing = struct {
        calls: usize = 0,
        fn onContent(raw: *anyopaque, _: tree.Tree.ContentEvent) !void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            self.calls += 1;
            if (self.calls == 2) return error.StopAfterTwo;
        }
    };
    var failing: Failing = .{};
    try std.testing.expectError(error.StopAfterTwo, parsed.visitContent(a, .{ .context = &failing, .on_content = Failing.onContent }));
    try std.testing.expectEqual(@as(usize, 2), failing.calls);
    try parsed.visitContent(a, .{ .context = &collector, .on_content = Collector.onContent });
    const original = parsed.elements[1].start_tag;
    parsed.elements[1].start_tag.start += 1;
    try std.testing.expectError(error.InvalidSourceSpan, parsed.visitContent(a, .{ .context = &collector, .on_content = Collector.onContent }));
    parsed.elements[1].start_tag = original;
    const original_parent = parsed.elements[3].parent;
    parsed.elements[3].parent = 1;
    try std.testing.expectError(error.InvalidSectionTreeDepth, parsed.visitContent(a, .{ .context = &collector, .on_content = Collector.onContent }));
    parsed.elements[3].parent = original_parent;
    const original_end = parsed.elements[4].end;
    parsed.elements[4].end += 1;
    try std.testing.expectError(error.InvalidSourceSpan, parsed.visitContent(a, .{ .context = &collector, .on_content = Collector.onContent }));
    parsed.elements[4].end = original_end;
}

test "HWPX section tree ordered replay retains element and direct content order" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>" ++
        "A<!-- ignored --><p:p>B&amp;<p:run><p:t>X<![CDATA[Y]]><mark/><?pi ignored?>Z</p:t></p:run>T</p:p>Q</s:sec>";
    var parsed = try tree.parse(a, source, 0, 0, .{});
    defer parsed.deinit(a);
    const Collector = struct {
        allocator: std.mem.Allocator,
        events: std.ArrayList(tree.Tree.OrderedEvent) = .empty,

        fn onEvent(raw: *anyopaque, event: tree.Tree.OrderedEvent) !void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            try self.events.append(self.allocator, event);
        }
    };
    var collected: Collector = .{ .allocator = a };
    defer collected.events.deinit(a);
    try parsed.visitOrdered(a, .{ .context = &collected, .on_event = Collector.onEvent });
    const Kind = std.meta.Tag(tree.Tree.OrderedEvent);
    const expected_kinds = [_]Kind{
        .start_element, .content,       .start_element, .content,
        .start_element, .start_element, .content,       .content,
        .empty_element, .content,       .end_element,   .end_element,
        .content,       .end_element,   .content,       .end_element,
    };
    const expected_indices = [_]usize{ 0, 0, 1, 1, 2, 3, 3, 3, 4, 3, 3, 2, 1, 1, 0, 0 };
    const expected_text = [_]?[]const u8{ null, "A", null, "B&", null, null, "X", "Y", null, "Z", null, null, "T", null, "Q", null };
    try std.testing.expectEqual(expected_kinds.len, collected.events.items.len);
    for (collected.events.items, 0..) |event, index| {
        try std.testing.expectEqual(expected_kinds[index], std.meta.activeTag(event));
        switch (event) {
            .start_element, .end_element, .empty_element => |element_index| try std.testing.expectEqual(expected_indices[index], element_index),
            .content => |value| {
                try std.testing.expectEqual(expected_indices[index], value.parent_index);
                try std.testing.expectEqual(if (index == 7) @as(@TypeOf(value.value.kind), .cdata) else .char_data, value.value.kind);
                const decoded = try value.value.toUtf8(a, 16);
                defer a.free(decoded);
                try std.testing.expectEqualStrings(expected_text[index].?, decoded);
            },
        }
    }
    const Failing = struct {
        count: usize = 0,
        fn onEvent(raw: *anyopaque, _: tree.Tree.OrderedEvent) !void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            self.count += 1;
            if (self.count == 9) return error.StopOnEmptyElement;
        }
    };
    var failing: Failing = .{};
    try std.testing.expectError(error.StopOnEmptyElement, parsed.visitOrdered(a, .{ .context = &failing, .on_event = Failing.onEvent }));
    try std.testing.expectEqual(@as(usize, 9), failing.count);
    collected.events.clearRetainingCapacity();
    try parsed.visitOrdered(a, .{ .context = &collected, .on_event = Collector.onEvent });
    try std.testing.expectEqual(expected_kinds.len, collected.events.items.len);
    parsed.elements[4].parent = 1;
    try std.testing.expectError(error.InvalidSectionTreeDepth, parsed.visitOrdered(a, .{ .context = &collected, .on_event = Collector.onEvent }));
    parsed.elements[4].parent = 3;
    const original_uri = parsed.elements[4].name.uri;
    parsed.elements[4].name.uri = "urn:wrong";
    try std.testing.expectError(error.InvalidSectionTreeName, parsed.visitOrdered(a, .{ .context = &collected, .on_event = Collector.onEvent }));
    parsed.elements[4].name.uri = original_uri;
}

test "HWPX section tree ordered replay cleans up on every allocation failure" {
    const a = std.testing.allocator;
    var parsed = try tree.parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'><p>A&amp;<![CDATA[B]]><x/></p></s:sec>", 0, 0, .{});
    defer parsed.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed_tree: *const tree.Tree) !void {
            var count: usize = 0;
            const Counter = struct {
                fn onEvent(raw: *anyopaque, _: tree.Tree.OrderedEvent) !void {
                    const value: *usize = @ptrCast(@alignCast(raw));
                    value.* += 1;
                }
            };
            try parsed_tree.visitOrdered(allocator, .{ .context = &count, .on_event = Counter.onEvent });
            try std.testing.expectEqual(@as(usize, 7), count);
        }
    }.run, .{&parsed});
}

test "HWPX section tree ordered replay distinguishes empty syntax from explicit pair" {
    const a = std.testing.allocator;
    var parsed = try tree.parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'><x/><y></y></s:sec>", 0, 0, .{});
    defer parsed.deinit(a);
    const C = struct {
        events: [5]std.meta.Tag(tree.Tree.OrderedEvent) = undefined,
        count: usize = 0,
        fn onEvent(raw: *anyopaque, event: tree.Tree.OrderedEvent) !void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            self.events[self.count] = std.meta.activeTag(event);
            self.count += 1;
        }
    };
    var captured: C = .{};
    try parsed.visitOrdered(a, .{ .context = &captured, .on_event = C.onEvent });
    try std.testing.expectEqual(@as(usize, 5), captured.count);
    try std.testing.expectEqualSlices(std.meta.Tag(tree.Tree.OrderedEvent), &.{ .start_element, .empty_element, .start_element, .end_element, .end_element }, &captured.events);
}

test "HWPX section tree content replay cleans up on every allocation failure" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'><p>first&amp;second<![CDATA[third]]></p></s:sec>";
    var parsed = try tree.parse(a, source, 0, 0, .{});
    defer parsed.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed_tree: *const tree.Tree) !void {
            var count: usize = 0;
            const C = struct {
                fn onContent(raw: *anyopaque, event: tree.Tree.ContentEvent) !void {
                    const result: *usize = @ptrCast(@alignCast(raw));
                    _ = event;
                    result.* += 1;
                }
            };
            try parsed_tree.visitContent(allocator, .{ .context = &count, .on_content = C.onContent });
            try std.testing.expectEqual(@as(usize, 2), count);
        }
    }.run, .{&parsed});
}
