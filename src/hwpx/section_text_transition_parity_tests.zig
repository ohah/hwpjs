//! Public scanner differential against frozen pre-refactor transitions.
//! XML, namespace and selection dependencies are shared; Scanner code is not.
const std = @import("std");
const current = @import("section_text.zig");
const before = @import("../testing/section_text_before_parsed_locations.zig");
const document_xml = @import("document_xml.zig");
const zip = @import("../zip/archive.zig");
const fixture = @import("test_package_fixture.zig");
const master_parts = @import("masterpage_parts.zig");
const reflection = @import("../reflection.zig");
const a = std.testing.allocator;
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign' xmlns:e='http://www.idpf.org/2007/ops'>";
const suffix = "</s:sec>";
const policies = [_]current.Options{
    .{},
    .{ .branch_policy = .{ .mode = .selected } },
    .{ .branch_policy = .{ .mode = .selected, .supported_namespaces = &.{"urn:feature"} } },
};
const seeded: current.Report = .{ .sections = 3, .paragraphs = 7, .direct_paragraphs = 4, .runs = 11, .text_elements = 13, .text_bytes = 5, .text_chunks = 2, .decoded_xml_bytes = 29 };

// Names, not source enum ordinals, identify event variants. All seven Location
// numbers are retained, including part_kind. Payloads never borrow callbacks.
const Summary = struct {
    kind: []const u8,
    location: [7]usize,
    inline_kind: ?usize,
    raw_tag: []u8,
    content: []u8,
};
const Trace = struct {
    items: std.ArrayList(Summary) = .empty,
    fail_after: ?usize = null,

    fn deinit(self: *Trace) void {
        for (self.items.items) |item| {
            a.free(item.raw_tag);
            a.free(item.content);
        }
        self.items.deinit(a);
    }

    fn append(self: *Trace, kind: []const u8, location: anytype, inline_kind: ?usize, raw_tag: []const u8, content: []const u8) !void {
        if (self.fail_after) |limit| if (self.items.items.len == limit) return error.ParityCallbackStopped;
        const owned_tag = try a.dupe(u8, raw_tag);
        errdefer a.free(owned_tag);
        const owned_content = try a.dupe(u8, content);
        errdefer a.free(owned_content);
        try self.items.append(a, .{
            .kind = kind,
            .location = .{ location.section_ordinal, location.item_index, location.paragraph_ordinal, location.run_ordinal, location.text_ordinal, @backingInt(location.part_kind), location.part_ordinal },
            .inline_kind = inline_kind,
            .raw_tag = owned_tag,
            .content = owned_content,
        });
    }

    fn record(self: *Trace, event: anytype) !void {
        const kind = @tagName(event);
        switch (event) {
            .paragraph_start, .paragraph_end, .run_start, .run_end => |v| try self.append(kind, v.location, null, v.tag.raw, ""),
            .text_start => |v| try self.append(kind, v.location, null, v.tag.raw, ""),
            .text_end => |v| try self.append(kind, v, null, "", ""),
            .content => |v| try self.append(kind, v.location, null, "", v.bytes),
            .inline_start, .inline_end, .inline_empty => |v| try self.append(kind, v.location, @backingInt(v.kind), v.tag.raw, ""),
        }
    }
};

fn Adapter(comptime Impl: type) type {
    return struct {
        fn event(raw: *anyopaque, value: Impl.Event) anyerror!void {
            const trace: *Trace = @ptrCast(@alignCast(raw));
            try trace.record(value);
        }
    };
}

fn optionsFor(comptime Impl: type, options: current.Options) Impl.Options {
    var result: Impl.Options = .{};
    inline for (reflection.fields(current.Options)) |field| @field(result, field.name) = @field(options, field.name);
    return result;
}

fn normalizeReport(report: anytype) current.Report {
    comptime {
        if (reflection.fields(@TypeOf(report)).len != reflection.fields(current.Report).len) @compileError("scanner Report field set changed");
    }
    var result: current.Report = .{};
    inline for (reflection.fields(current.Report)) |field| @field(result, field.name) = @field(report, field.name);
    return result;
}

const Capture = struct {
    trace: Trace,
    report: current.Report,
    failure: ?anyerror,
};
const Outcome = struct { failure: ?anyerror, events: usize, report: current.Report };

fn capture(comptime Impl: type, input: []const u8, options: current.Options, initial: current.Report, fail_after: ?usize) !Capture {
    var report: Impl.Report = .{};
    inline for (reflection.fields(current.Report)) |field| @field(report, field.name) = @field(initial, field.name);
    var trace: Trace = .{ .fail_after = fail_after };
    errdefer trace.deinit();
    var failure: ?anyerror = null;
    Impl.scanSource(a, input, 5, 37, optionsFor(Impl, options), &report, .{ .context = &trace, .on_event = Adapter(Impl).event }) catch |err| {
        if (err == error.OutOfMemory) return err;
        failure = err;
    };
    return .{ .trace = trace, .report = normalizeReport(report), .failure = failure };
}

fn compare(input: []const u8, options: current.Options, initial: current.Report, fail_after: ?usize) !Outcome {
    var old = try capture(before, input, options, initial, fail_after);
    defer old.trace.deinit();
    var fresh = try capture(current, input, options, initial, fail_after);
    defer fresh.trace.deinit();
    try std.testing.expectEqual(old.failure, fresh.failure);
    try std.testing.expectEqualDeep(old.report, fresh.report);
    try std.testing.expectEqualDeep(old.trace.items.items, fresh.trace.items.items);
    return .{ .failure = fresh.failure, .events = fresh.trace.items.items.len, .report = fresh.report };
}

const rich = prefix ++
    "\r\n<p:p/><p:p><p:run/><p:run><p:t/></p:run><p:run><p:t></p:t></p:run></p:p>" ++
    "<p:p><p:run> \n outside <p:script>formula</p:script><p:stringParam>str</p:stringParam>" ++
    "<p:shapeComment>comment</p:shapeComment><p:integerParam>1</p:integerParam><p:booleanParam>true</p:booleanParam>" ++
    "<p:metaTag>meta</p:metaTag><p:firstKey>key</p:firstKey><p:mainText>main</p:mainText><p:subText>sub</p:subText>" ++
    "<p:dutmal><p:mainText>upper</p:mainText><p:subText>lower</p:subText></p:dutmal>" ++
    "<p:t>A&amp;&#x1F600;<![CDATA[<B>]]><!--keep--><?pi x?><![CDATA[]]>C" ++
    "<p:tab/><p:fwSpace/><p:nbSpace/><p:lineBreak/><p:titleMark/><p:markpenBegin/><p:markpenEnd/><p:hypen/>" ++
    "<p:hyphen/><p:chval/><p:insertBegin/><x:tab/><p:tab>inline<x:mark>nested</x:mark></p:tab>" ++
    "<p:p><p:run><p:t>inline names</p:t></p:run></p:p></p:t></p:run></p:p>\n" ++ suffix;
const switched = prefix ++ "<p:p><p:run><p:t>before</p:t><p:switch>" ++
    "<p:case p:required-namespace='urn:missing'><p:t>skip</p:t></p:case>" ++
    "<p:case e:required-namespace='urn:feature'><p:p><p:run><p:switch>" ++
    "<p:case p:required-namespace='urn:feature'><p:t>chosen</p:t></p:case><p:default><p:t>inner fallback</p:t></p:default>" ++
    "</p:switch></p:run></p:p></p:case>" ++
    "<p:default><p:t>fallback</p:t></p:default><p:default><p:t>second default</p:t></p:default>" ++
    "<x:unknown><p:t>outside branch</p:t></x:unknown></p:switch><p:t>after</p:t></p:run></p:p>" ++ suffix;

test "section transition parity frozen oracle compares all public events and reports" {
    inline for (.{
        prefix ++ suffix,
        rich,
        switched,
        prefix ++ "<p:p><p:p/><p:p><p:run><p:t>nested paragraph</p:t></p:run></p:p><p:run><p:t>outer</p:t></p:run></p:p>" ++ suffix,
        prefix ++ "<q:p xmlns:q='http://www.hancom.co.kr/hwpml/2011/paragraph'><q:run><q:t>A</q:t><p:t xmlns:p='urn:rebound'>foreign</p:t></q:run></q:p>" ++ suffix,
        prefix ++ "<p xmlns='http://www.hancom.co.kr/hwpml/2011/paragraph'><run><t>default namespace</t></run></p>" ++ suffix,
        prefix ++ "<p:p><p:run><p:switch><p:case p:required-namespace='   '><p:t>whitespace capability</p:t></p:case><p:default><p:t>fallback</p:t></p:default></p:switch></p:run></p:p>" ++ suffix,
    }) |input| for (policies) |options| {
        const result = try compare(input, options, seeded, null);
        try std.testing.expect(result.failure == null);
    };
    var accumulated = seeded;
    for ([_][]const u8{ rich, prefix ++ "<p:p/><p:p><p:run><p:t>next</p:t></p:run></p:p>" ++ suffix }) |input| {
        const result = try compare(input, policies[1], accumulated, null);
        try std.testing.expect(result.failure == null);
        accumulated = result.report;
    }
    try std.testing.expect(accumulated.paragraphs > seeded.paragraphs);
}

test "section transition parity retains error codes partial reports and prefix events" {
    const initial = prefix ++ "<p:p><p:run><p:t>A</p:t>";
    inline for (.{
        initial ++ "<undeclared:t/></p:run></p:p>" ++ suffix,
        initial ++ "<p:t id='1' id='2'/></p:run></p:p>" ++ suffix,
        initial ++ "<p:t>&missing;</p:t></p:run></p:p>" ++ suffix,
        initial ++ "<p:t>&#x110000;</p:t></p:run></p:p>" ++ suffix,
        initial ++ "<p:t>\x01</p:t></p:run></p:p>" ++ suffix,
        initial ++ "<p:t></p:run></p:p>" ++ suffix,
        initial ++ "<!DOCTYPE bad></p:run></p:p>" ++ suffix,
        initial ++ "<p:t>unfinished",
        initial ++ "<p:switch><p:case p:required-namespace='urn:missing'><undeclared:t/></p:case><p:default><p:t>ok</p:t></p:default></p:switch></p:run></p:p>" ++ suffix,
    }) |input| for (policies) |options| {
        const result = try compare(input, options, seeded, null);
        try std.testing.expect(result.failure != null);
        try std.testing.expect(result.events > 0);
    };
    const wrong = try compare("<other><undeclared:t/></other>", .{}, .{}, null);
    try std.testing.expectEqual(@as(?anyerror, error.InvalidSectionRoot), wrong.failure);
    try std.testing.expectEqual(@as(usize, 0), wrong.events);
    const versioned = try compare("<s:sec xmlns:s='http://www.owpml.org/owpml/2021/section'><undeclared:t/></s:sec>", .{}, .{}, null);
    try std.testing.expectEqual(@as(?anyerror, error.UnsupportedHwpxNamespaceProfile), versioned.failure);
    const policy_first = try compare("<other/>", .{ .branch_policy = .{ .supported_namespaces = &.{"invalid namespace"} } }, seeded, null);
    try std.testing.expectEqual(@as(?anyerror, error.InvalidSupportedNamespace), policy_first.failure);
    try std.testing.expectEqualDeep(seeded, policy_first.report);
}

test "section transition parity callback failure at every public event keeps exact prefix" {
    for (policies) |options| {
        const complete = try compare(switched, options, seeded, null);
        try std.testing.expect(complete.failure == null);
        for (0..complete.events + 1) |limit| {
            const result = try compare(switched, options, seeded, limit);
            try std.testing.expectEqual(limit, result.events);
            try std.testing.expectEqual(if (limit == complete.events) @as(?anyerror, null) else @as(?anyerror, error.ParityCallbackStopped), result.failure);
        }
    }
}

fn utf16(input: []const u8, endian: std.builtin.Endian) ![]u8 {
    // Fixtures here are ASCII with numeric references for non-ASCII scalars.
    const bytes = try a.alloc(u8, input.len * 2 + 2);
    std.mem.writeInt(u16, bytes[0..2], 0xfeff, endian);
    for (input, 0..) |byte, index| std.mem.writeInt(u16, bytes[2 + index * 2 ..][0..2], byte, endian);
    return bytes;
}

test "section transition parity UTF16LE BE event bytes content and failing suffix" {
    inline for (.{ std.builtin.Endian.little, std.builtin.Endian.big }) |endian| {
        inline for (.{ rich, switched, prefix ++ "<p:p><p:run><p:t>A&amp;<![CDATA[B]]><undeclared:t/></p:t></p:run></p:p>" ++ suffix }) |input| {
            const bytes = try utf16(input, endian);
            defer a.free(bytes);
            for (policies) |options| {
                _ = try compare(bytes, options, seeded, null);
                const broken = try compare(bytes[0 .. bytes.len - 1], options, seeded, null);
                try std.testing.expect(broken.failure != null);
                try std.testing.expect(broken.events > 0);
            }
        }
    }
}

test "section transition parity bounded scanner and XML zero exact overflow budgets" {
    const input = prefix ++ "<p:p><p:run><p:t>A&amp;<![CDATA[B]]><p:tab/>C</p:t><p:t>D</p:t></p:run></p:p>" ++ suffix;
    const complete = try compare(input, .{}, .{}, null);
    try std.testing.expect(complete.failure == null);
    inline for (.{ "max_text_elements", "max_inline_elements", "max_text_bytes" }) |field| {
        const used: usize = if (comptime std.mem.eql(u8, field, "max_text_elements")) complete.report.text_elements else if (comptime std.mem.eql(u8, field, "max_text_bytes")) complete.report.text_bytes else complete.report.inlineCount(.tab);
        for ([_]usize{ 0, used - 1, used, used + 1 }) |limit| {
            var options: current.Options = .{};
            @field(options, field) = limit;
            const result = try compare(input, options, .{}, null);
            try std.testing.expectEqual(limit < used, result.failure != null);
        }
    }
    const lexical = try document_xml.visitBytes(a, input, input.len, .{}, null);
    inline for (.{ "max_elements", "max_events", "max_attributes", "max_references", "max_depth" }) |field| {
        const used = @field(lexical, if (std.mem.eql(u8, field, "max_depth")) "max_depth" else field[4..]);
        for ([_]usize{ 0, used - 1, used, used + 1 }) |limit| {
            var options: current.Options = .{};
            @field(options.xml, field) = limit;
            const result = try compare(input, options, .{}, null);
            try std.testing.expectEqual(limit < used, result.failure != null);
        }
    }
    for ([_]usize{ 0, input.len - 1, input.len, input.len + 1 }) |limit| {
        const result = try compare(input, .{ .max_section_xml_bytes = limit }, .{}, null);
        try std.testing.expectEqual(limit < input.len, result.failure != null);
    }
    const attribute = prefix ++ "<p:p><p:run><p:switch><p:case p:required-namespace='urn:feature'><p:t>A</p:t></p:case><p:default><p:t>B</p:t></p:default></p:switch></p:run></p:p>" ++ suffix;
    for ([_]usize{ 0, "urn:feature".len - 1, "urn:feature".len, "urn:feature".len + 1 }) |limit| {
        var options = policies[2];
        options.max_attribute_bytes = limit;
        const result = try compare(attribute, options, .{}, null);
        try std.testing.expectEqual(limit < "urn:feature".len, result.failure != null);
    }
}

const MasterCapture = struct { trace: Trace, report: ?current.MasterReport, failure: ?anyerror };
const MasterOutcome = struct { events: usize, failure: ?anyerror, report: ?current.MasterReport };

fn captureMaster(comptime Impl: type, archive: zip.Archive, parts: []const master_parts.Part, options: current.MasterOptions, fail_after: ?usize) !MasterCapture {
    const adapted: Impl.MasterOptions = .{ .max_parts = options.max_parts, .max_part_xml_bytes = options.max_part_xml_bytes, .max_total_xml_bytes = options.max_total_xml_bytes, .scan = optionsFor(Impl, options.scan) };
    var trace: Trace = .{ .fail_after = fail_after };
    errdefer trace.deinit();
    const report = Impl.inspectMasterPages(a, archive, parts, adapted, .{ .context = &trace, .on_event = Adapter(Impl).event }) catch |err| {
        if (err == error.OutOfMemory) return err;
        // This public API does not expose its local partial Report on failure.
        return .{ .trace = trace, .report = null, .failure = err };
    };
    return .{ .trace = trace, .failure = null, .report = .{ .parts = report.parts, .sub_lists = report.sub_lists, .xml_bytes = report.xml_bytes, .text = normalizeReport(report.text) } };
}

fn compareMaster(archive: zip.Archive, parts: []const master_parts.Part, options: current.MasterOptions, fail_after: ?usize) !MasterOutcome {
    var old = try captureMaster(before, archive, parts, options, fail_after);
    defer old.trace.deinit();
    var fresh = try captureMaster(current, archive, parts, options, fail_after);
    defer fresh.trace.deinit();
    try std.testing.expectEqual(old.failure, fresh.failure);
    try std.testing.expectEqualDeep(old.report, fresh.report);
    try std.testing.expectEqualDeep(old.trace.items.items, fresh.trace.items.items);
    for (fresh.trace.items.items) |event| try std.testing.expectEqual(@as(usize, @backingInt(current.PartKind.master_page)), event.location[5]);
    return .{ .events = fresh.trace.items.items.len, .failure = fresh.failure, .report = fresh.report };
}

const master_prefix = "<masterPage xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>";
const master_one = master_prefix ++
    "<x:subList><p:p><p:run><p:t>excluded foreign list</p:t></p:run></p:p></x:subList>" ++
    "<p:subList><p:p/><p:p><p:run><p:t>A&amp;<![CDATA[B]]><p:tab/>C</p:t>" ++
    "<p:dutmal><p:mainText>main</p:mainText><p:subText>sub</p:subText></p:dutmal></p:run></p:p>" ++
    "</p:subList><p:outside><p:p><p:run><p:t>excluded outside</p:t></p:run></p:p></p:outside></masterPage>";
const master_two = master_prefix ++ "<p:subList><p:p><p:run><p:switch>" ++
    "<p:case p:required-namespace='urn:feature'><p:p><p:run><p:t>X</p:t></p:run></p:p></p:case>" ++
    "<p:default><p:p><p:run><p:t>Y</p:t></p:run></p:p></p:default>" ++
    "</p:switch></p:run></p:p></p:subList></masterPage>";

// Minimal Parts borrow local names/SubLists for the call; no Part owner is
// constructed or destroyed. The ZIP is real stored ZIP with verified CRCs.
fn withMasters(inputs: [2][]const u8, raw_paragraphs: [2]usize, options: current.MasterOptions, fail_after: ?usize) !MasterOutcome {
    const names = [_][]const u8{ "Contents/masterpage0.xml", "Contents/masterpage1.xml" };
    const bytes = try fixture.storedZip(a, &.{ .{ .name = names[0], .data = inputs[0] }, .{ .name = names[1], .data = inputs[1] } });
    defer a.free(bytes);
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    var lists: [2]master_parts.SubList = .{ std.mem.zeroes(master_parts.SubList), std.mem.zeroes(master_parts.SubList) };
    var parts: [2]master_parts.Part = undefined;
    var owned_names: [2][]u8 = undefined;
    var initialized: usize = 0;
    defer for (owned_names[0..initialized]) |name| a.free(name);
    for (&parts, 0..) |*part, index| {
        owned_names[index] = try a.dupe(u8, names[index]);
        initialized += 1;
        lists[index].paragraph_metadata.paragraphs = raw_paragraphs[index];
        lists[index].direct_paragraphs = if (index == 0) 2 else 1;
        part.* = .{ .href = owned_names[index], .id = owned_names[index], .entry_index = index, .item_index = 31 - index * 7, .type_name = null, .kind = null, .page_number = null, .page_duplicate = null, .page_front = null, .sub_lists = lists[index .. index + 1], .other_direct_elements = 0, .descendant_elements = 0, .manifest_id_matches = true };
    }
    return compareMaster(archive, &parts, options, fail_after);
}

test "section transition parity master page public stream scopes parts branches and callback prefixes" {
    for (policies) |policy| {
        const options: current.MasterOptions = .{ .scan = policy };
        const complete = try withMasters(.{ master_one, master_two }, .{ 2, 3 }, options, null);
        try std.testing.expect(complete.failure == null);
        try std.testing.expectEqual(@as(usize, 2), complete.report.?.parts);
        for (0..complete.events) |limit| {
            const result = try withMasters(.{ master_one, master_two }, .{ 2, 3 }, options, limit);
            try std.testing.expectEqual(@as(?anyerror, error.ParityCallbackStopped), result.failure);
            try std.testing.expectEqual(limit, result.events);
        }
    }
    const mismatch = try withMasters(.{ master_one, master_two }, .{ 99, 3 }, .{}, null);
    try std.testing.expectEqual(@as(?anyerror, error.InconsistentMasterPageSelection), mismatch.failure);
}

test "section transition parity master page budgets malformed inactive XML and UTF16" {
    const exact_bytes = master_one.len + master_two.len;
    inline for (.{ "max_parts", "max_part_xml_bytes", "max_total_xml_bytes" }) |field| {
        const used: usize = if (comptime std.mem.eql(u8, field, "max_parts")) 2 else if (comptime std.mem.eql(u8, field, "max_total_xml_bytes")) exact_bytes else @max(master_one.len, master_two.len);
        for ([_]usize{ 0, used - 1, used, used + 1 }) |limit| {
            var options: current.MasterOptions = .{};
            @field(options, field) = limit;
            const result = try withMasters(.{ master_one, master_two }, .{ 2, 3 }, options, null);
            try std.testing.expectEqual(limit < used, result.failure != null);
        }
    }
    const complete = try withMasters(.{ master_one, master_two }, .{ 2, 3 }, .{}, null);
    inline for (.{ "max_text_elements", "max_inline_elements", "max_text_bytes" }) |field| {
        const used: usize = if (comptime std.mem.eql(u8, field, "max_text_elements")) complete.report.?.text.text_elements else if (comptime std.mem.eql(u8, field, "max_text_bytes")) complete.report.?.text.text_bytes else complete.report.?.text.inlineCount(.tab);
        for ([_]usize{ 0, used - 1, used, used + 1 }) |limit| {
            var options: current.MasterOptions = .{};
            @field(options.scan, field) = limit;
            const result = try withMasters(.{ master_one, master_two }, .{ 2, 3 }, options, null);
            try std.testing.expectEqual(limit < used, result.failure != null);
        }
    }
    const wrong_root = try withMasters(.{ master_one, "<other><undeclared:t/></other>" }, .{ 2, 0 }, .{}, null);
    try std.testing.expectEqual(@as(?anyerror, error.InvalidMasterPageRoot), wrong_root.failure);
    const bad = master_prefix ++ "<p:subList><p:p><p:run><p:t>prefix</p:t><p:switch><p:case p:required-namespace='urn:missing'><undeclared:t/></p:case><p:default><p:t>ok</p:t></p:default></p:switch></p:run></p:p></p:subList></masterPage>";
    const malformed = try withMasters(.{ master_one, bad }, .{ 2, 1 }, .{ .scan = policies[1] }, null);
    try std.testing.expect(malformed.failure != null);
    try std.testing.expect(malformed.events > 0);
    inline for (.{ std.builtin.Endian.little, std.builtin.Endian.big }) |endian| {
        const one = try utf16(master_one, endian);
        defer a.free(one);
        const two = try utf16(master_two, endian);
        defer a.free(two);
        const wide = try withMasters(.{ one, two }, .{ 2, 3 }, .{}, null);
        try std.testing.expect(wide.failure == null);
    }
}
