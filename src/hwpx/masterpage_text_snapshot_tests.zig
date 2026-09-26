const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const manifest = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
    "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
    "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
    "<o:item id='masterpage0' href='Contents/masterpage0.xml' media-type='application/xml'/>" ++
    "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
const prefix = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>";
const suffix = "</masterPage>";
const master = prefix ++
    "<x:subList><p:p><p:run><p:t>omit</p:t></p:run></p:p></x:subList>" ++
    "<p:subList><p:p><p:run><p:t>A&amp;B<p:tab/>C</p:t><p:t/></p:run></p:p>" ++
    "<p:tbl><p:p><p:run><p:t>nested</p:t></p:run></p:p></p:tbl></p:subList>" ++
    "<p:outside><p:p><p:run><p:t>skip</p:t></p:run></p:p></p:outside>" ++ suffix;

fn read(a: std.mem.Allocator, source: []const u8, options: package.MasterPageTextSnapshotOptions) !package.MasterPageTextSnapshot {
    const sources = [_]fixture.Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = manifest },
        .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'/>" },
        .{ .name = "Contents/section0.xml", .data = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'/>" },
        .{ .name = "Contents/masterpage0.xml", .data = source },
    };
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    return document.readMasterPageTextSnapshot(a, options);
}

test "HWPX master text snapshot owns selected boundaries and normalized content" {
    var result = try read(std.testing.allocator, master, .{});
    defer result.deinit();
    try std.testing.expectEqual(@as(usize, 1), result.parts);
    try std.testing.expectEqual(@as(usize, 1), result.sub_lists);
    try std.testing.expectEqual(master.len, result.xml_bytes);
    try std.testing.expectEqual(@as(usize, 2), result.snapshot.report.paragraphs);
    try std.testing.expectEqual(@as(usize, 3), result.snapshot.report.text_elements);
    try std.testing.expectEqual(@as(usize, 10), result.snapshot.report.text_bytes);
    try std.testing.expectEqual(@as(usize, 0), result.snapshot.report.sections);
    var normalized: std.ArrayList(u8) = .empty;
    defer normalized.deinit(std.testing.allocator);
    var tabs: usize = 0;
    var empties: usize = 0;
    for (result.snapshot.events) |event| {
        try std.testing.expectEqual(@as(@TypeOf(event.location.part_kind), .master_page), event.location.part_kind);
        try std.testing.expectEqual(@as(usize, 0), event.location.part_ordinal);
        switch (event.value) {
            .content => |bytes| try normalized.appendSlice(std.testing.allocator, bytes),
            .inline_empty => |item| {
                try std.testing.expectEqual(package.SectionTextInlineKind.tab, item.kind);
                try std.testing.expectEqualStrings("<p:tab/>", item.raw_tag);
                tabs += 1;
            },
            .text_start => |tag| {
                if (std.mem.eql(u8, tag, "<p:t/>")) empties += 1;
            },
            else => {},
        }
    }
    try std.testing.expectEqualStrings("A&BCnested", normalized.items);
    try std.testing.expectEqual(@as(usize, 1), tabs);
    try std.testing.expectEqual(@as(usize, 1), empties);
}

test "HWPX master text snapshot applies exact storage and scanner limits" {
    const a = std.testing.allocator;
    var exact = try read(a, master, .{});
    const event_count = exact.snapshot.events.len;
    const owned_bytes = exact.snapshot.owned_bytes;
    exact.deinit();
    var boundary = try read(a, master, .{ .storage = .{ .max_events = event_count, .max_owned_bytes = owned_bytes } });
    boundary.deinit();
    try std.testing.expectError(error.LimitExceeded, read(a, master, .{ .storage = .{ .max_events = event_count - 1 } }));
    try std.testing.expectError(error.LimitExceeded, read(a, master, .{ .storage = .{ .max_owned_bytes = owned_bytes - 1 } }));
    try std.testing.expectError(error.LimitExceeded, read(a, master, .{ .scan = .{ .text = .{ .scan = .{ .max_text_bytes = 9 } } } }));
    try std.testing.expectError(error.LimitExceeded, read(a, master, .{ .scan = .{ .text = .{ .max_part_xml_bytes = master.len - 1 } } }));
}

test "HWPX master text snapshot stores only selected switch branch" {
    const xml = prefix ++ "<p:subList><p:p><p:run><p:switch>" ++
        "<p:case p:required-namespace='urn:feature'><p:p><p:run><p:t>X</p:t></p:run></p:p></p:case>" ++
        "<p:default><p:p><p:run><p:t>Y</p:t></p:run></p:p></p:default>" ++
        "</p:switch></p:run></p:p></p:subList>" ++ suffix;
    const a = std.testing.allocator;
    var fallback = try read(a, xml, .{ .scan = .{ .text = .{ .scan = .{ .branch_policy = .{ .mode = .selected } } } } });
    defer fallback.deinit();
    try std.testing.expectEqual(@as(usize, 2), fallback.snapshot.report.paragraphs);
    var fallback_text: std.ArrayList(u8) = .empty;
    defer fallback_text.deinit(a);
    for (fallback.snapshot.events) |event| if (event.value == .content) {
        try fallback_text.appendSlice(a, event.value.content);
    };
    try std.testing.expectEqualStrings("Y", fallback_text.items);
    var supported = try read(a, xml, .{ .scan = .{ .text = .{ .scan = .{ .branch_policy = .{ .mode = .selected, .supported_namespaces = &.{"urn:feature"} } } } } });
    defer supported.deinit();
    var supported_text: std.ArrayList(u8) = .empty;
    defer supported_text.deinit(a);
    for (supported.snapshot.events) |event| if (event.value == .content) {
        try supported_text.appendSlice(a, event.value.content);
    };
    try std.testing.expectEqualStrings("X", supported_text.items);
}

test "HWPX master text snapshot releases every allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var result = try read(a, master, .{});
            defer result.deinit();
            try std.testing.expectEqual(@as(usize, 3), result.snapshot.report.text_elements);
        }
    }.run, .{});
}
