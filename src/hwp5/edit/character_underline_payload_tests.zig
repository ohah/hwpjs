const std = @import("std");
const write = @import("character_underline_payload.zig").write;
const Kind = @import("character_underline_payload.zig").Kind;

test "HWP5 underline payload actual fixture resources change only position bits" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "underline-styles", "charshape", "parashape" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(bytes);
        var source = try @import("../text_source.zig").Source.open(a, bytes);
        defer source.deinit();
        const decoded = try @import("../stream.zig").decode(a, &source.header, try source.file.readStream(a, "/DocInfo"), 4_000_000);
        defer a.free(decoded);
        var iterator = @import("../record.zig").Iterator.init(decoded, .{});
        var resources: usize = 0;
        while (try iterator.next()) |record| {
            if (record.tag != 21) continue;
            resources += 1;
            for ([_]?Kind{ null, .none, .bottom, .top }) |kind| {
                const output = try write(a, record.payload, source.header.version(), kind, 4_000_000);
                defer a.free(output);
                const expected = try a.dupe(u8, record.payload);
                defer a.free(expected);
                if (kind) |value| expected[46] = (expected[46] & ~@as(u8, 12)) | (@as(u8, @backingInt(value)) << 2);
                try std.testing.expectEqualSlices(u8, expected, output);
                const parsed = try @import("../docinfo/char_shape.zig").CharShape.parse(output, source.header.version());
                try std.testing.expectEqual(@as(u2, @truncate((expected[46] >> 2) & 3)), parsed.underlineKindRaw());
            }
        }
        try std.testing.expect(resources > 0);
    }
}
