const std = @import("std");
const t = std.testing;
const r = @import("ole_references.zig");

test "OLE ordinal policy distinguishes zero missing counts and range failures" {
    for ([_]u16{ 0, 1, 2, 32768, 65535 }) |id| {
        for ([_]?usize{ null, 0, 1, 2, 32768, 65535, std.math.maxInt(usize) }) |count| {
            for ([_]r.Policy{ .uninspected, .observed_ordinal }) |policy| {
                var report: r.Report = .{};
                if (policy == .uninspected) {
                    try t.expect(!try report.observe(id, count, policy));
                    try t.expectEqualDeep(r.Report{ .unselected_references = 1, .zero_ids = @intFromBool(id == 0) }, report);
                } else if (id == 0) {
                    try t.expect(!try report.observe(id, count, policy));
                    try t.expectEqualDeep(r.Report{ .zero_ids = 1 }, report);
                } else if (count) |n| {
                    if (id > n) {
                        try t.expectError(error.InvalidOleBinaryReference, report.observe(id, count, policy));
                        try t.expectEqualDeep(r.Report{}, report);
                    } else {
                        try t.expect(try report.observe(id, count, policy));
                        try t.expectEqualDeep(r.Report{ .ordinal_references = 1 }, report);
                    }
                } else {
                    try t.expect(!try report.observe(id, count, policy));
                    try t.expectEqualDeep(r.Report{ .unavailable_counts = 1 }, report);
                }
            }
        }
    }
}

test "OLE failed ordinal check leaves prior successful accounting unchanged" {
    var report: r.Report = .{};
    try t.expect(try report.observe(1, 1, .observed_ordinal));
    const before = report;
    try t.expectError(error.InvalidOleBinaryReference, report.observe(2, 1, .observed_ordinal));
    try t.expectEqualDeep(before, report);
    try t.expect(!try report.observe(0, 0, .observed_ordinal));
    try t.expectEqualDeep(r.Report{ .ordinal_references = 1, .zero_ids = 1 }, report);
}

test "OLE selected reference check consumes the parsed ID in both layouts" {
    const ole = @import("ole.zig");
    const validation = @import("ole_validation.zig");
    inline for (.{ ole.Layout.spec24, ole.Layout.observed26 }) |layout| {
        const width = if (layout == .spec24) 24 else 26;
        const id_offset = if (layout == .spec24) 10 else 12;
        var bytes = [_]u8{0} ** (12 + width);
        std.mem.writeInt(u32, bytes[0..4], 76 | (4 << 20), .little);
        std.mem.writeInt(u32, bytes[4..8], @import("control_rules.zig").id("$ole"), .little);
        std.mem.writeInt(u32, bytes[8..12], 84 | (1 << 10) | (width << 20), .little);
        std.mem.writeInt(u32, bytes[12 + id_offset + 2 ..][0..4], 0xaabbccdd, .little);
        for ([_]u16{ 0, 1, 2, 65535 }) |id| {
            std.mem.writeInt(u16, bytes[12 + id_offset ..][0..2], id, .little);
            var tree = try @import("tree.zig").Tree.parse(t.allocator, &bytes, .{ .raw = 0x05010001 }, .{});
            defer tree.deinit(t.allocator);
            try t.expectEqual(@as(usize, 1), (try validation.inspect(tree, layout)).pending_references);
            if (id > 1) {
                try t.expectError(error.InvalidOleBinaryReference, validation.inspectDetailed(tree, layout, 1, .observed_ordinal));
            } else {
                const result = try validation.inspectDetailed(tree, layout, 1, .observed_ordinal);
                try t.expectEqual(@as(usize, @intFromBool(id == 0)), result.ole.pending_references);
                try t.expectEqual(@as(usize, @intFromBool(id != 0)), result.references.ordinal_references);
                try t.expectEqual(@as(usize, @intFromBool(id == 0)), result.references.zero_ids);
            }
        }
    }
}
