const std = @import("std");
const trees = @import("xml_part_tree.zig");
const sites = @import("text_sites.zig");
const a = std.testing.allocator;
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:e='http://www.idpf.org/2007/ops'>";
const suffix = "</s:sec>";

fn compare(allocator: std.mem.Allocator, input: []const u8) !void {
    var parsed = try trees.parseWithContent(allocator, input, .section, 0, 0, .{});
    defer parsed.tree.deinit(allocator);
    defer if (parsed.events) |events| allocator.free(events);
    var original = try trees.parse(allocator, input, .section, 0, 0, .{});
    defer original.deinit(allocator);
    try std.testing.expectEqualDeep(original.xml_report, parsed.tree.xml_report);
    const options: sites.Options = .{ .materialize_tab_boundaries = true, .materialize_anchor_boundaries = true, .branch_policy = .{ .mode = .selected } };
    var fused = try sites.collectParsed(allocator, &parsed, options);
    defer fused.deinit(allocator);
    var reference = try sites.collect(allocator, &parsed.tree, options);
    defer reference.deinit(allocator);
    try std.testing.expectEqualDeep(reference.items, fused.items);
    // Source copies and events remain independent of the caller's input buffer.
    try std.testing.expectEqualStrings(input, parsed.tree.source);
    for (parsed.events.?) |event| {
        try std.testing.expect(event.parent_index < parsed.tree.elements.len);
        const p = @intFromPtr(event.value.raw.ptr);
        const base = @intFromPtr(parsed.tree.source.ptr);
        try std.testing.expect(p >= base and p + event.value.raw.len <= base + parsed.tree.source.len);
    }
}

test "fused text content preserves source order entities branches nested owners and empty sites" {
    inline for (.{
        "<p:p><p:run><p:t>A&amp;&#x1F600;<![CDATA[<B>]]><!--keep-->C</p:t></p:run></p:p>",
        "<p:p/><p:p><p:run/></p:p><p:p><p:run><p:t/></p:run></p:p>",
        "<p:p><p:run><p:t>before<p:tbl><p:tr><p:tc><p:subList><p:p><p:run><p:t>nested</p:t></p:run></p:p></p:subList></p:tc></p:tr></p:tbl>after</p:t></p:run></p:p>",
        "<p:p><p:run><p:switch><p:case e:required-namespace='urn:unsupported'><p:t>skip</p:t></p:case><p:default><p:t>keep</p:t></p:default></p:switch></p:run></p:p>",
        "<p:p><p:run><p:t>A<p:tab/>B<p:lineBreak/>C</p:t></p:run></p:p>",
        "<p:p><p:run><x:t xmlns:x='urn:foreign'>foreign</x:t><p:t>body</p:t></p:run></p:p>",
        "<p:p><p:run> \n\t </p:run></p:p>",
    }) |body| try compare(a, prefix ++ body ++ suffix);
}

test "fused text content propagates syntax errors limits and allocation failures" {
    inline for (.{
        prefix ++ "<p:p><p:t>&missing;</p:t></p:p>" ++ suffix,
        prefix ++ "<p:p id='1' id='2'/>" ++ suffix,
        prefix ++ "<q:p/>" ++ suffix,
        prefix ++ "<p:p></p:run>" ++ suffix,
    }) |input| {
        const expected: anyerror = blk: {
            var tree = trees.parse(a, input, .section, 0, 0, .{}) catch |err| break :blk err;
            defer tree.deinit(a);
            return error.ExpectedMalformedXml;
        };
        try std.testing.expectError(expected, trees.parseWithContent(a, input, .section, 0, 0, .{}));
    }
    const valid = prefix ++ "<p:p><p:run><p:t>A&amp;<![CDATA[B]]></p:t></p:run></p:p>" ++ suffix;
    try std.testing.expectError(error.LimitExceeded, trees.parseWithContent(a, valid, .section, 0, 0, .{ .max_nodes = 1 }));
    try std.testing.checkAllAllocationFailures(a, compare, .{valid});
}

test "fused text content owns input and preserves decoding and site limits" {
    const valid = prefix ++ "<p:p><p:run><p:t>A&amp;B</p:t><p:t>C</p:t></p:run></p:p>" ++ suffix;
    const input = try a.dupe(u8, valid);
    defer a.free(input);
    var parsed = try trees.parseWithContent(a, input, .section, 0, 0, .{});
    defer parsed.tree.deinit(a);
    defer if (parsed.events) |events| a.free(events);
    @memset(input, 'x');
    try std.testing.expectEqualStrings(valid, parsed.tree.source);
    var result = try sites.collectParsed(a, &parsed, .{});
    defer result.deinit(a);
    try std.testing.expectEqualStrings("A&B", result.items[0].text);
    inline for (.{ sites.Options{ .max_text_bytes = 1 }, sites.Options{ .max_sites = 1 } }) |options| {
        try std.testing.expectError(error.LimitExceeded, sites.collect(a, &parsed.tree, options));
        try std.testing.expectError(error.LimitExceeded, sites.collectParsed(a, &parsed, options));
    }
    const utf16 = try a.alloc(u8, valid.len * 2 + 2);
    defer a.free(utf16);
    utf16[0] = 0xff;
    utf16[1] = 0xfe;
    for (valid, 0..) |byte, i| std.mem.writeInt(u16, utf16[2 + i * 2 ..][0..2], byte, .little);
    var wide = try trees.parseWithContent(a, utf16, .section, 0, 0, .{});
    defer wide.tree.deinit(a);
    defer if (wide.events) |events| a.free(events);
    try std.testing.expectError(error.UnsupportedEditEncoding, sites.collect(a, &wide.tree, .{}));
    try std.testing.expectError(error.UnsupportedEditEncoding, sites.collectParsed(a, &wide, .{}));
}

test "fused text content falls back at capture budget without rejecting or losing content" {
    for ([_]usize{ trees.max_captured_content_events - 1, trees.max_captured_content_events, trees.max_captured_content_events + 1 }) |count| {
        var bytes: std.ArrayList(u8) = .empty;
        defer bytes.deinit(a);
        try bytes.appendSlice(a, prefix ++ "<p:p><p:run><p:t>");
        for (0..count) |_| try bytes.appendSlice(a, "<![CDATA[x]]>");
        try bytes.appendSlice(a, "</p:t></p:run></p:p>" ++ suffix);
        var parsed = try trees.parseWithContent(a, bytes.items, .section, 0, 0, .{});
        defer parsed.tree.deinit(a);
        defer if (parsed.events) |events| a.free(events);
        try std.testing.expectEqual(count > trees.max_captured_content_events, parsed.events == null);
        var reference = try sites.collect(a, &parsed.tree, .{});
        defer reference.deinit(a);
        var fallback = try sites.collectParsed(a, &parsed, .{});
        defer fallback.deinit(a);
        try std.testing.expectEqual(count, fallback.items.len);
        try std.testing.expectEqualDeep(reference.items, fallback.items);
        // Abandoning capture must not stop lexical/namespace validation.
        const bad = try std.mem.concat(a, u8, &.{ bytes.items[0 .. bytes.items.len - suffix.len], "<undeclared:p/>", suffix });
        defer a.free(bad);
        const expected: anyerror = blk: {
            var tree = trees.parse(a, bad, .section, 0, 0, .{}) catch |err| break :blk err;
            defer tree.deinit(a);
            return error.ExpectedMalformedXml;
        };
        try std.testing.expectError(expected, trees.parseWithContent(a, bad, .section, 0, 0, .{}));
    }
}
