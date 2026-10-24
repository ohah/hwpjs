//! Actual malformed formula sources must only block edits in their dependencies.
const std = @import("std");
const a = std.testing.allocator;

test "unrelated formula refresh actual fixtures preserve commands and dependency failures" {
    const paths = [_][]const u8{
        "reference/rhwp/samples/issue6023/30269_reform_recommendation.hwp",
        "reference/rhwp/samples/task2430/1382000_domestic_violence_survey.hwp",
        "reference/rhwp/samples/loading-fail-01.hwp",
    };
    for (paths, 0..) |path, fixture| {
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(32_000_000));
        defer a.free(input);
        var source = try @import("../text_source.zig").Source.openReadOnly(a, input);
        defer source.deinit();
        const bytes = try source.decodeSection(a, 0);
        defer a.free(bytes);
        var doc = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
        defer doc.deinit(a);
        const recalc = @import("formula_recalculate.zig");
        const expected = if (fixture == 2) error.UnsupportedMergedFormulaCell else error.InvalidFormulaNumber;
        try std.testing.expectError(expected, recalc.applyDraft(a, bytes, source.header.version(), &doc.sections[0], 65536, .{}));
        // Failed draft evaluation is discarded, just as in the transaction owner.
        var fresh = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
        defer fresh.deinit(a);
        try @import("formula_splice.zig").apply(a, bytes, source.header.version(), &fresh.sections[0], .{ .section = 0, .paragraph = 0, .start_unit = 0, .end_unit = 0, .utf8 = "검증" }, 65536);
        for (fresh.sections[0].paragraphs) |p| try std.testing.expect(p.formula_results == null);
        const saved = try @import("text_section_writer.zig").write(a, bytes, fresh.sections[0], source.header.version(), 32_000_000);
        defer a.free(saved);
        var reopened = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{saved});
        defer reopened.deinit(a);
        const text = try @import("plain_text_content.zig").textBytes(a, fresh.sections[0].paragraphs[0]);
        defer a.free(text);
        const recovered = try @import("plain_text_content.zig").textBytes(a, reopened.sections[0].paragraphs[0]);
        defer a.free(recovered);
        try std.testing.expectEqualSlices(u8, text, recovered);
        // The bad referenced cells are still rejected when explicitly evaluated.
        try std.testing.expectError(expected, recalc.applyDraft(a, saved, source.header.version(), &reopened.sections[0], 65536, .{}));
        var before_tree = try @import("source_tree.zig").parse(a, bytes, source.header.version(), .{});
        defer before_tree.deinit(a);
        var after_tree = try @import("source_tree.zig").parse(a, saved, source.header.version(), .{});
        defer after_tree.deinit(a);
        var next_control: usize = 0;
        for (before_tree.nodes) |before_node| {
            if (before_node.record.value != .control_header) continue;
            while (next_control < after_tree.nodes.len and after_tree.nodes[next_control].record.value != .control_header) next_control += 1;
            try std.testing.expect(next_control < after_tree.nodes.len);
            try std.testing.expectEqualSlices(u8, before_node.record.framing.payload, after_tree.nodes[next_control].record.framing.payload);
            next_control += 1;
        }
        for (after_tree.nodes[next_control..]) |node| try std.testing.expect(node.record.value != .control_header);
        var rejected: ?usize = null;
        for (doc.sections[0].paragraphs, 0..) |_, index| {
            var candidate = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
            defer candidate.deinit(a);
            @import("formula_splice.zig").apply(a, bytes, source.header.version(), &candidate.sections[0], .{ .section = 0, .paragraph = index, .start_unit = 0, .end_unit = 0, .utf8 = "검증" }, 65536) catch |err| {
                if (err != expected) continue;
                const unchanged = try @import("text_section_writer.zig").write(a, bytes, candidate.sections[0], source.header.version(), 32_000_000);
                defer a.free(unchanged);
                try std.testing.expectEqualSlices(u8, bytes, unchanged);
                rejected = index;
                break;
            };
        }
        try std.testing.expect(rejected != null);
        std.debug.print("\ndependent paragraph {d}: rejected atomically with {s}\n", .{ rejected.?, @errorName(expected) });
        std.debug.print("\nfixture {s}: unrelated splice/reopen OK; retained {s}\n", .{ path, @errorName(expected) });
    }
}
