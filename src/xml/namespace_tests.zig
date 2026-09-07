const std = @import("std");
const t = std.testing;
const xml = @import("root.zig");
const options: xml.document.Options = .{ .validate_namespaces = true };
test "XML namespace QName and NCName share XML character rules" {
    for ([_][]const u8{ "a", "한글", "😀", "p:a", "한:😀", "xml:a", "XMLfoo:a" }) |raw| {
        const name = try xml.qname.parse(.{ .raw = raw, .encoding = .utf8 });
        try t.expect(name.local.raw.len > 0);
    }
    for ([_][]const u8{ "", ":a", "a:", "a:b:c", "p:1a", "1a", "a b", "a\x00" }) |raw| try t.expectError(error.InvalidXmlQName, xml.qname.parse(.{ .raw = raw, .encoding = .utf8 }));
    try t.expectError(error.InvalidXmlNCName, xml.qname.ncname(.{ .raw = "p:a", .encoding = .utf8 }));
}
test "XML namespace declarations apply before uses and respect reserved bindings" {
    for ([_][]const u8{
        "<r/>",                                                 "<p:r p:a='1' xmlns:p='urn:a'/>",                         "<r xml:lang='ko'/>",
        "<xml:r/>",                                             "<xmlns/>",                                               "<r xmlns:xml='http://www.w3.org/XML/1998/namespace'/>",
        "<r xmlns:XMLfoo='urn:a' XMLfoo:a='1'/>",               "<r xmlns:XML='urn:a' XML:a='1'/>",                       "<r xmlns='urn:a' xmlns:p='urn:a' a='1' p:a='2'/>",
        "<r xmlns:p='urn:A' xmlns:q='urn:a' p:a='1' q:a='2'/>", "<r xmlns:p='urn:%61' xmlns:q='urn:a' p:a='1' q:a='2'/>", "<r xmlns:p='urn:a'><a xmlns:p='urn:b'><p:b/></a><p:c/></r>",
        "<r xmlns='urn:a'><a xmlns=''/><b/></r>",
    }) |source| try t.expect((try xml.document.inspect(t.allocator, source, options)).namespaces_validated);
    for ([_][]const u8{
        "<p:r/>",                                                   "<r p:a='1'/>",                               "<xmlns:r/>",                                                                                      "<r xmlns:xmlns='urn:a'/>",
        "<r xmlns:xml='urn:a'/>",                                   "<r xmlns:xml=''/>",                          "<r xmlns:p=''/>",                                                                                 "<r xmlns='http://www.w3.org/XML/1998/namespace'/>",
        "<r xmlns:p='http://www.w3.org/XML/1998/namespace'/>",      "<r xmlns='http://www.w3.org/2000/xmlns/'/>", "<r xmlns:p='http://www.w3.org/2000/xmlns/'/>",                                                    "<r xmlns:p='urn:a' xmlns:q='urn:a' p:x='1' q:x='2'/>",
        "<r xmlns:p='urn:&#97;' xmlns:q='urn:a' p:x='1' q:x='2'/>", "<r><a xmlns:p='urn:a'/><p:b/></r>",          "<r xmlns:p='urn:a' xmlns:q='urn:a'><a xmlns:p='urn:b' p:x='1' q:x='2'/><b p:x='1' q:x='2'/></r>", "<p:r xmlns:p='urn:a' xmlns:q='urn:a'></q:r>",
        "<:r/>",                                                    "<r:/>",                                      "<p:r:s/>",                                                                                        "<r :a='1'/>",
        "<r xmlns:p:q='urn:a'/>",                                   "<?p:q?><r/>",                                "<r><?p:q data?></r>",
    }) |source| {
        if (xml.document.inspect(t.allocator, source, options)) |_| return error.ExpectedRejection else |_| {}
    }
    try t.expect(!(try xml.document.inspect(t.allocator, "<p:r/>", .{})).namespaces_validated);
}
test "XML namespace budgets count live shadowed bindings and normalized UTF8 bytes" {
    const source = "<r xmlns:p='urn:a'><a xmlns:p='urn:b'/><p:b/></r>";
    var limited = options;
    limited.namespaces = .{ .max_bindings = 2, .max_uri_bytes = 10 };
    _ = try xml.document.inspect(t.allocator, source, limited);
    limited.namespaces.max_bindings = 1;
    try t.expectError(error.LimitExceeded, xml.document.inspect(t.allocator, source, limited));
    limited.namespaces = .{ .max_bindings = 2, .max_uri_bytes = 9 };
    try t.expectError(error.LimitExceeded, xml.document.inspect(t.allocator, source, limited));
    limited.namespaces = .{ .max_bindings = 1, .max_uri_bytes = 3 };
    _ = try xml.document.inspect(t.allocator, "<r xmlns:p='&#xAC00;'/>", limited);
    limited.namespaces.max_uri_bytes = 2;
    try t.expectError(error.LimitExceeded, xml.document.inspect(t.allocator, "<r xmlns:p='&#xAC00;'/>", limited));
    limited.namespaces = .{ .max_bindings = 1, .max_uri_bytes = 5 };
    _ = try xml.document.inspect(t.allocator, "<r><a xmlns:p='urn:a'/><b xmlns:q='urn:b'/></r>", limited);
    limited.namespaces = .{ .max_bindings = 0, .max_uri_bytes = 0 };
    _ = try xml.document.inspect(t.allocator, "<r xml:lang='ko'/>", limited);
    try t.expectError(error.LimitExceeded, xml.document.inspect(t.allocator, "<r xmlns=''/>", limited));
}
fn allocations(a: std.mem.Allocator, fail: bool) !void {
    const start = "<r xmlns:p='urn:a' xmlns:q='urn:a'><a xmlns:p='urn:b' p:x='1' q:x='2'/><b p:x='1'";
    const source = if (fail) start ++ " q:x='2'/></r>" else start ++ "/></r>";
    _ = xml.document.inspect(a, source, options) catch |err| {
        if (fail and err == error.DuplicateXmlExpandedAttribute) return;
        return err;
    };
    try t.expect(!fail);
}
test "XML namespace allocation failures and late duplicate errors free all bindings" {
    try t.checkAllAllocationFailures(t.allocator, allocations, .{false});
    try t.checkAllAllocationFailures(t.allocator, allocations, .{true});
}
fn readTag(source: []const u8) !xml.tags.Tag {
    var input = try xml.input.Input.init(source, .utf8, .{});
    return xml.tags.parse(t.allocator, &input, .{});
}
fn bound(scope: *const @import("namespaces.zig").State, prefix: []const u8) []const u8 {
    return scope.bindings.items[scope.current.get(prefix).?].uri;
}
test "XML namespace scope restores defaults shadows and state after failed enter" {
    var scope: @import("namespaces.zig").State = .{};
    defer scope.deinit(t.allocator);
    var root = try readTag("<r xmlns='urn:default' xmlns:p='urn:a'>");
    defer root.deinit(t.allocator);
    const root_marker = try scope.enter(t.allocator, root, .{});
    var child = try readTag("<r xmlns='' xmlns:p='urn:b'>");
    defer child.deinit(t.allocator);
    const child_marker = try scope.enter(t.allocator, child, .{});
    try t.expectEqualStrings("", bound(&scope, ""));
    try t.expectEqualStrings("urn:b", bound(&scope, "p"));
    scope.leave(t.allocator, child_marker);
    try t.expectEqualStrings("urn:default", bound(&scope, ""));
    try t.expectEqualStrings("urn:a", bound(&scope, "p"));
    const previous_bytes = scope.uri_bytes;
    var bad = try readTag("<q:r xmlns='' xmlns:p='urn:changed'/>");
    defer bad.deinit(t.allocator);
    try t.expectError(error.UnboundXmlPrefix, scope.enter(t.allocator, bad, .{}));
    try t.expectEqual(previous_bytes, scope.uri_bytes);
    try t.expectEqual(@as(usize, 2), scope.bindings.items.len);
    try t.expectEqualStrings("urn:default", bound(&scope, ""));
    try t.expectEqualStrings("urn:a", bound(&scope, "p"));
    const recovered = try scope.enter(t.allocator, child, .{});
    scope.leave(t.allocator, recovered);
    scope.leave(t.allocator, root_marker);
    try t.expectEqual(@as(usize, 0), scope.bindings.items.len);
    try t.expectEqual(@as(usize, 0), scope.uri_bytes);
    try t.expectEqual(@as(u32, 0), scope.current.count());
}
