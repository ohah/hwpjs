const std = @import("std");

test "original cross reference control document three bookmark name results match stored ordinary output independently of cache" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpctl_ParameterSetID_Item_v1.2.hwp", a, .limited(32_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.openReadOnly(a, input);
    defer source.deinit();
    var count: usize = 0;
    for (0..source.section_count) |section| {
        const bytes = try source.decodeSection(a, section);
        defer a.free(bytes);
        const sites = try @import("cross_reference_bookmark_sites.zig").collect(a, bytes, source.header.version(), section);
        defer a.free(sites);
        var doc = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
        defer doc.deinit(a);
        const no_op = try @import("cross_reference_name_apply.zig").apply(a, bytes, source.header.version(), &doc.sections[0], sites, 65536);
        try std.testing.expectEqual(@as(usize, 3), no_op.processed);
        try std.testing.expectEqual(@as(usize, 0), no_op.changed);
        const unchanged = try @import("text_section_writer.zig").write(a, bytes, doc.sections[0], source.header.version(), 32 * 1024 * 1024);
        defer a.free(unchanged);
        try std.testing.expectEqualSlices(u8, bytes, unchanged);
        const bindings = try @import("field_bindings.zig").collect(a, bytes, source.header.version(), doc.sections[0]);
        defer a.free(bindings);
        for (bindings) |binding| {
            if (binding.span.field_id != @import("../body/control_rules.zig").id("%xrf")) continue;
            const view = try @import("../body/cross_reference_command.zig").View.parse(binding.properties.command);
            const value = try @import("../body/cross_reference_name_result.zig").evaluate(view, sites);
            try std.testing.expectEqual(binding.span.begin.paragraph, binding.span.end.paragraph);
            const text = try @import("plain_text.zig").textBytes(a, doc.sections[0].paragraphs[binding.span.begin.paragraph]);
            defer a.free(text);
            const begin = binding.span.begin.unit * 2;
            const end = binding.span.end.unit * 2;
            try std.testing.expectEqualSlices(u8, text[begin..end], value);
            // Change the actual owned model label, not just a temporary text copy.
            for (doc.sections[0].paragraphs[binding.span.begin.paragraph].tokens) |token| {
                if (token.kind != .text) continue;
                const from = @max(binding.span.begin.unit, token.start_unit);
                const to = @min(binding.span.end.unit, token.start_unit + token.raw.len / 2);
                if (from >= to) continue;
                for (from..to) |unit| std.mem.writeInt(u16, token.raw[(unit - token.start_unit) * 2 ..][0..2], 'X', .little);
            }
            const changed = try @import("plain_text.zig").textBytes(a, doc.sections[0].paragraphs[binding.span.begin.paragraph]);
            defer a.free(changed);
            try std.testing.expect(!std.mem.eql(u8, value, changed[begin..end]));
            try std.testing.expectEqualSlices(u8, value, try @import("../body/cross_reference_name_result.zig").evaluate(view, sites));
            count += 1;
        }
        const first = for (bindings) |binding| {
            if (binding.span.field_id == @import("../body/control_rules.zig").id("%xrf")) break binding;
        } else return error.TestExpectedEqual;
        const first_site = (try @import("../body/cross_reference_name_target.zig").resolveCommand(try @import("../body/cross_reference_command.zig").View.parse(first.properties.command), sites)).?;
        // The first two labels can update, but the final different target is absent.
        try std.testing.expectError(error.UnresolvedCrossReferenceTarget, @import("cross_reference_name_apply.zig").apply(a, bytes, source.header.version(), &doc.sections[0], &.{first_site}, 65536));
        for (bindings) |binding| {
            if (binding.span.field_id != @import("../body/control_rules.zig").id("%xrf")) continue;
            const p = doc.sections[0].paragraphs[binding.span.begin.paragraph];
            try std.testing.expect(p.range_tags == null);
            const text = try @import("plain_text.zig").textBytes(a, p);
            defer a.free(text);
            for (binding.span.begin.unit..binding.span.end.unit) |unit| try std.testing.expectEqual(@as(u16, 'X'), std.mem.readInt(u16, text[unit * 2 ..][0..2], .little));
        }
        const restored = try @import("cross_reference_name_apply.zig").apply(a, bytes, source.header.version(), &doc.sections[0], sites, 65536);
        try std.testing.expectEqual(@as(usize, 3), restored.processed);
        try std.testing.expectEqual(@as(usize, 3), restored.changed);
        const saved = try @import("text_section_writer.zig").write(a, bytes, doc.sections[0], source.header.version(), 32 * 1024 * 1024);
        defer a.free(saved);
        var reopened = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{saved});
        defer reopened.deinit(a);
        for (bindings) |binding| {
            if (binding.span.field_id != @import("../body/control_rules.zig").id("%xrf")) continue;
            const value = try @import("../body/cross_reference_name_result.zig").evaluate(try @import("../body/cross_reference_command.zig").View.parse(binding.properties.command), sites);
            const text = try @import("plain_text.zig").textBytes(a, reopened.sections[0].paragraphs[binding.span.begin.paragraph]);
            defer a.free(text);
            try std.testing.expectEqualSlices(u8, value, text[binding.span.begin.unit * 2 .. binding.span.end.unit * 2]);
        }
        var original_records = @import("../record.zig").Iterator.init(bytes, .{});
        var saved_records = @import("../record.zig").Iterator.init(saved, .{});
        while (try nextControl(&original_records)) |record| {
            const after = (try nextControl(&saved_records)) orelse return error.TestExpectedEqual;
            try std.testing.expectEqualSlices(u8, record.raw, after.raw);
        }
        try std.testing.expect(try nextControl(&saved_records) == null);
    }
    try std.testing.expectEqual(@as(usize, 3), count);
}

fn nextControl(it: *@import("../record.zig").Iterator) !?@import("../record.zig").Record {
    while (try it.next()) |record| if (record.tag == 71 or record.tag == 87) return record;
    return null;
}
