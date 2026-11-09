//! Synthetic contracts for fused immutable header capture; no filesystem fixtures.
const std = @import("std");
const a = std.testing.allocator;
const document_xml = @import("document_xml.zig");
const parts = @import("xml_part_tree.zig");
const structure = @import("document_structure.zig");
const package = @import("package.zig");
const editor = @import("editor_session.zig");
const headers = @import("header_read_context.zig");
const fixture = @import("test_formula_fixture.zig");

const section = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'/>";
const opening = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'";
const header = opening ++ " version='1&amp;5' secCnt='1'><h:refList>" ++
    "<h:charProperties><h:charPr id='4294967295'/><h:charPr id='7'/></h:charProperties>" ++
    "<x:item xmlns:x='urn:first' x:value='&#49;'/><x:item xmlns:x='urn:second'/>" ++
    "<plain xmlns=''/></h:refList></h:head>";

fn inspectBytes(allocator: std.mem.Allocator, bytes: []const u8, options: document_xml.Options) !document_xml.Report {
    var inspector: document_xml.Inspector = .{ .allocator = allocator, .max_attribute_bytes = options.max_attribute_bytes };
    errdefer if (inspector.header_version) |value| allocator.free(value);
    const parsed = try document_xml.visitBytes(allocator, bytes, bytes.len, options, .{ .context = &inspector, .on_tag = document_xml.Inspector.onTag });
    return .{
        .kind = inspector.kind,
        .xml_bytes = bytes.len,
        .elements = parsed.elements,
        .direct_paragraphs = inspector.direct_paragraphs,
        .declared_section_count = inspector.declared_section_count,
        .header_version = inspector.header_version,
    };
}

// Apply the structure layer's post-visit root classification to the independent oracle.
fn inspectHeaderBytes(allocator: std.mem.Allocator, bytes: []const u8, options: document_xml.Options) !void {
    var report = try inspectBytes(allocator, bytes, options);
    defer report.deinit(allocator);
    if (report.kind != .header) return error.InvalidHeaderRoot;
}

fn compareBytes(bytes: []const u8, options: parts.Options) !void {
    var expected = try inspectBytes(a, bytes, options.xml);
    defer expected.deinit(a);
    var captured = try parts.parseInspectedHeader(a, bytes, 17, options);
    defer captured.report.deinit(a);
    defer captured.tree.deinit(a);
    var ordinary = try parts.parse(a, bytes, .header, null, 17, options);
    defer ordinary.deinit(a);
    try std.testing.expectEqualDeep(expected, captured.report);
    try std.testing.expectEqualDeep(ordinary.xml_report, captured.tree.xml_report);
    try std.testing.expectEqualDeep(ordinary.elements, captured.tree.elements);
    try std.testing.expectEqualDeep(ordinary.uris, captured.tree.uris);
    try std.testing.expectEqualStrings(bytes, captured.tree.source);
    try std.testing.expectEqual(@as(usize, 17), captured.tree.item_index);
    try std.testing.expect(captured.tree.part_kind == .header);
    try std.testing.expect(captured.tree.section_ordinal == null);
}

test "header capture metadata and tree match independent Inspector and ordinary tree" {
    try compareBytes(header, .{});
    try compareBytes(opening ++ "/>", .{});
    try compareBytes(opening ++ " version='' secCnt='0'/>", .{});
    try compareBytes("<head xmlns='http://www.hancom.co.kr/hwpml/2011/head' xmlns:x='urn:ignored' x:secCnt='bad' x:version='ignored'><child xmlns=''/></head>", .{});
}

test "header capture metadata matches archive read and survives input and report release" {
    const bytes = try fixture.zipWithSectionHeader(a, section, header);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const selected = try structure.plainHeaderEntry(a, document.archive, document.manifest, .{});
    var expected = try document_xml.read(a, document.archive, selected.entry, header.len, .{});
    defer expected.deinit(a);
    const input = try a.dupe(u8, header);
    defer a.free(input);
    var captured = try parts.parseInspectedHeader(a, input, selected.item_index, .{});
    defer captured.tree.deinit(a);
    var report_live = true;
    defer if (report_live) captured.report.deinit(a);
    try std.testing.expectEqualDeep(expected, captured.report);
    try std.testing.expect(input.ptr != captured.tree.source.ptr);
    @memset(input, '!');
    try std.testing.expectEqualStrings("1&5", captured.report.header_version.?);
    captured.report.deinit(a);
    report_live = false;
    try std.testing.expectEqualStrings(header, captured.tree.source);
    try std.testing.expect(captured.tree.elements[4].is(document_xml.head_uri, "charPr"));
    try std.testing.expect(captured.tree.elements[5].is("urn:first", "item"));
    try std.testing.expect(captured.tree.elements[6].is("urn:second", "item"));
    try std.testing.expect(captured.tree.elements[7].is("", "plain"));
    const value = (try captured.tree.attributeValue(a, 5, "urn:first", "value")).?;
    const normalized = try value.toUtf8(a, 8);
    defer a.free(normalized);
    try std.testing.expectEqualStrings("1", normalized);
}

test "header capture report independently survives tree release" {
    var captured = try parts.parseInspectedHeader(a, header, 0, .{});
    defer captured.report.deinit(a);
    captured.tree.deinit(a);
    try std.testing.expectEqualStrings("1&5", captured.report.header_version.?);
    try std.testing.expectEqual(@as(?u32, 1), captured.report.declared_section_count);
}

test "header capture preserves UTF16 source spans and normalized metadata" {
    inline for (.{ std.builtin.Endian.little, std.builtin.Endian.big }) |order| {
        const text = opening ++ " version='1&amp;5' secCnt='1'><h:child/></h:head>";
        const bytes = try a.alloc(u8, 2 + text.len * 2);
        defer a.free(bytes);
        @memcpy(bytes[0..2], if (order == .little) "\xff\xfe" else "\xfe\xff");
        for (text, 0..) |byte, index| std.mem.writeInt(u16, bytes[2 + index * 2 ..][0..2], byte, order);
        try compareBytes(bytes, .{});
    }
}

test "header capture wrong roots late XML errors and metadata errors preserve precedence" {
    const Case = struct { bytes: []const u8, expected: anyerror };
    for ([_]Case{
        .{ .bytes = "<other/>", .expected = error.InvalidHeaderRoot },
        .{ .bytes = section, .expected = error.InvalidHeaderRoot },
        .{ .bytes = "<other><child/></wrong>", .expected = error.XmlElementNameMismatch },
        .{ .bytes = "<other><unbound:child/></other>", .expected = error.UnboundXmlPrefix },
        .{ .bytes = "<other/><!--", .expected = error.UnexpectedEnd },
        .{ .bytes = opening ++ " secCnt='bad'><h:child/></wrong>", .expected = error.InvalidSectionCount },
        .{ .bytes = opening ++ " secCnt=''><h:child/></wrong>", .expected = error.InvalidSectionCount },
        .{ .bytes = opening ++ " secCnt='4294967296'/>", .expected = error.InvalidSectionCount },
        .{ .bytes = opening ++ " version='ok'><h:child/></wrong>", .expected = error.XmlElementNameMismatch },
        .{ .bytes = "<h:head xmlns:h='http://www.owpml.org/owpml/2021/head'><x/></wrong>", .expected = error.UnsupportedHwpxNamespaceProfile },
        .{ .bytes = "<s:sec xmlns:s='http://www.owpml.org/owpml/2024/section'><x/></wrong>", .expected = error.UnsupportedHwpxNamespaceProfile },
        .{ .bytes = "<h:head xmlns:h='http://www.owpml.org/owpml/2021/head/extra'/>", .expected = error.InvalidHeaderRoot },
    }) |case| {
        try std.testing.expectError(case.expected, inspectHeaderBytes(a, case.bytes, .{}));
        try std.testing.expectError(case.expected, parts.parseInspectedHeader(a, case.bytes, 0, .{}));
    }
    try std.testing.expectError(error.InvalidHeaderRoot, parts.parseInspectedHeader(a, "<other><child/></other>", 0, .{ .max_nodes = 0 }));
    try std.testing.expectError(error.UnboundXmlPrefix, parts.parseInspectedHeader(a, "<other><unbound:child/></other>", 0, .{ .max_nodes = 0 }));
    try std.testing.expectError(error.InvalidSectionCount, parts.parseInspectedHeader(a, opening ++ " secCnt='bad'><h:a/></wrong>", 0, .{ .max_nodes = 0 }));
}

test "header capture byte attribute node and XML budgets retain exact boundaries" {
    const tiny = opening ++ " version='abc' secCnt='1'><h:a/><h:b/></h:head>";
    try compareBytes(tiny, .{ .max_xml_bytes = tiny.len, .max_nodes = 3, .xml = .{ .max_elements = 3, .max_attribute_bytes = 3 } });
    try std.testing.expectError(error.LimitExceeded, parts.parseInspectedHeader(a, tiny, 0, .{ .max_xml_bytes = tiny.len - 1 }));
    try std.testing.expectError(error.LimitExceeded, parts.parseInspectedHeader(a, tiny, 0, .{ .max_nodes = 2, .xml = .{ .max_elements = 3 } }));
    try std.testing.expectError(error.LimitExceeded, parts.parseInspectedHeader(a, tiny, 0, .{ .max_nodes = 3, .xml = .{ .max_elements = 2 } }));
    for ([_][]const u8{ tiny, opening ++ " secCnt='1234'/>", opening ++ " version='&#65;&#66;&#67;&#68;'/>", opening ++ " version='abcd'><h:a/></wrong>" }) |bytes| {
        try std.testing.expectError(error.LimitExceeded, inspectHeaderBytes(a, bytes, .{ .max_attribute_bytes = 2 }));
        try std.testing.expectError(error.LimitExceeded, parts.parseInspectedHeader(a, bytes, 0, .{ .xml = .{ .max_attribute_bytes = 2 } }));
    }
    for ([_]document_xml.Options{
        .{ .max_events = 1 },
        .{ .max_attributes = 1 },
        .{ .max_references = 0 },
        .{ .max_depth = 1 },
    }) |limits| {
        try std.testing.expectError(error.LimitExceeded, inspectHeaderBytes(a, header, limits));
        try std.testing.expectError(error.LimitExceeded, parts.parseInspectedHeader(a, header, 0, .{ .xml = limits }));
    }
}

test "header capture structure report agrees at custom small and above default XML limits" {
    const bytes = try fixture.zipWithSectionHeader(a, section, header);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    // The tiny boundary exercises policy mapping without allocating millions of nodes.
    // The raised option checks acceptance, not an actual >2m-element document.
    for ([_]usize{ 8, 2_000_001 }) |limit| {
        const options: structure.Options = .{ .xml = .{ .max_elements = limit } };
        var expected = try structure.inspect(a, document.archive, document.manifest, options);
        defer expected.deinit(a);
        var captured = try structure.inspectWithHeader(a, document.archive, document.manifest, options);
        defer captured.report.deinit(a);
        defer captured.header.deinit(a);
        try std.testing.expectEqualDeep(expected, captured.report);
        try std.testing.expectEqual(@as(usize, 8), captured.header.elements.len);
    }
    try std.testing.expectError(error.LimitExceeded, structure.inspect(a, document.archive, document.manifest, .{ .xml = .{ .max_elements = 7 } }));
    try std.testing.expectError(error.LimitExceeded, structure.inspectWithHeader(a, document.archive, document.manifest, .{ .xml = .{ .max_elements = 7 } }));
}

test "header capture structure owns header and version after archive and input teardown" {
    var captured = block: {
        const bytes = try fixture.zipWithSectionHeader(a, section, header);
        defer a.free(bytes);
        var document = try package.inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        break :block try structure.inspectWithHeader(a, document.archive, document.manifest, .{});
    };
    defer captured.report.deinit(a);
    defer captured.header.deinit(a);
    try std.testing.expectEqualStrings(header, captured.header.source);
    try std.testing.expectEqualStrings("1&5", captured.report.header_version.?);
    try std.testing.expectEqual(captured.report.header_item_index, captured.header.item_index);
    try std.testing.expect(captured.header.elements[5].is("urn:first", "item"));
}

test "header capture trusted borrow and raw fallback have separate ownership" {
    const bytes = try fixture.zipWithSectionHeader(a, section, header);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    try std.testing.expect(session.original_header != null);
    try std.testing.expect(!session.display_resource_trusted);
    {
        var raw = headers.Context.init(&session);
        defer raw.deinit();
        const tree = try raw.originalHeader();
        try std.testing.expect(tree != &session.original_header.?);
        try std.testing.expect(raw.original_tree != null);
        try std.testing.expectEqualStrings(header, tree.source);
    }
    @import("display_resource_generation.zig").openOwned(&session);
    {
        var trusted = headers.Context.init(&session);
        defer trusted.deinit();
        try std.testing.expect(try trusted.originalHeader() == &session.original_header.?);
        try std.testing.expect(try trusted.originalHeader() == &session.original_header.?);
        try std.testing.expect(trusted.original_tree == null);
        try std.testing.expect(trusted.document_value == null);
    }
    try std.testing.expectEqualStrings(header, session.original_header.?.source);
}

test "header capture mismatched source pointer and length fall back before borrow" {
    const bytes = try fixture.zipWithSectionHeader(a, section, header);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    @import("display_resource_generation.zig").openOwned(&session);
    const binding = session.original_header_source;
    defer session.original_header_source = binding;
    const duplicate = try a.dupe(u8, session.source);
    defer a.free(duplicate);
    for ([_][]const u8{ duplicate, binding[0 .. binding.len - 1] }) |mismatch| {
        session.original_header_source = mismatch;
        var context = headers.Context.init(&session);
        defer context.deinit();
        const tree = try context.originalHeader();
        try std.testing.expect(tree != &session.original_header.?);
        try std.testing.expect(context.original_tree != null);
        try std.testing.expectEqualStrings(header, tree.source);
    }
}

test "header capture raw in place edits and foreign source copies observe fresh XML" {
    const bytes = try fixture.zipWithSectionHeader(a, section, header);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const changed_header = try a.dupe(u8, header);
    defer a.free(changed_header);
    const at = std.mem.indexOf(u8, changed_header, "1&amp;5").?;
    changed_header[at] = '2';
    const changed_zip = try fixture.zipWithSectionHeader(a, section, changed_header);
    defer a.free(changed_zip);
    @import("display_resource_generation.zig").openOwned(&session);
    // This projection borrows the Session's owners and is never deinitialized.
    var copy = session;
    copy.source = changed_zip;
    {
        var context = headers.Context.init(&copy);
        defer context.deinit();
        try std.testing.expectEqualStrings(changed_header, (try context.originalHeader()).source);
        try std.testing.expect(context.original_tree != null);
    }
    // A raw Session may alter bytes at the exact original address and length.
    session.display_resource_trusted = false;
    try std.testing.expectEqual(session.source.len, changed_zip.len);
    @memcpy(session.source, changed_zip);
    {
        var context = headers.Context.init(&session);
        defer context.deinit();
        try std.testing.expectEqualStrings(changed_header, (try context.originalHeader()).source);
    }
    try std.testing.expectEqualStrings(header, session.original_header.?.source);
}

test "header capture original getter retains legacy options behavior and stale fences" {
    const bytes = try fixture.zipWithSectionHeader(a, section, header);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const source = session.source;
    const duplicate = try a.dupe(u8, source);
    defer a.free(duplicate);
    for ([_]bool{ false, true }) |trusted| {
        session.display_resource_trusted = trusted;
        session.options.max_xml_bytes = 1;
        var context = headers.Context.init(&session);
        defer context.deinit();
        try std.testing.expectEqualStrings(header, (try context.originalHeader()).source);
        session.options.max_xml_bytes = 2;
        try std.testing.expectError(error.StaleHeaderReadContext, context.originalHeader());
        session.options.max_xml_bytes = 1;
        session.mutation_serial += 1;
        try std.testing.expectError(error.StaleHeaderReadContext, context.originalHeader());
        session.mutation_serial -= 1;
        session.source = duplicate;
        try std.testing.expectError(error.StaleHeaderReadContext, context.originalHeader());
        session.source = source[0 .. source.len - 1];
        try std.testing.expectError(error.StaleHeaderReadContext, context.originalHeader());
        session.source = source;
        try std.testing.expectEqualStrings(header, (try context.originalHeader()).source);
    }
}

fn parseAllocationProbe(allocator: std.mem.Allocator, bytes: []const u8, failure: ?anyerror) !void {
    if (parts.parseInspectedHeader(allocator, bytes, 0, .{})) |result| {
        var captured = result;
        defer captured.report.deinit(allocator);
        defer captured.tree.deinit(allocator);
        try std.testing.expect(failure == null);
        try std.testing.expectEqualStrings("1&5", captured.report.header_version.?);
    } else |err| {
        if (err == error.OutOfMemory) return err;
        try std.testing.expectEqual(failure orelse return err, err);
    }
}

fn structureAllocationProbe(allocator: std.mem.Allocator, bytes: []const u8, failure: ?anyerror) !void {
    var document = try package.inspectDocument(allocator, bytes, .{});
    defer document.deinit(allocator);
    if (structure.inspectWithHeader(allocator, document.archive, document.manifest, .{})) |result| {
        var captured = result;
        defer captured.report.deinit(allocator);
        defer captured.header.deinit(allocator);
        try std.testing.expect(failure == null);
        try std.testing.expectEqualStrings(header, captured.header.source);
    } else |err| {
        if (err == error.OutOfMemory) return err;
        try std.testing.expectEqual(failure orelse return err, err);
    }
}

fn sessionAllocationProbe(allocator: std.mem.Allocator, bytes: []const u8, trusted: bool) !void {
    var session = try editor.open(allocator, bytes, .{});
    defer session.deinit();
    if (trusted) @import("display_resource_generation.zig").openOwned(&session);
    var context = headers.Context.init(&session);
    defer context.deinit();
    const tree = try context.originalHeader();
    try std.testing.expectEqualStrings(header, tree.source);
    try std.testing.expectEqual(trusted, tree == &session.original_header.?);
}

test "header capture every parse allocation and metadata failure releases partial owners" {
    var fixed_growth = std.testing.FailingAllocator.init(a, .{ .resize_fail_index = 0 });
    try std.testing.checkAllAllocationFailures(fixed_growth.allocator(), parseAllocationProbe, .{ header, @as(?anyerror, null) });
    try std.testing.checkAllAllocationFailures(fixed_growth.allocator(), parseAllocationProbe, .{ opening ++ " version='1&amp;5'><h:a/></wrong>", @as(?anyerror, error.XmlElementNameMismatch) });
    try std.testing.checkAllAllocationFailures(fixed_growth.allocator(), parseAllocationProbe, .{ opening ++ " secCnt='bad'><h:a/></wrong>", @as(?anyerror, error.InvalidSectionCount) });
}

test "header capture every structure and late spine failure allocation releases captured header" {
    const bytes = try fixture.zipWithSectionHeader(a, section, header);
    defer a.free(bytes);
    const bad = try fixture.zipWithSectionHeader(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'><s:a/></wrong>", header);
    defer a.free(bad);
    var fixed_growth = std.testing.FailingAllocator.init(a, .{ .resize_fail_index = 0 });
    try std.testing.checkAllAllocationFailures(fixed_growth.allocator(), structureAllocationProbe, .{ bytes, @as(?anyerror, null) });
    try std.testing.checkAllAllocationFailures(fixed_growth.allocator(), structureAllocationProbe, .{ bad, @as(?anyerror, error.XmlElementNameMismatch) });
}

test "header capture every Session open and raw fallback allocation releases owned trees" {
    const bytes = try fixture.zipWithSectionHeader(a, section, header);
    defer a.free(bytes);
    var fixed_growth = std.testing.FailingAllocator.init(a, .{ .resize_fail_index = 0 });
    for ([_]bool{ false, true }) |trusted|
        try std.testing.checkAllAllocationFailures(fixed_growth.allocator(), sessionAllocationProbe, .{ bytes, trusted });
}
