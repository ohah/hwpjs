const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
    "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
    "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
    "<o:item id='masterpage0' href='Contents/masterpage0.xml' media-type='application/xml'/>" ++
    "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
const master = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>" ++
    "<x:subList><p:p><p:run><p:t>omit</p:t></p:run></p:p></x:subList>" ++
    "<p:subList><p:p><p:run><p:t>A&amp;<![CDATA[B]]><p:tab/>C</p:t><p:t/></p:run></p:p>" ++
    "<p:tbl><p:p><p:run><p:t>nested</p:t></p:run></p:p></p:tbl></p:subList>" ++
    "<p:outside><p:p><p:run><p:t>skip</p:t></p:run></p:p></p:outside></masterPage>";
const sources = [_]fixture.Source{
    .{ .name = "mimetype", .data = package.mime },
    .{ .name = "META-INF/container.xml", .data = fixture.package_container },
    .{ .name = "Contents/content.hpf", .data = hpf },
    .{ .name = "version.xml", .data = "<v:HCFVersion xmlns:v='http://www.hancom.co.kr/hwpml/2011/version' major='5' minor='1'/>" },
    .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:beginNum page='1' footnote='1' endnote='1' pic='1' tbl='1' equation='1'/><h:refList/></h:head>" },
    .{ .name = "Contents/section0.xml", .data = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'><s:p/></s:sec>" },
    .{ .name = "Contents/masterpage0.xml", .data = master },
};

fn inspect(a: std.mem.Allocator, source: []const u8, options: package.MasterPageTextOptions, visitor: ?package.SectionTextVisitor) !package.MasterPageTextReport {
    var changed = sources;
    changed[6].data = source;
    const bytes = try fixture.storedZip(a, &changed);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    return document.inspectMasterPageText(a, options, visitor);
}

const Trace = struct {
    a: std.mem.Allocator,
    bytes: std.ArrayList(u8) = .empty,
    starts: usize = 0,
    ends: usize = 0,

    fn deinit(self: *Trace) void {
        self.bytes.deinit(self.a);
    }

    fn onEvent(raw: *anyopaque, event: package.SectionTextEvent) anyerror!void {
        const self: *Trace = @ptrCast(@alignCast(raw));
        switch (event) {
            .text_start => |value| {
                try std.testing.expectEqual(@as(@TypeOf(value.location.part_kind), .master_page), value.location.part_kind);
                try std.testing.expectEqual(@as(usize, 0), value.location.part_ordinal);
                self.starts += 1;
                try self.bytes.appendSlice(self.a, "[");
            },
            .text_end => {
                self.ends += 1;
                try self.bytes.appendSlice(self.a, "]");
            },
            .content => |value| try self.bytes.appendSlice(self.a, value.bytes),
            .inline_empty => |value| {
                if (value.kind == .tab) try self.bytes.appendSlice(self.a, "<tab/>");
            },
            .paragraph_start, .paragraph_end, .run_start, .run_end, .inline_start, .inline_end => {},
        }
    }
};

test "HWPX master text preserves selected nested paragraphs, normalized content and inline order" {
    var trace: Trace = .{ .a = std.testing.allocator };
    defer trace.deinit();
    const report = try inspect(std.testing.allocator, master, .{}, .{ .context = &trace, .on_event = Trace.onEvent });
    try std.testing.expectEqualStrings("[A&B<tab/>C][][nested]", trace.bytes.items);
    try std.testing.expectEqual(@as(usize, 3), trace.starts);
    try std.testing.expectEqual(trace.starts, trace.ends);
    try std.testing.expectEqual(@as(usize, 1), report.parts);
    try std.testing.expectEqual(@as(usize, 1), report.sub_lists);
    try std.testing.expectEqual(@as(usize, 0), report.text.sections);
    try std.testing.expectEqual(@as(usize, 2), report.text.paragraphs);
    try std.testing.expectEqual(@as(usize, 1), report.text.direct_paragraphs);
    try std.testing.expectEqual(@as(usize, 2), report.text.runs);
    try std.testing.expectEqual(@as(usize, 3), report.text.text_elements);
    try std.testing.expectEqual(@as(usize, 1), report.text.empty_text_elements);
    try std.testing.expectEqual(@as(usize, 10), report.text.text_bytes);
    try std.testing.expectEqual(@as(usize, 1), report.text.inlineCount(.tab));
    try std.testing.expectEqual(@as(usize, 0), report.text.non_text_content_chunks);
    try std.testing.expectEqual(master.len, report.xml_bytes);
}

test "HWPX master text keeps exact independent limits and callback error" {
    const a = std.testing.allocator;
    const exact = try inspect(a, master, .{ .text = .{ .max_part_xml_bytes = master.len, .max_total_xml_bytes = master.len, .scan = .{ .max_text_elements = 3, .max_inline_elements = 1, .max_text_bytes = 10 } } }, null);
    try std.testing.expectEqual(@as(usize, 10), exact.text.text_bytes);
    try std.testing.expectError(error.LimitExceeded, inspect(a, master, .{ .text = .{ .max_parts = 0 } }, null));
    try std.testing.expectError(error.LimitExceeded, inspect(a, master, .{ .text = .{ .max_part_xml_bytes = master.len - 1 } }, null));
    try std.testing.expectError(error.LimitExceeded, inspect(a, master, .{ .text = .{ .max_total_xml_bytes = master.len - 1 } }, null));
    try std.testing.expectError(error.LimitExceeded, inspect(a, master, .{ .text = .{ .scan = .{ .max_text_elements = 2 } } }, null));
    try std.testing.expectError(error.LimitExceeded, inspect(a, master, .{ .text = .{ .scan = .{ .max_inline_elements = 0 } } }, null));
    try std.testing.expectError(error.LimitExceeded, inspect(a, master, .{ .text = .{ .scan = .{ .max_text_bytes = 9 } } }, null));
    const Stop = struct {
        fn onEvent(_: *anyopaque, event: package.SectionTextEvent) anyerror!void {
            if (event == .content) return error.StopHere;
        }
    };
    var dummy: u8 = 0;
    try std.testing.expectError(error.StopHere, inspect(a, master, .{}, .{ .context = &dummy, .on_event = Stop.onEvent }));
    const retry = try inspect(a, master, .{}, null);
    try std.testing.expectEqual(@as(usize, 3), retry.text.text_elements);
}

test "HWPX master text keeps part ordinals and cumulative budgets across parts" {
    const a = std.testing.allocator;
    const second_hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
        "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
        "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
        "<o:item id='masterpage0' href='Contents/masterpage0.xml' media-type='application/xml'/>" ++
        "<o:item id='masterpage1' href='Contents/masterpage1.xml' media-type='application/xml'/>" ++
        "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
    const second_master = "<masterPage id='masterpage1' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:subList><p:p><p:run><p:t>Q</p:t></p:run></p:p></p:subList></masterPage>";
    var changed: [sources.len + 1]fixture.Source = undefined;
    @memcpy(changed[0..sources.len], &sources);
    changed[2].data = second_hpf;
    changed[sources.len] = .{ .name = "Contents/masterpage1.xml", .data = second_master };
    const bytes = try fixture.storedZip(a, &changed);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const Observer = struct {
        ordinals: [4]usize = undefined,
        count: usize = 0,

        fn onEvent(raw: *anyopaque, event: package.SectionTextEvent) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            if (event == .text_start) {
                self.ordinals[self.count] = event.text_start.location.part_ordinal;
                self.count += 1;
            }
        }
    };
    var observer: Observer = .{};
    const report = try document.inspectMasterPageText(a, .{}, .{ .context = &observer, .on_event = Observer.onEvent });
    try std.testing.expectEqualSlices(usize, &.{ 0, 0, 0, 1 }, observer.ordinals[0..observer.count]);
    try std.testing.expectEqual(@as(usize, 2), report.parts);
    try std.testing.expectEqual(@as(usize, 4), report.text.text_elements);
    try std.testing.expectEqual(@as(usize, 11), report.text.text_bytes);
    const combined = master.len + second_master.len;
    const exact = try document.inspectMasterPageText(a, .{ .text = .{ .max_parts = 2, .max_total_xml_bytes = combined, .scan = .{ .max_text_elements = 4, .max_text_bytes = 11 } } }, null);
    try std.testing.expectEqual(combined, exact.xml_bytes);
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageText(a, .{ .text = .{ .max_total_xml_bytes = combined - 1 } }, null));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageText(a, .{ .text = .{ .scan = .{ .max_text_elements = 3 } } }, null));
    try std.testing.expectError(error.LimitExceeded, document.inspectMasterPageText(a, .{ .text = .{ .scan = .{ .max_text_bytes = 10 } } }, null));
}

test "HWPX master text selects declared switch capabilities without hiding malformed XML" {
    const source = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>" ++
        "<p:subList><p:p><p:run><p:switch>" ++
        "<p:case p:required-namespace='urn:feature'><p:p><p:run><p:t>X</p:t></p:run></p:p></p:case>" ++
        "<p:default><p:p><p:run><p:t>Y</p:t></p:run></p:p></p:default>" ++
        "</p:switch></p:run></p:p></p:subList></masterPage>";
    const a = std.testing.allocator;
    var raw: Trace = .{ .a = a };
    defer raw.deinit();
    const raw_report = try inspect(a, source, .{}, .{ .context = &raw, .on_event = Trace.onEvent });
    try std.testing.expectEqualStrings("[X][Y]", raw.bytes.items);
    try std.testing.expectEqual(@as(usize, 2), raw_report.text.text_elements);
    try std.testing.expectEqual(@as(usize, 3), raw_report.text.paragraphs);
    var fallback: Trace = .{ .a = a };
    defer fallback.deinit();
    const fallback_report = try inspect(a, source, .{ .text = .{ .scan = .{ .max_text_elements = 1, .branch_policy = .{ .mode = .selected } } } }, .{ .context = &fallback, .on_event = Trace.onEvent });
    try std.testing.expectEqualStrings("[Y]", fallback.bytes.items);
    try std.testing.expectEqual(@as(usize, 1), fallback_report.text.text_elements);
    try std.testing.expectEqual(@as(usize, 2), fallback_report.text.paragraphs);
    var supported: Trace = .{ .a = a };
    defer supported.deinit();
    _ = try inspect(a, source, .{ .text = .{ .scan = .{ .branch_policy = .{ .mode = .selected, .supported_namespaces = &.{"urn:feature"} } } } }, .{ .context = &supported, .on_event = Trace.onEvent });
    try std.testing.expectEqualStrings("[X]", supported.bytes.items);
    try std.testing.expectError(error.InvalidSupportedNamespace, inspect(a, source, .{ .text = .{ .scan = .{ .branch_policy = .{ .mode = .selected, .supported_namespaces = &.{"urn:bad uri"} } } } }, null));
    const malformed = "<masterPage id='masterpage0' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>" ++
        "<p:subList><p:p><p:run><p:switch><p:case p:required-namespace='urn:unavailable'>" ++
        "<p:t>&#x110000;</p:t></p:case><p:default><p:t>Y</p:t></p:default>" ++
        "</p:switch></p:run></p:p></p:subList></masterPage>";
    try std.testing.expectError(error.XmlCharacterReferenceOutOfRange, inspect(a, malformed, .{ .text = .{ .scan = .{ .branch_policy = .{ .mode = .selected } } } }, null));
}

test "HWPX master text releases allocations under failure injection" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            const report = try inspect(a, master, .{}, null);
            try std.testing.expectEqual(@as(usize, 3), report.text.text_elements);
        }
    }.run, .{});
}
