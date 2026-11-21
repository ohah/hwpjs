//! Own generated data and raster. Transport/record tests, never GUI paint evidence.
const std = @import("std");
const a = std.testing.allocator;
const edit = @import("../edit/style_preservation.zig");
const History = @import("../edit/history_v2.zig").History;
const Request = @import("create_request.zig").Request;
const profile = @import("create_profile.zig");
const horizontal = profile.Profile.spec24_registered_png_presentation_horizontal_bar_v1;
const bar = profile.Profile.spec24_registered_png_presentation_v1;
const png = @embedFile("test_fixtures/create-transport-bars-64.png");
const data: @import("../../hwpx/chart_create_data.zig").Data = .{
    .categories = &.{ "North", "East", "South" },
    .series = &.{ .{ .name = "Blue", .values = &.{ "30", "-10", "0" } }, .{ .name = "Orange", .values = &.{ "20", "-20", "10" } }, .{ .name = "Gray", .values = &.{ "10", "-30", "20" } }, .{ .name = "Gold", .values = &.{ "-10", "0", "30" } }, .{ .name = "LightBlue", .values = &.{ "-20", "10", "-10" } }, .{ .name = "Green", .values = &.{ "-30", "20", "-20" } } },
};
fn digest(bytes: []const u8) [32]u8 {
    var result: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &result, .{});
    return result;
}
const Fixture = struct {
    input: []u8,
    expected: []u8,
    session: *edit.Session,
    fn open() !Fixture {
        const input = try @import("../../new_document/hwp5.zig").create(a);
        errdefer a.free(input);
        const session = try edit.Session.open(a, input);
        errdefer session.close();
        session.enableHistoryDelta();
        const expected = try session.copyCurrentParagraphTextUtf16(a, 0, try session.currentSourceParagraphReference(0, 0));
        return .{ .input = input, .expected = expected, .session = session };
    }
    fn deinit(f: *Fixture) void {
        f.session.close();
        a.free(f.expected);
        a.free(f.input);
    }
    fn request(f: Fixture) !Request {
        const xml = try profile.create(a, data, horizontal);
        defer a.free(xml);
        return .{
            .target = .{ .section = 0, .binding = try f.session.historyTicket(), .anchor = .{ .host = .{ .original_node = (try f.session.paragraph(0, 0)).source_node.? }, .unit = 16 } },
            .expected_text_utf16le = f.expected,
            .box = .{ .width = 12000, .height = 12000 },
            .data = data,
            .rendered = .{ .source_xml_sha256 = digest(xml), .pixel_width = 64, .pixel_height = 64, .bytes = png },
            .profile = horizontal,
        };
    }
};
// Assertions inspect actual payload tokens/literals, never writer-produced expected XML.
fn checkXML(xml: []const u8) !void {
    try std.testing.expectEqualStrings(@embedFile("test_fixtures/own-horizontal-clustered-palette.xml"), xml);
}

fn checkSaved(bytes: []const u8, expected_hash: [32]u8) !void {
    const fresh = try edit.Session.open(a, bytes);
    defer fresh.close();
    const candidates = try fresh.hwp5ChartCandidatesWithLayout(a, .spec24);
    defer a.free(candidates);
    try std.testing.expectEqual(@as(usize, 1), candidates.len);
    const row = candidates[0];
    var display = try fresh.hwp5ChartDisplayWithLayout(a, row.section, row.owner.control_node, .spec24);
    defer display.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), display.values.plots.plots.len);
    try std.testing.expectEqual(@import("../../hwpx/chart_plot_kind.zig").Kind.barChart, display.values.plots.plots[0].kind);
    try std.testing.expectEqual(@import("../../hwpx/chart_plot_settings.zig").Direction.bar, display.values.plot_settings[0].direction.?.value.?);
    try std.testing.expectEqual(@import("../../hwpx/chart_plot_settings.zig").Grouping.clustered, display.values.plot_settings[0].grouping.?.value.?);
    try std.testing.expectEqual(@import("../../hwpx/chart_axis_values.zig").Position.l, display.values.axes.items[0].position.?.value.?);
    try std.testing.expectEqual(@import("../../hwpx/chart_axis_values.zig").Position.b, display.values.axes.items[1].position.?.value.?);
    // Resolve the saved ordinal/physical STORAGE through actual DocInfo and CFB.
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    var index = try @import("../edit/binary_resource_index.zig").Index.init(a, &source);
    defer index.deinit(a);
    const physical = try index.physicalId(row.owner.ordinal);
    const path = try @import("../container/paths.zig").binary(a, physical, &.{});
    defer a.free(path);
    const entry = try source.file.findExact(path) orelse return error.MissingChartStorage;
    var ole = try @import("../../ole/container.zig").open(a, source.file.entries[entry].content, .observed_size_prefix, .{ .strict = true });
    defer ole.deinit();
    const chart = try ole.findExact("/OOXMLChartContents") orelse return error.MissingChartXML;
    const xml = ole.entries[chart].content;
    try checkXML(xml);
    try std.testing.expectEqualSlices(u8, &expected_hash, &digest(xml));
    try std.testing.expectEqual(@as(?usize, null), try ole.findExact("/Contents"));
    const presentation = try ole.findExact("/\x02OlePres000") orelse return error.MissingChartPresentation;
    const p = ole.entries[presentation].content;
    try std.testing.expectEqual(@as(usize, 40 + png.len), p.len);
    try std.testing.expectEqualStrings("PNG\x00", p[4..8]);
    try std.testing.expectEqual(@as(u32, 64), std.mem.readInt(u32, p[28..32], .little));
    try std.testing.expectEqual(@as(u32, 64), std.mem.readInt(u32, p[32..36], .little));
    try std.testing.expectEqual(@as(u32, png.len), std.mem.readInt(u32, p[36..40], .little));
    try std.testing.expectEqualSlices(u8, png, p[40..]);
}
test "H5 horizontal chart explicit clustered profile preserves legacy column XML bytes" {
    const old = try @import("../../hwpx/chart_create_xml.zig").create(a, data);
    defer a.free(old);
    try std.testing.expectEqual(profile.Profile.spec24_registered_png_presentation_v1, try profile.decode("spec24-registered-png-presentation-v1"));
    try std.testing.expectEqual(profile.Profile.spec24_registered_png_presentation_line_v1, try profile.decode("spec24-registered-png-presentation-line-v1"));
    try std.testing.expectEqual(horizontal, try profile.decode("spec24-registered-png-presentation-horizontal-bar-v1"));
    try std.testing.expectEqual(@as(u32, 4), profile.version);
    const current = try profile.create(a, data, bar);
    defer a.free(current);
    try std.testing.expectEqualSlices(u8, old, current);
    const xml = try profile.create(a, data, horizontal);
    defer a.free(xml);
    try checkXML(xml);
}
test "H5 horizontal chart per type validation allows singleton and rejects ragged and XY auxiliary data" {
    const singleton: @import("../../hwpx/chart_create_data.zig").Data = .{ .categories = &.{"Only"}, .series = &.{.{ .name = "One", .values = &.{"1"} }} };
    try profile.validate(singleton, bar);
    try profile.validate(singleton, horizontal);
    const ragged: @import("../../hwpx/chart_create_data.zig").Data = .{ .categories = data.categories, .series = &.{.{ .name = "Ragged", .values = &.{"1"} }} };
    try std.testing.expectError(error.InvalidChartCreateShape, profile.validate(ragged, horizontal));
    const xy: @import("../../hwpx/chart_create_data.zig").Data = .{ .categories = data.categories, .series = &.{.{ .name = "XY", .values = &.{ "1", "2", "3" }, .x_values = &.{ "4", "5", "6" } }} };
    try std.testing.expectError(error.InvalidChartCreateShape, profile.validate(xy, horizontal));
}
test "H5 horizontal chart preview hash describes same typed XML with exact output cap" {
    const wire = try @import("create_preview.zig").writeFor(a, data, horizontal, 1048576);
    defer a.free(wire);
    var parsed = try std.json.parseFromSlice(std.json.Value, a, wire, .{});
    defer parsed.deinit();
    const xml = try profile.create(a, data, horizontal);
    defer a.free(xml);
    const hash = digest(xml);
    const values = parsed.value.object.get("xml_sha256").?.array.items;
    try std.testing.expectEqual(@as(usize, 32), values.len);
    for (hash, values) |byte, value| try std.testing.expectEqual(@as(i64, byte), value.integer);
    const exact = try @import("create_preview.zig").writeFor(a, data, horizontal, wire.len);
    defer a.free(exact);
    try std.testing.expectEqualSlices(u8, wire, exact);
    try std.testing.expectError(error.LimitExceeded, @import("create_preview.zig").writeFor(a, data, horizontal, wire.len - 1));
}
test "H5 horizontal chart saved raw OOXML fresh disk reopen undo redo exact full bytes" {
    var f = try Fixture.open();
    defer f.deinit();
    const history = try History.create(a, f.session, .{});
    defer history.deinit();
    const request = try f.request();
    try std.testing.expect(try history.applyBatch(f.session, &.{.{ .insert_chart = request }}));
    const saved = try f.session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try checkSaved(saved.bytes, request.rendered.source_xml_sha256);
    var tmp = std.testing.tmpDir(.{});
    defer tmp.cleanup();
    try tmp.dir.writeFile(std.testing.io, .{ .sub_path = "own-horizontal.hwp", .data = saved.bytes });
    const disk = try tmp.dir.readFileAlloc(std.testing.io, "own-horizontal.hwp", a, .limited(64 * 1024 * 1024));
    defer a.free(disk);
    try checkSaved(disk, request.rendered.source_xml_sha256);
    try std.testing.expectEqualSlices(u8, saved.bytes, disk);
    try std.testing.expect(try history.undo(f.session));
    const undo = try f.session.save(a, .{});
    defer a.free(undo.bytes);
    try std.testing.expectEqualSlices(u8, f.input, undo.bytes);
    try std.testing.expect(try history.redo(f.session));
    const redo = try f.session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redo.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redo.bytes);
}
fn refusesWithRedo(comptime wrong: enum { bar_hash, bar_profile, source }) !void {
    var f = try Fixture.open();
    defer f.deinit();
    const history = try History.create(a, f.session, .{});
    defer history.deinit();
    const valid = try f.request();
    try std.testing.expect(try history.applyBatch(f.session, &.{.{ .insert_chart = valid }}));
    const saved = try f.session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try std.testing.expect(try history.undo(f.session));
    var bad = try f.request();
    const text = try a.dupe(u8, f.expected);
    defer a.free(text);
    if (wrong == .bar_hash) {
        const xml = try profile.create(a, data, bar);
        defer a.free(xml);
        bad.rendered.source_xml_sha256 = digest(xml);
    } else if (wrong == .bar_profile) {
        bad.profile = bar;
    } else {
        text[0] ^= 1;
        bad.expected_text_utf16le = text;
    }
    try std.testing.expectError(if (wrong == .source) error.SourceBindingMismatch else error.StaleChartCreatePreview, history.applyBatch(f.session, &.{.{ .insert_chart = bad }}));
    const refused = try f.session.save(a, .{});
    defer a.free(refused.bytes);
    try std.testing.expectEqualSlices(u8, f.input, refused.bytes);
    try std.testing.expect(try history.redo(f.session));
    const redo = try f.session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redo.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redo.bytes);
}
test "H5 horizontal chart wrong bar preview digest preserves valid redo and original bytes" {
    try refusesWithRedo(.bar_hash);
}
test "H5 horizontal chart horizontal PNG binding cannot be relabeled as column profile" {
    try refusesWithRedo(.bar_profile);
}
test "H5 horizontal chart stale source witness preserves valid redo and original bytes" {
    try refusesWithRedo(.source);
}
test "H5 horizontal chart rejects payload dimensions inconsistent with actual PNG" {
    var f = try Fixture.open();
    defer f.deinit();
    var request = try f.request();
    request.rendered.pixel_width = 65;
    try std.testing.expectError(error.InvalidChartCreatePreviewPNG, @import("create_rendered_resources.zig").validateFor(a, data, horizontal, request.rendered, .{}));
}
test "H5 horizontal chart detached resource allocation preserves previous chart and uses distinct IDs" {
    var f = try Fixture.open();
    defer f.deinit();
    var source = try @import("../text_source.zig").Source.open(a, f.input);
    defer source.deinit();
    const info = try source.decodeDocInfo(a, 1048576);
    defer a.free(info);
    const single = @import("create_single_asset.zig");
    const request = try f.request();
    var first = try single.prepare(a, &source.file, .{}, info, source.header.version(), request, 1048576);
    defer first.deinit(a);
    var next = try single.prepare(a, &source.file, first.values, first.values.docinfo.?, source.header.version(), request, 1048576);
    defer next.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), first.values.entries.len);
    try std.testing.expectEqual(@as(usize, 2), next.values.entries.len);
    try std.testing.expect(first.ordinal != next.ordinal);
    try std.testing.expect(first.values.entries[0].physical != next.values.entries[1].physical);
    try std.testing.expectEqualSlices(u8, first.values.entries[0].bytes, next.values.entries[0].bytes);
}
test "H5 horizontal chart nonfinite numbers and invalid Unicode never reach serializer" {
    for ([_][]const u8{ "NaN", "Infinity", "-Infinity" }) |value| {
        const invalid: @import("../../hwpx/chart_create_data.zig").Data = .{ .categories = data.categories, .series = &.{.{ .name = "Invalid", .values = &.{ value, "0", "1" } }} };
        try std.testing.expectError(error.InvalidChartNumericValue, profile.validate(invalid, horizontal));
    }
    const invalid_text: @import("../../hwpx/chart_create_data.zig").Data = .{ .categories = &.{ "\xff", "Valid" }, .series = &.{.{ .name = "Invalid text", .values = &.{ "0", "1" } }} };
    try std.testing.expectError(error.InvalidUtf8, profile.validate(invalid_text, horizontal));
}

fn previewAllocationCase(allocator: std.mem.Allocator) !void {
    const small: @import("../../hwpx/chart_create_data.zig").Data = .{ .categories = &.{ "A", "B" }, .series = &.{.{ .name = "Signed", .values = &.{ "-1", "1" } }} };
    const xml = try profile.create(allocator, small, horizontal);
    defer allocator.free(xml);
    const preview = try @import("create_preview.zig").writeFor(allocator, small, horizontal, 1048576);
    defer allocator.free(preview);
    try std.testing.expect(std.mem.indexOf(u8, xml, "<c:barDir val=\"bar\"/>") != null);
}
test "H5 horizontal chart exhaustive checked source and preview allocation failures" {
    try @import("../../testing/allocation_failures.zig").check(previewAllocationCase, .{});
}
test "H5 horizontal chart retained click field nested host refuses without changing source" {
    const retained = @import("../edit/click_retained_fixture.zig");
    const raw = try retained.bytes(a);
    defer a.free(raw);
    const before = try a.dupe(u8, raw);
    defer a.free(before);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, retained.version, &.{raw});
    defer document.deinit(a);
    var f = try Fixture.open();
    defer f.deinit();
    var request = try f.request();
    const paragraph = document.sections[0].paragraphs[1];
    request.target.anchor = .{ .host = .{ .original_node = paragraph.source_node.? }, .unit = 8 };
    const expected = try @import("../edit/plain_text_content.zig").textBytes(a, paragraph);
    defer a.free(expected);
    request.expected_text_utf16le = expected;
    const Tables = @import("../edit/created_table_values.zig").Values;
    try std.testing.expectError(error.UnsupportedChartHost, @import("create_session.zig").prepare(a, &.{raw}, &document, &[_]Tables{.{}}, .{}, retained.version, request, 1, .{
        .paragraphs = .{ .char_shapes = 1, .para_shapes = 1, .styles = 1 },
        .border_count = 1,
    }, .{ .max_cells = 16, .max_bytes = 1048576 }));
    try std.testing.expectEqualSlices(u8, before, raw);
}
