//! Complete saved-file validation before publish. Compare semantic stream bytes, not CFB sector placement.
const std = @import("std");
const Source = @import("../text_source.zig").Source;
const Target = @import("literal_edit_request.zig").Target;
pub fn verify(a: std.mem.Allocator, before_bytes: []const u8, after_bytes: []const u8, targets: []const Target, entry: @import("created_resources.zig").Entry, file_limit: usize, resource_read_limit: usize) !void {
    if (before_bytes.len > file_limit or after_bytes.len > file_limit) return error.LimitExceeded;
    var before = try Source.open(a, before_bytes);
    defer before.deinit();
    var after = try Source.open(a, after_bytes);
    defer after.deinit();
    if (before.header.version().raw != after.header.version().raw or before.header.flags() != after.header.flags()) return error.ChartLiteralEditVerificationFailed;
    var names: std.ArrayList([]const u8) = .empty;
    defer names.deinit(a);
    if (try before.file.findExact("/BinData")) |parent| for (before.file.entries) |e| {
        if (e.kind != 0 and e.parent == parent) try names.append(a, e.name);
    };
    const old_info = try before.decodeDocInfo(a, resource_read_limit);
    defer a.free(old_info);
    var expected = try @import("create_single_docinfo.zig").prepare(a, old_info, before.header.version(), names.items, resource_read_limit);
    defer expected.deinit(a);
    const new_info = try after.decodeDocInfo(a, resource_read_limit);
    defer a.free(new_info);
    if (expected.ids.ordinal != entry.ordinal or expected.ids.physical != entry.physical or !std.mem.eql(u8, expected.bytes, new_info)) return error.ChartLiteralEditVerificationFailed;
    const fresh = try after.file.findExact(entry.path) orelse return error.ChartLiteralEditVerificationFailed;
    if (!std.mem.eql(u8, after.file.entries[fresh].content, entry.bytes)) return error.ChartLiteralEditVerificationFailed;
    var selected_paths: std.StringHashMapUnmanaged(usize) = .empty;
    defer {
        var keys = selected_paths.keyIterator();
        while (keys.next()) |address| a.free(address.*);
        selected_paths.deinit(a);
    }
    for (targets) |target| {
        const address = try std.fmt.allocPrint(a, "/BodyText/Section{d}", .{target.section});
        if (selected_paths.contains(address)) {
            a.free(address);
            continue;
        }
        selected_paths.put(a, address, target.section) catch |err| {
            a.free(address);
            return err;
        };
    }
    // Preserve every original directory object and every non-target stream,
    // including old resources retained for unselected aliases.
    for (before.file.entries, 0..) |e, i| {
        if (e.kind == 0) continue;
        const path = try before.file.rootRelativePath(i);
        const j = try after.file.findExact(path) orelse return error.ChartLiteralEditVerificationFailed;
        const n = after.file.entries[j];
        if (e.kind != n.kind or !std.mem.eql(u8, &e.clsid, &n.clsid) or e.state != n.state or e.created != n.created or e.modified != n.modified) return error.ChartLiteralEditVerificationFailed;
        if (e.kind != 2 or std.mem.eql(u8, path, "/DocInfo")) continue;
        if (selected_paths.get(path)) |section| {
            const old = try before.decodeSection(a, section);
            defer a.free(old);
            const current = try after.decodeSection(a, section);
            defer a.free(current);
            const patched = try @import("literal_edit_sections.zig").patch(a, old, before.header.version(), targets, section, entry.ordinal, true);
            defer a.free(patched);
            if (!std.mem.eql(u8, patched, current)) return error.ChartLiteralEditVerificationFailed;
        } else if (!std.mem.eql(u8, e.content, n.content)) return error.ChartLiteralEditVerificationFailed;
    }
    var count_before: usize = 0;
    var count_after: usize = 0;
    for (before.file.entries) |e| count_before += @intFromBool(e.kind != 0);
    for (after.file.entries) |e| count_after += @intFromBool(e.kind != 0);
    if (count_after != count_before + 1) return error.ChartLiteralEditVerificationFailed;
    var index = try @import("../edit/binary_resource_index.zig").Index.init(a, &after);
    defer index.deinit(a);
    if (try index.physicalId(entry.ordinal) != entry.physical) return error.ChartLiteralEditVerificationFailed;
    const decoded = try index.read(a, entry.ordinal, resource_read_limit);
    defer a.free(decoded);
    if (!std.mem.eql(u8, decoded, entry.bytes)) return error.ChartLiteralEditVerificationFailed;
}
