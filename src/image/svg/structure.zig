const std = @import("std");
const xml = @import("../../xml/document.zig");
const Tag = @import("../../xml/tags.zig").Tag;
const Namespace = @import("../../xml/namespaces.zig").State;

pub const namespace = "http://www.w3.org/2000/svg";
pub const Options = struct { xml: xml.Options = .{} };

/// This is a bounded XML/root check, not SVG rendering or script/resource safety.
pub fn inspect(a: std.mem.Allocator, bytes: []const u8, options: Options) !xml.Report {
    var selected = options.xml;
    selected.validate_namespaces = true;
    var root_seen = false;
    const report = try xml.visit(a, bytes, selected, .{ .context = &root_seen, .on_tag = onTag });
    if (!root_seen) return error.MissingSvgRoot;
    return report;
}

fn onTag(context: *anyopaque, tag: Tag, scope: *const Namespace, depth: usize) !void {
    if (depth != 1 or tag.kind == .end) return;
    const expanded = try scope.expandElement(tag.name);
    if (!expanded.local.equals("svg", false) or !std.mem.eql(u8, expanded.uri, namespace)) return error.InvalidSvgRoot;
    const root_seen: *bool = @ptrCast(@alignCast(context));
    root_seen.* = true;
}

/// Only a signature hint. XML declarations/prefixes can instead be selected by MIME.
pub fn looksLike(bytes: []const u8) bool {
    const data = if (std.mem.startsWith(u8, bytes, "\xef\xbb\xbf")) bytes[3..] else bytes;
    const content = std.mem.trimStart(u8, data, " \t\r\n");
    return std.mem.startsWith(u8, content, "<svg") and content.len > 4 and (std.ascii.isWhitespace(content[4]) or content[4] == '>' or content[4] == '/');
}
