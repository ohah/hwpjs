//! Owned equation snapshot wire. Parsing and anchor matching remain in their
//! existing HWP5 modules; a snapshot never retains borrowed Section bytes.
const std = @import("std");
const query = @import("equation_sources.zig");
const wire = @import("../../wasm/hwp5_equation_sources.zig");
const Version = @import("../version.zig").Version;
const Paragraph = @import("../../model/document.zig").Paragraph;
const Layout = @import("../body/equation.zig").Layout;
const max_output = 16 * 1024 * 1024;

pub fn encode(a: std.mem.Allocator, raw: []const u8, version: Version, paragraphs: []const Paragraph, layout: Layout) ![]u8 {
    const sites = try query.sites(a, raw, version, paragraphs, .{});
    defer a.free(sites);
    const sources = try query.read(a, raw, version, layout, .{});
    defer a.free(sources);
    if (sites.len != sources.len) return error.SourceBindingMismatch;
    var by_node: std.AutoHashMapUnmanaged(usize, query.Source) = .empty;
    defer by_node.deinit(a);
    for (sources) |source| {
        const entry = try by_node.getOrPut(a, source.equation_node);
        if (entry.found_existing) return error.SourceBindingMismatch;
        entry.value_ptr.* = source;
    }
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try out.appendSlice(a, "{\"schemaVersion\":1,\"sources\":[");
    for (sites, 0..) |site, index| {
        const source = by_node.fetchRemove(site.equation_node) orelse return error.SourceBindingMismatch;
        const detail = try wire.encodeSource(a, site, source.value, layout);
        defer a.free(detail);
        if (out.items.len > max_output - 3 or detail.len > max_output - out.items.len - 3) return error.LimitExceeded;
        if (index != 0) try out.append(a, ',');
        try out.appendSlice(a, detail);
    }
    if (by_node.count() != 0) return error.SourceBindingMismatch;
    try out.appendSlice(a, "]}");
    return out.toOwnedSlice(a);
}
