//! Remove only validated ODF encryption-data spans, retaining all other bytes.
const std = @import("std");
const xml = @import("../xml/root.zig");
const detection = @import("encryption_manifest.zig");
const attrs = @import("xml_attributes.zig");
const writer = @import("xml_source_writer.zig");
const Context = struct {
    a: std.mem.Allocator,
    source: []const u8,
    changes: std.ArrayList(writer.Change) = .empty,
    start: ?usize = null,
    fn onTag(raw: *anyopaque, tag: xml.tags.Tag, scope: *const xml.namespaces.State, depth: usize) anyerror!void {
        const self: *Context = @ptrCast(@alignCast(raw));
        if (depth != 3 or !try attrs.element(tag, scope, detection.manifest_uri, "encryption-data")) return;
        const at = @intFromPtr(tag.raw.ptr) - @intFromPtr(self.source.ptr);
        if (at > self.source.len or tag.raw.len > self.source.len - at) return error.SourceBindingMismatch;
        if (tag.kind == .start) {
            self.start = at;
        } else {
            const start = if (tag.kind == .empty) at else self.start orelse return error.SourceBindingMismatch;
            try self.changes.append(self.a, .{ .start = start, .end = at + tag.raw.len, .text = "", .serialized_xml = "" });
            self.start = null;
        }
    }
};
pub fn remove(a: std.mem.Allocator, bytes: []const u8, options: detection.Options) ![]u8 {
    var report = try detection.readXml(a, bytes, options);
    defer report.deinit(a);
    var context: Context = .{ .a = a, .source = bytes };
    defer context.changes.deinit(a);
    _ = try xml.document.visit(a, bytes, .{
        .validate_namespaces = true,
        .prolog = .{ .input = .{ .max_bytes = options.max_xml_bytes, .max_characters = options.max_xml_bytes } },
        .max_elements = 200_000,
        .max_events = 400_000,
        .max_depth = 64,
    }, .{ .context = &context, .on_tag = Context.onTag });
    if (context.start != null or context.changes.items.len != report.encrypted_paths.len) return error.SourceBindingMismatch;
    return writer.write(a, bytes, context.changes.items, options.max_xml_bytes);
}

test "HWPX encryption manifest clear preserves unrelated bytes and all allocation failures" {
    const prefix = "<?xml version='1.0'?><m:manifest xmlns:m='" ++ detection.manifest_uri ++ "' xmlns:x='other'><!--encryption-data--><m:file-entry full-path='a' size='5'>";
    const suffix = "<x:encryption-data/><![CDATA[encryption-data]]></m:file-entry><m:file-entry full-path='b'><m:encryption-data/></m:file-entry></m:manifest>";
    const source = prefix ++ "<m:encryption-data><m:algorithm/></m:encryption-data>" ++ suffix;
    const expected = prefix ++ "<x:encryption-data/><![CDATA[encryption-data]]></m:file-entry><m:file-entry full-path='b'></m:file-entry></m:manifest>";
    const Probe = struct {
        fn run(a: std.mem.Allocator) !void {
            const result = try remove(a, source, .{});
            defer a.free(result);
            try std.testing.expectEqualStrings(expected, result);
            var report = try detection.readXml(a, result, .{});
            defer report.deinit(a);
            try std.testing.expectEqual(@as(usize, 0), report.encrypted_paths.len);
        }
    };
    try Probe.run(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(Probe.run, .{});
}
