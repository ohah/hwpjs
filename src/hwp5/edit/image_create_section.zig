//! Existing own drawing splice/remap; no chart payload, layout bypass, or opaque template.
const std = @import("std");
const Request = @import("image_create_request.zig").Request;
const Version = @import("../version.zig").Version;
const model = @import("../../model/document.zig");
// Ephemeral author-only context. The file version is from the current source,
// never an ABI/client field and never retained by History.
const DrawingRequest = struct {
    target: @import("equation_create_request.zig").Target,
    expected_text_utf16le: []const u8,
    box: @import("equation_create_request.zig").Box,
    image: []const u8,
    version: Version,
    fn plain(self: DrawingRequest) Request {
        return .{ .target = self.target, .expected_text_utf16le = self.expected_text_utf16le, .box = self.box, .image = self.image };
    }
};

pub fn write(a: std.mem.Allocator, raw: []const u8, version: Version, current: model.Section, index: usize, req: Request, id: u32, ordinal: u16, char_count: usize, limit: usize) !@import("../chart/create_section.zig").Result {
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    try @import("field_free_section.zig").validate(tree);
    if (index >= current.paragraphs.len) return error.InvalidParagraph;
    const p = current.paragraphs[index];
    if (p.parent_node != null) return error.UnsupportedPictureInsertionHost;
    if (p.range_tags) |ranges| if (ranges.len != 0) return error.UnsupportedRangeSemantics;
    const text = try @import("plain_text_content.zig").textBytes(a, p);
    defer a.free(text);
    try @import("control_boundaries.zig").validate(text, req.target.anchor.unit, req.target.anchor.unit);
    var it = try @import("../body/text.zig").Iterator.init(text);
    var prefix: usize = 0;
    while (try it.next()) |token| {
        if (token.value != .control) continue;
        const control = token.value.control;
        if (control.code == 13 and token.start_unit + 1 == text.len / 2) continue;
        if (control.code == 2 and token.start_unit == prefix) {
            const control_id = std.mem.readInt(u32, control.data[0..4], .little);
            const rules = @import("../body/control_rules.zig");
            if (control_id == rules.section_id or control_id == rules.column_id) {
                prefix = token.start_unit + 8;
                continue;
            }
        }
        return error.UnsupportedPictureInsertionControl;
    }
    if (req.target.anchor.unit < prefix) return error.InvalidPictureInsertionPosition;
    const drawing: DrawingRequest = .{ .target = req.target, .expected_text_utf16le = req.expected_text_utf16le, .box = req.box, .image = req.image, .version = version };
    return @import("../chart/create_section.zig").writeWith(a, raw, version, current, index, drawing, id, ordinal, char_count, limit, Author);
}
const Author = struct {
    pub fn create(a: std.mem.Allocator, req: DrawingRequest, id: u32, level: u10, ordinal: u16, limit: usize) !@import("equation_create_records.zig").Fragment {
        try @import("image_create_request.zig").validate(req.plain());
        const raster = try @import("../../image/picture_input.zig").inspectRaster(req.image, 8 * 1024 * 1024);
        const payloads = try @import("image_insertion_records.zig").create(req.version, .{ .width = req.box.width, .height = req.box.height }, raster.pixels, ordinal, id);
        return .{ .allocator = a, .anchor = payloads.text_control, .records = try @import("image_insertion_records.zig").encode(a, &payloads, level, limit) };
    }
    pub fn verify(a: std.mem.Allocator, raw: []const u8, version: Version, id: u32, ordinal: u16, req: DrawingRequest) !void {
        try verifyDrawing(a, raw, version, id, ordinal, req.plain(), null);
    }
};
/// Base-prefix inventory preserves unrelated legacy tails; inspect the new site's exact prefix.
pub fn verifyDrawing(a: std.mem.Allocator, raw: []const u8, version: Version, id: u32, ordinal: u16, req: Request, anchor: ?u32) !void {
    const sites = try @import("picture_sources.zig").read(a, raw, version, .base73);
    defer a.free(sites);
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    var links = try @import("../body/control_links.zig").Links.build(a, tree);
    defer links.deinit(a);
    var found: usize = 0;
    for (sites) |site| if (site.bin_data_id == ordinal) {
        const picture = try @import("../body/shape_picture.zig").Picture.parse(tree.nodes[site.picture_node].record.framing.payload, .interleaved, .with_instance78);
        const common = try @import("../body/object_common.zig").parseControl(tree.nodes[site.owner_node].record.value.control_header);
        const raster = try @import("../../image/picture_input.zig").inspectRaster(req.image, 8 * 1024 * 1024);
        const source_size = try @import("image_insertion_profile.zig").sourceSize(raster.pixels);
        if (!std.meta.eql(picture.crop, [4]i32{ 0, 0, @intCast(source_size.width), @intCast(source_size.height) })) return error.PictureInsertionVerificationFailed;
        const profile = try @import("image_insertion_profile.zig").layout(version);
        const selected: ?@import("../body/picture_additional.zig").Layout = switch (profile) {
            .effects_only => null,
            .dimensions8 => .dimensions8,
            .with_alpha9 => .with_alpha9,
        };
        var tail_reader: @import("../../binary/reader.zig").Reader = .{ .bytes = picture.extra };
        const tail = try @import("../body/picture_tail.zig").Tail.read(&tail_reader, selected);
        if (tail.effects.flags != 0 or tail_reader.offset != picture.extra.len) return error.PictureInsertionVerificationFailed;
        if (tail.properties) |properties| if (properties.width != source_size.width or properties.height != source_size.height or (properties.alpha orelse 0) != 0) return error.PictureInsertionVerificationFailed;

        if (picture.instance_id != id or common.instance_id != id or common.width != req.box.width or common.height != req.box.height or common.flags & 1 == 0) return error.PictureInsertionVerificationFailed;
        if (anchor) |expected| {
            var matched: usize = 0;
            for (links.items) |link| if (link.control_node == site.owner_node and link.start_unit == expected) {
                matched += 1;
            };
            if (matched != 1) return error.PictureInsertionVerificationFailed;
        }
        found += 1;
    };
    if (found != 1) return error.PictureInsertionVerificationFailed;
}
