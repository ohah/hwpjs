// 기존 공유 helper는 보존하고 이 보호 fixture에만 사용합니다.
const std = @import("std");
const editor = @import("editor_session.zig");
const fixtures = @import("note_protection_fixtures.zig");
const fixture = @import("note_delete_fixtures.zig");
const base = fixtures.base;
const withOutside = fixtures.withOutside;
const replacePart = fixtures.replacePart;
const hp = @import("document_xml.zig").paragraph_uri;
const plain_host = "<hp:p id='98768' paraPrIDRef='0' styleIDRef='0'><hp:run charPrIDRef='0'><hp:t/></hp:run></hp:p>";
fn plainParagraph(a: std.mem.Allocator, input: []const u8) !usize {
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    var selected: ?usize = null;
    for (tree.elements, 0..) |element, index| {
        if (!element.is(hp, "p") or !std.mem.eql(u8, tree.sourceOf(index), plain_host)) continue;
        if (selected != null) return error.InvalidNoteTestFixture;
        selected = index;
    }
    const node = selected orelse return error.InvalidNoteTestFixture;
    const scanner = @import("section_text.zig");
    const Context = struct {
        tree: *const @import("xml_part_tree.zig").Tree,
        node: usize,
        paragraph: ?usize = null,
        fn event(raw: *anyopaque, value: scanner.Event) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            if (value != .paragraph_start) return;
            const boundary = value.paragraph_start;
            const index = try self.tree.startTagIndex(boundary.tag.raw);
            if (index != self.node) return;
            if (self.paragraph != null or boundary.location.section_ordinal != 0) return error.InvalidNoteTestFixture;
            self.paragraph = boundary.location.paragraph_ordinal;
        }
    };
    var context: Context = .{ .tree = tree, .node = node };
    var report: scanner.Report = .{};
    try scanner.scanSource(a, tree.source, tree.section_ordinal orelse return error.InvalidSectionIndex, tree.item_index, .{}, &report, .{ .context = &context, .on_event = Context.event });
    return context.paragraph orelse error.InvalidNoteTestFixture;
}

pub fn withPicturePlain(a: std.mem.Allocator, cache: []const u8, lexical: []const u8) ![]u8 {
    const original = try @import("../new_document/hwpx.zig").create(a);
    defer a.free(original);
    const blank = try fixtures.withOutside(a, original, "", plain_host);
    defer a.free(blank);
    const paragraph = try plainParagraph(a, blank);
    const png = try @import("../image/png/rgba_fixture.zig").image(a, 1, 1, 8, 6, 0, &.{ 0, 0, 0, 0, 255 }, null, null);
    defer a.free(png);
    var inserted = try @import("image_insertion_file.zig").prepare(a, blank, png, .{ .expected_source_sha256 = @import("note_removal_plan.zig").digest(blank), .target = .{ .section = 0, .paragraph = std.math.cast(u32, paragraph) orelse return error.LimitExceeded, .unit = 0 }, .expected_text = "", .width = 100, .height = 100 });
    defer inserted.deinit(a);
    var image_session = try editor.open(a, inserted.bytes, .{});
    defer image_session.deinit();
    const tree = &image_session.sections[0].tree;
    var picture: ?usize = null;
    for (tree.elements, 0..) |element, index| if (element.is(hp, "pic")) {
        picture = index;
    };
    const node = picture orelse return error.InvalidNoteTestFixture;
    const changed_tag = try @import("xml_scalar_attributes_upsert.zig").write(a, tree, node, &.{"lock"}, .{lexical}, 100_000);
    defer a.free(changed_tag);
    const element = tree.elements[node];
    const fragment = try std.fmt.allocPrint(a, "{s}{s}", .{ changed_tag, tree.source[element.start_tag.end..element.end] });
    defer a.free(fragment);
    const outside = try std.fmt.allocPrint(a, "<hp:p id='98766' paraPrIDRef='0' styleIDRef='0'><hp:run charPrIDRef='0'>{s}<hp:t>outside picture</hp:t></hp:run>{s}</hp:p>", .{ fragment, cache });
    defer a.free(outside);
    const notes = try base(a, fixture.foot);
    defer a.free(notes);
    const combined = try withOutside(a, notes, "", outside);
    defer a.free(combined);
    var combined_zip = try @import("../zip/archive.zig").open(a, combined, .{});
    defer combined_zip.deinit();
    const combined_xml = try combined_zip.decode(combined_zip.find("Contents/section0.xml").?, 1_000_000);
    defer a.free(combined_xml);
    const output = try replacePart(a, inserted.bytes, image_session.sections[0].entry_index, combined_xml);
    errdefer a.free(output);
    var verified = try @import("../zip/archive.zig").open(a, output, .{});
    defer verified.deinit();
    const resource = verified.find(inserted.resource_path) orelse return error.InvalidNoteTestFixture;
    const bytes = try verified.decode(resource, 1_000_000);
    defer a.free(bytes);
    try std.testing.expectEqualSlices(u8, png, bytes);
    return output;
}
