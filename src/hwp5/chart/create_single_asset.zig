//! Detached resource and OLE presentation candidate. No live Session mutation.
const std = @import("std");
const store = @import("created_resources.zig");
pub const Prepared = struct {
    values: store.Values,
    ordinal: u16,
    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        self.values.deinit(a);
        self.* = undefined;
    }
};
pub fn prepare(a: std.mem.Allocator, file: *const @import("../../cfb/reader.zig").File, previous: store.Values, docinfo: []const u8, version: @import("../version.zig").Version, request: @import("create_request.zig").Request, limit: usize) !Prepared {
    try @import("create_request.zig").validate(request);
    try @import("create_rendered_resources.zig").validateFor(a, request.data, request.profile, request.rendered, .{});
    if (previous.docinfo) |bytes| if (!std.mem.eql(u8, bytes, docinfo)) return error.SourceBindingMismatch;
    if (previous.entries.len >= 128) return error.LimitExceeded;
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
    const xml = try @import("create_profile.zig").create(a, request.data, request.profile);
    defer a.free(xml);
    const presentation = try @import("create_png_presentation.zig").write(a, request.rendered.bytes, request.rendered.pixel_width, request.rendered.pixel_height, limit);
    defer a.free(presentation);
    const inner = try @import("../../cfb/writer.zig").write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "OOXMLChartContents", .parent = 0, .content = xml },
        .{ .name = @import("create_png_presentation.zig").stream_name, .parent = 0, .content = presentation },
    }, .{ .limits = .{ .max_input_bytes = limit, .max_stream_bytes = limit } });
    defer a.free(inner);
    const length = std.math.add(usize, inner.len, 4) catch return error.LimitExceeded;
    if (length > limit) return error.LimitExceeded;
    const ole = try a.alloc(u8, length);
    defer a.free(ole);
    std.mem.writeInt(u32, ole[0..4], std.math.cast(u32, inner.len) orelse return error.LimitExceeded, .little);
    @memcpy(ole[4..], inner);
    var checked = try @import("../../ole/container.zig").open(a, ole, .observed_size_prefix, .{ .strict = true, .max_input_bytes = limit, .max_stream_bytes = limit });
    defer checked.deinit();
    const x = try checked.findExact("/OOXMLChartContents") orelse return error.ChartCreateVerificationFailed;
    const p = try checked.findExact("/\x02OlePres000") orelse return error.ChartCreateVerificationFailed;
    if (!std.mem.eql(u8, checked.entries[x].content, xml)) return error.ChartCreateVerificationFailed;
    try @import("create_png_presentation.zig").verify(checked.entries[p].content, request.rendered.bytes, request.rendered.pixel_width, request.rendered.pixel_height);
    const path = try @import("../container/paths.zig").binary(a, info.ids.physical, &.{});
    defer a.free(path);
    var entries: std.ArrayList(store.Entry) = .empty;
    defer entries.deinit(a);
    try entries.appendSlice(a, previous.entries);
    try entries.append(a, .{ .ordinal = info.ids.ordinal, .physical = info.ids.physical, .path = path, .bytes = ole });
    const view: store.Values = .{ .docinfo = info.bytes, .entries = entries.items };
    return .{ .values = try view.clone(a, limit), .ordinal = info.ids.ordinal };
}
