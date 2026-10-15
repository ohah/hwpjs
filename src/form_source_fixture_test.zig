//! Read-only evidence for a separately gated observed form retention profile.
const std = @import("std");

test "observed form source newer version retains validated assembly" {
    try @import("testing/checked_allocator.zig").run(newerVersion, .{});
}

fn newerVersion(a: std.mem.Allocator) !void {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/hancom-hwp/form-002.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    try std.testing.expectEqual(@as(u32, 0x05010001), source.header.version().raw);
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var tree = try @import("hwp5/body/tree.zig").Tree.parse(a, bytes, source.header.version(), .{});
    defer tree.deinit(a);
    var forms = try @import("hwp5/body/form_links.zig").collectObservedUnits(a, tree, .{});
    defer forms.deinit(a);
    try std.testing.expectEqual(@as(usize, 180), forms.forms.forms.len);
    for (forms.forms.forms) |form| {
        try std.testing.expect(form.envelope.kind() != .unknown);
        try std.testing.expectEqual(@as(usize, 0), form.other_direct_children);
        try std.testing.expectEqual(@as(usize, 0), form.common.extra.len);
        try std.testing.expectEqual(@as(usize, 0), form.envelope.extra.len);
    }
    var retained = try @import("hwp5/edit/form_source_retention.zig").collect(a, bytes, source.header.version());
    defer retained.deinit(a);
    try std.testing.expectEqual(@as(usize, 180), retained.forms.len);
    try std.testing.expectEqualSlices(u8, input, source.file.bytes);
}

test "observed form source retention preserves official deferred classification" {
    try @import("testing/checked_allocator.zig").run(retentionFixtureCases, .{});
}

fn retentionFixtureCases(a: std.mem.Allocator) !void {
    for ([_][]const u8{ "form-01.hwp", "form-02.hwp" }) |name| {
        const path = try std.fmt.allocPrint(a, "reference/rhwp/samples/{s}", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(2_000_000));
        defer a.free(input);
        var source = try @import("hwp5/text_source.zig").Source.open(a, input);
        defer source.deinit();
        const bytes = try source.decodeSection(a, 0);
        defer a.free(bytes);
        var tree = try @import("hwp5/body/tree.zig").Tree.parse(a, bytes, source.header.version(), .{});
        defer tree.deinit(a);
        var forms = try @import("hwp5/body/form_control.zig").collectObservedUnits(a, tree, .{});
        defer forms.deinit(a);
        try std.testing.expectEqual(@as(usize, 5), forms.forms.len);
        var links = try @import("hwp5/body/control_links.zig").Links.build(a, tree);
        defer links.deinit(a);
        var observed: usize = 0;
        const rules = @import("hwp5/body/control_rules.zig");
        for (links.items) |link| {
            if (link.header_id != rules.form_id) continue;
            try std.testing.expectEqual(rules.form_id, link.id);
            try std.testing.expectEqual(@as(u16, 11), link.code);
            try std.testing.expectEqual(.exact, link.identity);
            try std.testing.expectEqual(@as(?u16, null), rules.expectedCode(link.id));
            observed += 1;
            std.debug.print("fixture={s} control={d} token={d} code={d} exact=true\n", .{ name, link.control_node, link.start_unit, link.code });
        }
        try std.testing.expectEqual(forms.forms.len, observed);
        const report = try @import("hwp5/body/control_type_validation.zig").inspect(links.items);
        try std.testing.expectEqual(observed, report.deferred);
        try @import("hwp5/edit/source_policy.zig").validateFieldTransaction(a, bytes, source.header.version());
        try std.testing.expectError(error.UnsupportedSectionControl, @import("hwp5/edit/control_source.zig").validate(a, tree));
        try @import("hwp5/edit/control_source.zig").validateWithSource(a, tree, bytes, source.header.version());
        const retention = @import("hwp5/edit/form_source_retention.zig");
        try @import("testing/allocation_failures.zig").check(struct {
            fn run(allocator: std.mem.Allocator, raw: []const u8, version: @import("hwp5/version.zig").Version, parsed: *@import("hwp5/body/tree.zig").Tree) !void {
                var result = try retention.collect(allocator, raw, version);
                defer result.deinit(allocator);
                try std.testing.expectEqual(@as(usize, 5), result.forms.len);
                for (result.forms) |bound| {
                    try std.testing.expect(result.allows(bound.offset, bound.payload));
                    try std.testing.expect(!result.allows(bound.offset + 1, bound.payload));
                    try std.testing.expect(!result.allows(bound.offset, "wrong"));
                }
                try @import("hwp5/edit/source_policy.zig").validateFieldTransaction(allocator, raw, version);
                try @import("hwp5/edit/control_source.zig").validateWithSource(allocator, parsed.*, raw, version);
            }
        }.run, .{ bytes, source.header.version(), &tree });
        var paired = try @import("hwp5/body/form_links.zig").collectObservedUnits(a, tree, .{});
        defer paired.deinit(a);
        const first = paired.links[0];
        const text = tree.nodes[first.text_node].record.value.text.raw;
        const token_offset = @intFromPtr(text.ptr) - @intFromPtr(bytes.ptr) + first.start_unit * 2;
        const changed = try a.dupe(u8, bytes);
        defer a.free(changed);
        std.mem.writeInt(u16, changed[token_offset..][0..2], 17, .little);
        std.mem.writeInt(u16, changed[token_offset + 14 ..][0..2], 17, .little);
        try std.testing.expectError(error.FormControlCodeMismatch, retention.collect(a, changed, source.header.version()));
        @memcpy(changed, bytes);
        const object_offset = tree.nodes[paired.forms.forms[0].object_node].record.framing.offset;
        const framing = std.mem.readInt(u32, changed[object_offset..][0..4], .little);
        std.mem.writeInt(u32, changed[object_offset..][0..4], (framing & ~@as(u32, 0x3ff)) | 76, .little);
        try std.testing.expectError(error.MissingFormObject, retention.collect(a, changed, source.header.version()));
        @memcpy(changed, bytes);
        const object_payload = tree.nodes[paired.forms.forms[0].object_node].record.framing.payload;
        const type_offset = @intFromPtr(object_payload.ptr) - @intFromPtr(bytes.ptr);
        @memcpy(changed[type_offset..][0..4], "zzzz");
        try std.testing.expectError(error.UnsupportedFormSourceType, retention.collect(a, changed, source.header.version()));
        const control = tree.nodes[first.control_node].record.framing;
        const append_at = @intFromPtr(control.payload.ptr) - @intFromPtr(bytes.ptr) + control.payload.len;
        const extension = try a.alloc(u8, bytes.len + 1);
        defer a.free(extension);
        @memcpy(extension[0..append_at], bytes[0..append_at]);
        extension[append_at] = 0xa5;
        @memcpy(extension[append_at + 1 ..], bytes[append_at..]);
        const original_header = std.mem.readInt(u32, bytes[control.offset..][0..4], .little);
        std.mem.writeInt(u32, extension[control.offset..][0..4], (original_header & 0xfffff) | (@as(u32, @intCast(control.payload.len + 1)) << 20), .little);
        try std.testing.expectError(error.UnsupportedFormSourceExtension, retention.collect(a, extension, source.header.version()));
        try std.testing.expectError(error.UnsupportedFormSourceVersion, retention.collect(a, bytes, .{ .raw = 0x05000301 }));
        try std.testing.expectEqualSlices(u8, input, source.file.bytes);
    }
}
