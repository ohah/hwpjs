const std = @import("std");
const t = std.testing;
const policy = @import("source_color_profile.zig");
const provenance = @import("document_provenance.zig");
const Session = @import("editor_session.zig");
const legacy_version = "<v:HCFVersion xmlns:v='http://www.hancom.co.kr/hwpml/2011/version' major='5' minor='1' micro='0' buildNumber='1' os='1' xmlVersion='1.2' tagetApplication='WORDPROCESSOR' application='Hancom Office Hangul' appVersion='10, 0, 0, 5060 WIN32LEWindows_8'/>";
const modern_version = "<v:HCFVersion xmlns:v='http://www.hancom.co.kr/hwpml/2011/version' major='5' minor='1' micro='1' buildNumber='0' os='1' xmlVersion='1.5' tagetApplication='WORDPROCESSOR' application='Hancom Office Hangul' appVersion='12, 0, 0, 4426 WIN32LEWindows_10'/>";
const section = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run charPrIDRef='0'><p:t>ABC</p:t></p:run></p:p></s:sec>";
const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core' secCnt='1'><h:refList><h:charProperties itemCnt='1'><h:charPr id='0' height='1000' textColor='#A5E7E7'/></h:charProperties><h:borderFills itemCnt='1'><h:borderFill id='1'><c:fillBrush><c:winBrush faceColor='#A5E7E7' alpha='0'/></c:fillBrush></h:borderFill></h:borderFills></h:refList></h:head>";
fn fixture(a: std.mem.Allocator, version: ?[]const u8) ![]u8 {
    const f = @import("test_package_fixture.zig");
    const entries = [_]f.Source{
        .{ .name = "mimetype", .data = @import("package.zig").mime },
        .{ .name = "META-INF/container.xml", .data = f.package_container },
        .{ .name = "Contents/content.hpf", .data = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest><o:item id='h' href='Contents/header.xml' media-type='application/xml'/><o:item id='s' href='Contents/section0.xml' media-type='application/xml'/></o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>" },
        .{ .name = "Contents/header.xml", .data = header },
        .{ .name = "Contents/section0.xml", .data = section },
        .{ .name = "version.xml", .data = version orelse "" },
    };
    return f.storedZip(a, entries[0..if (version != null) entries.len else entries.len - 1]);
}
fn profileFrom(a: std.mem.Allocator, xml: []const u8) !policy.Profile {
    const input = try fixture(a, xml);
    defer a.free(input);
    var version = try @import("source_version_metadata.zig").read(a, input, .{});
    defer version.deinit(a);
    return policy.classify(if (version.sourceVersion) |*v| v else null);
}
test "producer color exact tuples do not guess versions absent fields or numeric zero" {
    const a = t.allocator;
    const old = try profileFrom(a, legacy_version);
    const modern = try profileFrom(a, modern_version);
    try t.expectEqual(policy.Encoding.colorref24, old.encoding);
    try t.expectEqual(policy.Encoding.rgb24, modern.encoding);
    try t.expect(old.verified and modern.verified);
    const changes = [_][2][]const u8{
        .{ "major='5'", "major='4'" },                                                                       .{ "minor='1'", "minor='0'" },
        .{ "micro='0'", "" },                                                                                .{ "buildNumber='1'", "buildNumber='0'" },
        .{ "os='1'", "os='0'" },                                                                             .{ "xmlVersion='1.2'", "xmlVersion='1.5'" },
        .{ "tagetApplication='WORDPROCESSOR'", "tagetApplication='OTHER'" },                                 .{ "application='Hancom Office Hangul'", "application='Other'" },
        .{ "appVersion='10, 0, 0, 5060 WIN32LEWindows_8'", "appVersion='10, 0, 0, 5061 WIN32LEWindows_8'" }, .{ "major='5'", "major='5' patch='0'" },
        .{ "major='5'", "major='5' revision='0'" },
    };
    for (changes) |change| {
        const xml = try std.mem.replaceOwned(u8, a, legacy_version, change[0], change[1]);
        defer a.free(xml);
        const result = try profileFrom(a, xml);
        try t.expect(!result.verified);
        try t.expectEqual(policy.Encoding.rgb24, result.encoding);
    }
    try t.expect(!policy.classify(null).verified);
}
test "producer color field scoped codec preserves unsupported raw and canonical roundtrip" {
    const a = t.allocator;
    const old = try profileFrom(a, legacy_version);
    const modern = try profileFrom(a, modern_version);
    try t.expectEqual(@as(?u32, 0xe7e7a5), policy.decode(old, .win_brush_face_color, "#A5E7E7"));
    try t.expectEqual(@as(?u32, 0xa5e7e7), policy.decode(old, .other, "#A5E7E7"));
    try t.expectEqual(@as(?u32, 0xa5e7e7), policy.decode(modern, .character_text_color, "#A5E7E7"));
    for ([_][]const u8{ "none", "#00A5E7E7", "#FFFFFFFF", "#12345", "#gggggg" }) |raw| try t.expectEqual(@as(?u32, null), policy.decode(old, .win_brush_face_color, raw));
    for ([_]policy.Profile{ old, modern, .{} }) |p| for ([_]policy.Field{ .win_brush_face_color, .character_text_color, .other }) |field| for (0..1024) |i| {
        const rgb: u32 = @intCast((i * 16411 + 0x123456) & 0xffffff);
        const raw = try policy.encode(a, p, field, rgb);
        defer a.free(raw);
        try t.expectEqual(@as(?u32, rgb), policy.decode(p, field, raw));
    };
    try t.expectError(error.InvalidCharacterColor, policy.encode(a, old, .character_text_color, 0x1000000));
}
test "producer color independent provenance keeps raw null diagnostics limits and source" {
    const a = t.allocator;
    const variants = [_]?[]const u8{ legacy_version, modern_version, null, "<v:HCFVersion xmlns:v='http://www.hancom.co.kr/hwpml/2011/version' major='bad' minor='1'/>" };
    for (variants, 0..) |xml, i| {
        const input = try fixture(a, xml);
        defer a.free(input);
        var session = try Session.open(a, input, .{});
        defer session.deinit();
        const bytes = try provenance.encode(a, &session);
        defer a.free(bytes);
        var parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
        defer parsed.deinit();
        const root = parsed.value.object;
        if (i < 2) {
            const v = root.get("sourceVersion").?.object;
            try t.expectEqual(@as(usize, 12), v.count());
            try t.expect(v.get("patch").? == .null and v.get("revision").? == .null);
            try t.expect(root.get("sourceVersionError").? == .null);
        } else {
            try t.expect(root.get("sourceVersion").? == .null);
            try t.expect(root.get("sourceVersionError").? == .string);
        }
        const before = try session.save();
        defer a.free(before);
        try t.expectEqualSlices(u8, input, before);
        session.options.max_output_bytes = bytes.len - 1;
        try t.expectError(error.LimitExceeded, provenance.encode(a, &session));
    }
}
test "producer color Native canonical read noop clone write save reopen share encoder" {
    const a = t.allocator;
    const input = try fixture(a, legacy_version);
    defer a.free(input);
    var session = try Session.open(a, input, .{});
    defer session.deinit();
    const first = try @import("character_style_resources.zig").displayShapes(&session);
    defer a.free(first);
    try t.expectEqual(@as(?u32, 0xe7e7a5), first[0].text_color);
    try t.expect(!try session.setCharacterProperties(0, 1, 0, 1, .{ .text_color = 0xe7e7a5 }));
    try t.expect(try session.setCharacterProperties(0, 1, 0, 1, .{ .text_color = 0x123456 }));
    const projected = try @import("character_style_resources.zig").displayShapesProjected(&session);
    defer a.free(projected);
    const serialized = try @import("character_style_resources.zig").displayShapesSerialized(&session);
    defer a.free(serialized);
    try t.expectEqualDeep(projected, serialized);
    const saved = try session.save();
    defer a.free(saved);
    var doc = try @import("package.zig").inspectDocument(a, saved, .{});
    defer doc.deinit(a);
    var tree = try doc.readHeaderTree(a, .{});
    defer tree.deinit(a);
    try t.expect(std.mem.indexOf(u8, tree.source, "#563412") != null);
    try t.expect(std.mem.indexOf(u8, tree.source, "#A5E7E7") != null);
    var reopened = try Session.open(a, saved, .{});
    defer reopened.deinit();
    const after = try @import("character_style_resources.zig").displayShapes(&reopened);
    defer a.free(after);
    try t.expectEqual(@as(?u32, 0x123456), after[after.len - 1].text_color);
}
test "producer color table source raw and semantic face remain independent of alpha" {
    const a = t.allocator;
    const input = try fixture(a, legacy_version);
    defer a.free(input);
    var doc = try @import("package.zig").inspectDocument(a, input, .{});
    defer doc.deinit(a);
    var tree = try doc.readHeaderTree(a, .{});
    defer tree.deinit(a);
    var source = try @import("border_fill_source.zig").read(a, &tree, 1);
    defer source.deinit();
    const p = try profileFrom(a, legacy_version);
    try @import("source_color_projection.zig").enrich(&source, p);
    try t.expectEqualStrings("#A5E7E7", source.fill_report.?.nodes[0].get(.face_color).?);
    try t.expectEqualStrings("0", source.fill_report.?.nodes[0].get(.win_alpha).?);
    try t.expectEqual(@as(?u32, 0xe7e7a5), source.semantic_face_colors.?[0].rgb);
}

test "producer color single batch invalid ranges retain source error precedence" {
    const a = t.allocator;
    const input = try fixture(a, legacy_version);
    defer a.free(input);
    var session = try Session.open(a, input, .{});
    defer session.deinit();
    const original = session.source;
    session.source = &.{};
    defer session.source = original;
    try t.expectError(error.InvalidSectionIndex, @import("table_border_sources.zig").read(a, &session, 999));
    var invalid = try @import("table_border_sources_batch.zig").read(a, &session, &.{999});
    defer invalid.deinit(a);
    try t.expectEqual(error.InvalidSectionIndex, invalid.entries[0].result.unavailable);
    session.source = original;
    var one = try @import("table_border_sources.zig").read(a, &session, 0);
    defer one.deinit(a);
    var many = try @import("table_border_sources_batch.zig").read(a, &session, &.{ 0, 999, 0 });
    defer many.deinit(a);
    try t.expectEqual(one.cells.len, many.entries[0].result.value.cells.len);
    try t.expectEqual(error.InvalidSectionIndex, many.entries[1].result.unavailable);
    try t.expectEqual(one.styles.len, many.entries[2].result.value.styles.len);
}
fn failureRound(a: std.mem.Allocator, input: []const u8) !void {
    var session = try Session.open(a, input, .{});
    defer session.deinit();
    const bytes = try provenance.encode(a, &session);
    defer a.free(bytes);
    try t.expect(std.mem.indexOf(u8, bytes, "hangul-10.0.0.5060-xml1.2") != null);
    var source = try @import("package.zig").inspectDocument(a, input, .{});
    defer source.deinit(a);
    var tree = try source.readHeaderTree(a, .{});
    defer tree.deinit(a);
    var raw = try @import("border_fill_source.zig").read(a, &tree, 1);
    defer raw.deinit();
    try @import("source_color_projection.zig").enrich(&raw, try provenance.profile(&session));
    try t.expect(try session.setCharacterProperties(0, 1, 0, 1, .{ .text_color = 0x123456 }));
    const saved = try session.save();
    defer a.free(saved);
}
test "producer color full owned DTO and encoder failure cleanup preserves input" {
    const a = t.allocator;
    const input = try fixture(a, legacy_version);
    defer a.free(input);
    const before = try a.dupe(u8, input);
    defer a.free(before);
    var counter = t.FailingAllocator.init(a, .{});
    var nr: @import("../testing/no_resize_allocator.zig").NoResize = .{ .backing = counter.allocator() };
    try failureRound(nr.allocator(), input);
    if (counter.alloc_index > 6000) return error.TestAllocationSweepBudgetExceeded;
    try @import("../testing/allocation_failures.zig").check(failureRound, .{input});
    try t.expectEqualSlices(u8, before, input);
}
test "producer color canonical history undo redo and document ABA keep profile local" {
    const a = t.allocator;
    const input = try fixture(a, legacy_version);
    defer a.free(input);
    var session = try Session.open(a, input, .{});
    defer session.deinit();
    var history = try @import("editor_history.zig").History.init(&session, 8, 1_000_000);
    defer history.deinit();
    try t.expect(try history.apply(&session, .{ .kind = .character_properties, .section = 0, .paragraph = 1, .start = 0, .deleted = 1, .inserted = "", .character_properties = .{ .text_color = 0x123456 } }));
    const saved = try session.save();
    defer a.free(saved);
    try t.expect(try history.undo(&session));
    const undone = try session.save();
    defer a.free(undone);
    try t.expectEqualSlices(u8, input, undone);
    try t.expect(try history.redo(&session));
    const redone = try session.save();
    defer a.free(redone);
    try t.expectEqualSlices(u8, saved, redone);
    const modern = try fixture(a, modern_version);
    defer a.free(modern);
    var other = try Session.open(a, modern, .{});
    defer other.deinit();
    try t.expectEqual(policy.Encoding.rgb24, (try provenance.profile(&other)).encoding);
    try t.expectEqual(policy.Encoding.colorref24, (try provenance.profile(&session)).encoding);
}
test "producer color actual noori and modern form version tuples use parser SSOT" {
    const a = t.allocator;
    const cases = [_]struct { path: []const u8, encoding: policy.Encoding }{
        .{ .path = "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwpx", .encoding = .colorref24 },
        .{ .path = "reference/rhwp/rhwp-studio/public/samples/form-002.hwpx", .encoding = .rgb24 },
    };
    for (cases) |c| {
        const input = try std.Io.Dir.cwd().readFileAlloc(t.io, c.path, a, .limited(32_000_000));
        defer a.free(input);
        var raw = try @import("source_version_metadata.zig").read(a, input, .{});
        defer raw.deinit(a);
        const selected = policy.classify(if (raw.sourceVersion) |*v| v else null);
        try t.expect(selected.verified);
        try t.expectEqual(c.encoding, selected.encoding);
    }
}
