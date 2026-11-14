//! Synthetic Native source tests. Execution is reserved for Main's slot.
const std = @import("std");
const t = std.testing;
const eq = @import("equation_insert.zig");
const shared = @import("inline_object_insert.zig");
const tree_mod = @import("xml_part_tree.zig");
const editor = @import("editor_session.zig");
const zip = @import("../zip/replace_writer.zig");
const archive = @import("../zip/archive.zig");
const hp = @import("document_xml.zig").paragraph_uri;
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const suffix = "</s:sec>";
const body = "<p:p id='0'><p:run charPrIDRef='0'><p:t>앞😀&amp;뒤</p:t></p:run><p:linesegarray/></p:p>";
const untouched = "<p:p id='0'><p:run charPrIDRef='0'><p:t>유지</p:t></p:run><p:linesegarray/></p:p>";
const wire = "{\"section\":0,\"paragraph\":1,\"start\":0,\"expectedText\":\"\",\"script\":\"a < 한😀 & b\\r\",\"width\":2400,\"height\":1200,\"baseLine\":80,\"baseUnit\":1000,\"version\":\"Equation Version 60\",\"font\":\"HYhwpEQ\"}";

fn request(input: []const u8) eq.Request {
    var sha: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(input, &sha, .{});
    return .{
        .expected_source_sha256 = sha,
        .target = .{ .section = 0, .paragraph = 1, .unit = 0, .expected_text = "" },
        .script = "a < 한😀 & b\r",
        .width = 2400,
        .height = 1200,
        .base_line = 80,
        .base_unit = 1000,
        .version = "Equation Version 60",
        .font = "HYhwpEQ",
    };
}

fn rawPart(a: std.mem.Allocator, bytes: []const u8, path: []const u8) ![]u8 {
    var doc = try archive.open(a, bytes, .{});
    defer doc.deinit();
    return doc.decode(doc.find(path) orelse return error.MissingTestPart, 16 * 1024 * 1024);
}

fn replaceSection(a: std.mem.Allocator, bytes: []const u8, old: []const u8, new: []const u8) ![]u8 {
    var doc = try archive.open(a, bytes, .{});
    defer doc.deinit();
    for (doc.entries, 0..) |entry, index| {
        if (!std.mem.eql(u8, entry.name, "Contents/section0.xml")) continue;
        const raw = try doc.decode(entry, 16 * 1024 * 1024);
        defer a.free(raw);
        try t.expectEqual(@as(usize, 1), std.mem.count(u8, raw, old));
        const changed = try std.mem.replaceOwned(u8, a, raw, old, new);
        defer a.free(changed);
        return zip.write(a, bytes, &.{.{ .entry_index = index, .bytes = changed }}, .{});
    }
    return error.MissingTestPart;
}

test "HWPX new equation strict JSON types ownership and metadata" {
    const a = t.allocator;
    const input = try a.dupe(u8, wire);
    defer a.free(input);
    var parsed = try eq.parseRequest(a, input, @splat(7));
    defer parsed.deinit();
    @memset(input, 'x');
    try t.expectEqualStrings("a < 한😀 & b\r", parsed.request.script);
    try t.expectEqual(@as(u32, 80), parsed.request.base_line);
    for ([_][]const u8{ "{}", "[]", "null" }) |bad| {
        try t.expectError(error.InvalidEquationInsertRequest, eq.parseRequest(a, bad, @splat(0)));
    }
    for ([_][2][]const u8{
        .{ "\"width\":2400", "\"width\":\"2400\"" },
        .{ "\"height\":1200", "\"height\":1.5" },
        .{ "\"baseUnit\":1000", "\"baseUnit\":null" },
        .{ "\"script\":", "\"unknown\":" },
    }) |pair| {
        const bad = try std.mem.replaceOwned(u8, a, wire, pair[0], pair[1]);
        defer a.free(bad);
        try t.expectError(error.InvalidEquationInsertRequest, eq.parseRequest(a, bad, @splat(0)));
    }
    const duplicate = try std.mem.replaceOwned(u8, a, wire, "\"width\":2400", "\"width\":2400,\"width\":2400");
    defer a.free(duplicate);
    if (eq.parseRequest(a, duplicate, @splat(0))) |result| {
        var unexpected = result;
        unexpected.deinit();
        return error.ExpectedDuplicateKeyRejection;
    } else |_| {}
    var req = request("");
    req.width = 0;
    try t.expectError(error.InvalidEquationInsertionSize, eq.validate(a, req, .{}));
    req = request("");
    req.height = 0x80000000;
    try t.expectError(error.InvalidEquationInsertionSize, eq.validate(a, req, .{}));
    req = request("");
    req.base_unit = 0;
    try t.expectError(error.InvalidEquationInsertionSize, eq.validate(a, req, .{}));
    req = request("");
    req.script = &.{0};
    try t.expectError(error.InvalidXmlCharacter, eq.validate(a, req, .{}));
    req.script = &.{0x80};
    try t.expectError(error.InvalidXmlEncoding, eq.validate(a, req, .{}));
    req = request("");
    try t.expectError(error.LimitExceeded, eq.validate(a, req, .{ .max_script_bytes = 1 }));
}

test "HWPX new equation shared splice UTF16 XML escape owner cache and unique IDs" {
    const a = t.allocator;
    var tree = try tree_mod.parse(a, prefix ++ body ++ untouched ++ suffix, .section, 0, 0, .{});
    defer tree.deinit(a);
    const target: shared.Target = .{ .section = 0, .paragraph = 1, .unit = 3, .expected_text = "앞😀&뒤" };
    const original = try a.dupe(u8, tree.source);
    defer a.free(original);
    const object = try eq.createXml(a, request(""), 1, .{});
    defer a.free(object);
    const result = try shared.write(a, &tree, 1, target, object, 64 * 1024);
    defer a.free(result);
    try t.expect(std.mem.indexOf(u8, result, "<p:t>앞😀</p:t><hp:equation") != null);
    try t.expect(std.mem.indexOf(u8, result, "</hp:equation><p:t>&amp;뒤</p:t>") != null);
    try t.expect(std.mem.indexOf(u8, result, untouched) != null);
    try t.expectEqual(@as(usize, 1), std.mem.count(u8, result, "<p:linesegarray/>"));
    try t.expectEqualStrings(original, tree.source);
    var inside_surrogate = target;
    inside_surrogate.unit = 2;
    try t.expectError(error.InvalidPictureInsertionPosition, shared.write(a, &tree, 1, inside_surrogate, object, 64 * 1024));
    var stale = target;
    stale.expected_text = "偽";
    stale.unit = 0;
    try t.expectError(error.InlineObjectTextMismatch, shared.write(a, &tree, 1, stale, object, 64 * 1024));
    const nested = prefix ++ "<p:p><p:run><p:tbl><p:p><p:run><p:t/></p:run></p:p></p:tbl></p:run></p:p>" ++ suffix;
    var owned = try tree_mod.parse(a, nested, .section, 0, 0, .{});
    defer owned.deinit(a);
    try t.expectError(error.UnsupportedInlineObjectOwner, shared.write(a, &owned, 4, .{ .section = 0, .paragraph = 2, .unit = 0, .expected_text = "" }, object, 64 * 1024));
    var ids_tree = try tree_mod.parse(a, prefix ++ "<p:p id='1'/><p:p id='1'/><p:pic id='+02' instid='3'/><p:equation id='4294967296'/>" ++ suffix, .section, 0, 0, .{});
    defer ids_tree.deinit(a);
    const ids = try shared.nextIds(a, &.{ids_tree}, 4);
    defer a.free(ids);
    try t.expectEqualSlices(u32, &.{ 4, 5, 6, 7 }, ids);
}

test "HWPX new equation authored empty package save reopen and untouched ZIP" {
    const a = t.allocator;
    const original = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(original);
    var result = try eq.prepare(a, original, request(original), .{});
    defer result.deinit(a);
    try t.expect(result.object_id > 0);
    try t.expect(result.layout_requires_reflow and result.preview_stale);
    var reopened = try editor.open(a, result.bytes, .{});
    defer reopened.deinit();
    const saved = try reopened.save();
    defer a.free(saved);
    try t.expectEqualSlices(u8, result.bytes, saved);
    const value = try @import("equation_script_write.zig").readValue(a, &reopened.sections[0].tree, result.equation_node, .{});
    defer a.free(value);
    try t.expectEqualStrings(request(original).script, value);
    var child = reopened.sections[0].tree.elements[result.equation_node].first_child;
    var saw_size = false;
    while (child) |node| : (child = reopened.sections[0].tree.elements[node].next_sibling) {
        if (!reopened.sections[0].tree.elements[node].is(hp, "sz")) continue;
        try @import("document_insert_xml.zig").requireValue(a, &reopened.sections[0].tree, node, "width", "2400");
        try @import("document_insert_xml.zig").requireValue(a, &reopened.sections[0].tree, node, "height", "1200");
        saw_size = true;
    }
    try t.expect(saw_size);
    var before = try archive.open(a, original, .{});
    defer before.deinit();
    var after = try archive.open(a, result.bytes, .{});
    defer after.deinit();
    try t.expectEqual(before.entries.len, after.entries.len);
    for (before.entries, after.entries) |left, right| {
        try t.expectEqualStrings(left.name, right.name);
        if (std.mem.eql(u8, left.name, "Contents/section0.xml")) continue;
        try t.expectEqual(left.crc32, right.crc32);
        try t.expectEqualSlices(u8, left.compressed, right.compressed);
    }
    var bad = request(original);
    bad.expected_source_sha256[0] ^= 1;
    try t.expectError(error.SourceHashMismatch, eq.prepare(a, original, bad, .{}));
    const before_saved = try reopened.save();
    defer a.free(before_saved);
    try t.expectEqualSlices(u8, result.bytes, before_saved);
}

test "HWPX new equation prepared output keeps body Unicode and invalidates only host lines" {
    const a = t.allocator;
    const empty = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(empty);
    const text = try replaceSection(a, empty, "<hp:t/>", "<hp:t>앞😀&amp;뒤</hp:t>");
    defer a.free(text);
    var req = request(text);
    req.target.expected_text = "앞😀&뒤";
    req.target.unit = 3;
    var result = try eq.prepare(a, text, req, .{});
    defer result.deinit(a);
    const raw = try rawPart(a, result.bytes, "Contents/section0.xml");
    defer a.free(raw);
    try t.expect(std.mem.indexOf(u8, raw, "<hp:t>앞😀</hp:t><hp:equation") != null);
    try t.expect(std.mem.indexOf(u8, raw, "</hp:equation><hp:t>&amp;뒤</hp:t>") != null);
    try t.expect(std.mem.indexOf(u8, raw, "width=\"2400\"") != null);
    try t.expect(std.mem.indexOf(u8, raw, "height=\"1200\"") != null);
    try t.expectError(error.LimitExceeded, eq.prepare(a, text, req, .{ .max_output_bytes = text.len }));
}

test "HWPX new equation cache unknown content field control and UTF16 refusal" {
    const a = t.allocator;
    const target: shared.Target = .{ .section = 0, .paragraph = 1, .unit = 0, .expected_text = "x" };
    for ([_][]const u8{
        "<p:p><p:run><p:t>x</p:t></p:run><p:linesegarray><p:opaque/></p:linesegarray></p:p>",
        "<p:p><p:run><p:t>x</p:t></p:run><p:linesegarray><p:p><p:run><p:t>must survive</p:t></p:run></p:p></p:linesegarray></p:p>",
        "<p:p><p:run><p:t>x</p:t></p:run><p:linesegarray unknown='preserve'/></p:p>",
    }) |host| {
        const xml = try std.fmt.allocPrint(a, "{s}{s}{s}{s}", .{ prefix, host, untouched, suffix });
        defer a.free(xml);
        var tree = try tree_mod.parse(a, xml, .section, 0, 0, .{});
        defer tree.deinit(a);
        try t.expectError(error.UnsupportedSourceLineCache, shared.write(a, &tree, 1, target, "<p:equation/>", 64 * 1024));
        try t.expectEqualStrings(xml, tree.source);
    }
    var control = try tree_mod.parse(a, prefix ++ "<p:p><p:run><p:t>x</p:t><p:ctrl><p:bookmark name='keep'/></p:ctrl></p:run></p:p>" ++ suffix, .section, 0, 0, .{});
    defer control.deinit(a);
    try t.expectError(error.UnsupportedInlineObjectOwner, shared.write(a, &control, 1, target, "<p:equation/>", 64 * 1024));
    var field = try tree_mod.parse(a, prefix ++ "<p:p><p:run><p:ctrl><p:fieldBegin id='1' type='HYPERLINK'/></p:ctrl><p:t>x</p:t></p:run></p:p>" ++ suffix, .section, 0, 0, .{});
    defer field.deinit(a);
    try t.expectError(error.ProtectedFieldRange, shared.write(a, &field, 1, target, "<p:equation/>", 64 * 1024));
    const utf16 = try std.unicode.utf8ToUtf16LeAlloc(a, prefix ++ body ++ suffix);
    defer a.free(utf16);
    const encoded = try a.alloc(u8, 2 + utf16.len * 2);
    defer a.free(encoded);
    encoded[0] = 0xff;
    encoded[1] = 0xfe;
    @memcpy(encoded[2..], std.mem.sliceAsBytes(utf16));
    var wide = try tree_mod.parse(a, encoded, .section, 0, 0, .{});
    defer wide.deinit(a);
    try t.expectError(error.UnsupportedEditEncoding, shared.write(a, &wide, 1, target, "<p:equation/>", 64 * 1024));
    var commented = try tree_mod.parse(a, prefix ++ "<p:p><p:run><p:t><!--keep-->x</p:t></p:run></p:p>" ++ suffix, .section, 0, 0, .{});
    defer commented.deinit(a);
    try t.expectError(error.UnsupportedInlineObjectTextSegments, shared.write(a, &commented, 1, target, "<p:equation/>", 64 * 1024));
}

test "HWPX new equation shared splice every allocation failure is immutable" {
    const a = t.allocator;
    var tree = try tree_mod.parse(a, prefix ++ body ++ suffix, .section, 0, 0, .{});
    defer tree.deinit(a);
    try t.checkAllAllocationFailures(a, struct {
        fn run(alloc: std.mem.Allocator, source: *const tree_mod.Tree) !void {
            const bytes = try shared.write(alloc, source, 1, .{ .section = 0, .paragraph = 1, .unit = 3, .expected_text = "앞😀&뒤" }, "<p:equation/>", 64 * 1024);
            defer alloc.free(bytes);
            try t.expectEqualStrings(prefix ++ body ++ suffix, source.source);
        }
    }.run, .{&tree});
}

test "HWPX new equation JSON every allocation failure" {
    try t.checkAllAllocationFailures(t.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var parsed = try eq.parseRequest(a, wire, @splat(0));
            defer parsed.deinit();
        }
    }.run, .{});
}

test "HWPX new equation physical orphan XML identity inventory and signed refusal" {
    var arena = std.heap.ArenaAllocator.init(t.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    const original = try @import("../new_document/hwpx.zig").create(a);
    var doc = try archive.open(a, original, .{});
    defer doc.deinit();
    var sources: std.ArrayList(@import("../zip/store_writer.zig").Source) = .empty;
    for (doc.entries) |entry| {
        const bytes = try doc.decode(entry, 16 * 1024 * 1024);
        try sources.append(a, .{ .name = entry.name, .bytes = bytes });
    }
    try sources.append(a, .{
        .name = "Contents/unlisted.xml",
        .bytes = prefix ++ "<p:p id='0'/><p:p id='0'/><p:pic id='+0002' instid='3'/><p:equation id='4294967296'/>" ++ suffix,
    });
    const with_orphan = try @import("../zip/store_writer.zig").write(a, sources.items, .{});
    var inserted = try eq.prepare(a, with_orphan, request(with_orphan), .{});
    defer inserted.deinit(a);
    try t.expect(inserted.object_id != 2 and inserted.object_id != 3);
    const orphan_before = try rawPart(a, with_orphan, "Contents/unlisted.xml");
    const orphan_after = try rawPart(a, inserted.bytes, "Contents/unlisted.xml");
    try t.expectEqualSlices(u8, orphan_before, orphan_after);
    sources.items[sources.items.len - 1].bytes = "<sig:Signature xmlns:sig='http://www.w3.org/2000/09/xmldsig#'/>";
    const signed = try @import("../zip/store_writer.zig").write(a, sources.items, .{});
    try t.expectError(error.SignedDocument, eq.prepare(a, signed, request(signed), .{}));
}

test "HWPX new equation package every allocation failure leaves input intact" {
    const a = t.allocator;
    const original = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(original);
    const hash = request(original).expected_source_sha256;
    try t.checkAllAllocationFailures(a, struct {
        fn run(alloc: std.mem.Allocator, input: []const u8, sha: [32]u8) !void {
            var result = try eq.prepare(alloc, input, request(input), .{});
            defer result.deinit(alloc);
            try shared.verifySource(input, sha);
        }
    }.run, .{ original, hash });
}
