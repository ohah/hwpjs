const std = @import("std");
const Request = @import("image_create_request.zig").Request;
pub const Prepared = @import("../chart/create_session.zig").Prepared;
pub const validate = @import("image_create_request.zig").validate;
pub const write = @import("image_create_section.zig").write;
pub fn prepare(a: std.mem.Allocator, decoded: []const []u8, document: *const @import("../../model/document.zig").Document, pending: []const @import("created_table_values.zig").Values, backgrounds: @import("cell_background_values.zig").Values, version: @import("../version.zig").Version, request: Request, ordinal: u16, resources: @import("created_table_records.zig").Resources, limits: @import("created_table_records.zig").Limits) !Prepared {
    return @import("../chart/create_session.zig").prepareWith(a, decoded, document, pending, backgrounds, version, request, ordinal, resources, limits, @This());
}
pub fn verify(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, id: u32, ordinal: u16, request: Request, _: @import("../../model/document.zig").Section, _: usize, check_anchor: bool) !void {
    try @import("image_create_section.zig").verifyDrawing(a, raw, version, id, ordinal, request, if (check_anchor) request.target.anchor.unit else null);
}
pub fn verifyFile(a: std.mem.Allocator, bytes: []const u8, request: Request, ordinal: u16, entry: @import("../chart/created_resources.zig").Entry) !void {
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    var resources = try @import("binary_resource_index.zig").Index.init(a, &source);
    defer resources.deinit(a);
    if (ordinal == 0 or ordinal > resources.records.len) return error.PictureInsertionVerificationFailed;
    const resource = resources.records[ordinal - 1];
    if (resource.data != .embedding or resource.data.embedding.id != entry.physical or try resource.isCompressed(source.header.has(.compressed))) return error.PictureInsertionVerificationFailed;
    const index = try source.file.findExact(entry.path) orelse return error.MissingHwpEntry;
    if (!std.mem.eql(u8, source.file.entries[index].content, request.image) or !std.mem.eql(u8, entry.bytes, request.image)) return error.PictureInsertionVerificationFailed;
    const raw = try source.decodeSection(a, request.target.section);
    defer a.free(raw);
    const sites = try @import("picture_sources.zig").read(a, raw, source.header.version(), .base73);
    defer a.free(sites);
    var found: usize = 0;
    for (sites) |site| if (site.bin_data_id == ordinal) {
        found += 1;
    };
    if (found != 1) return error.PictureInsertionVerificationFailed;
    // Inventory uses base73 to preserve unrelated old tails. Read the newly
    // authored site's explicit prefix for its instance, never the absent field
    // of that conservative inventory view.
    var tree = try @import("source_tree.zig").parse(a, raw, source.header.version(), .{});
    defer tree.deinit(a);
    for (sites) |site| if (site.bin_data_id == ordinal) {
        const picture = try @import("../body/shape_picture.zig").Picture.parse(tree.nodes[site.picture_node].record.framing.payload, .interleaved, .with_instance78);
        const id = picture.instance_id orelse return error.PictureInsertionVerificationFailed;
        try @import("image_create_section.zig").verifyDrawing(a, raw, source.header.version(), id, ordinal, request, null);
    };
}
