//! Validate the actual complete HWP output before any live publication.
const std = @import("std");
pub fn verify(a: std.mem.Allocator, bytes: []const u8, request: @import("create_request.zig").Request, ordinal: u16, entry: @import("created_resources.zig").Entry) !void {
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    var resources = try @import("../edit/binary_resource_index.zig").Index.init(a, &source);
    defer resources.deinit(a);
    const records = resources.records;
    if (ordinal == 0 or ordinal > records.len) return error.ChartCreateVerificationFailed;
    const resource = records[ordinal - 1];
    if (resource.data != .storage or resource.data.storage != entry.physical or try resource.isCompressed(source.header.has(.compressed))) return error.ChartCreateVerificationFailed;
    const index = try source.file.findExact(entry.path) orelse return error.MissingHwpEntry;
    if (!std.mem.eql(u8, entry.bytes, source.file.entries[index].content)) return error.ChartCreateVerificationFailed;
    const raw = try source.decodeSection(a, request.target.section);
    defer a.free(raw);
    var projected = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer projected.deinit(a);
    const sites = try @import("ole_sites.zig").read(a, raw, source.header.version(), projected.sections[0].paragraphs, .spec24);
    defer a.free(sites);
    var matches: usize = 0;
    for (sites) |site| if (site.ordinal == ordinal) {
        if (site.geometry.width != request.box.width or site.geometry.height != request.box.height or site.attributes != 1 or site.opaque_tail_bytes != 0) return error.ChartCreateVerificationFailed;
        matches += 1;
    };
    if (matches != 1) return error.ChartCreateVerificationFailed;
}
