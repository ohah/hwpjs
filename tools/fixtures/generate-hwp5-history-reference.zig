//! 정확 old455만 사용하는 개발용 생성 진입점. 현재 엔진은 import하지 않는다.
const std = @import("std");
const builtin = @import("builtin");
const old = @import("original_hwp5_v2_compare.zig");
const edit = @import("hwp5/edit/style_preservation.zig");
const a = std.testing.allocator;
fn emit(id: []const u8, bytes: []const u8) !void {
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(bytes, &digest, .{});
    const hex = std.fmt.bytesToHex(digest, .lower);
    const name = try std.fmt.allocPrint(a, "output/{s}.hwp", .{hex});
    defer a.free(name);
    try std.Io.Dir.cwd().writeFile(std.testing.io, .{ .sub_path = name, .data = bytes });
    std.debug.print("GEN_BLOB|{s}|{s}|{}\n", .{ id, hex, bytes.len });
}
test "old455 golden: nine exact request keys and original undo redo witnesses" {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/noori.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(input, &digest, .{});
    try std.testing.expectEqualStrings("b18be0217a5d9f81e587705edc0c514cdd11e6314bbe434f17d256aa21b75a7f", &std.fmt.bytesToHex(digest, .lower));
    const source = try edit.Session.open(a, input);
    defer source.close();
    inline for (.{ .format, .table, .picture }) |kind| {
        var request: old.Request = .{ .kind = kind };
        if (kind == .table) {
            const bindings = try source.tableBindings(a, 0);
            defer a.free(bindings);
            if (bindings.len == 0) return error.RequiredTableFixtureCoverageMissing;
            request.node = bindings[0].list_node;
            request.width = try std.math.add(u32, bindings[0].width, 1);
            request.height = bindings[0].height;
        } else if (kind == .picture) {
            const pictures = try source.pictureSources(a, 0, .base73);
            defer a.free(pictures);
            if (pictures.len == 0) return error.RequiredPictureFixtureCoverageMissing;
            const components = try source.drawingComponentSources(a, 0);
            defer a.free(components);
            var found = false;
            for (components) |row| if (row.component_node == pictures[0].component_node) {
                request.node = @intCast(pictures[0].picture_node);
                request.width = try std.math.add(u32, row.current_width, 1);
                request.height = row.current_height;
                found = true;
                break;
            };
            if (!found) return error.RequiredPictureComponentMissing;
        }
        std.debug.print("GEN_REQUEST|run|{s}|{}|{}|{}|{}|{}\n", .{ @tagName(kind), request.section, request.paragraph, request.node, request.width, request.height });
        var result = try old.run(a, input, request);
        defer result.deinit();
        for (result.states, 0..) |bytes, i| {
            const id = try std.fmt.allocPrint(a, "run.{s}.{}", .{ @tagName(kind), i });
            defer a.free(id);
            try emit(id, bytes);
        }
        std.debug.print("GEN_WITNESS|run.{s}|undo3|redo3|exact\n", .{@tagName(kind)});
    }
    const current = try old.current20(a, input);
    defer a.free(current);
    try emit("current20", current);
    std.debug.print("GEN_WITNESS|current20|undo20|redo20|revision20\n", .{});
    const cost = try old.payloadCost(a, input);
    std.debug.print("GEN_TARGET|{s}|{s}|{s}|{}|{}\n", .{ @tagName(builtin.cpu.arch), @tagName(builtin.os.tag), @tagName(builtin.abi), @bitSizeOf(usize), cost });
    inline for (std.meta.tags(old.Refusal)) |kind| {
        const result = (try old.refusal(a, input, kind, if (kind == .payload) @intCast(cost) else null)) orelse return error.MissingBaselineResult;
        if (kind == .payload) {
            std.debug.print("GEN_ERROR|refusal.payload|{s}|{}|revision0|originalExact\n", .{ result, cost });
        } else {
            defer a.free(result);
            const id = try std.fmt.allocPrint(a, "refusal.{s}", .{@tagName(kind)});
            defer a.free(id);
            try emit(id, result);
            std.debug.print("GEN_WITNESS|refusal.{s}|oldAssertionsPassed\n", .{@tagName(kind)});
        }
    }
}
