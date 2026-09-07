const std = @import("std");
const t = std.testing;
const xml = @import("root.zig");
const doc = xml.document;
test "XML document exact text byte budget stops before the following tag" {
    const result = try doc.inspect(t.allocator, "<r>A&#13;</r>", .{ .max_text_bytes = 6 });
    try t.expectEqual(@as(usize, 2), result.text_scalars);
    try t.expectError(error.LimitExceeded, doc.inspect(t.allocator, "<r>A&#13;</r>", .{ .max_text_bytes = 5 }));
    inline for (.{ "<!--x-->", "<![CDATA[]]]>", "<?p?>", "<?p ??>" }) |token| {
        const source = "<r>" ++ token ++ "</r>";
        _ = try doc.inspect(t.allocator, source, .{ .max_markup_bytes = token.len });
        try t.expectError(error.LimitExceeded, doc.inspect(t.allocator, source, .{ .max_markup_bytes = token.len - 1 }));
    }
    const cdata = try doc.inspect(t.allocator, "<r><![CDATA[]]]></r>", .{});
    try t.expectEqual(@as(usize, 1), cdata.text_scalars);
    const newline = try doc.inspect(t.allocator, "<r>\r\n</r>", .{ .max_text_bytes = 2 });
    try t.expectEqual(@as(usize, 1), newline.text_scalars);
    try t.expectError(error.LimitExceeded, doc.inspect(t.allocator, "<r>\r\n</r>", .{ .max_text_bytes = 1 }));
}
test "XML document combines comments CDATA PI references and matching tags" {
    const source = "<?xml version='1.0'?><!--before--><?p?><r a='&#13;'>A&#13;<e/><![CDATA[<x>&unknown;\r\n]]><!-- c --><?q data?></r> \n<!--after-->";
    const report = try doc.inspect(t.allocator, source, .{});
    try t.expectEqual(@as(usize, 2), report.elements);
    try t.expectEqual(@as(usize, 1), report.end_tags);
    try t.expectEqual(@as(usize, 1), report.attributes);
    try t.expectEqual(@as(usize, 2), report.references);
    try t.expectEqual(@as(usize, 15), report.text_scalars);
    try t.expectEqual(@as(usize, 3), report.comments);
    try t.expectEqual(@as(usize, 2), report.processing_instructions);
    try t.expectEqual(@as(usize, 1), report.cdata);
    try t.expectEqual(@as(usize, 2), report.max_depth);
    try t.expect(!report.namespaces_validated);
}
test "XML document rejects whole-document structure and unsupported entity semantics" {
    for ([_][]const u8{ "<?p??><r/>", "<?p?a?><r/>" }) |source| {
        if (doc.inspect(t.allocator, source, .{})) |_| return error.ExpectedRejection else |_| {}
    }
    for ([_][]const u8{ "", " ", "<!--only-->", "<r>", "</r>", "<r></R>", "<r><a></r></a>", "<r/><s/>", "x<r/>", "<r/>x", "&#32;<r/>", "<![CDATA[]]><r/>", "<r/><![CDATA[]]>", "<r>]]></r>", "<r>&unknown;</r>", "<r a='&unknown;'/>", "<!DOCTYPE r><r/>", "<r><?XML?></r>", " <\u{3f}xml version='1.0'?><r/>", "<r><!--a--b--></r>", "<r><!--a---></r>", "<r><![CDATA[unterminated</r>", "<r><?p unterminated</r>", "<r/>\x00" }) |source| {
        if (doc.inspect(t.allocator, source, .{})) |_| return error.ExpectedRejection else |_| {}
    }
    for ([_][]const u8{ "<r>]]&gt;</r>", "<r>&#93;]></r>", "<r>]&#93;></r>", "<!-- <!DOCTYPE r> --><r/>", "<r><![CDATA[<!DOCTYPE r>&unknown;]]></r>", "<r><?xml-stylesheet?></r>" }) |source| _ = try doc.inspect(t.allocator, source, .{});
}
test "XML document shares tag attribute reference and depth budgets across the document" {
    const source = "<r a='&amp;'><e b='&#9;'/>&#13;</r>";
    const baseline = try doc.inspect(t.allocator, source, .{});
    var options: doc.Options = .{ .max_elements = 2, .max_depth = 2, .max_attributes = 2, .max_references = 3, .max_events = baseline.events };
    options.prolog.input.max_bytes = source.len;
    options.prolog.input.max_characters = source.len;
    _ = try doc.inspect(t.allocator, source, options);
    for (0..7) |i| {
        var short = options;
        switch (i) {
            0 => short.max_elements -= 1,
            1 => short.max_depth -= 1,
            2 => short.max_attributes -= 1,
            3 => short.max_references -= 1,
            4 => short.max_events -= 1,
            5 => short.prolog.input.max_bytes -= 1,
            6 => short.prolog.input.max_characters -= 1,
            else => unreachable,
        }
        try t.expectError(error.LimitExceeded, doc.inspect(t.allocator, source, short));
    }
    _ = try doc.inspect(t.allocator, "<r/>", .{ .max_attributes = 0, .max_references = 0, .max_depth = 1, .max_elements = 1 });
}
fn allocationCase(a: std.mem.Allocator, late_failure: bool) !void {
    const prefix = "<r><a><b><c><d><e><f><g><h><i a='1' b='2'/></h></g></f></e></d></c></b></a>";
    const source = if (late_failure) prefix ++ "</wrong>" else prefix ++ "</r>";
    _ = doc.inspect(a, source, .{}) catch |err| {
        if (late_failure and err == error.XmlElementNameMismatch) return;
        return err;
    };
    try t.expect(!late_failure);
}
test "XML document frees stack and transient attributes on allocation and late errors" {
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{false});
    try t.checkAllAllocationFailures(t.allocator, allocationCase, .{true});
}
