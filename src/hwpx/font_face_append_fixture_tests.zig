const std = @import("std");

test "HWPX new font append preserves actual fixture names and IDs" {
    const a = std.testing.allocator;
    const dir = try std.Io.Dir.cwd().openDir(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures", .{ .iterate = true });
    defer dir.close(std.testing.io);
    var walker = try dir.walk(a);
    defer walker.deinit();
    var files: usize = 0;
    var groups: usize = 0;
    while (try walker.next(std.testing.io)) |entry| {
        if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwpx") or std.mem.eql(u8, entry.basename, "password-12345.hwpx")) continue;
        const bytes = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(16_000_000));
        defer a.free(bytes);
        var document = try @import("package.zig").inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        var tree = try document.readHeaderTree(a, .{});
        defer tree.deinit(a);
        for (tree.elements, 0..) |element, node| {
            if (!element.is(@import("document_xml.zig").head_uri, "fontface")) continue;
            var id: u32 = 0;
            var child = element.first_child;
            while (child) |index| : (child = tree.elements[index].next_sibling) {
                if (!tree.elements[index].is(@import("document_xml.zig").head_uri, "font")) continue;
                var face = try @import("font_face_values.zig").read(a, &tree, index, 4096);
                defer face.deinit(a);
                id = @max(id, std.math.add(u32, face.id, 1) catch return error.InvalidFontId);
            }
            const output = try @import("font_face_append.zig").write(a, &tree, node, id, "Hwpjs Corpus Font", .ttf, 16_000_000);
            defer a.free(output);
            var parsed = try @import("xml_part_tree.zig").parse(a, output, .header, null, tree.item_index, .{});
            defer parsed.deinit(a);
            const group = parsed.elements[node];
            var original = element.first_child;
            var actual = group.first_child;
            while (original) |index| : (original = tree.elements[index].next_sibling) {
                const target = actual orelse return error.MissingOriginalFont;
                try std.testing.expectEqualStrings(tree.sourceOf(index), parsed.sourceOf(target));
                actual = parsed.elements[target].next_sibling;
            }
            const added = actual orelse return error.MissingNewFont;
            var face = try @import("font_face_values.zig").read(a, &parsed, added, 4096);
            defer face.deinit(a);
            try std.testing.expectEqual(id, face.id);
            try std.testing.expectEqualStrings("Hwpjs Corpus Font", face.name.?);
            try std.testing.expect(parsed.elements[added].next_sibling == null);
            groups += 1;
        }
        files += 1;
    }
    try std.testing.expect(files > 0 and groups >= files);
    std.debug.print("HWPX new font headers: {d} files, {d} language groups\n", .{ files, groups });
}
