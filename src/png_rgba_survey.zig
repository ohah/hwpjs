const std = @import("std");
const rgba = @import("image/png/rgba.zig");

test "PNG RGBA real screenshot matches unmanaged Pillow bytes" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue2020/issue2020_actual_fsc_image_text_overlap_region.png", a, .limited(1_000_000));
    defer a.free(bytes);
    var image = try rgba.decode(a, bytes, .{});
    defer image.deinit(a);
    try std.testing.expectEqual(@as(u32, 134), image.raster.width);
    try std.testing.expectEqual(@as(u32, 48), image.raster.height);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(image.raster.rgba, &digest, .{});
    const expected = "6378c83d2255c5ec30725ae1abc19d1bbbace3b1575f81447ac71595ed340d18";
    try std.testing.expectEqualStrings(expected, &std.fmt.bytesToHex(digest, .lower));
}

// Binary stdout is consumed only by tools/png-rgba-corpus-diff.py.
test "PNG RGBA raw local corpus stream" {
    const a = std.testing.allocator;
    const roots = [_][]const u8{ "legacy/rust/crates/hwp-core/tests/fixtures", "reference/rhwp/samples" };
    for (roots) |root| {
        const dir = try std.Io.Dir.cwd().openDir(std.testing.io, root, .{ .iterate = true });
        defer dir.close(std.testing.io);
        var walker = try dir.walk(a);
        defer walker.deinit();
        while (try walker.next(std.testing.io)) |entry| {
            if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".png")) continue;
            const png = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(16 * 1024 * 1024));
            defer a.free(png);
            var image = try rgba.decode(a, png, .{});
            defer image.deinit(a);
            const path = try std.fmt.allocPrint(a, "{s}/{s}", .{ root, entry.path });
            defer a.free(path);
            var length: [4]u8 = undefined;
            const output = std.Io.File.stdout();
            std.mem.writeInt(u32, &length, @intCast(path.len), .little);
            try output.writeStreamingAll(std.testing.io, &length);
            try output.writeStreamingAll(std.testing.io, path);
            std.mem.writeInt(u32, &length, @intCast(image.raster.rgba.len), .little);
            try output.writeStreamingAll(std.testing.io, &length);
            try output.writeStreamingAll(std.testing.io, image.raster.rgba);
        }
    }
}

// HWP PrvImage PNG bytes are extracted by the Zig CFB reader. The Python
// comparison independently extracts the same stream with olefile.
test "PNG RGBA raw HWP preview stream" {
    const a = std.testing.allocator;
    const root = "legacy/rust/crates/hwp-core/tests/fixtures";
    const dir = try std.Io.Dir.cwd().openDir(std.testing.io, root, .{ .iterate = true });
    defer dir.close(std.testing.io);
    var walker = try dir.walk(a);
    defer walker.deinit();
    while (try walker.next(std.testing.io)) |entry| {
        if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwp")) continue;
        const document = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(25 * 1024 * 1024));
        defer a.free(document);
        var file = try @import("cfb/reader.zig").File.open(a, document, .{ .strict = true });
        defer file.deinit();
        const index = try file.findExact("/PrvImage") orelse continue;
        const png = file.entries[index].content;
        if (!std.mem.startsWith(u8, png, @import("image/png/chunks.zig").signature)) continue;
        var image = try rgba.decode(a, png, .{});
        defer image.deinit(a);
        const path = try std.fmt.allocPrint(a, "{s}/{s}::PrvImage", .{ root, entry.path });
        defer a.free(path);
        var length: [4]u8 = undefined;
        const output = std.Io.File.stdout();
        std.mem.writeInt(u32, &length, @intCast(path.len), .little);
        try output.writeStreamingAll(std.testing.io, &length);
        try output.writeStreamingAll(std.testing.io, path);
        std.mem.writeInt(u32, &length, @intCast(image.raster.rgba.len), .little);
        try output.writeStreamingAll(std.testing.io, &length);
        try output.writeStreamingAll(std.testing.io, image.raster.rgba);
    }
}
