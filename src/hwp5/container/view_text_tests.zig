const std = @import("std");
const t = std.testing;
const c = @import("validation.zig");
const f = @import("../document/test_fixture.zig");
const writer = @import("../../cfb/writer.zig");
const opts: c.Options = .{ .document = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } } };
fn fixture(a: std.mem.Allocator, declared: bool, present: bool, bad: bool) ![]u8 {
    var h = f.header();
    f.put(&h, 36, u32, if (declared) 16384 else 0);
    const doc = try f.docInfo(a, 1);
    defer a.free(doc);
    const body = try f.section(a);
    defer a.free(body);
    var view = [_]u8{0} ** 5;
    f.put(&view, 0, u32, 999 | (1023 << 10) | (@as(u32, if (bad) 2 else 1) << 20));
    const nodes = [_]writer.Node{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = &h },
        .{ .name = "DocInfo", .parent = 0, .content = doc },
        .{ .name = "BodyText", .parent = 0, .kind = 1 },
        .{ .name = "Section0", .parent = 3, .content = body },
        .{ .name = "ViewText", .parent = 0, .kind = 1 },
        .{ .name = "Section0", .parent = 5, .content = &view },
    };
    return writer.write(a, nodes[0..if (present) 7 else 5], .{});
}
fn success(a: std.mem.Allocator, bytes: []const u8) !void {
    var r = try c.inspect(a, bytes, opts);
    defer r.deinit(a);
    try t.expect(r.view_text.present);
    try t.expectEqual(1, r.view_text.sections);
    try t.expectEqual(1, r.view_text.records);
    try t.expectEqual(1, r.view_text.deferred_records);
    try t.expectEqual(5, r.view_text.decoded_bytes);
    try t.expectEqual(0, r.uninspected_streams);
}
fn failure(a: std.mem.Allocator, bytes: []const u8) !void {
    var r = c.inspect(a, bytes, opts) catch |err| switch (err) {
        error.UnexpectedEnd => return,
        else => return err,
    };
    defer r.deinit(a);
    return error.ExpectedViewTextFailure;
}
fn encryptedSuccess(a: std.mem.Allocator, bytes: []const u8) !void {
    var r = try c.inspect(a, bytes, opts);
    defer r.deinit(a);
    try t.expectEqual(8, r.view_text.records);
    try t.expectEqual(32, r.view_text.decoded_bytes);
}
fn encryptedLimitFailure(a: std.mem.Allocator, bytes: []const u8) !void {
    var limited = opts;
    limited.max_viewtext_ciphertext_bytes = 31;
    var r = c.inspect(a, bytes, limited) catch |err| switch (err) {
        error.LimitExceeded => return,
        else => return err,
    };
    defer r.deinit(a);
    return error.ExpectedDistributionLimit;
}
test "distribution ViewText integration owns decoded buffers and bounds ciphertext" {
    const source = try fixture(t.allocator, true, true, false);
    defer t.allocator.free(source);
    var file = try @import("../../cfb/reader.zig").File.open(t.allocator, source, .{ .strict = true });
    defer file.deinit();
    const nodes = try file.toNodes(t.allocator);
    defer t.allocator.free(nodes);
    var raw = [_]u8{0} ** 292;
    f.put(&raw, 0, u32, 0x1000001c);
    f.put(&raw, 4, u32, 5);
    var plain = [_]u8{0} ** 32;
    for (0..8) |i| f.put(&plain, i * 4, u32, 999);
    const cipher = std.crypto.core.aes.Aes128.initEnc(@import("../distribution/key.zig").derive(raw[4..260]));
    for (0..2) |i| cipher.encrypt(raw[260 + i * 16 ..][0..16], plain[i * 16 ..][0..16]);
    // toNodes compacts unused CFB entries: do not reuse physical directory IDs.
    var view_parent: ?usize = null;
    for (nodes, 0..) |node, i| {
        if (node.parent == 0 and std.mem.eql(u8, node.name, "ViewText")) view_parent = i;
    }
    for (nodes) |*node| {
        if (node.parent == view_parent.? and std.mem.eql(u8, node.name, "Section0")) node.content = &raw;
    }
    const encoded = try writer.write(t.allocator, nodes, .{});
    defer t.allocator.free(encoded);
    try t.checkAllAllocationFailures(t.allocator, encryptedSuccess, .{encoded});
    try t.checkAllAllocationFailures(t.allocator, encryptedLimitFailure, .{encoded});
}
test "ViewText framing success and late failure clean every allocation" {
    const good = try fixture(t.allocator, true, true, false);
    defer t.allocator.free(good);
    try t.checkAllAllocationFailures(t.allocator, success, .{good});
    const bad = try fixture(t.allocator, true, true, true);
    defer t.allocator.free(bad);
    try t.checkAllAllocationFailures(t.allocator, failure, .{bad});
}
test "ViewText presence is independent of declaration and shares global limits" {
    for ([_]bool{ false, true }) |declared| {
        const good = try fixture(t.allocator, declared, true, false);
        defer t.allocator.free(good);
        var report = try c.inspect(t.allocator, good, opts);
        defer report.deinit(t.allocator);
        try t.expectEqual(declared, report.view_text.declared);
        var limits = opts;
        limits.document.max_total_bytes = report.total_decoded_bytes;
        limits.document.max_total_records = report.document.total_records + 1;
        var exact = try c.inspect(t.allocator, good, limits);
        exact.deinit(t.allocator);
        limits.document.max_total_bytes -= 1;
        try t.expectError(error.LimitExceeded, c.inspect(t.allocator, good, limits));
        limits.document.max_total_bytes += 1;
        limits.document.max_total_records -= 1;
        try t.expectError(error.LimitExceeded, c.inspect(t.allocator, good, limits));
        const absent = try fixture(t.allocator, declared, false, false);
        defer t.allocator.free(absent);
        if (declared) {
            try t.expectError(error.MissingViewText, c.inspect(t.allocator, absent, opts));
        } else {
            var plain = try c.inspect(t.allocator, absent, opts);
            defer plain.deinit(t.allocator);
            try t.expect(!plain.view_text.present);
        }
    }
}

test "ViewText record budget spans multiple sections and late framing failure cleans up" {
    var h = f.header();
    f.put(&h, 36, u32, 16384);
    const doc = try f.docInfo(t.allocator, 2);
    defer t.allocator.free(doc);
    const body = try f.section(t.allocator);
    defer t.allocator.free(body);
    var view = [_]u8{0} ** 8;
    f.put(&view, 0, u32, 999);
    f.put(&view, 4, u32, 998);
    const nodes = [_]writer.Node{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = &h },
        .{ .name = "DocInfo", .parent = 0, .content = doc },
        .{ .name = "BodyText", .parent = 0, .kind = 1 },
        .{ .name = "Section0", .parent = 3, .content = body },
        .{ .name = "Section1", .parent = 3, .content = body },
        .{ .name = "ViewText", .parent = 0, .kind = 1 },
        .{ .name = "Section1", .parent = 6, .content = &view },
        .{ .name = "Section0", .parent = 6, .content = view[0..4] },
    };
    const good = try writer.write(t.allocator, &nodes, .{});
    defer t.allocator.free(good);
    var report = try c.inspect(t.allocator, good, opts);
    defer report.deinit(t.allocator);
    try t.expectEqual(2, report.view_text.sections);
    try t.expectEqual(3, report.view_text.records);
    var limits = opts;
    limits.document.max_total_records = report.document.total_records + 2;
    try t.expectError(error.LimitExceeded, c.inspect(t.allocator, good, limits));
    f.put(&view, 4, u32, 998 | (1 << 20));
    const bad = try writer.write(t.allocator, &nodes, .{});
    defer t.allocator.free(bad);
    try t.checkAllAllocationFailures(t.allocator, failure, .{bad});
}
