//! 수식 조회 wire. UTF16LE 원문을 JSON 문자열로 오인하지 않도록 u16 배열로 보낸다.
const std = @import("std");
const query = @import("../hwp5/edit/equation_sources.zig");
const Layout = @import("../hwp5/body/equation.zig").Layout;
const max_detail_bytes = 2 * 1024 * 1024;

pub fn layout(value: u32) !Layout {
    return switch (value) {
        0 => .version_only,
        1 => .with_font,
        else => error.InvalidEquationLayout,
    };
}

pub fn encodeSites(a: std.mem.Allocator, sites: []const query.Site) ![]u8 {
    if (sites.len > 10_000) return error.LimitExceeded;
    return std.json.Stringify.valueAlloc(a, .{ .schemaVersion = 1, .sites = sites }, .{});
}

fn units(a: std.mem.Allocator, bytes: []const u8) ![]u16 {
    if (bytes.len % 2 != 0) return error.InvalidTextSize;
    const result = try a.alloc(u16, bytes.len / 2);
    for (result, 0..) |*value, i| value.* = std.mem.readInt(u16, bytes[i * 2 ..][0..2], .little);
    return result;
}

pub fn encodeSource(a: std.mem.Allocator, site: query.Site, source: query.Source, selected_layout: Layout) ![]u8 {
    if (site.control_node != source.control_node or site.equation_node != source.equation_node) return error.SourceBindingMismatch;
    var total = try std.math.add(usize, source.script.len, source.version_info.len);
    total = try std.math.add(usize, total, if (source.font_name) |name| name.len else 0);
    total = try std.math.add(usize, total, source.extra.len);
    if (total > max_detail_bytes) return error.LimitExceeded;
    const script = try units(a, source.script);
    defer a.free(script);
    const version = try units(a, source.version_info);
    defer a.free(version);
    const font = if (source.font_name) |name| try units(a, name) else null;
    defer if (font) |name| a.free(name);
    // []u8는 문자열로 직렬화되므로 opaque 꼬리도 정수 배열로 명시한다.
    const extra = try a.alloc(u16, source.extra.len);
    defer a.free(extra);
    for (extra, source.extra) |*target, value| target.* = value;
    return std.json.Stringify.valueAlloc(a, .{
        .schemaVersion = 1,
        .layout = if (selected_layout == .version_only) "version-only" else "with-font",
        .site = site,
        .attributes = source.attributes,
        .fontSize = source.font_size,
        .color = source.color,
        .baseline = source.baseline,
        .unknown = source.unknown,
        .scriptUtf16LE = script,
        .versionUtf16LE = version,
        .fontUtf16LE = font,
        .extraBytes = extra,
    }, .{});
}
