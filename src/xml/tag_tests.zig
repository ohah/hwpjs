const std = @import("std");
const t = std.testing;
const xml = @import("root.zig");
test "XML tag attributes normalize literal whitespace but preserve reference scalars" {
    const source = "<x a=' \t\r\n&#9;&#10;&#13;&lt;&amp;&quot;&apos; ' b='&custom;'/>tail";
    var input = try xml.input.Input.init(source, .utf8, .{});
    var tag = try xml.tags.parse(t.allocator, &input, .{});
    defer tag.deinit(t.allocator);
    try t.expectEqual(.empty, tag.kind);
    try t.expect(tag.name.equals("x", false));
    try t.expectEqual(@as(usize, 2), tag.attributes.len);
    try t.expectEqual(@as(usize, 8), tag.references);
    try t.expectEqual(@as(usize, 1), tag.unresolved);
    var iterator = try tag.attributes[0].value.iterator();
    for ([_]u21{ 32, 32, 32, 9, 10, 13, 60, 38, 34, 39, 32 }) |c| try t.expectEqual(c, (try iterator.next()).?.scalar().?);
    try t.expectEqual(null, try iterator.next());
    try t.expectEqual(@as(usize, 11), tag.attributes[0].value.stats.scalars);
    iterator = try tag.attributes[1].value.iterator();
    const unresolved = (try iterator.next()).?.reference.value.unresolved;
    try t.expect(unresolved.equals("custom", false));
    try t.expectEqual(@intFromPtr(source.ptr), @intFromPtr(tag.raw.ptr));
    try t.expectEqualStrings("tail", input.bytes[input.offset..]);
}
test "XML tag syntax failures and duplicate attributes roll back all input state" {
    for ([_][]const u8{ "", "<", "<>", "< x>", "<x", "<x / >", "</x/>", "</x a='1'>", "<x a=1>", "<x a='1'b='2'>", "<x a='1' a='2'>", "<x a='<'/>", "<x a='&amp'/>", "<x a='&#0;'/>", "<x a='unterminated", "<?xml?>", "<!--x-->" }) |source| {
        var input = try xml.input.Input.init(source, .utf8, .{});
        const before = input;
        if (xml.tags.parse(t.allocator, &input, .{})) |result| {
            var owned = result;
            owned.deinit(t.allocator);
            return error.ExpectedRejection;
        } else |_| {}
        try t.expectEqual(before.offset, input.offset);
        try t.expectEqual(before.remaining, input.remaining);
    }
    var input = try xml.input.Input.init("<x a='1' A='2' p:x='3' q:x='4'/></x >", .utf8, .{});
    var first = try xml.tags.parse(t.allocator, &input, .{});
    defer first.deinit(t.allocator);
    try t.expectEqual(@as(usize, 4), first.attributes.len);
    const second_start = input.offset;
    const remaining = input.remaining;
    try t.expectError(error.LimitExceeded, xml.tags.parse(t.allocator, &input, .{ .max_bytes = 4 }));
    try t.expectEqual(second_start, input.offset);
    try t.expectEqual(remaining, input.remaining);
    var second = try xml.tags.parse(t.allocator, &input, .{ .max_bytes = 5 });
    defer second.deinit(t.allocator);
    try t.expectEqual(.end, second.kind); // Matching element stack is not this parser's role.
    try t.expectEqualStrings("</x >", second.raw);
}
test "XML tag shared budgets include attributes references quotes and delimiters" {
    const source = "<xx aa='&amp;' bb='&#13;'/>";
    const exact: xml.tags.Options = .{ .max_bytes = source.len, .max_name_bytes = 2, .max_attributes = 2, .max_references = 2 };
    var input = try xml.input.Input.init(source, .utf8, .{ .max_characters = source.len });
    var tag = try xml.tags.parse(t.allocator, &input, exact);
    defer tag.deinit(t.allocator);
    try t.expectEqual(@as(usize, 0), input.remaining);
    for (0..5) |n| {
        var options = exact;
        var chars = source.len;
        switch (n) {
            0 => options.max_bytes -= 1,
            1 => options.max_name_bytes -= 1,
            2 => options.max_attributes -= 1,
            3 => options.max_references -= 1,
            4 => chars -= 1,
            else => unreachable,
        }
        input = try xml.input.Input.init(source, .utf8, .{ .max_characters = chars });
        try t.expectError(error.LimitExceeded, xml.tags.parse(t.allocator, &input, options));
        try t.expectEqual(@as(usize, 0), input.offset);
        try t.expectEqual(chars, input.remaining);
    }
}
test "XML tags preserve UTF16 byte order and raw duplicate identity" {
    const source = "<x a='&#13;&quot;'/ >";
    inline for (.{ xml.input.Encoding.utf16le, xml.input.Encoding.utf16be }) |encoding| {
        var bytes: [source.len * 2]u8 = undefined;
        for (source, 0..) |c, i| std.mem.writeInt(u16, bytes[i * 2 ..][0..2], c, if (encoding == .utf16le) .little else .big);
        var input = try xml.input.Input.init(&bytes, encoding, .{});
        try t.expectError(error.InvalidXmlTag, xml.tags.parse(t.allocator, &input, .{}));
        // Replace the invalid slash-space ending with a plain start-tag ending.
        const valid = bytes[0 .. bytes.len - 6];
        var owned = try t.allocator.alloc(u8, valid.len + 2);
        defer t.allocator.free(owned);
        @memcpy(owned[0..valid.len], valid);
        std.mem.writeInt(u16, owned[valid.len..][0..2], '>', if (encoding == .utf16le) .little else .big);
        input = try xml.input.Input.init(owned, encoding, .{});
        var tag = try xml.tags.parse(t.allocator, &input, .{ .max_bytes = owned.len });
        defer tag.deinit(t.allocator);
        var iterator = try tag.attributes[0].value.iterator();
        try t.expectEqual(@as(u21, 13), (try iterator.next()).?.scalar().?);
        try t.expectEqual(@as(u21, '"'), (try iterator.next()).?.scalar().?);
    }
}
fn allocationCase(a: std.mem.Allocator, fail_late: bool) !void {
    const source = if (fail_late) "<x a='1' b='2' c='3' d='4' e='5' f='6' g='7' h='8' i='9' j='10' a='duplicate'/>" else "<x a='1' b='2' c='3' d='4' e='5' f='6' g='7' h='8' i='9' j='10'/>";
    var input = try xml.input.Input.init(source, .utf8, .{});
    var tag = xml.tags.parse(a, &input, .{}) catch |err| {
        try t.expectEqual(@as(usize, 0), input.offset);
        try t.expectEqual(@as(usize, 16 * 1024 * 1024), input.remaining);
        if (fail_late and err == error.DuplicateXmlAttribute) return;
        return err;
    };
    defer tag.deinit(a);
    try t.expect(!fail_late);
    try t.expectEqual(@as(usize, 10), tag.attributes.len);
}
test "XML tag allocation failures and late duplicate release all metadata" {
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{false});
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{true});
}
