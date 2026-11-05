const std = @import("std");
const candidate = @import("header_resource_save.zig");
const planner = @import("header_batch_resource_save.zig");
const Paras = @import("paragraph_resource_values.zig").Values;
const Chars = @import("character_resource_values.zig").Values;
const Fonts = @import("../model/font_resource_values.zig").Values;
const a = std.testing.allocator;

// The caller supplies its existing sequential fallback, never the fast entry.
pub fn Cases(comptime sequential: anytype) type {
    return struct {
        const raw = struct {
            const replacementWithFonts = sequential;
        };
        fn fixture(allocator: std.mem.Allocator, top: []const u8, group: []const u8, lang: []const u8) ![]u8 {
            const header = try std.fmt.allocPrint(allocator, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:z='urn:opaque'><h:refList><h:fontfaces itemCnt='{s}'><h:fontface lang='{s}' fontCnt='{s}'><h:font id='0' face='Old'/><!--keep--></h:fontface></h:fontfaces><h:charProperties itemCnt='1'><h:charPr id='0' height='1000'><h:fontRef hangul='0' latin='0' hanja='0' japanese='0' other='0' symbol='0' user='0'/><z:keep/></h:charPr></h:charProperties><h:paraProperties itemCnt='1'><h:paraPr id='0'><h:align horizontal='LEFT'/></h:paraPr></h:paraProperties></h:refList></h:head>", .{ top, lang, group });
            defer allocator.free(header);
            return @import("test_formula_fixture.zig").zipWithSectionHeader(allocator, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>x</p:t></p:run></p:p></s:sec>", header);
        }
        fn compare(input: []const u8, p: *const Paras, c: *const Chars, f: *const Fonts, limit: usize) !void {
            const saved = try a.dupe(u8, input);
            defer a.free(saved);
            const expected = raw.replacementWithFonts(a, input, p, c, f, limit) catch |err| {
                if (err == error.OutOfMemory) return err;
                try std.testing.expectError(err, candidate.replacementWithFonts(a, input, p, c, f, limit));
                try std.testing.expectEqualSlices(u8, saved, input);
                return;
            };
            defer a.free(expected.bytes);
            const got = try candidate.replacementWithFonts(a, input, p, c, f, limit);
            defer a.free(got.bytes);
            try std.testing.expectEqual(expected.entry_index, got.entry_index);
            try std.testing.expectEqualSlices(u8, expected.bytes, got.bytes);
            try std.testing.expectEqualSlices(u8, saved, input);
        }
        test "canonical header: fontCnt fontfaces itemCnt decline and budgets" {
            const zeros: [512]u8 = @splat('0');
            const entity = try std.fmt.allocPrint(a, "&#{s}49;", .{zeros});
            defer a.free(entity);
            const leading = try std.fmt.allocPrint(a, "{s}1", .{zeros});
            defer a.free(leading);
            const p: Paras = .{};
            const c: Chars = .{};
            for ([_]bool{ false, true }) |top| for ([_][]const u8{ entity, leading }) |count| {
                const input = try fixture(a, if (top) count else "1", if (top) "1" else count, "HANGUL");
                defer a.free(input);
                var f: Fonts = .{};
                defer f.deinit(a);
                _ = try f.add(a, if (top) .latin else .hangul, if (top) 0 else 1, "New", 4096);
                var stats: planner.Stats = .{};
                try std.testing.expect((try planner.replacementCanonical(a, input, &p, &c, &f, 1_000_000, &stats)) == null);
                try std.testing.expectEqual(@as(usize, 0), stats.header_patches);
                var doc = try @import("package.zig").inspectDocument(a, input, .{});
                defer doc.deinit(a);
                var tree = try doc.readHeaderTree(a, .{});
                defer tree.deinit(a);
                try compare(input, &p, &c, &f, 1_000_000);
                try compare(input, &p, &c, &f, tree.source.len + 8);
                std.debug.print("COUNT top={any} rawFallback=true budget={d}\n", .{ top, tree.source.len + 8 });
            };
        }
        test "canonical header: canonical fast admission and creation order whole bytes" {
            const input = try fixture(a, "1", "1", "HANGUL");
            defer a.free(input);
            var p: Paras = .{};
            defer p.deinit(a);
            try p.entries.append(a, .{ .source_id = 0, .id = 1, .alignment = .CENTER });
            var c: Chars = .{};
            defer c.deinit(a);
            try c.entries.append(a, .{ .source_id = 0, .id = 1, .properties = .{ .size = 1200 } });
            try c.entries.append(a, .{ .source_id = 0, .id = 2, .properties = .{ .bold = true } });
            var f: Fonts = .{};
            defer f.deinit(a);
            _ = try f.add(a, .latin, 0, "LatinFirst", 4096);
            _ = try f.add(a, .hangul, 1, "Hangul", 4096);
            _ = try f.add(a, .latin, 1, "LatinLast", 4096);
            var stats: planner.Stats = .{};
            const got = (try planner.replacementCanonical(a, input, &p, &c, &f, 1_000_000, &stats)) orelse return error.FastPathNotEntered;
            defer a.free(got.bytes);
            try std.testing.expectEqual(@as(usize, 1), stats.header_patches);
            try std.testing.expectEqual(@as(usize, 2), stats.generated_characters);
            const expected = try raw.replacementWithFonts(a, input, &p, &c, &f, 1_000_000);
            defer a.free(expected.bytes);
            try std.testing.expectEqualSlices(u8, expected.bytes, got.bytes);
            try compare(input, &p, &c, &f, expected.bytes.len);
        }
        test "canonical header: source duplicate language combined failures match raw" {
            const input = try fixture(a, "1", "1", "HANGUL");
            defer a.free(input);
            var p: Paras = .{};
            defer p.deinit(a);
            var c: Chars = .{};
            defer c.deinit(a);
            var f: Fonts = .{};
            defer f.deinit(a);
            try p.entries.append(a, .{ .source_id = 999, .id = 1, .alignment = .CENTER });
            try c.entries.append(a, .{ .source_id = 999, .id = 0, .properties = .{ .size = 1200 } });
            _ = try f.add(a, .hangul, 0, "Duplicate", 4096);
            try compare(input, &p, &c, &f, 1_000_000);
            p.entries.clearRetainingCapacity();
            try compare(input, &p, &c, &f, 1_000_000);
            c.entries.items[0].source_id = 0;
            try compare(input, &p, &c, &f, 1_000_000);
            c.entries.clearRetainingCapacity();
            try compare(input, &p, &c, &f, 1_000_000);
            const bad = try fixture(a, "1", "1", "UNKNOWN");
            defer a.free(bad);
            try compare(bad, &p, &c, &f, 1_000_000);
            try compare(input, &p, &c, &f, 1);
        }
        test "canonical header: original batch entry remains distinct from canonical guard" {
            const input = try fixture(a, "0001", "1", "HANGUL");
            defer a.free(input);
            const p: Paras = .{};
            var c: Chars = .{};
            defer c.deinit(a);
            try c.entries.append(a, .{ .source_id = 0, .id = 1, .properties = .{ .size = 1200 } });
            const f: Fonts = .{};
            var x: planner.Stats = .{};
            var y: planner.Stats = .{};
            const before = (try planner.replacement(a, input, &p, &c, &f, 1_000_000, &x)) orelse return error.BatchPathNotEntered;
            defer a.free(before.bytes);
            const after = try candidate.replacementBatch(a, input, &p, &c, &f, 1_000_000, &y);
            defer a.free(after.bytes);
            try std.testing.expectEqualSlices(u8, before.bytes, after.bytes);
            try std.testing.expectEqualDeep(x, y);
            var z: planner.Stats = .{};
            try std.testing.expect((try planner.replacementCanonical(a, input, &p, &c, &f, 1_000_000, &z)) == null);
        }
        test "canonical header: existing allocator helper fast fallback OOM and input immutable" {
            const p: Paras = .{};
            var c: Chars = .{};
            defer c.deinit(a);
            try c.entries.append(a, .{ .source_id = 0, .id = 1, .properties = .{ .size = 1200 } });
            const f: Fonts = .{};
            for ([_][]const u8{ "1", "0001" }) |count| {
                const input = try fixture(a, count, "1", "HANGUL");
                defer a.free(input);
                const saved = try a.dupe(u8, input);
                defer a.free(saved);
                const expected = try raw.replacementWithFonts(a, input, &p, &c, &f, 1_000_000);
                defer a.free(expected.bytes);
                try @import("../testing/allocation_failures.zig").check(struct {
                    fn run(allocator: std.mem.Allocator, bytes: []const u8, paras: *const Paras, chars: *const Chars, fonts: *const Fonts, want: []const u8) !void {
                        const result = try candidate.replacementWithFonts(allocator, bytes, paras, chars, fonts, 1_000_000);
                        defer allocator.free(result.bytes);
                        try std.testing.expectEqualSlices(u8, want, result.bytes);
                    }
                }.run, .{ input, &p, &c, &f, expected.bytes });
                try std.testing.expectEqualSlices(u8, saved, input);
            }
        }

        fn budgetHeader(allocator: std.mem.Allocator, count: []const u8) ![]u8 {
            return std.fmt.allocPrint(allocator, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:z='urn:opaque'><h:refList><h:fontfaces itemCnt='1'><h:fontface lang='HANGUL' fontCnt='1'><h:font id='0' face='Old'/></h:fontface></h:fontfaces><h:paraProperties itemCnt='1'><h:paraPr id='0'><h:align horizontal='LEFT'/><z:keep value='a&amp;b'/></h:paraPr></h:paraProperties><h:charProperties itemCnt='{s}'><h:charPr id='0' height='1000'><h:fontRef hangul='0' latin='0' hanja='0' japanese='0' other='0' symbol='0' user='0'/><z:keep/></h:charPr></h:charProperties></h:refList></h:head>", .{count});
        }
        fn budgetInput(allocator: std.mem.Allocator, h: []const u8) ![]u8 {
            return @import("test_formula_fixture.zig").zipWithSectionHeader(allocator, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:t>x</p:t></p:run></p:p></s:sec>", h);
        }
        test "canonical header: encoded count shrinks after earlier prefix overflow" {
            const zeros: [512]u8 = @splat('0');
            for ([_]bool{ true, false }) |entity| {
                const count = if (entity) try std.fmt.allocPrint(a, "&#{s}49;", .{zeros}) else try std.fmt.allocPrint(a, "{s}1", .{zeros});
                defer a.free(count);
                const h = try budgetHeader(a, count);
                defer a.free(h);
                const package = try budgetInput(a, h);
                defer a.free(package);
                const original = try a.dupe(u8, package);
                defer a.free(original);
                var paras: Paras = .{};
                defer paras.deinit(a);
                try paras.entries.append(a, .{ .source_id = 0, .id = 1, .alignment = .CENTER });
                var chars: Chars = .{};
                defer chars.deinit(a);
                try chars.entries.append(a, .{ .source_id = 0, .id = 1, .properties = .{ .size = 1200 } });
                const fonts: Fonts = .{};
                const roomy = try raw.replacementWithFonts(a, package, &paras, &chars, &fonts, 1_000_000);
                defer a.free(roomy.bytes);
                const roomy_candidate = try candidate.replacementWithFonts(a, package, &paras, &chars, &fonts, 1_000_000);
                defer a.free(roomy_candidate.bytes);
                try std.testing.expectEqualSlices(u8, roomy.bytes, roomy_candidate.bytes);
                const limit = h.len + 8;
                try std.testing.expect(h.len <= limit);
                try std.testing.expect(roomy.bytes.len <= limit);
                try std.testing.expectError(error.LimitExceeded, raw.replacementWithFonts(a, package, &paras, &chars, &fonts, limit));
                try std.testing.expectError(error.LimitExceeded, candidate.replacementWithFonts(a, package, &paras, &chars, &fonts, limit));
                try std.testing.expectEqualSlices(u8, original, package);
            }
        }
        test "canonical header: canonical decimal count ordinary raw candidate equality" {
            const h = try budgetHeader(a, "1");
            defer a.free(h);
            const package = try budgetInput(a, h);
            defer a.free(package);
            var paras: Paras = .{};
            defer paras.deinit(a);
            try paras.entries.append(a, .{ .source_id = 0, .id = 1, .alignment = .CENTER });
            var chars: Chars = .{};
            defer chars.deinit(a);
            try chars.entries.append(a, .{ .source_id = 0, .id = 1, .properties = .{ .size = 1200 } });
            const fonts: Fonts = .{};
            const baseline = try raw.replacementWithFonts(a, package, &paras, &chars, &fonts, 1_000_000);
            defer a.free(baseline.bytes);
            const result = try candidate.replacementWithFonts(a, package, &paras, &chars, &fonts, baseline.bytes.len);
            defer a.free(result.bytes);
            try std.testing.expectEqualSlices(u8, baseline.bytes, result.bytes);
        }

        test "canonical header: rich fallback errors and original source preserved" {
            const h = try budgetHeader(a, "1");
            defer a.free(h);
            const package = try budgetInput(a, h);
            defer a.free(package);
            const original = try a.dupe(u8, package);
            defer a.free(original);
            var paras: Paras = .{};
            defer paras.deinit(a);
            var chars: Chars = .{};
            defer chars.deinit(a);
            try chars.entries.append(a, .{ .source_id = 0, .id = 1, .properties = .{ .underline_kind = .bottom } });
            const fonts: Fonts = .{};
            const baseline = try raw.replacementWithFonts(a, package, &paras, &chars, &fonts, 1_000_000);
            defer a.free(baseline.bytes);
            const result = try candidate.replacementWithFonts(a, package, &paras, &chars, &fonts, 1_000_000);
            defer a.free(result.bytes);
            try std.testing.expectEqualSlices(u8, baseline.bytes, result.bytes);
            try std.testing.expectError(error.LimitExceeded, raw.replacementWithFonts(a, package, &paras, &chars, &fonts, 1));
            try std.testing.expectError(error.LimitExceeded, candidate.replacementWithFonts(a, package, &paras, &chars, &fonts, 1));
            chars.entries.items[0].source_id = 999;
            try std.testing.expectError(error.InvalidCharacterShapeReference, raw.replacementWithFonts(a, package, &paras, &chars, &fonts, 1_000_000));
            try std.testing.expectError(error.InvalidCharacterShapeReference, candidate.replacementWithFonts(a, package, &paras, &chars, &fonts, 1_000_000));
            try std.testing.expectEqualSlices(u8, original, package);
        }
    };
}
