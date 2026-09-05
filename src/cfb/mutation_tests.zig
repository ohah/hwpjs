const std = @import("std");
const cfb = @import("reader.zig");

test "4096 deterministic mutations release all parser memory" {
    const seed = @import("tests.zig").miniFile();
    var prng = std.Random.DefaultPrng.init(0xcfb2026);
    const random = prng.random();
    for (0..4096) |i| {
        var bytes = seed;
        const offset = random.uintLessThan(usize, bytes.len - 3);
        std.mem.writeInt(u32, bytes[offset..][0..4], random.int(u32), .little);
        const length = if (i % 3 == 0) random.uintLessThan(usize, bytes.len) else bytes.len;
        if (cfb.File.open(std.testing.allocator, bytes[0..length], .{
            .max_input_bytes = 4096,
            .max_stream_bytes = 4096,
            .max_total_stream_bytes = 8192,
            .max_entries = 32,
            .max_path_bytes = 4096,
        })) |parsed| {
            var file = parsed;
            defer file.deinit();
            for (file.entries) |entry| {
                if (entry.kind == 2) try std.testing.expectEqual(entry.size, entry.content.len);
            }
        } else |err| {
            if (err == error.OutOfMemory) return err;
        }
    }
}
