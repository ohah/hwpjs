const std = @import("std");
const package = @import("hwpx/package.zig");
const common = @import("hwpx_text_snapshot_corpus_common.zig");
const section_tree = @import("hwpx/section_tree.zig");
const equation = @import("hwpx/equation.zig");

const Sha256 = std.crypto.hash.sha2.Sha256;

fn number(hash: *Sha256, count: usize) void {
    var bytes: [8]u8 = undefined;
    std.mem.writeInt(u64, &bytes, @intCast(count), .little);
    hash.update(&bytes);
}

fn value(hash: *Sha256, bytes: []const u8) void {
    number(hash, bytes.len);
    hash.update(bytes);
}

fn digest(report: *const package.EquationReport) !u256 {
    var hash = Sha256.init(.{});
    for (report.equations) |item| {
        number(&hash, item.section_ordinal);
        for (item.attributes.raw) |attribute| {
            if (attribute) |bytes| {
                hash.update(&.{1});
                value(&hash, bytes);
            } else hash.update(&.{0});
        }
        number(&hash, item.script_count);
        for (report.scripts[item.first_script..][0..item.script_count]) |script| value(&hash, script.value);
        number(&hash, item.other_children);
        number(&hash, item.shape_child_count);
        for (report.shape_children[item.first_shape_child..][0..item.shape_child_count]) |child| {
            value(&hash, child.localName());
            number(&hash, child.element_index - item.element_index);
            for (child.values) |attribute| {
                if (attribute) |bytes| {
                    hash.update(&.{1});
                    value(&hash, bytes);
                } else hash.update(&.{0});
            }
            number(&hash, child.other_attributes);
            number(&hash, child.direct_children);
            if (child.kind == .caption) {
                number(&hash, child.caption_sub_list_count);
                for (report.caption_sub_lists[child.first_caption_sub_list..][0..child.caption_sub_list_count]) |sub_list| {
                    number(&hash, sub_list.element_index - child.element_index);
                    for (sub_list.attributes) |attribute| {
                        if (attribute) |bytes| {
                            hash.update(&.{1});
                            value(&hash, bytes);
                        } else hash.update(&.{0});
                    }
                    number(&hash, sub_list.direct_paragraphs);
                    number(&hash, sub_list.other_direct_children);
                    number(&hash, sub_list.unknown_enums);
                    number(&hash, sub_list.other_attributes);
                }
            }
        }
    }
    var output: [32]u8 = undefined;
    hash.final(&output);
    return std.mem.readInt(u256, &output, .big);
}

const Inspected = union(enum) {
    rejected_zip,
    encrypted,
    accepted: struct { hash: u256, counts: [12]usize },
};

test "HWPX equation caption independent XML digest fixture" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>" ++
        "<p:p><p:run><p:equation version='v'><p:caption side='TOP'><p:subList id='' textDirection='FUTURE' textWidth='&#49;' hasTextRef='1' future='x'><p:p/><x:p/></p:subList><x:subList/></p:caption><p:script>a&amp;b</p:script></p:equation></p:run></p:p></s:sec>";
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    var report = try equation.inspect(a, &.{tree}, .{});
    defer report.deinit();
    // tools/hwpx-equation-corpus-diff.py inspect_sections() computes this
    // fixture from independent ElementTree parent/attribute/content rules.
    try std.testing.expectEqual(@as(u256, 0x80a6a32a5aee019fb8f335c06e721cf28e18bf9224f40762d3c2f9c9764ae33f), try digest(&report));
    try std.testing.expectEqual(@as(usize, 1), report.caption.sub_lists);
    try std.testing.expectEqual(@as(usize, 1), report.caption.direct_paragraphs);
}

fn inspectOne(a: std.mem.Allocator, bytes: []const u8) !Inspected {
    var document = package.inspectDocument(a, bytes, .{}) catch |err| {
        if (err == error.MissingEndRecord) return .rejected_zip;
        return err;
    };
    defer document.deinit(a);
    var report = document.inspectEquations(a, .{}) catch |err| {
        if (err == error.EncryptedDocument) return .encrypted;
        return err;
    };
    defer report.deinit();
    return .{ .accepted = .{
        .hash = try digest(&report),
        .counts = .{
            report.sections,           report.equations.len,          report.scripts.len,       report.script_bytes,
            report.without_script,     report.multiple_scripts,       report.other_children,    report.other_attributes,
            report.shape_children.len, report.shape.unknown_children, report.caption.sub_lists, report.caption.direct_paragraphs,
        },
    } };
}

test "HWPX equation corpus per-file independent XML digest survey" {
    const a = std.testing.allocator;
    var accepted: usize = 0;
    var rejected_zip: usize = 0;
    var encrypted: usize = 0;
    var totals: [12]usize = @splat(0);
    for (common.roots, 0..) |root, root_index| {
        const dir = try std.Io.Dir.cwd().openDir(std.testing.io, root, .{ .iterate = true });
        defer dir.close(std.testing.io);
        var walker = try dir.walk(a);
        defer walker.deinit();
        while (try walker.next(std.testing.io)) |entry| {
            if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwpx")) continue;
            const bytes = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(25_000_000));
            defer a.free(bytes);
            var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
            checked.requested_memory_limit = 2 * 1024 * 1024 * 1024;
            defer _ = checked.deinit();
            defer if (checked.total_requested_bytes != 0) @panic("HWPX equation corpus inspection leaked allocations");
            const outcome = inspectOne(checked.allocator(), bytes) catch |err| {
                std.debug.print("EQUATION_ERROR root={d} path={s} error={s}\n", .{ root_index, entry.path, @errorName(err) });
                return err;
            };
            switch (outcome) {
                .rejected_zip => {
                    rejected_zip += 1;
                    std.debug.print("EQUATION_REJECTED {d} {x:0>64}\n", .{ root_index, common.pathDigest(entry.path) });
                },
                .encrypted => {
                    encrypted += 1;
                    std.debug.print("EQUATION_ENCRYPTED {d} {x:0>64}\n", .{ root_index, common.pathDigest(entry.path) });
                },
                .accepted => |row| {
                    for (row.counts, 0..) |count, index| totals[index] += count;
                    std.debug.print("EQUATION_FILE {d} {x:0>64} {x:0>64} {d} {d} {d} {d} {d} {d} {d} {d} {d} {d} {d} {d}\n", .{
                        root_index,    common.pathDigest(entry.path), row.hash,
                        row.counts[0], row.counts[1],                 row.counts[2],
                        row.counts[3], row.counts[4],                 row.counts[5],
                        row.counts[6], row.counts[7],                 row.counts[8],
                        row.counts[9], row.counts[10],                row.counts[11],
                    });
                    accepted += 1;
                },
            }
        }
    }
    std.debug.print("EQUATION_TOTAL {d} {d} {d} {d} {d} {d} {d} {d} {d} {d} {d} {d} {d} {d} {d}\n", .{
        accepted,  rejected_zip, encrypted,  totals[0],  totals[1], totals[2], totals[3], totals[4], totals[5], totals[6], totals[7],
        totals[8], totals[9],    totals[10], totals[11],
    });
    try std.testing.expectEqual(@as(usize, 476), accepted);
    try std.testing.expectEqual(@as(usize, 6), rejected_zip);
    try std.testing.expectEqual(@as(usize, 2), encrypted);
}
