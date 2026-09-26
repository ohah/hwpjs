const std = @import("std");
const package = @import("hwpx/package.zig");
const common = @import("hwpx_text_snapshot_corpus_common.zig");

const Mode = common.Mode;

fn survey(mode: Mode) !void {
    const a = std.testing.allocator;
    const chart_capabilities = [_][]const u8{common.chart_uri};
    var options: package.SectionTextSnapshotOptions = .{};
    if (mode != .raw) options.scan.text.branch_policy = .{
        .mode = .selected,
        .supported_namespaces = if (mode == .selected_chart) &chart_capabilities else &.{},
    };
    var accepted: usize = 0;
    var rejected_zip: usize = 0;
    var encrypted: usize = 0;
    var sections: usize = 0;
    var paragraphs: usize = 0;
    var runs: usize = 0;
    var text_elements: usize = 0;
    var empty_text_elements: usize = 0;
    var text_bytes: usize = 0;
    for (common.roots, 0..) |root, root_index| {
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
                std.debug.print("SNAPSHOT_REJECTED {s} {d} {x:0>64}\n", .{ @tagName(mode), root_index, common.pathDigest(entry.path) });
                continue;
            };
            defer document.deinit(a);
            var snapshot = document.readSectionTextSnapshot(a, options) catch |err| {
                if (err != error.EncryptedDocument) {
                    std.debug.print("SNAPSHOT_ERROR root={d} path={s} error={s}\n", .{ root_index, entry.path, @errorName(err) });
                    return err;
                }
                encrypted += 1;
                std.debug.print("SNAPSHOT_ENCRYPTED {s} {d} {x:0>64}\n", .{ @tagName(mode), root_index, common.pathDigest(entry.path) });
                continue;
            };
            defer snapshot.deinit();
            const report = snapshot.report;
            const hashes = try common.eventDigests(snapshot.events, report, null);
            std.debug.print("SNAPSHOT_FILE {s} {d} {x:0>64} {x:0>64} {x:0>64} {d} {d} {d} {d} {d} {d}\n", .{
                @tagName(mode),
                root_index,
                common.pathDigest(entry.path),
                hashes.content,
                hashes.ordered,
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
    std.debug.print("SNAPSHOT_TOTAL {s} {d} {d} {d} {d} {d} {d} {d} {d} {d}\n", .{ @tagName(mode), accepted, rejected_zip, encrypted, sections, paragraphs, runs, text_elements, empty_text_elements, text_bytes });
    try std.testing.expectEqual(@as(usize, 476), accepted);
    try std.testing.expectEqual(@as(usize, 6), rejected_zip);
    try std.testing.expectEqual(@as(usize, 2), encrypted);
}

test "HWPX section text snapshot corpus digest survey raw" {
    try survey(.raw);
}

test "HWPX section text snapshot corpus digest survey selected default" {
    try survey(.selected_default);
}

test "HWPX section text snapshot corpus digest survey selected chart" {
    try survey(.selected_chart);
}
