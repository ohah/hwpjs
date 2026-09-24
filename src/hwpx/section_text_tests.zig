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
    return inspectMode(a, section, options, null, visitor);
}

fn inspectSelected(a: std.mem.Allocator, section: []const u8, options: package.SectionTextOptions, supported_namespaces: []const []const u8, visitor: ?package.SectionTextVisitor) !package.SectionTextReport {
    return inspectMode(a, section, options, supported_namespaces, visitor);
}

fn inspectMode(a: std.mem.Allocator, section: []const u8, options: package.SectionTextOptions, supported_namespaces: ?[]const []const u8, visitor: ?package.SectionTextVisitor) !package.SectionTextReport {
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
    if (supported_namespaces) |supported| return document.inspectSelectedSectionText(a, options, supported, visitor);
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
            .paragraph_start, .paragraph_end, .run_start, .run_end => {},
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

test "HWPX section text emits paragraph and run boundaries including empty nodes" {
    const source = prefix ++ "<p:p id=\"&#49;\"><p:run charPrIDRef=\"&#55;\"><p:t>A</p:t></p:run><p:run/></p:p><p:p/>" ++ suffix;
    const Capture = struct {
        allocator: std.mem.Allocator,
        order: std.ArrayList(u8) = .empty,
        saw_paragraph_id: bool = false,
        saw_run_style: bool = false,
        fn deinit(self: *@This()) void {
            self.order.deinit(self.allocator);
        }
        fn onEvent(raw: *anyopaque, event: package.SectionTextEvent) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            const marker: u8 = switch (event) {
                .paragraph_start => |value| blk: {
                    if (value.location.paragraph_ordinal == 1) {
                        const id = try attrs.attribute(self.allocator, value.tag, value.scope, "id", 8);
                        defer if (id) |owned| self.allocator.free(owned);
                        self.saw_paragraph_id = if (id) |owned| std.mem.eql(u8, owned, "1") else false;
                    }
                    break :blk 'P';
                },
                .paragraph_end => 'p',
                .run_start => |value| blk: {
                    if (value.location.run_ordinal == 1) {
                        const id = try attrs.attribute(self.allocator, value.tag, value.scope, "charPrIDRef", 8);
                        defer if (id) |owned| self.allocator.free(owned);
                        self.saw_run_style = if (id) |owned| std.mem.eql(u8, owned, "7") else false;
                    }
                    break :blk 'R';
                },
                .run_end => 'r',
                .text_start => 'T',
                .text_end => 't',
                else => return,
            };
            try self.order.append(self.allocator, marker);
        }
    };
    var capture: Capture = .{ .allocator = std.testing.allocator };
    defer capture.deinit();
    const report = try inspect(std.testing.allocator, source, .{}, .{ .context = &capture, .on_event = Capture.onEvent });
    try std.testing.expectEqualStrings("PRTtrRrpPp", capture.order.items);
    try std.testing.expect(capture.saw_paragraph_id);
    try std.testing.expect(capture.saw_run_style);
    try std.testing.expectEqual(@as(usize, 2), report.direct_paragraphs);
    try std.testing.expectEqual(@as(usize, 1), report.paragraphs_without_direct_run);
    try std.testing.expectEqual(@as(usize, 0), report.non_direct_runs);
    try std.testing.expectEqual(@as(usize, 1), report.issues());
}

test "HWPX section text reports missing direct children without inventing nodes" {
    const empty_section = try inspect(std.testing.allocator, prefix ++ suffix, .{}, null);
    try std.testing.expectEqual(@as(usize, 1), empty_section.sections_without_direct_paragraph);
    try std.testing.expectEqual(@as(usize, 0), empty_section.paragraphs);
    try std.testing.expectEqual(@as(usize, 1), empty_section.issues());

    const layout_only = try inspect(std.testing.allocator, prefix ++ "<p:p id=\"2147483648\"><p:linesegarray/></p:p>" ++ suffix, .{}, null);
    try std.testing.expectEqual(@as(usize, 1), layout_only.direct_paragraphs);
    try std.testing.expectEqual(@as(usize, 1), layout_only.paragraphs_without_direct_run);
    try std.testing.expectEqual(@as(usize, 0), layout_only.runs);
    try std.testing.expectEqual(@as(usize, 1), layout_only.issues());

    const nested = prefix ++ "<p:container><p:p><p:container><p:run/></p:container></p:p></p:container>" ++ suffix;
    const report = try inspect(std.testing.allocator, nested, .{}, null);
    try std.testing.expectEqual(@as(usize, 1), report.sections_without_direct_paragraph);
    try std.testing.expectEqual(@as(usize, 1), report.paragraphs_without_direct_run);
    try std.testing.expectEqual(@as(usize, 1), report.non_direct_runs);
    try std.testing.expectEqual(@as(usize, 3), report.issues());
}

test "HWPX section text cleans up on every allocation failure" {
    const source = prefix ++ "<p:p><p:run><p:t>A&amp;<![CDATA[B]]><p:tab/>C</p:t></p:run></p:p>" ++ suffix;
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, bytes: []const u8) !void {
            _ = try inspect(a, bytes, .{}, null);
        }
    }.run, .{source});
}

test "HWPX selected section text chooses one nested branch without changing raw events" {
    const source = prefix ++ "<p:p><p:run><p:t>before</p:t><p:switch>" ++
        "<p:case p:required-namespace='urn:outer'><p:p><p:run><p:switch>" ++
        "<p:case p:required-namespace='urn:inner'><p:t>inner<p:tab/></p:t></p:case>" ++
        "<p:default><p:t>fallback<p:lineBreak/></p:t></p:default></p:switch></p:run></p:p></p:case>" ++
        "<p:default><p:p><p:run><p:t>outer-default</p:t></p:run></p:p></p:default>" ++
        "</p:switch><p:t>after</p:t></p:run></p:p>" ++ suffix;
    const Capture = struct {
        a: std.mem.Allocator,
        bytes: std.ArrayList(u8) = .empty,
        fn deinit(self: *@This()) void {
            self.bytes.deinit(self.a);
        }
        fn onEvent(raw: *anyopaque, event: package.SectionTextEvent) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            if (event == .content) try self.bytes.appendSlice(self.a, event.content.bytes);
        }
    };
    var raw: Capture = .{ .a = std.testing.allocator };
    defer raw.deinit();
    const raw_report = try inspect(std.testing.allocator, source, .{}, .{ .context = &raw, .on_event = Capture.onEvent });
    try std.testing.expectEqualStrings("beforeinnerfallbackouter-defaultafter", raw.bytes.items);
    try std.testing.expectEqual(@as(usize, 5), raw_report.text_elements);
    try std.testing.expectEqual(@as(usize, 1), raw_report.inlineCount(.tab));
    try std.testing.expectEqual(@as(usize, 1), raw_report.inlineCount(.line_break));

    var default: Capture = .{ .a = std.testing.allocator };
    defer default.deinit();
    const default_report = try inspectSelected(std.testing.allocator, source, .{}, &.{}, .{ .context = &default, .on_event = Capture.onEvent });
    try std.testing.expectEqualStrings("beforeouter-defaultafter", default.bytes.items);
    try std.testing.expectEqual(@as(usize, 3), default_report.text_elements);
    try std.testing.expectEqual(@as(usize, 0), default_report.inlineCount(.tab));
    try std.testing.expectEqual(@as(usize, 0), default_report.inlineCount(.line_break));

    var nested_default: Capture = .{ .a = std.testing.allocator };
    defer nested_default.deinit();
    const nested_default_report = try inspectSelected(std.testing.allocator, source, .{}, &.{"urn:outer"}, .{ .context = &nested_default, .on_event = Capture.onEvent });
    try std.testing.expectEqualStrings("beforefallbackafter", nested_default.bytes.items);
    try std.testing.expectEqual(@as(usize, 3), nested_default_report.text_elements);
    try std.testing.expectEqual(@as(usize, 0), nested_default_report.inlineCount(.tab));
    try std.testing.expectEqual(@as(usize, 1), nested_default_report.inlineCount(.line_break));

    var both: Capture = .{ .a = std.testing.allocator };
    defer both.deinit();
    const both_report = try inspectSelected(std.testing.allocator, source, .{}, &.{ "urn:outer", "urn:inner" }, .{ .context = &both, .on_event = Capture.onEvent });
    try std.testing.expectEqualStrings("beforeinnerafter", both.bytes.items);
    try std.testing.expectEqual(@as(usize, 3), both_report.text_elements);
    try std.testing.expectEqual(@as(usize, 1), both_report.inlineCount(.tab));
    try std.testing.expectEqual(@as(usize, 0), both_report.inlineCount(.line_break));
}

test "HWPX selected section text isolates inactive limits and validates capabilities" {
    const source = prefix ++ "<p:p><p:run><p:switch>" ++
        "<p:case p:required-namespace='urn:feature'><p:t>too much text</p:t></p:case>" ++
        "<p:default><p:t>X</p:t></p:default></p:switch></p:run></p:p>" ++ suffix;
    const report = try inspectSelected(std.testing.allocator, source, .{ .text = .{ .max_text_bytes = 1, .max_text_elements = 1 } }, &.{}, null);
    try std.testing.expectEqual(@as(usize, 1), report.text_bytes);
    try std.testing.expectEqual(@as(usize, 1), report.text_elements);
    try std.testing.expectError(error.LimitExceeded, inspectSelected(std.testing.allocator, source, .{ .text = .{ .max_text_bytes = 1 } }, &.{"urn:feature"}, null));
    try std.testing.expectError(error.InvalidSupportedNamespace, inspectSelected(std.testing.allocator, source, .{}, &.{"urn:bad uri"}, null));
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, bytes: []const u8) !void {
            _ = try inspectSelected(a, bytes, .{}, &.{"urn:feature"}, null);
        }
    }.run, .{source});
}

test "HWPX selected section text keeps source-order default and ignores foreign switch" {
    const source = prefix ++ "<p:p><p:run>" ++
        "<x:switch><x:case p:required-namespace='urn:yes'><p:t>foreign</p:t></x:case></x:switch>" ++
        "<p:switch><p:default><p:t>D</p:t></p:default>" ++
        "<p:case p:required-namespace='urn:yes'><p:t>C</p:t></p:case></p:switch>" ++
        "</p:run></p:p>" ++ suffix;
    const report = try inspectSelected(std.testing.allocator, source, .{ .text = .{ .max_text_bytes = 8, .max_text_elements = 2 } }, &.{"urn:yes"}, null);
    try std.testing.expectEqual(@as(usize, 2), report.text_elements);
    try std.testing.expectEqual(@as(usize, 8), report.text_bytes);
    try std.testing.expectError(error.LimitExceeded, inspect(std.testing.allocator, source, .{ .text = .{ .max_text_elements = 2 } }, null));
}

test "HWPX selected section text still rejects malformed XML inside inactive branch" {
    const source = prefix ++ "<p:p><p:run><p:switch>" ++
        "<p:case p:required-namespace='urn:unsupported'><p:t>&#x110000;</p:t></p:case>" ++
        "<p:default><p:t>valid</p:t></p:default></p:switch></p:run></p:p>" ++ suffix;
    try std.testing.expectError(error.XmlCharacterReferenceOutOfRange, inspectSelected(std.testing.allocator, source, .{}, &.{}, null));
}
