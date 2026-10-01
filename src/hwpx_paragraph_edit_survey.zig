//! Classify every tracked fixture paragraph; refusal is not a passed edit.
const std = @import("std");
const package = @import("hwpx/package.zig");
const sites_module = @import("hwpx/text_sites.zig");
const locations_module = @import("hwpx/text_site_locations.zig");
const edit = @import("hwpx/plain_paragraph_edit.zig");
const save = @import("hwpx/text_sites_save.zig");

test "HWPX selected paragraph edit fixture survey" {
    const a = std.testing.allocator;
    const dir = try std.Io.Dir.cwd().openDir(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures", .{ .iterate = true });
    defer dir.close(std.testing.io);
    var iterator = dir.iterate();
    var files: usize = 0;
    var encrypted: usize = 0;
    var accepted: usize = 0;
    var rejected: usize = 0;
    var failures: std.StringHashMapUnmanaged(usize) = .empty;
    defer failures.deinit(a);
    const options: sites_module.Options = .{ .branch_policy = .{ .mode = .selected } };
    while (try iterator.next(std.testing.io)) |entry| {
        if (entry.kind != .file or !std.mem.endsWith(u8, entry.name, ".hwpx")) continue;
        files += 1;
        const input = try dir.readFileAlloc(std.testing.io, entry.name, a, .limited(64 * 1024 * 1024));
        defer a.free(input);
        var document = try package.inspectDocument(a, input, .{});
        defer document.deinit(a);
        var structure = document.inspectStructure(a, .{}) catch |err| {
            if (err != error.EncryptedDocument) return err;
            encrypted += 1;
            std.debug.print("PARAGRAPH_ENCRYPTED {s}\n", .{entry.name});
            continue;
        };
        defer structure.deinit(a);
        var counters: @import("hwpx/section_text.zig").Report = .{};
        var file_ok: usize = 0;
        var file_refused: usize = 0;
        for (structure.sections, 0..) |_, section| {
            var tree = try document.readSectionTree(a, section, .{});
            defer tree.deinit(a);
            var sites = try sites_module.collect(a, &tree, options);
            defer sites.deinit(a);
            const first_paragraph = counters.paragraphs + 1;
            const locations = try locations_module.buildWithCounters(a, &tree, &sites, options, &counters);
            defer a.free(locations);
            for (first_paragraph..counters.paragraphs + 1) |paragraph| {
                _ = edit.splice(a, &tree, &sites, locations, paragraph, 0, 0, "검증", 64 * 1024 * 1024) catch |err| {
                    switch (err) {
                        error.MissingTextSite, error.UnsupportedInlineControl, error.UnsupportedParagraphControl => {},
                        else => return err,
                    }
                    const count = try failures.getOrPut(a, @errorName(err));
                    if (!count.found_existing) count.value_ptr.* = 0;
                    count.value_ptr.* += 1;
                    rejected += 1;
                    file_refused += 1;
                    continue;
                };
                const output = try save.write(a, &tree, &sites, options, 64 * 1024 * 1024);
                defer a.free(output);
                var reopened = try @import("hwpx/xml_part_tree.zig").parse(a, output, .section, section, tree.item_index, .{});
                defer reopened.deinit(a);
                var updated = try sites_module.collect(a, &reopened, options);
                defer updated.deinit(a);
                try std.testing.expectEqual(sites.items.len, updated.items.len);
                for (sites.items, updated.items) |current, actual| try std.testing.expectEqualStrings(current.text, actual.text);
                _ = try edit.splice(a, &tree, &sites, locations, paragraph, 0, 2, "", 64 * 1024 * 1024);
                const restored = try save.write(a, &tree, &sites, options, 64 * 1024 * 1024);
                defer a.free(restored);
                try std.testing.expectEqualSlices(u8, tree.source, restored);
                accepted += 1;
                file_ok += 1;
            }
        }
        std.debug.print("PARAGRAPH_FILE {s} accepted={d} refused={d}\n", .{ entry.name, file_ok, file_refused });
    }
    var failure_iterator = failures.iterator();
    while (failure_iterator.next()) |failure| std.debug.print("PARAGRAPH_REFUSAL {s} {d}\n", .{ failure.key_ptr.*, failure.value_ptr.* });
    std.debug.print("PARAGRAPH_TOTAL files={d} encrypted={d} accepted={d} refused={d}\n", .{ files, encrypted, accepted, rejected });
    try std.testing.expectEqual(@as(usize, 45), files);
    try std.testing.expectEqual(@as(usize, 1), encrypted);
}
