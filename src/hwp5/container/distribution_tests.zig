const std = @import("std");
const t = std.testing;
const c = @import("validation.zig");
const fixture = @import("distribution_test_fixture.zig");
const opts: c.Options = .{ .document = .{ .distribution = .observed_viewtext, .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } } };
test "distribution container history consumes actual remaining record budget" {
    const bytes = try fixture.makeWithHistory(t.allocator, false, false, true);
    defer t.allocator.free(bytes);
    var baseline = try c.inspect(t.allocator, bytes, opts);
    defer baseline.deinit(t.allocator);
    var options = opts;
    options.history = .{ .encoding = .decoded, .item = .{ .start_layout = .spec_flag_first } };
    options.document.max_total_records = baseline.document.total_records + 2;
    options.document.max_total_bytes = baseline.total_decoded_bytes + 16;
    var exact = try c.inspect(t.allocator, bytes, options);
    defer exact.deinit(t.allocator);
    try t.expectEqual(@as(usize, 2), exact.history.?.records);
    try t.expectEqual(@as(usize, 16), exact.history.?.decoded_bytes);
    try t.expectEqual(baseline.uninspected_streams - 1, exact.uninspected_streams);
    options.document.max_total_records -= 1;
    try t.expectError(error.LimitExceeded, c.inspect(t.allocator, bytes, options));
    options.document.max_total_records += 1;
    options.document.max_total_bytes -= 1;
    try t.expectError(error.LimitExceeded, c.inspect(t.allocator, bytes, options));
}
fn exercise(a: std.mem.Allocator, late: bool) !void {
    const bytes = try fixture.make(a, false, late);
    defer a.free(bytes);
    var options = opts;
    if (late) options.preview_image = .{ .images = .{}, .empty = .reject, .unhandled = .reject };
    var report = c.inspect(a, bytes, options) catch |err| {
        if (late and err == error.UnsupportedPreviewImage) return;
        return err;
    };
    defer report.deinit(a);
    try t.expect(!late);
    try t.expectEqual(.distribution_viewtext, report.primary_source);
    try t.expectEqual(@as(u32, 5), report.document.header.flags());
    try t.expectEqual(@as(usize, 6), report.document.sections.len);
    try t.expectEqual(@as(usize, 24), report.view_text.records);
    try t.expectEqual(@as(usize, 1), report.uninspected_streams);
    try t.expectEqual(@as(usize, 8), report.scripts.decoded_bytes);
    try t.expect(report.scripts.version != null);
    try t.expectEqual(report.document.total_bytes + 8, report.total_decoded_bytes);
    try t.expect(report.view_text_semantics == null); // Primary report is document, not a second allocation.
}
test "distribution container chooses six primary ViewText sections and cleans late failures" {
    try exercise(t.allocator, false);
    try exercise(t.allocator, true);
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try exercise(checked.allocator(), false);
    try exercise(checked.allocator(), true);
    try t.expectEqual(@as(usize, 0), checked.total_requested_bytes);
    try t.checkAllAllocationFailures(t.allocator, exercise, .{false});
    try t.checkAllAllocationFailures(t.allocator, exercise, .{true});
}
test "distribution container requires primary ViewText and keeps default rejection" {
    const missing = try fixture.make(t.allocator, true, false);
    defer t.allocator.free(missing);
    try t.expectError(error.MissingViewText, c.inspect(t.allocator, missing, opts));
    var off = opts;
    off.document.distribution = .reject;
    try t.expectError(error.UnsupportedDistribution, c.inspect(t.allocator, missing, off));
}
test "distribution container budgets do not charge primary ViewText twice" {
    const bytes = try fixture.make(t.allocator, false, false);
    defer t.allocator.free(bytes);
    var baseline = try c.inspect(t.allocator, bytes, opts);
    defer baseline.deinit(t.allocator);
    var options = opts;
    options.document.max_total_bytes = baseline.total_decoded_bytes;
    options.document.max_total_records = baseline.document.total_records;
    options.view_text_semantics = .strict_document_rules;
    options.history = .{ .encoding = .decoded, .item = .{ .start_layout = .spec_flag_first } };
    var exact = try c.inspect(t.allocator, bytes, options);
    defer exact.deinit(t.allocator);
    try t.expectEqualDeep(baseline.document.sections, exact.document.sections);
    try t.expect(exact.view_text_semantics == null);
    try t.expect(exact.history != null);
    options.document.max_total_records -= 1;
    try t.expectError(error.LimitExceeded, c.inspect(t.allocator, bytes, options));
    options.document.max_total_records += 1;
    options.document.max_total_bytes -= 1;
    try t.expectError(error.LimitExceeded, c.inspect(t.allocator, bytes, options));
    options.document.max_total_bytes += 1;
    options.max_script_ciphertext_bytes = 48;
    var bounded = try c.inspect(t.allocator, bytes, options);
    defer bounded.deinit(t.allocator);
    try t.expectEqual(@as(usize, 8), bounded.scripts.decoded_bytes);
    options.max_script_ciphertext_bytes -= 1;
    try t.expectError(error.LimitExceeded, c.inspect(t.allocator, bytes, options));
}
