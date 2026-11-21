//! Exact registered-presentation profile and grouped copy-on-write asset. No in-place original overwrite.
const std = @import("std");
const cfb = @import("../../cfb/reader.zig");
const store = @import("created_resources.zig");
const png = @import("create_png_presentation.zig");
pub const Input = struct {
    file: cfb.File,
    xml_entry: usize,
    presentation_entry: usize,
    width: u32,
    height: u32,
    pub fn deinit(self: *Input) void {
        self.file.deinit();
        self.* = undefined;
    }
    pub fn xml(self: *const Input) []const u8 {
        return self.file.entries[self.xml_entry].content;
    }
};
pub fn open(a: std.mem.Allocator, bytes: []const u8, expected: [32]u8, limit: usize) !Input {
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &digest, .{});
    if (!std.mem.eql(u8, &digest, &expected)) return error.SourceBindingMismatch;
    var file = try @import("../../ole/container.zig").open(a, bytes, .observed_size_prefix, .{ .strict = true, .max_input_bytes = limit, .max_stream_bytes = limit });
    errdefer file.deinit();
    const x = try file.findExact("/OOXMLChartContents") orelse return error.UnsupportedChartLiteralEditProfile;
    const p = try file.findExact("/\x02OlePres000") orelse return error.UnsupportedChartLiteralEditProfile;
    for (file.entries, 0..) |entry, i| {
        if (entry.kind == 0 or i == 0) continue;
        if (entry.kind != 2 or entry.parent != 0 or (i != x and i != p)) return error.UnsupportedChartLiteralEditProfile;
    }
    const presentation = file.entries[p].content;
    if (presentation.len < 40) return error.UnsupportedChartLiteralEditProfile;
    const width = std.mem.readInt(u32, presentation[28..32], .little);
    const height = std.mem.readInt(u32, presentation[32..36], .little);
    if (width < 64 or height < 64 or width > 2048 or height > 2048) return error.UnsupportedChartLiteralEditProfile;
    try png.verify(presentation, presentation[40..], width, height);
    const inspected = try @import("../../image/png/structure.zig").inspect(presentation[40..], .{ .max_pixels = 4 * 1024 * 1024 });
    if (inspected.header.width != width or inspected.header.height != height) return error.UnsupportedChartLiteralEditProfile;
    return .{ .file = file, .xml_entry = x, .presentation_entry = p, .width = width, .height = height };
}
pub const Prepared = struct {
    values: store.Values,
    ordinal: u16,
    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        self.values.deinit(a);
        self.* = undefined;
    }
};
pub fn prepare(a: std.mem.Allocator, file: *const cfb.File, previous: store.Values, docinfo: []const u8, version: @import("../version.zig").Version, source: *const Input, changed: *const @import("literal_edit_xml.zig").Prepared, rendered: @import("create_rendered_resources.zig").Payload, limit: usize) !Prepared {
    if (!changed.changed or previous.entries.len >= 128) return error.LimitExceeded;
    if (previous.docinfo) |bytes| if (!std.mem.eql(u8, bytes, docinfo)) return error.SourceBindingMismatch;
    if (rendered.pixel_width != source.width or rendered.pixel_height != source.height) return error.InvalidChartCreatePreviewPNG;
    try @import("create_rendered_resources.zig").validate(a, changed.data.data, rendered, .{});
    if (!std.mem.eql(u8, &rendered.source_xml_sha256, &changed.sha256)) return error.StaleChartCreatePreview;
    const presentation = try png.write(a, rendered.bytes, rendered.pixel_width, rendered.pixel_height, limit);
    defer a.free(presentation);
    const inner = try @import("../../cfb/stream_replace.zig").rebuildManyExact(a, &source.file, &.{
        .{ .path = "/OOXMLChartContents", .content = changed.xml },
        .{ .path = "/\x02OlePres000", .content = presentation },
    }, .{ .max_output_bytes = limit });
    defer a.free(inner);
    if (inner.len > limit -| 4 or inner.len > std.math.maxInt(u32)) return error.LimitExceeded;
    const ole = try a.alloc(u8, inner.len + 4);
    defer a.free(ole);
    std.mem.writeInt(u32, ole[0..4], @intCast(inner.len), .little);
    @memcpy(ole[4..], inner);
    var verified = try @import("../../ole/container.zig").open(a, ole, .observed_size_prefix, .{ .strict = true, .max_input_bytes = limit, .max_stream_bytes = limit });
    defer verified.deinit();
    const vx = try verified.findExact("/OOXMLChartContents") orelse return error.ChartLiteralEditVerificationFailed;
    const vp = try verified.findExact("/\x02OlePres000") orelse return error.ChartLiteralEditVerificationFailed;
    if (!std.mem.eql(u8, verified.entries[vx].content, changed.xml)) return error.ChartLiteralEditVerificationFailed;
    try png.verify(verified.entries[vp].content, rendered.bytes, source.width, source.height);
    var names: std.ArrayList([]const u8) = .empty;
    defer names.deinit(a);
    if (try file.findExact("/BinData")) |parent| for (file.entries) |entry| {
        if (entry.kind != 0 and entry.parent == parent) try names.append(a, entry.name);
    };
    for (previous.entries) |entry| {
        if (!std.mem.startsWith(u8, entry.path, "/BinData/")) return error.InvalidChartResourcePath;
        try names.append(a, entry.path[9..]);
    }
    var info = try @import("create_single_docinfo.zig").prepare(a, docinfo, version, names.items, limit);
    defer info.deinit(a);
    const path = try @import("../container/paths.zig").binary(a, info.ids.physical, &.{});
    defer a.free(path);
    var entries: std.ArrayList(store.Entry) = .empty;
    defer entries.deinit(a);
    try entries.appendSlice(a, previous.entries);
    try entries.append(a, .{ .ordinal = info.ids.ordinal, .physical = info.ids.physical, .path = path, .bytes = ole });
    const view: store.Values = .{ .docinfo = info.bytes, .entries = entries.items };
    return .{ .values = try view.clone(a, limit), .ordinal = info.ids.ordinal };
}
