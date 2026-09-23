const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");
const attrs = @import("xml_attributes.zig");

const hpf = "<p:package xmlns:p=\"http://www.idpf.org/2007/opf/\"><p:manifest>" ++
    "<p:item id=\"header\" href=\"Contents/header.xml\" media-type=\"application/xml\"/>" ++
    "<p:item id=\"section\" href=\"Contents/section0.xml\" media-type=\"application/xml\"/>" ++
    "</p:manifest><p:spine><p:itemref idref=\"header\"/><p:itemref idref=\"section\"/></p:spine></p:package>";
const prefix = "<s:sec xmlns:s=\"http://www.hancom.co.kr/hwpml/2011/section\" xmlns:p=\"http://www.hancom.co.kr/hwpml/2011/paragraph\" xmlns:x=\"urn:other\">";
const suffix = "</s:sec>";

fn inspect(a: std.mem.Allocator, section: []const u8, options: package.SectionTextOptions, visitor: ?package.SectionTextVisitor) !package.SectionTextReport {
    const sources = [_]fixture.Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = hpf },
        .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h=\"http://www.hancom.co.kr/hwpml/2011/head\" secCnt=\"1\"/>" },
        .{ .name = "Contents/section0.xml", .data = section },
    };
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    return document.inspectSectionText(a, options, visitor);
}

const Trace = struct {
    allocator: std.mem.Allocator,
    bytes: std.ArrayList(u8) = .empty,
    saw_char_style: bool = false,
    saw_tab_width: bool = false,

    fn deinit(self: *Trace) void {
        self.bytes.deinit(self.allocator);
    }

    fn onEvent(raw: *anyopaque, event: package.SectionTextEvent) anyerror!void {
        const self: *Trace = @ptrCast(@alignCast(raw));
        switch (event) {
            .text_start => |start| {
                try std.testing.expectEqual(@as(usize, 0), start.location.section_ordinal);
                try std.testing.expectEqual(@as(usize, 1), start.location.paragraph_ordinal);
                const value = try attrs.attribute(self.allocator, start.tag, start.scope, "charStyleIDRef", 32);
                defer if (value) |owned| self.allocator.free(owned);
                if (value) |owned| self.saw_char_style = std.mem.eql(u8, owned, "7");
                try self.bytes.appendSlice(self.allocator, "[");
            },
            .text_end => try self.bytes.appendSlice(self.allocator, "]"),
            .content => |content| try self.bytes.appendSlice(self.allocator, content.bytes),
            .inline_empty => |control| {
                if (control.kind == .tab) {
                    const width = try attrs.attribute(self.allocator, control.tag, control.scope, "width", 32);
                    defer if (width) |owned| self.allocator.free(owned);
                    self.saw_tab_width = if (width) |owned| std.mem.eql(u8, owned, "123") else false;
                }
                try self.bytes.appendSlice(self.allocator, "<");
                try self.bytes.appendSlice(self.allocator, @tagName(control.kind));
                try self.bytes.appendSlice(self.allocator, "/>");
            },
            .inline_start => try self.bytes.appendSlice(self.allocator, "{"),
            .inline_end => try self.bytes.appendSlice(self.allocator, "}"),
        }
    }
};

test "HWPX section text streams XML-normalized content and ordered inline controls" {
    const source = prefix ++ "<p:p><p:run><p:t charStyleIDRef=\"7\">A&amp;<![CDATA[B]]><p:tab width=\"123\"/>C<p:fwSpace/>D<p:lineBreak/>E</p:t><p:t/></p:run></p:p>" ++ suffix;
    var trace: Trace = .{ .allocator = std.testing.allocator };
    defer trace.deinit();
    const report = try inspect(std.testing.allocator, source, .{}, .{ .context = &trace, .on_event = Trace.onEvent });
    try std.testing.expectEqualStrings("[A&B<tab/>C<fw_space/>D<line_break/>E][]", trace.bytes.items);
    try std.testing.expect(trace.saw_char_style);
    try std.testing.expect(trace.saw_tab_width);
    try std.testing.expectEqual(@as(usize, 1), report.sections);
    try std.testing.expectEqual(@as(usize, 1), report.paragraphs);
    try std.testing.expectEqual(@as(usize, 1), report.runs);
    try std.testing.expectEqual(@as(usize, 2), report.text_elements);
    try std.testing.expectEqual(@as(usize, 1), report.empty_text_elements);
    try std.testing.expectEqual(@as(usize, 6), report.text_bytes);
    try std.testing.expectEqual(@as(usize, 1), report.inlineCount(.tab));
    try std.testing.expectEqual(@as(usize, 1), report.inlineCount(.fw_space));
    try std.testing.expectEqual(@as(usize, 1), report.inlineCount(.line_break));
    try std.testing.expectEqual(@as(usize, 0), report.issues());
}

test "HWPX section text retains unsupported and nested inline boundaries" {
    const source = prefix ++ "<p:p><p:run><p:t>A<x:future><x:inner>B</x:inner></x:future>C</p:t></p:run></p:p>" ++ suffix;
    var trace: Trace = .{ .allocator = std.testing.allocator };
    defer trace.deinit();
    const report = try inspect(std.testing.allocator, source, .{}, .{ .context = &trace, .on_event = Trace.onEvent });
    try std.testing.expectEqualStrings("[A{{B}}C]", trace.bytes.items);
    try std.testing.expectEqual(@as(usize, 2), report.inlineCount(.unknown));
    try std.testing.expectEqual(@as(usize, 1), report.nested_inline_elements);
    try std.testing.expectEqual(@as(usize, 3), report.text_bytes);
    try std.testing.expectEqual(@as(usize, 3), report.issues());
}

test "HWPX section text distinguishes lookalikes and non-text content" {
    const source = prefix ++ "<p:p><p:run><x:t>fake</x:t><p:t>real</p:t></p:run></p:p>" ++ suffix;
    const report = try inspect(std.testing.allocator, source, .{}, null);
    try std.testing.expectEqual(@as(usize, 1), report.text_elements);
    try std.testing.expectEqual(@as(usize, 4), report.text_bytes);
    try std.testing.expectEqual(@as(usize, 1), report.non_text_content_chunks);
    try std.testing.expectEqual(@as(usize, 1), report.issues());
    try std.testing.expectError(error.MissingDocumentSection, inspect(std.testing.allocator, "<x:sec xmlns:x=\"urn:other\"/>", .{}, null));
}

test "HWPX section text classifies ancillary XML text without treating it as visible hp:t" {
    const source = prefix ++ "<p:p><p:run><p:t>body</p:t><p:script>code</p:script><p:stringParam>value</p:stringParam><p:shapeComment>note</p:shapeComment></p:run></p:p>" ++ suffix;
    const report = try inspect(std.testing.allocator, source, .{}, null);
    try std.testing.expectEqual(@as(usize, 4), report.text_bytes);
    try std.testing.expectEqual(@as(usize, 3), report.non_text_content_chunks);
    try std.testing.expectEqual(@as(usize, 1), report.otherContentCount(.script));
    try std.testing.expectEqual(@as(usize, 1), report.otherContentCount(.string_param));
    try std.testing.expectEqual(@as(usize, 1), report.otherContentCount(.shape_comment));
    try std.testing.expectEqual(@as(usize, 0), report.issues());
}

test "HWPX section text uses exact independent text and inline limits" {
    const source = prefix ++ "<p:p><p:run><p:t>A<p:tab/>B</p:t><p:t/></p:run></p:p>" ++ suffix;
    const exact = try inspect(std.testing.allocator, source, .{ .text = .{ .max_text_elements = 2, .max_inline_elements = 1, .max_text_bytes = 2 } }, null);
    try std.testing.expectEqual(@as(usize, 2), exact.text_bytes);
    try std.testing.expectError(error.LimitExceeded, inspect(std.testing.allocator, source, .{ .text = .{ .max_text_elements = 1 } }, null));
    try std.testing.expectError(error.LimitExceeded, inspect(std.testing.allocator, source, .{ .text = .{ .max_inline_elements = 0 } }, null));
    try std.testing.expectError(error.LimitExceeded, inspect(std.testing.allocator, source, .{ .text = .{ .max_text_bytes = 1 } }, null));
}

test "HWPX section text distinguishes every observed inline kind without inventing spaces" {
    const source = prefix ++ "<p:p><p:run><p:t><p:tab width=\"100\" leader=\"NONE\" type=\"LEFT\"/><p:fwSpace/><p:nbSpace/><p:lineBreak/><p:titleMark ignore=\"0\"/><p:markpenBegin color=\"#FFFFFF\"/><p:markpenEnd/><p:hypen/></p:t></p:run></p:p>" ++ suffix;
    const Capture = struct {
        counts: [@typeInfo(package.SectionTextInlineKind).@"enum".fields.len]usize = @splat(0),
        fn onEvent(raw: *anyopaque, event: package.SectionTextEvent) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            if (event == .inline_empty) self.counts[@intFromEnum(event.inline_empty.kind)] += 1;
        }
    };
    var capture: Capture = .{};
    const report = try inspect(std.testing.allocator, source, .{}, .{ .context = &capture, .on_event = Capture.onEvent });
    inline for (.{ .tab, .fw_space, .nb_space, .line_break, .title_mark, .markpen_begin, .markpen_end, .hypen }) |kind| {
        try std.testing.expectEqual(@as(usize, 1), report.inlineCount(kind));
        try std.testing.expectEqual(@as(usize, 1), capture.counts[@intFromEnum(@as(package.SectionTextInlineKind, kind))]);
    }
    try std.testing.expectEqual(@as(usize, 0), report.text_bytes);
    try std.testing.expectEqual(@as(usize, 1), report.empty_text_elements);
    try std.testing.expectEqual(@as(usize, 0), report.issues());
}

test "HWPX section text keeps nested paragraph ordinals and callback errors" {
    const source = prefix ++ "<p:p><p:run><p:t>outer</p:t><p:tbl><p:tr><p:tc><p:subList><p:p><p:run><p:t>inner</p:t></p:run></p:p></p:subList></p:tc></p:tr></p:tbl></p:run></p:p>" ++ suffix;
    const Capture = struct {
        ordinals: [2]usize = undefined,
        count: usize = 0,
        fn onEvent(raw: *anyopaque, event: package.SectionTextEvent) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            if (event == .text_start) {
                self.ordinals[self.count] = event.text_start.location.paragraph_ordinal;
                self.count += 1;
            }
        }
    };
    var capture: Capture = .{};
    const report = try inspect(std.testing.allocator, source, .{}, .{ .context = &capture, .on_event = Capture.onEvent });
    try std.testing.expectEqual(@as(usize, 2), report.paragraphs);
    try std.testing.expectEqual(@as(usize, 2), report.runs);
    try std.testing.expectEqual(@as(usize, 2), capture.count);
    try std.testing.expectEqualSlices(usize, &.{ 1, 2 }, &capture.ordinals);

    const Stop = struct {
        fn onEvent(_: *anyopaque, event: package.SectionTextEvent) anyerror!void {
            if (event == .content) return error.StopHere;
        }
    };
    try std.testing.expectError(error.StopHere, inspect(std.testing.allocator, source, .{}, .{ .context = &capture, .on_event = Stop.onEvent }));
    const retry = try inspect(std.testing.allocator, source, .{}, null);
    try std.testing.expectEqual(@as(usize, 10), retry.text_bytes);
}

test "HWPX section text cleans up on every allocation failure" {
    const source = prefix ++ "<p:p><p:run><p:t>A&amp;<![CDATA[B]]><p:tab/>C</p:t></p:run></p:p>" ++ suffix;
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, bytes: []const u8) !void {
            _ = try inspect(a, bytes, .{}, null);
        }
    }.run, .{source});
}
