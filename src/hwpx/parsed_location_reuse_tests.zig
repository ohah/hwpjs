//! Synthetic only: no filesystem fixtures, Session imports, or Native flags.
const std = @import("std");
const trees = @import("xml_part_tree.zig");
const sites_mod = @import("text_sites.zig");
const locations = @import("text_site_locations.zig");
const scanner = @import("section_text.zig");
const a = std.testing.allocator;
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>";
const suffix = "</s:sec>";
const site_options: sites_mod.Options = .{ .materialize_tab_boundaries = true, .materialize_anchor_boundaries = true, .branch_policy = .{ .mode = .selected } };
const seed: scanner.Report = .{ .sections = 4, .paragraphs = 11, .runs = 17, .text_elements = 19, .text_bytes = 3, .text_chunks = 2, .decoded_xml_bytes = 23 };

fn release(allocator: std.mem.Allocator, parsed: *trees.ParsedWithContent) void {
    if (parsed.events) |events| allocator.free(events);
    parsed.tree.deinit(allocator);
}

const Sink = struct {
    tree: *const trees.Tree,
    values: []?scanner.Location,
    next: usize = 0,

    fn location(raw: *anyopaque, index: usize, value: scanner.Location) anyerror!void {
        const self: *Sink = @ptrCast(@alignCast(raw));
        if (index >= self.values.len or self.values[index] != null) return error.SourceBindingMismatch;
        self.values[index] = value;
    }

    fn event(raw: *anyopaque, value: scanner.Event) anyerror!void {
        const self: *Sink = @ptrCast(@alignCast(raw));
        const start: scanner.BoundaryEvent = switch (value) {
            .run_start => |v| v,
            .text_start => |v| .{ .location = v.location, .tag = v.tag, .scope = v.scope },
            else => return,
        };
        try location(raw, try self.tree.startTagIndexForward(start.tag.raw, &self.next), start.location);
    }
};

fn compareScan(parsed: *const trees.ParsedWithContent, options: scanner.Options, expected_reuse: bool) !void {
    const old_values = try a.alloc(?scanner.Location, parsed.tree.elements.len);
    defer a.free(old_values);
    const new_values = try a.alloc(?scanner.Location, parsed.tree.elements.len);
    defer a.free(new_values);
    @memset(old_values, null);
    @memset(new_values, null);
    var old: Sink = .{ .tree = &parsed.tree, .values = old_values };
    var fresh: Sink = .{ .tree = &parsed.tree, .values = new_values };
    var old_report = seed;
    var new_report = seed;
    try scanner.scanSource(a, parsed.tree.source, parsed.tree.section_ordinal.?, parsed.tree.item_index, options, &old_report, .{ .context = &old, .on_event = Sink.event });
    const reused = try scanner.scanParsedLocations(a, parsed, options, &new_report, .{ .context = &fresh, .on_location = Sink.location });
    try std.testing.expectEqual(expected_reuse, reused);
    if (!reused) {
        try std.testing.expectEqualDeep(seed, new_report);
        for (new_values) |value| try std.testing.expect(value == null);
        try scanner.scanSource(a, parsed.tree.source, parsed.tree.section_ordinal.?, parsed.tree.item_index, options, &new_report, .{ .context = &fresh, .on_event = Sink.event });
    }
    try std.testing.expectEqualDeep(old_report, new_report);
    try std.testing.expectEqualDeep(old_values, new_values);
}

fn compareSites(parsed: *const trees.ParsedWithContent, counters: *scanner.Report) !void {
    var sites = try sites_mod.collectParsed(a, parsed, site_options);
    defer sites.deinit(a);
    var reference = counters.*;
    const expected = try locations.buildWithCounters(a, &parsed.tree, &sites, site_options, &reference);
    defer a.free(expected);
    const actual = try locations.buildParsedWithCounters(a, parsed, &sites, site_options, counters);
    defer a.free(actual);
    try std.testing.expectEqualDeep(reference, counters.*);
    try std.testing.expectEqualDeep(expected, actual);
}

test "parsed location reuse compares all locations and report fields including inline and whitespace content" {
    inline for (.{
        "",
        "<p:p/><p:p><p:run/></p:p><p:p><p:run><p:t/></p:run></p:p><p:p><p:run><p:t></p:t></p:run></p:p>",
        "\r\n<p:p><p:run> \t\n<p:t>A&amp;&#x1F600;<![CDATA[<B>]]><!--keep--><?pi x?>C</p:t></p:run></p:p>\n",
        "<p:p><p:run><p:t><![CDATA[]]>A<p:tab/>B<p:lineBreak/>C<p:markpenBegin/><p:titleMark/>D</p:t></p:run></p:p>",
        "<p:p><p:run><p:t>before<x:mark>inside<p:p><p:run><p:t>nested</p:t></p:run></p:p></x:mark>after</p:t></p:run></p:p>",
        "<p:p><p:run><x:t>foreign</x:t><p:script>script</p:script><p:t>body</p:t></p:run></p:p>",
        "<p:p><p:run><p:t>A<p:fwSpace/><p:nbSpace/><p:hypen/><p:hyphen/><p:markpenEnd/></p:t></p:run></p:p>",
        "<p:p><p:run> \n </p:run><p:run><p:charPr/></p:run></p:p>",
        "<p:p><p:run><p:secPr/></p:run></p:p><p:p><p:run><p:t><p:tab/></p:t></p:run></p:p>",
        "<q:p xmlns:q='http://www.hancom.co.kr/hwpml/2011/paragraph'><q:run><q:t>A</q:t><p:t xmlns:p='urn:rebound'>foreign</p:t></q:run></q:p>",
    }) |body| {
        var parsed = try trees.parseWithContent(a, prefix ++ body ++ suffix, .section, 7, 19, .{});
        defer release(a, &parsed);
        try compareScan(&parsed, .{ .branch_policy = site_options.branch_policy }, true);
        var report = seed;
        try compareSites(&parsed, &report);
    }
}

test "parsed location reuse preserves spine supplied ordinals and empty paragraph counters" {
    var report = seed;
    var first = try trees.parseWithContent(a, prefix ++ "<p:p/><p:p><p:run><p:t>A</p:t></p:run></p:p>" ++ suffix, .section, 8, 70, .{});
    defer release(a, &first);
    try compareSites(&first, &report);
    try std.testing.expectEqual(@as(usize, 13), report.paragraphs);
    try std.testing.expectEqual(@as(usize, 18), report.runs);
    var second = try trees.parseWithContent(a, prefix ++ "<p:p/><p:p><p:run/><p:run><p:t>B</p:t></p:run></p:p>" ++ suffix, .section, 2, 3, .{});
    defer release(a, &second);
    try compareSites(&second, &report);
    try std.testing.expectEqual(@as(usize, 15), report.paragraphs);
    try std.testing.expectEqual(@as(usize, 20), report.runs);
    try std.testing.expectEqual(@as(usize, 21), report.text_elements);
    try std.testing.expectEqual(seed.decoded_xml_bytes, report.decoded_xml_bytes);
}

test "parsed location reuse falls back for semantic switches and null capture" {
    const input = prefix ++ "<p:p><p:run><p:switch><p:case p:required-namespace='urn:unknown'><p:p><p:run><p:t>skip</p:t></p:run></p:p></p:case><p:default><p:t>keep</p:t></p:default></p:switch></p:run></p:p>" ++ suffix;
    var parsed = try trees.parseWithContent(a, input, .section, 0, 6, .{});
    defer release(a, &parsed);
    try compareScan(&parsed, .{ .branch_policy = site_options.branch_policy }, false);
    try compareScan(&parsed, .{}, false);
    var report = seed;
    try compareSites(&parsed, &report);
    var plain = try trees.parseWithContent(a, prefix ++ "<p:p><p:run><p:t>plain</p:t></p:run></p:p>" ++ suffix, .section, 1, 0, .{});
    defer release(a, &plain);
    var no_capture = plain;
    no_capture.events = null;
    try compareScan(&no_capture, .{}, false);
    try compareSites(&no_capture, &report);
}

test "parsed location reuse capture cap keeps the old scanner fallback" {
    for ([_]usize{ trees.max_captured_content_events - 1, trees.max_captured_content_events, trees.max_captured_content_events + 1 }) |count| {
        var bytes: std.ArrayList(u8) = .empty;
        defer bytes.deinit(a);
        try bytes.appendSlice(a, prefix ++ "<p:p><p:run><p:t>");
        for (0..count) |_| try bytes.appendSlice(a, "<![CDATA[x]]>");
        try bytes.appendSlice(a, "</p:t></p:run></p:p>" ++ suffix);
        var parsed = try trees.parseWithContent(a, bytes.items, .section, 0, 0, .{});
        defer release(a, &parsed);
        try std.testing.expectEqual(count > trees.max_captured_content_events, parsed.events == null);
        try compareScan(&parsed, .{}, count <= trees.max_captured_content_events);
        var report: scanner.Report = .{};
        try compareSites(&parsed, &report);
        try std.testing.expectEqual(count, report.text_chunks);
    }
}

test "parsed location reuse UTF16 scanner parity and original edit encoding refusal" {
    const input = prefix ++ "<p:p/><p:p><p:run><p:t>A&amp;<![CDATA[B]]><p:tab/>C</p:t></p:run></p:p>" ++ suffix;
    inline for (.{ .little, .big }) |endian| {
        const bytes = try a.alloc(u8, input.len * 2 + 2);
        defer a.free(bytes);
        std.mem.writeInt(u16, bytes[0..2], 0xfeff, endian);
        for (input, 0..) |byte, index| std.mem.writeInt(u16, bytes[2 + index * 2 ..][0..2], byte, endian);
        var parsed = try trees.parseWithContent(a, bytes, .section, 0, 9, .{});
        defer release(a, &parsed);
        try compareScan(&parsed, .{}, true);
        try std.testing.expectError(error.UnsupportedEditEncoding, sites_mod.collectParsed(a, &parsed, site_options));
    }
}

test "parsed location reuse declines unknown XML limits without changing counters or bindings" {
    var parsed = try trees.parseWithContent(a, prefix ++ "<p:p><p:run><p:t>A</p:t></p:run></p:p>" ++ suffix, .section, 0, 0, .{});
    defer release(a, &parsed);
    const values = try a.alloc(?scanner.Location, parsed.tree.elements.len);
    defer a.free(values);
    inline for (.{
        scanner.Options{ .xml = .{ .max_elements = 1 } },
        scanner.Options{ .xml = .{ .max_events = 1 } },
        scanner.Options{ .xml = .{ .max_depth = 1 } },
        scanner.Options{ .xml = .{ .max_attribute_bytes = 1 } },
        scanner.Options{ .max_section_xml_bytes = 1 },
    }) |options| {
        @memset(values, null);
        var sink: Sink = .{ .tree = &parsed.tree, .values = values };
        var report = seed;
        try std.testing.expect(!try scanner.scanParsedLocations(a, &parsed, options, &report, .{ .context = &sink, .on_location = Sink.location }));
        try std.testing.expectEqualDeep(seed, report);
        for (values) |value| try std.testing.expect(value == null);
    }
    var report: scanner.Report = .{};
    try std.testing.expectError(error.LimitExceeded, scanner.scanSource(a, parsed.tree.source, 0, 0, .{ .xml = .{ .max_elements = 1 } }, &report, null));
}

test "parsed location reuse preserves text inline budgets and commits counters only on full success" {
    var parsed = try trees.parseWithContent(a, prefix ++ "<p:p><p:run><p:t>A<x:mark>BC</x:mark>D</p:t></p:run></p:p>" ++ suffix, .section, 0, 0, .{});
    defer release(a, &parsed);
    var sites = try sites_mod.collectParsed(a, &parsed, site_options);
    defer sites.deinit(a);
    var report: scanner.Report = .{};
    var limited = site_options;
    limited.max_text_bytes = 3;
    try std.testing.expectError(error.LimitExceeded, locations.buildWithCounters(a, &parsed.tree, &sites, limited, &report));
    try std.testing.expectEqualDeep(scanner.Report{}, report);
    try std.testing.expectError(error.LimitExceeded, locations.buildParsedWithCounters(a, &parsed, &sites, limited, &report));
    try std.testing.expectEqualDeep(scanner.Report{}, report);
    limited.max_text_bytes = 4;
    const exact = try locations.buildParsedWithCounters(a, &parsed, &sites, limited, &report);
    a.free(exact);
    try std.testing.expectEqual(@as(usize, 4), report.text_bytes);
    report = .{};
    limited = site_options;
    limited.branch_policy = .{ .mode = .selected, .supported_namespaces = &.{"bad namespace"} };
    try std.testing.expectError(error.InvalidSupportedNamespace, locations.buildWithCounters(a, &parsed.tree, &sites, limited, &report));
    try std.testing.expectError(error.InvalidSupportedNamespace, locations.buildParsedWithCounters(a, &parsed, &sites, limited, &report));
    try std.testing.expectEqualDeep(scanner.Report{}, report);
    const saved = sites.items[0].element_index;
    sites.items[0].element_index = parsed.tree.elements.len;
    defer sites.items[0].element_index = saved;
    try std.testing.expectError(error.InvalidTextSites, locations.buildParsedWithCounters(a, &parsed, &sites, site_options, &report));
    try std.testing.expectEqualDeep(scanner.Report{}, report);
    const values = try a.alloc(?scanner.Location, parsed.tree.elements.len);
    defer a.free(values);
    @memset(values, null);
    var sink: Sink = .{ .tree = &parsed.tree, .values = values };
    var old: scanner.Report = .{};
    var fresh: scanner.Report = .{};
    try std.testing.expectError(error.LimitExceeded, scanner.scanSource(a, parsed.tree.source, 0, 0, .{ .max_inline_elements = 0 }, &old, null));
    try std.testing.expectError(error.LimitExceeded, scanner.scanParsedLocations(a, &parsed, .{ .max_inline_elements = 0 }, &fresh, .{ .context = &sink, .on_location = Sink.location }));
    try std.testing.expectEqualDeep(old, fresh);
}

test "parsed location reuse OOM sweep retains caller counters and owns all partial allocations" {
    var parsed = try trees.parseWithContent(a, prefix ++ " \n<p:p/><p:p><p:run> \t<p:t>A&amp;<![CDATA[B]]><x:mark>inline</x:mark>C</p:t></p:run></p:p>" ++ suffix, .section, 3, 7, .{});
    defer release(a, &parsed);
    var sites = try sites_mod.collectParsed(a, &parsed, site_options);
    defer sites.deinit(a);
    var expected_report = seed;
    const expected = try locations.buildWithCounters(a, &parsed.tree, &sites, site_options, &expected_report);
    defer a.free(expected);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: *const trees.ParsedWithContent, bindings: *const sites_mod.Sites, wanted: []const scanner.Location, wanted_report: scanner.Report) !void {
            var report = seed;
            const result = locations.buildParsedWithCounters(allocator, input, bindings, site_options, &report) catch |err| {
                try std.testing.expectEqualDeep(seed, report);
                return err;
            };
            defer allocator.free(result);
            try std.testing.expectEqualDeep(wanted, result);
            try std.testing.expectEqualDeep(wanted_report, report);
        }
    }.run, .{ &parsed, &sites, expected, expected_report });
}

test "parsed location reuse leaves raw XML validation active and rejects inactive malformed branches" {
    const input = prefix ++ "<p:p><p:run><p:switch><p:case p:required-namespace='urn:unknown'><undeclared:t/></p:case><p:default><p:t>ok</p:t></p:default></p:switch></p:run></p:p>" ++ suffix;
    var report: scanner.Report = .{};
    const failure: anyerror = blk: {
        scanner.scanSource(a, input, 0, 0, .{ .branch_policy = site_options.branch_policy }, &report, null) catch |err| break :blk err;
        return error.ExpectedMalformedXml;
    };
    try std.testing.expectError(failure, trees.parseWithContent(a, input, .section, 0, 0, .{}));
    var parsed = try trees.parseWithContent(a, prefix ++ "<p:p><p:run><p:t>A</p:t></p:run></p:p>" ++ suffix, .section, 0, 0, .{});
    defer release(a, &parsed);
    var sites = try sites_mod.collectParsed(a, &parsed, site_options);
    defer sites.deinit(a);
    parsed.tree.source[0] = '!';
    report = .{};
    const before = report;
    const result = locations.buildWithCounters(a, &parsed.tree, &sites, site_options, &report) catch {
        try std.testing.expectEqualDeep(before, report);
        return;
    };
    defer a.free(result);
    return error.ExpectedRawValidationFailure;
}
