//! Actual paragraph resource IDs, independent of list positions.
const std = @import("std");
pub fn ids(session: *const @import("editor_session.zig").Session) ![]u32 {
    const a = session.allocator;
    var document = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer document.deinit(a);
    var resources = try document.inspectHeaderResources(a, .{});
    defer resources.deinit(a);
    const original = resources.table(.para_shape).ids.items;
    var output: std.ArrayList(u32) = .empty;
    errdefer output.deinit(a);
    try output.appendSlice(a, original);
    for (session.paragraph_resources.entries.items) |entry| {
        try requireExisting(original, entry.source_id);
        for (output.items) |id| if (id == entry.id) return error.DuplicateParagraphResourceId;
        try output.append(a, entry.id);
    }
    std.mem.sort(u32, output.items, {}, std.sort.asc(u32));
    return output.toOwnedSlice(a);
}

pub fn requireExisting(existing: []const u32, id: u32) !void {
    // The caller supplies the validated header table, not a count.
    for (existing) |value| if (value == id) return;
    return error.InvalidParagraphShapeReference;
}

test "HWPX paragraph resource validation uses sparse IDs rather than counts" {
    try requireExisting(&.{ 0, 9, 300 }, 0);
    try requireExisting(&.{ 0, 9, 300 }, 300);
    try std.testing.expectError(error.InvalidParagraphShapeReference, requireExisting(&.{ 0, 9, 300 }, 1));
    try std.testing.expectError(error.InvalidParagraphShapeReference, requireExisting(&.{ 0, 9, 300 }, 3));
    try std.testing.expectError(error.InvalidParagraphShapeReference, requireExisting(&.{}, 0));
}

test "HWPX paragraph resource query matches fixture header and owns returned IDs" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const result = try session.paragraphShapeIds();
    defer a.free(result);
    try std.testing.expect(result.len > 1);
    var document = try @import("package.zig").inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var tree = try document.readHeaderTree(a, .{});
    defer tree.deinit(a);
    var count: usize = 0;
    for (tree.elements, 0..) |element, index| {
        if (!element.is(@import("document_xml.zig").head_uri, "paraPr")) continue;
        const parent = element.parent orelse continue;
        if (!tree.elements[parent].is(@import("document_xml.zig").head_uri, "paraProperties")) continue;
        const attribute = (try tree.attributeValue(a, index, "", "id")) orelse return error.MissingParagraphShapeReference;
        const id = try @import("table_xml_fields.zig").unsigned(a, attribute, 4096);
        try requireExisting(result, id);
        count += 1;
    }
    try std.testing.expectEqual(count, result.len);
    const original = result[0];
    result[0] = std.math.maxInt(u32);
    const fresh = try ids(&session);
    defer a.free(fresh);
    try std.testing.expectEqual(original, fresh[0]);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}
