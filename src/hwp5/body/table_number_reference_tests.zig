const std = @import("std");
const objects = @import("cross_reference_object_target.zig");
const numbers = @import("table_number_targets.zig");
const Expected = struct { objects: usize, tables: usize, captions: usize, references: usize, resolved: usize, digest: []const u8 };

fn poisonVisibleDigits(raw: []u8) !usize {
    var count: usize = 0;
    var records = @import("../record.zig").Iterator.init(raw, .{});
    while (try records.next()) |record| {
        if (record.tag != 67) continue;
        var tokens = (try @import("text.zig").Text.parse(record.payload)).tokens();
        while (try tokens.next()) |token| {
            if (token.value != .text) continue;
            var unit: usize = 0;
            while (unit < token.raw.len) : (unit += 2) {
                const code = std.mem.readInt(u16, token.raw[unit..][0..2], .little);
                if (code < '0' or code > '9') continue;
                const at = @intFromPtr(token.raw.ptr) - @intFromPtr(raw.ptr) + unit;
                std.mem.writeInt(u16, raw[at..][0..2], 'X', .little);
                count += 1;
            }
        }
    }
    return count;
}

fn verify(path: []const u8, expected: Expected, poison: bool) !void {
    const a = std.testing.allocator;
    const input = std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(64000000)) catch |err| switch (err) {
        error.FileNotFound => return error.SkipZigTest,
        else => return err,
    };
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.openReadOnly(a, input);
    defer source.deinit();
    var all: std.ArrayList(objects.Site) = .empty;
    defer all.deinit(a);
    var sites: std.ArrayList(numbers.Site) = .empty;
    defer sites.deinit(a);
    var commands: std.ArrayList([]u8) = .empty;
    defer {
        for (commands.items) |bytes| a.free(bytes);
        commands.deinit(a);
    }
    var poisoned: usize = 0;
    for (0..source.section_count) |section| {
        const raw = try source.decodeSection(a, section);
        defer a.free(raw);
        if (poison) poisoned += try poisonVisibleDigits(raw);
        var tree = try @import("tree.zig").Tree.parse(a, raw, source.header.version(), .{});
        defer tree.deinit(a);
        const rows = try objects.collect(a, tree, section);
        defer a.free(rows);
        try all.appendSlice(a, rows);
        const values = try numbers.collect(a, tree, section);
        defer a.free(values);
        try sites.appendSlice(a, values);
        for (tree.nodes) |node| {
            if (node.record.value != .control_header or node.record.value.control_header.id != @import("control_rules.zig").id("%xrf")) continue;
            const properties = try @import("field_start.zig").Properties.parse(node.record.value.control_header.properties);
            const owned = try a.dupe(u8, properties.command);
            commands.append(a, owned) catch |err| {
                a.free(owned);
                return err;
            };
        }
    }
    if (poison) try std.testing.expect(poisoned > 0);
    try std.testing.expectEqual(expected.objects, all.items.len);
    try std.testing.expectEqual(expected.tables, sites.items.len);
    var captions: usize = 0;
    for (sites.items) |site| if (site.caption_numbers == 1) {
        captions += 1;
    };
    try std.testing.expectEqual(expected.captions, captions);
    try std.testing.expectEqual(expected.references, commands.items.len);
    var resolved: usize = 0;
    var unresolved: usize = 0;
    var hash = std.crypto.hash.sha2.Sha256.init(.{});
    for (commands.items) |bytes| {
        const view = try @import("cross_reference_command.zig").View.parse(bytes);
        const value = numbers.storedValue(view, all.items, sites.items) catch |err| switch (err) {
            error.UnresolvedCrossReferenceTarget => {
                unresolved += 1;
                continue;
            },
            else => return err,
        };
        var pair: [6]u8 = undefined;
        std.mem.writeInt(u32, pair[0..4], view.target.numeric, .little);
        std.mem.writeInt(u16, pair[4..6], value.header.number, .little);
        hash.update(&pair);
        resolved += 1;
    }
    var digest: [32]u8 = undefined;
    hash.final(&digest);
    const hex = std.fmt.bytesToHex(digest, .lower);
    try std.testing.expectEqualStrings(expected.digest, &hex);
    try std.testing.expectEqual(expected.resolved, resolved);
    try std.testing.expectEqual(expected.references - expected.resolved, unresolved);
}

test "table number source resolves 137 original spec references without cached output or ID guessing" {
    try verify("reference/rhwp/samples/hwpspec.hwp", .{ .objects = 518, .tables = 459, .captions = 424, .references = 142, .resolved = 137, .digest = "d2447c7a84804de00940b5d2ac2bc9e9f40cd4d0dc00a2f6daf942dee3e46b77" }, false);
}

test "table number source keeps five distribution reference targets unresolved" {
    try verify("reference/rhwp/samples/hwp-3.0-HWPML.hwp", .{ .objects = 321, .tables = 305, .captions = 274, .references = 5, .resolved = 0, .digest = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" }, false);
}

test "table number source ignores poisoned visible digits including cached cross reference output" {
    try verify("reference/rhwp/samples/hwpspec.hwp", .{ .objects = 518, .tables = 459, .captions = 424, .references = 142, .resolved = 137, .digest = "d2447c7a84804de00940b5d2ac2bc9e9f40cd4d0dc00a2f6daf942dee3e46b77" }, true);
}
