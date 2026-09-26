const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const manifest = "<p:package xmlns:p='http://www.idpf.org/2007/opf/'><p:manifest>" ++
    "<p:item id='header' href='Contents/header.xml' media-type='application/xml'/>" ++
    "<p:item id='section' href='Contents/section0.xml' media-type='application/xml'/>" ++
    "</p:manifest><p:spine><p:itemref idref='header'/><p:itemref idref='section'/></p:spine></p:package>";
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const suffix = "</s:sec>";
const section = prefix ++ "<p:p id='7'><p:run><p:t>A&amp;B<p:tab width='12'/>C</p:t><p:t/></p:run></p:p>" ++ suffix;

fn read(a: std.mem.Allocator, xml: []const u8, options: package.SectionTextSnapshotOptions) !package.SectionTextSnapshot {
    const sources = [_]fixture.Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = manifest },
        .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'/>" },
        .{ .name = "Contents/section0.xml", .data = xml },
    };
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    return document.readSectionTextSnapshot(a, options);
}

test "HWPX section text snapshot owns ordered boundaries tags and normalized content" {
    var snapshot = try read(std.testing.allocator, section, .{});
    defer snapshot.deinit();
    try std.testing.expectEqual(@as(usize, 11), snapshot.events.len);
    try std.testing.expectEqual(@as(usize, 2), snapshot.report.text_elements);
    try std.testing.expectEqual(@as(usize, 4), snapshot.report.text_bytes);
    try std.testing.expectEqualStrings("<p:p id='7'>", snapshot.events[0].value.paragraph_start);
    try std.testing.expectEqualStrings("A&B", snapshot.events[3].value.content);
    try std.testing.expectEqual(package.SectionTextInlineKind.tab, snapshot.events[4].value.inline_empty.kind);
    try std.testing.expectEqualStrings("<p:tab width='12'/>", snapshot.events[4].value.inline_empty.raw_tag);
    try std.testing.expectEqualStrings("C", snapshot.events[5].value.content);
    try std.testing.expect(snapshot.events[6].value == .text_end);
    try std.testing.expect(snapshot.events[7].value == .text_start);
    try std.testing.expect(snapshot.events[8].value == .text_end);
    try std.testing.expectEqual(@as(usize, 0), snapshot.events[10].location.section_ordinal);
    try std.testing.expectEqual(@as(usize, 1), snapshot.events[0].location.paragraph_ordinal);
}

test "HWPX section text snapshot enforces exact event and owned-byte limits" {
    const a = std.testing.allocator;
    var exact = try read(a, section, .{ .storage = .{ .max_events = 11, .max_owned_bytes = 67 } });
    exact.deinit();
    try std.testing.expectError(error.LimitExceeded, read(a, section, .{ .storage = .{ .max_events = 10 } }));
    try std.testing.expectError(error.LimitExceeded, read(a, section, .{ .storage = .{ .max_owned_bytes = 66 } }));
    try std.testing.expectError(error.LimitExceeded, read(a, section, .{ .scan = .{ .text = .{ .max_text_bytes = 3 } } }));
    try std.testing.expectError(error.LimitExceeded, read(a, section, .{ .storage = .{ .max_events = 0 } }));
}

test "HWPX section text snapshot preserves unsupported nested inline boundaries" {
    const xml = prefix ++ "<p:p><p:run><p:t>A<x:future xmlns:x='urn:future'><x:inner>B</x:inner></x:future>C</p:t></p:run></p:p>" ++ suffix;
    var snapshot = try read(std.testing.allocator, xml, .{});
    defer snapshot.deinit();
    try std.testing.expectEqual(@as(usize, 2), snapshot.report.inlineCount(.unknown));
    try std.testing.expectEqual(@as(usize, 1), snapshot.report.nested_inline_elements);
    var starts: usize = 0;
    var ends: usize = 0;
    var total_content: usize = 0;
    for (snapshot.events) |event| switch (event.value) {
        .inline_start => |item| {
            try std.testing.expectEqual(package.SectionTextInlineKind.unknown, item.kind);
            try std.testing.expect(std.mem.startsWith(u8, item.raw_tag, "<x:"));
            starts += 1;
        },
        .inline_end => |item| {
            try std.testing.expectEqual(package.SectionTextInlineKind.unknown, item.kind);
            try std.testing.expect(std.mem.startsWith(u8, item.raw_tag, "</x:"));
            ends += 1;
        },
        .content => |bytes| total_content += bytes.len,
        else => {},
    };
    try std.testing.expectEqual(@as(usize, 2), starts);
    try std.testing.expectEqual(@as(usize, 2), ends);
    try std.testing.expectEqual(@as(usize, 3), total_content);
}

test "HWPX section text snapshot releases partial allocations" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var snapshot = try read(a, section, .{});
            defer snapshot.deinit();
            try std.testing.expectEqualStrings("A&B", snapshot.events[3].value.content);
        }
    }.run, .{});
}
