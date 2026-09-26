const std = @import("std");
const package = @import("hwpx/package.zig");

const roots = [_][]const u8{ "legacy/rust/crates/hwp-core/tests/fixtures", "reference/rhwp/samples" };
const Sha256 = std.crypto.hash.sha2.Sha256;

fn digest(bytes: []const u8) u256 {
    var output: [32]u8 = undefined;
    Sha256.hash(bytes, &output, .{});
    return std.mem.readInt(u256, &output, .big);
}

test "HWPX section text snapshot corpus digest survey" {
    const a = std.testing.allocator;
    var accepted: usize = 0;
    var rejected_zip: usize = 0;
    var encrypted: usize = 0;
    var sections: usize = 0;
    var paragraphs: usize = 0;
    var runs: usize = 0;
    var text_elements: usize = 0;
    var empty_text_elements: usize = 0;
    var text_bytes: usize = 0;
    for (roots, 0..) |root, root_index| {
        const dir = try std.Io.Dir.cwd().openDir(std.testing.io, root, .{ .iterate = true });
        defer dir.close(std.testing.io);
        var walker = try dir.walk(a);
        defer walker.deinit();
        while (try walker.next(std.testing.io)) |entry| {
            if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwpx")) continue;
            const bytes = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(25_000_000));
            defer a.free(bytes);
            var document = package.inspectDocument(a, bytes, .{}) catch |err| {
                if (err != error.MissingEndRecord) return err;
                rejected_zip += 1;
                std.debug.print("SNAPSHOT_REJECTED {d} {x:0>64}\n", .{ root_index, digest(entry.path) });
                continue;
            };
            defer document.deinit(a);
            var snapshot = document.readSectionTextSnapshot(a, .{}) catch |err| {
                if (err != error.EncryptedDocument) {
                    std.debug.print("SNAPSHOT_ERROR root={d} path={s} error={s}\n", .{ root_index, entry.path, @errorName(err) });
                    return err;
                }
                encrypted += 1;
                std.debug.print("SNAPSHOT_ENCRYPTED {d} {x:0>64}\n", .{ root_index, digest(entry.path) });
                continue;
            };
            defer snapshot.deinit();
            var hash = Sha256.init(.{});
            var order = Sha256.init(.{});
            var copied_bytes: usize = 0;
            var paragraph_starts: usize = 0;
            var paragraph_ends: usize = 0;
            var run_starts: usize = 0;
            var run_ends: usize = 0;
            var text_starts: usize = 0;
            var text_ends: usize = 0;
            for (snapshot.events) |event| switch (event.value) {
                .paragraph_start => {
                    paragraph_starts += 1;
                    order.update(&.{1});
                },
                .paragraph_end => {
                    paragraph_ends += 1;
                    order.update(&.{2});
                },
                .run_start => {
                    run_starts += 1;
                    order.update(&.{3});
                },
                .run_end => {
                    run_ends += 1;
                    order.update(&.{4});
                },
                .text_start => {
                    text_starts += 1;
                    order.update(&.{5});
                },
                .text_end => {
                    text_ends += 1;
                    order.update(&.{6});
                },
                .inline_start => |item| order.update(&.{ 7, @intFromEnum(item.kind) }),
                .inline_end => |item| order.update(&.{ 8, @intFromEnum(item.kind) }),
                .inline_empty => |item| {
                    order.update(&.{ 7, @intFromEnum(item.kind) });
                    order.update(&.{ 8, @intFromEnum(item.kind) });
                },
                .content => |content| {
                    hash.update(content);
                    copied_bytes += content.len;
                    for (content) |byte| order.update(&.{ 9, byte });
                },
            };
            const report = snapshot.report;
            try std.testing.expectEqual(report.paragraphs, paragraph_starts);
            try std.testing.expectEqual(report.paragraphs, paragraph_ends);
            try std.testing.expectEqual(report.runs, run_starts);
            try std.testing.expectEqual(report.runs, run_ends);
            try std.testing.expectEqual(report.text_elements, text_starts);
            try std.testing.expectEqual(report.text_elements, text_ends);
            try std.testing.expectEqual(report.text_bytes, copied_bytes);
            var output: [32]u8 = undefined;
            var ordered_output: [32]u8 = undefined;
            hash.final(&output);
            order.final(&ordered_output);
            std.debug.print("SNAPSHOT_FILE {d} {x:0>64} {x:0>64} {x:0>64} {d} {d} {d} {d} {d} {d}\n", .{
                root_index,
                digest(entry.path),
                std.mem.readInt(u256, &output, .big),
                std.mem.readInt(u256, &ordered_output, .big),
                report.sections,
                report.paragraphs,
                report.runs,
                report.text_elements,
                report.empty_text_elements,
                report.text_bytes,
            });
            accepted += 1;
            sections += report.sections;
            paragraphs += report.paragraphs;
            runs += report.runs;
            text_elements += report.text_elements;
            empty_text_elements += report.empty_text_elements;
            text_bytes += report.text_bytes;
        }
    }
    std.debug.print("SNAPSHOT_TOTAL {d} {d} {d} {d} {d} {d} {d} {d} {d}\n", .{ accepted, rejected_zip, encrypted, sections, paragraphs, runs, text_elements, empty_text_elements, text_bytes });
    try std.testing.expectEqual(@as(usize, 476), accepted);
    try std.testing.expectEqual(@as(usize, 6), rejected_zip);
    try std.testing.expectEqual(@as(usize, 2), encrypted);
}
