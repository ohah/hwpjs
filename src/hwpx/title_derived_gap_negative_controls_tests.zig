//! 실제 두-marker Session의 source/output으로 검증합니다. node ID를 추정하지 않습니다.
const std = @import("std");
const editor = @import("editor_session.zig");
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Tree = @import("xml_part_tree.zig").Tree;
const Sites = @import("text_sites.zig").Sites;
const gap = @import("title_derived_gap.zig");
const paragraph_writer = @import("character_style_paragraph_xml.zig");
const a = std.testing.allocator;
const source_xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='1'><p:t>AB<p:titleMark ignore='1'/></p:t></p:run><p:run charPrIDRef='1'><p:t>CD<p:titleMark ignore='1'/></p:t></p:run></p:p></s:sec>";
const header_xml = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList><h:charProperties itemCnt='2'><h:charPr id='1' height='1000'/><h:charPr id='2' height='1200'/></h:charProperties></h:refList></h:head>";

const Marker = struct { element: usize, text: usize, run: usize };

fn markers(tree: *const Tree, owner: usize) ![2]Marker {
    var result: [2]Marker = undefined;
    var count: usize = 0;
    for (tree.elements, 0..) |element, index| {
        if (!@import("title_mark_axis.zig").retained(tree, index)) continue;
        const text = element.parent orelse return error.SourceBindingMismatch;
        const run = tree.elements[text].parent orelse return error.SourceBindingMismatch;
        if (tree.elements[run].parent != owner) continue;
        if (count == result.len) return error.UnexpectedMarkerCount;
        result[count] = .{ .element = index, .text = text, .run = run };
        count += 1;
    }
    try std.testing.expectEqual(result.len, count);
    return result;
}

const Fixture = struct {
    current: editor.Session,
    output: editor.Session,
    source_markers: [2]Marker,
    output_markers: [2]Marker,
    output_owner: usize,

    fn deinit(self: *Fixture, allocator: std.mem.Allocator) void {
        _ = allocator;
        self.output.deinit();
        self.current.deinit();
    }

    fn row(self: *const Fixture) *const Paragraph {
        return &self.current.sections[0].structure_values.?.paragraphs[0];
    }

    fn source(self: *const Fixture) *const Tree {
        return &self.current.sections[0].tree;
    }

    fn rendered(self: *const Fixture) *const Tree {
        return &self.output.sections[0].tree;
    }

    fn collect(self: *const Fixture, allocator: std.mem.Allocator, max_gaps: usize) ![]gap.Gap {
        var trace: std.ArrayList(usize) = .empty;
        defer trace.deinit(allocator);
        const bytes = try paragraph_writer.writeFieldsDirtyOptionsTrace(allocator, self.source(), self.row(), &.{}, editor.siteOptions(self.current.options), self.current.options.max_xml_bytes, &trace);
        defer allocator.free(bytes);
        return gap.collect(allocator, self.source(), self.row(), self.rendered(), self.output_owner, &self.output.sections[0].sites, max_gaps, trace.items);
    }
};

fn fixture(allocator: std.mem.Allocator) !Fixture {
    const input = try @import("test_formula_fixture.zig").zipWithSectionHeader(allocator, source_xml, header_xml);
    defer allocator.free(input);
    var current = try editor.open(allocator, input, .{});
    errdefer current.deinit();
    // AB/CD의 A와 C만 서식 변경합니다. 두 marker의 원본 raw XML은 동일합니다.
    try std.testing.expect(try current.setCharacterFormat(0, 1, 0, 1, 2));
    try std.testing.expect(try current.setCharacterFormat(0, 1, 2, 3, 2));
    const saved = try current.save();
    defer allocator.free(saved);
    var output = try editor.open(allocator, saved, .{});
    errdefer output.deinit();
    const row = &current.sections[0].structure_values.?.paragraphs[0];
    const owner = try @import("paragraph_site_owner.zig").resolve(&output.sections[0].tree, &output.sections[0].sites, output.sections[0].locations, output.sections[0].first_paragraph);
    const source_markers = try markers(&current.sections[0].tree, row.template_element);
    const output_markers = try markers(&output.sections[0].tree, owner);
    try std.testing.expect(source_markers[0].text != source_markers[1].text);
    try std.testing.expect(source_markers[0].run != source_markers[1].run);
    try std.testing.expectEqualStrings(current.sections[0].tree.sourceOf(source_markers[0].element), current.sections[0].tree.sourceOf(source_markers[1].element));
    for (source_markers, output_markers) |before, after| {
        try std.testing.expectEqualStrings(current.sections[0].tree.sourceOf(before.element), output.sections[0].tree.sourceOf(after.element));
    }
    return .{ .current = current, .output = output, .source_markers = source_markers, .output_markers = output_markers, .output_owner = owner };
}

const Frozen = struct {
    row: Paragraph,
    output_sites: Sites,
    source_xml: []u8,
    output_xml: []u8,
    source_zip: []u8,
    output_zip: []u8,

    fn capture(allocator: std.mem.Allocator, input: *const Fixture) !Frozen {
        var row = try input.row().clone(allocator);
        errdefer row.deinit(allocator);
        var output_sites = try input.output.sections[0].sites.clone(allocator);
        errdefer output_sites.deinit(allocator);
        const source = try allocator.dupe(u8, input.source().source);
        errdefer allocator.free(source);
        const rendered = try allocator.dupe(u8, input.rendered().source);
        errdefer allocator.free(rendered);
        const source_zip = try allocator.dupe(u8, input.current.source);
        errdefer allocator.free(source_zip);
        const output_zip = try allocator.dupe(u8, input.output.source);
        return .{ .row = row, .output_sites = output_sites, .source_xml = source, .output_xml = rendered, .source_zip = source_zip, .output_zip = output_zip };
    }

    fn deinit(self: *Frozen, allocator: std.mem.Allocator) void {
        allocator.free(self.output_zip);
        allocator.free(self.source_zip);
        allocator.free(self.output_xml);
        allocator.free(self.source_xml);
        self.output_sites.deinit(allocator);
        self.row.deinit(allocator);
    }

    fn check(self: *const Frozen, input: *const Fixture) !void {
        try std.testing.expectEqualDeep(self.row, input.row().*);
        try std.testing.expectEqualDeep(self.output_sites, input.output.sections[0].sites);
        try std.testing.expectEqualSlices(u8, self.source_xml, input.source().source);
        try std.testing.expectEqualSlices(u8, self.output_xml, input.rendered().source);
        try std.testing.expectEqualSlices(u8, self.source_zip, input.current.source);
        try std.testing.expectEqualSlices(u8, self.output_zip, input.output.source);
        try input.row().title_output_projection.?.validate(input.row());
    }
};

fn expectedGaps(allocator: std.mem.Allocator, input: *const Fixture) ![]gap.Gap {
    const result = try input.collect(allocator, std.math.maxInt(usize));
    errdefer allocator.free(result);
    try std.testing.expect(result.len >= input.source_markers.len);
    try std.testing.expectEqualDeep(input.row().title_output_projection.?.derived_gaps, result);
    for (input.source_markers) |marker| {
        var found: usize = 0;
        for (result) |entry| {
            if (entry.marker_element != marker.element) continue;
            try std.testing.expectEqual(marker.text, entry.text_element);
            try std.testing.expectEqual(marker.run, entry.run_element);
            found += 1;
        }
        try std.testing.expect(found != 0);
    }
    return result;
}

test "derived gap negative actual two marker source output mapping positive writer control" {
    var input = try fixture(a);
    defer input.deinit(a);
    var before = try Frozen.capture(a, &input);
    defer before.deinit(a);
    const collected = try expectedGaps(a, &input);
    defer a.free(collected);
    const plan = input.row().title_output_projection.?;
    const xml = try paragraph_writer.writeFieldsDirtyOptions(a, input.source(), input.row(), input.current.sections[0].field_dirty.items, plan.options, plan.max_xml_bytes);
    defer a.free(xml);
    try std.testing.expectEqualStrings(input.rendered().sourceOf(input.output_owner), xml);
    try before.check(&input);
}

test "derived gap negative recomputed digest wrong marker text run tuples reject writer" {
    var input = try fixture(a);
    defer input.deinit(a);
    var before = try Frozen.capture(a, &input);
    defer before.deinit(a);
    const markers_in_source = input.source_markers;
    for (0..3) |variant| {
        var forged = try input.row().clone(a);
        defer forged.deinit(a);
        const plan = &forged.title_output_projection.?;
        var selected: ?usize = null;
        for (plan.derived_gaps, 0..) |entry, index| {
            if (entry.marker_element == markers_in_source[0].element) {
                selected = index;
                break;
            }
        }
        const index = selected orelse return error.MissingFirstMarkerGap;
        switch (variant) {
            0 => plan.derived_gaps[index].marker_element = markers_in_source[1].element,
            1 => plan.derived_gaps[index].text_element = markers_in_source[1].text,
            2 => plan.derived_gaps[index].run_element = markers_in_source[1].run,
            else => unreachable,
        }
        plan.derived_gap_digest = gap.digest(plan.derived_gaps);
        // 여기서 성공해야 checksum mismatch가 아닌 writer의 binding 거부임을 확인합니다.
        try plan.validate(&forged);
        if (paragraph_writer.writeFieldsDirtyOptions(a, input.source(), &forged, input.current.sections[0].field_dirty.items, plan.options, plan.max_xml_bytes)) |xml| {
            a.free(xml);
            return error.ExpectedWriterSourceBindingMismatch;
        } else |err| {
            try std.testing.expectEqual(error.SourceBindingMismatch, err);
        }
        try plan.validate(&forged);
        try before.check(&input);
    }
}

test "derived gap negative direct collect exact N N minus one zero limits are atomic" {
    var input = try fixture(a);
    defer input.deinit(a);
    var before = try Frozen.capture(a, &input);
    defer before.deinit(a);
    const expected = try expectedGaps(a, &input);
    defer a.free(expected);
    const exact = try input.collect(a, expected.len);
    defer a.free(exact);
    try std.testing.expectEqualDeep(expected, exact);
    try before.check(&input);
    for ([_]usize{ expected.len - 1, 0 }) |limit| {
        if (input.collect(a, limit)) |unexpected| {
            a.free(unexpected);
            return error.ExpectedCollectLimitExceeded;
        } else |err| {
            try std.testing.expectEqual(error.LimitExceeded, err);
        }
        try before.check(&input);
    }
}

test "derived gap negative direct collect all allocation failures preserve both sessions" {
    var input = try fixture(a);
    defer input.deinit(a);
    var before = try Frozen.capture(a, &input);
    defer before.deinit(a);
    const expected = try expectedGaps(a, &input);
    defer a.free(expected);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, borrowed: *const Fixture, frozen: *const Frozen, known: []const gap.Gap) !void {
            defer frozen.check(borrowed) catch @panic("collect가 원본 상태를 변경했습니다");
            const result = try borrowed.collect(allocator, known.len);
            defer allocator.free(result);
            try std.testing.expectEqualDeep(known, result);
            // 일부 gap을 할당한 뒤 limit으로 거부되는 경로도 같은 전체 sweep에 포함합니다.
            if (borrowed.collect(allocator, known.len - 1)) |unexpected| {
                allocator.free(unexpected);
                return error.ExpectedCollectLimitExceeded;
            } else |err| {
                if (err == error.OutOfMemory) return err;
                try std.testing.expectEqual(error.LimitExceeded, err);
            }
        }
    }.run, .{ &input, &before, expected });
    try before.check(&input);
}
