const std = @import("std");
const trees = @import("xml_part_tree.zig");
const writer = @import("equation_script_write.zig");
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run><p:equation version='opaque' baseLine='7'>";
const suffix = "<p:sz width='123'/></p:equation><p:t>untouched</p:t></p:run></p:p></s:sec>";

test "equation script source actual fixtures ZIP reopen preserves unrelated payloads" {
    const a = std.testing.allocator;
    const zip = @import("../zip/archive.zig");
    const equations = @import("equation.zig");
    const paths = [_][]const u8{
        "reference/rhwp/samples/수식-문자처럼취급-아님.hwpx",
        "reference/rhwp/samples/정책연구용역사업 중간진도보고서(살아있는 간장 기증자의 의학적 선별기준 연구).hwpx",
    };
    for (paths) |path| {
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(16_000_000));
        defer a.free(input);
        var session = try @import("editor_session.zig").open(a, input, .{});
        defer session.deinit();
        var tested: usize = 0;
        for (session.sections, 0..) |*section, section_index| {
            var before = try equations.inspect(a, &.{section.tree}, .{});
            defer before.deinit();
            if (before.equations.len == 0) continue;
            const chosen = before.equations[0];
            try std.testing.expectEqual(@as(usize, 1), chosen.script_count);
            const value = "{a+b} over {c-d} 한😀<&\r";
            const changed_xml = try writer.write(a, &section.tree, chosen.element_index, value, .{});
            defer a.free(changed_xml);
            const saved = try @import("../zip/replace_writer.zig").write(a, input, &.{.{ .entry_index = section.entry_index, .bytes = changed_xml }}, .{});
            defer a.free(saved);
            var reopened = try @import("editor_session.zig").open(a, saved, .{});
            defer reopened.deinit();
            var after = try equations.inspect(a, &.{reopened.sections[section_index].tree}, .{});
            defer after.deinit();
            try std.testing.expectEqual(before.equations.len, after.equations.len);
            try std.testing.expectEqual(before.scripts.len, after.scripts.len);
            for (before.equations, after.equations) |original, changed| {
                try std.testing.expectEqualDeep(original.attributes, changed.attributes);
                try std.testing.expectEqual(original.shape_child_count, changed.shape_child_count);
            }
            for (before.scripts, after.scripts, 0..) |original, changed, index| {
                try std.testing.expectEqualStrings(if (index == chosen.first_script) value else original.value, changed.value);
            }
            var original_zip = try zip.open(a, input, .{});
            defer original_zip.deinit();
            var changed_zip = try zip.open(a, saved, .{});
            defer changed_zip.deinit();
            try std.testing.expectEqual(original_zip.entries.len, changed_zip.entries.len);
            for (original_zip.entries, changed_zip.entries, 0..) |original, changed, index| {
                try std.testing.expectEqualStrings(original.name, changed.name);
                if (index == section.entry_index) continue;
                try std.testing.expectEqual(original.crc32, changed.crc32);
                try std.testing.expectEqualSlices(u8, original.compressed, changed.compressed);
            }
            const unchanged = try session.save();
            defer a.free(unchanged);
            try std.testing.expectEqualSlices(u8, input, unchanged);
            tested += 1;
        }
        try std.testing.expect(tested > 0);
    }
}

test "equation script source preserves opaque bytes comments and normalized no-op" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:script custom='keep'>A<!--hold-->B<?keep x?><![CDATA[C<&]]></p:script>" ++ suffix;
    var tree = try trees.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    const unchanged = try writer.write(a, &tree, 3, "ABC<&", .{});
    defer a.free(unchanged);
    try std.testing.expectEqualStrings(source, unchanged);
    const output = try writer.write(a, &tree, 3, "한😀<&\r", .{});
    defer a.free(output);
    try std.testing.expectEqualStrings(prefix ++ "<p:script custom='keep'>한😀&lt;&amp;&#13;<!--hold--><?keep x?></p:script>" ++ suffix, output);
    var parsed = try trees.parse(a, output, .section, 0, 0, .{});
    defer parsed.deinit(a);
    const again = try writer.write(a, &parsed, 3, "한😀<&\r", .{});
    defer a.free(again);
    try std.testing.expectEqualStrings(output, again);
    try std.testing.expectEqualStrings(source, tree.source);
}

test "equation script source rejects ambiguous missing nested targets and respects budgets" {
    const a = std.testing.allocator;
    const cases = [_]struct { script: []const u8, failure: ?anyerror }{
        .{ .script = "<p:script/>", .failure = null },
        .{ .script = "<p:script/><p:script/>", .failure = error.DuplicateEquationScript },
        .{ .script = "<x:script/>", .failure = error.MissingEquationScript },
        .{ .script = "<p:script><x:node/></p:script>", .failure = error.InvalidEquationScriptChild },
    };
    for (cases) |case| {
        const source = try std.fmt.allocPrint(a, "{s}{s}{s}", .{ prefix, case.script, suffix });
        defer a.free(source);
        var tree = try trees.parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        if (case.failure) |failure| {
            try std.testing.expectError(failure, writer.write(a, &tree, 3, "&", .{}));
        } else {
            const output = try writer.write(a, &tree, 3, "&", .{ .max_script_bytes = 1 });
            defer a.free(output);
            try std.testing.expectEqualStrings(prefix ++ "<p:script>&amp;</p:script>" ++ suffix, output);
            try std.testing.expectError(error.LimitExceeded, writer.write(a, &tree, 3, "ab", .{ .max_script_bytes = 1 }));
            try std.testing.expectError(error.LimitExceeded, writer.write(a, &tree, 3, "&", .{ .max_output_bytes = output.len - 1 }));
            try std.testing.expectError(error.InvalidXmlCharacter, writer.write(a, &tree, 3, &.{0}, .{}));
            try std.testing.expectError(error.InvalidXmlEncoding, writer.write(a, &tree, 3, &.{0x80}, .{}));
            try std.testing.expectError(error.InvalidEquationNode, writer.write(a, &tree, 9999, "x", .{}));
            try std.testing.expectError(error.InvalidEquationSelection, writer.write(a, &tree, 3, "x", .{ .selection = .{} }));
        }
    }
}

test "equation script source full allocation failure cleanup" {
    const a = std.testing.allocator;
    var tree = try trees.parse(a, prefix ++ "<p:script>A<![CDATA[B]]><!--hold-->C</p:script>" ++ suffix, .section, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: *const trees.Tree) !void {
            const output = try writer.write(allocator, input, 3, "한😀<&\r", .{});
            defer allocator.free(output);
        }
    }.run, .{&tree});
}

test "equation script source refuses inactive branches and text descendant spoofs" {
    const a = std.testing.allocator;
    const root = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run>";
    const equation = "<p:p><p:run><p:equation><p:script>x</p:script></p:equation></p:run></p:p>";
    const sources = [_][]const u8{
        root ++ "<p:t>" ++ equation ++ "</p:t></p:run></p:p></s:sec>",
        root ++ "<p:switch><p:case required-namespace='urn:unsupported'>" ++ equation ++ "</p:case><p:default/></p:switch></p:run></p:p></s:sec>",
    };
    for (sources) |source| {
        var tree = try trees.parse(a, source, .section, 0, 0, .{});
        defer tree.deinit(a);
        var found: usize = 0;
        for (tree.elements, 0..) |element, index| {
            if (!element.is(@import("document_xml.zig").paragraph_uri, "equation")) continue;
            found += 1;
            try std.testing.expectError(error.InactiveEquationNode, writer.write(a, &tree, index, "changed", .{}));
        }
        try std.testing.expectEqual(@as(usize, 1), found);
    }
}

test "equation script source refuses UTF16 without transcoding and bounds no-op copies" {
    const a = std.testing.allocator;
    const ascii = prefix ++ "<p:script>x</p:script>" ++ suffix;
    for ([_]std.builtin.Endian{ .little, .big }) |endian| {
        const bytes = try a.alloc(u8, 2 + ascii.len * 2);
        defer a.free(bytes);
        std.mem.writeInt(u16, bytes[0..2], 0xfeff, endian);
        for (ascii, 0..) |byte, index| std.mem.writeInt(u16, bytes[2 + index * 2 ..][0..2], byte, endian);
        var tree = try trees.parse(a, bytes, .section, 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(error.UnsupportedEditEncoding, writer.write(a, &tree, 3, "new", .{}));
        try std.testing.expectEqualSlices(u8, bytes, tree.source);
    }
    var tree = try trees.parse(a, ascii, .section, 0, 0, .{});
    defer tree.deinit(a);
    const exact = try writer.write(a, &tree, 3, "x", .{ .max_output_bytes = ascii.len, .max_script_bytes = 1 });
    defer a.free(exact);
    try std.testing.expectEqualStrings(ascii, exact);
    try std.testing.expectError(error.LimitExceeded, writer.write(a, &tree, 3, "x", .{ .max_output_bytes = ascii.len - 1 }));
}
