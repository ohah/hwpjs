//! Independent synthetic files and focused optional ABI boundary tests only.
const std = @import("std");
const owner = @import("wasm/table_file_grid_output.zig");
const a = std.testing.allocator;
// Compile the optional exports directly without modifying the shared ABI root.
comptime {
    if (@import("builtin").cpu.arch == .wasm32) _ = @import("wasm/table_file_grid.zig");
}
const sample = "immutable input";
fn request(bytes: []const u8, format: u32) owner.Request {
    return .{ .format = format, .input_ptr = bytes.ptr, .input_len = bytes.len, .section = 0, .target = 4, .expected_rows = 2, .expected_columns = 2, .action = 0, .index = 1, .layout = 0 };
}
fn copy(allocator: std.mem.Allocator, r: owner.Request) ![]u8 {
    return allocator.dupe(u8, r.input());
}
fn unexpected(_: std.mem.Allocator, _: owner.Request) ![]u8 {
    return error.UnexpectedTraversal;
}
fn cleared(output: *const owner.Output) !void {
    try std.testing.expectEqual(@as(usize, 0), output.ptr());
    try std.testing.expectEqual(@as(usize, 0), output.len());
}
test "table file grid wire four schema actions 0 through 3" {
    const Command = @import("model/table_grid_edit_plan.zig").Command;
    for ([_]Command{ .{ .insert_row = 9 }, .{ .delete_row = 9 }, .{ .insert_column = 9 }, .{ .delete_column = 9 } }, 0..) |cmd, code| {
        try std.testing.expectEqualDeep(cmd, try owner.command(@intCast(code), 9));
    }
    for ([_]u32{ 4, 5, 255, std.math.maxInt(u32) }) |code| try std.testing.expectError(error.InvalidCreatedTableGridAction, owner.command(code, 0));
}
test "table file grid scalar refusal before pointer traversal clears prior output" {
    const Case = struct { field: std.meta.FieldEnum(owner.Request), value: usize, err: anyerror };
    const cases = [_]Case{
        .{ .field = .format, .value = 0, .err = error.InvalidDocumentFormat },
        .{ .field = .format, .value = 3, .err = error.InvalidDocumentFormat },
        .{ .field = .input_len, .value = 0, .err = error.LimitExceeded },
        .{ .field = .input_len, .value = owner.max_input_bytes + 1, .err = error.LimitExceeded },
        .{ .field = .layout, .value = 2, .err = error.InvalidSourceTableGridLayout },
        .{ .field = .action, .value = 4, .err = error.InvalidCreatedTableGridAction },
        .{ .field = .action, .value = std.math.maxInt(u32), .err = error.InvalidCreatedTableGridAction },
        .{ .field = .index, .value = 3, .err = error.InvalidTableGridEdit },
        .{ .field = .index, .value = std.math.maxInt(u32), .err = error.InvalidTableGridEdit },
        .{ .field = .expected_rows, .value = 0, .err = error.InvalidTableGridEdit },
        .{ .field = .expected_columns, .value = 0, .err = error.InvalidTableGridEdit },
        .{ .field = .expected_rows, .value = 100001, .err = error.LimitExceeded },
        .{ .field = .section, .value = 1024, .err = error.InvalidSection },
    };
    var output: owner.Output = .{ .allocator = a };
    defer output.clear();
    inline for (cases) |case| {
        output.bytes = try a.dupe(u8, sample);
        var r = request(sample, 1);
        r.input_ptr = @ptrFromInt(1);
        @field(r, @tagName(case.field)) = @intCast(case.value);
        try std.testing.expectError(case.err, output.replaceWith(r, unexpected));
        try cleared(&output);
    }
    var r = request(sample, 2);
    r.layout = 1;
    try std.testing.expectError(error.InvalidSourceTableGridLayout, owner.validateRequest(r));
    r = request(sample, 1);
    r.action = 1;
    r.expected_rows = 1;
    r.index = 0;
    try std.testing.expectError(error.InvalidTableGridEdit, owner.validateRequest(r));
    r = request(sample, 1);
    r.expected_rows = 65535;
    r.expected_columns = 1;
    try std.testing.expectError(error.LimitExceeded, owner.validateRequest(r));
    r = request(sample, 1);
    r.input_len = owner.max_input_bytes;
    try owner.validateRequest(r);
}
test "table file grid address null overflow linear memory bounds before slicing" {
    try std.testing.expectError(error.InvalidSourceTableGridPointer, owner.validateAddress(0, 1, null));
    try std.testing.expectError(error.LimitExceeded, owner.validateAddress(std.math.maxInt(usize), 1, null));
    try owner.validateAddress(65535, 1, 65536);
    try std.testing.expectError(error.InvalidSourceTableGridPointer, owner.validateAddress(65535, 2, 65536));
    try std.testing.expectError(error.InvalidSourceTableGridPointer, owner.validateAddress(65537, 1, 65536));
    var output: owner.Output = .{ .allocator = a };
    defer output.clear();
    output.bytes = try a.dupe(u8, sample);
    var r = request(sample, 1);
    r.input_ptr = @ptrFromInt(0);
    try std.testing.expectError(error.InvalidSourceTableGridPointer, output.replaceWith(r, unexpected));
    try cleared(&output);
    output.bytes = try a.dupe(u8, sample);
    r.input_ptr = @ptrFromInt(std.math.maxInt(usize));
    try std.testing.expectError(error.LimitExceeded, output.replaceWith(r, unexpected));
    try cleared(&output);
}
test "table file grid ownership alias success failure repeated free" {
    const Observer = struct {
        var output: *owner.Output = undefined;
        fn run(allocator: std.mem.Allocator, r: owner.Request) ![]u8 {
            try cleared(output);
            try std.testing.expectEqualSlices(u8, sample, r.input());
            if (r.target == 99) return error.InvalidSourceTableTarget;
            return copy(allocator, r);
        }
    };
    for ([_]u32{ 1, 2 }) |format| {
        var output: owner.Output = .{ .allocator = a };
        defer output.clear();
        Observer.output = &output;
        try output.replaceWith(request(sample, format), copy);
        try std.testing.expect(output.ptr() != @intFromPtr(sample.ptr));
        var r = request(output.bytes.?, format);
        try output.replaceWith(r, Observer.run);
        try std.testing.expectEqualSlices(u8, sample, output.bytes.?);
        r = request(output.bytes.?, format);
        r.target = 99;
        try std.testing.expectError(error.InvalidSourceTableTarget, output.replaceWith(r, Observer.run));
        try cleared(&output);
        output.clear();
        output.clear();
    }
}
test "table file grid output zero and 128MiB bounds release refused candidate" {
    const Provider = struct {
        var size: usize = 0;
        fn run(allocator: std.mem.Allocator, _: owner.Request) ![]u8 {
            return allocator.alloc(u8, size);
        }
    };
    var output: owner.Output = .{ .allocator = a };
    defer output.clear();
    for ([_]usize{ 0, owner.max_output_bytes + 1 }) |size| {
        Provider.size = size;
        output.bytes = try a.dupe(u8, sample);
        try std.testing.expectError(error.LimitExceeded, output.replaceWith(request(sample, 1), Provider.run));
        try cleared(&output);
    }
    Provider.size = owner.max_output_bytes;
    try output.replaceWith(request(sample, 1), Provider.run);
    try std.testing.expectEqual(owner.max_output_bytes, output.len());
}
fn copyOom(allocator: std.mem.Allocator) !void {
    var output: owner.Output = .{ .allocator = allocator };
    defer output.clear();
    output.bytes = try allocator.dupe(u8, sample);
    output.replaceWith(request(output.bytes.?, 1), copy) catch |err| {
        try cleared(&output);
        return err;
    };
    try std.testing.expectEqualSlices(u8, sample, output.bytes.?);
}
test "table file grid shared OOM helper alias replacement" {
    try @import("testing/allocation_failures.zig").check(copyOom, .{});
}

// New tiny fixtures: fixed HWP5 fields, independent 2x2 cells; stored HWPX XML.
fn put(comptime T: type, bytes: []u8, at: usize, value: T) void {
    std.mem.writeInt(T, bytes[at..][0..@sizeOf(T)], value, .little);
}
fn h5Fixture(layout: u32) ![]u8 {
    const wr = @import("hwp5/record_writer.zig");
    var body: std.ArrayList(u8) = .empty;
    defer body.deinit(a);
    var ph: [24]u8 = @splat(0);
    put(u32, &ph, 0, 0x80000002);
    put(u16, &ph, 12, 1);
    put(u32, &ph, 18, 100);
    try wr.append(a, &body, 66, 0, &ph, 16384);
    try wr.append(a, &body, 67, 1, &.{ 65, 0, 13, 0 }, 16384);
    try wr.append(a, &body, 68, 1, &(@as([8]u8, @splat(0))), 16384);
    var common: [46]u8 = @splat(0);
    put(u32, &common, 0, 0x74626c20);
    put(u32, &common, 4, 0x6a2211);
    put(u32, &common, 16, 60);
    put(u32, &common, 20, 40);
    try wr.append(a, &body, 71, 1, &common, 16384);
    var table: [26]u8 = @splat(0);
    put(u16, &table, 4, 2);
    put(u16, &table, 6, 2);
    put(u16, &table, 18, 2);
    put(u16, &table, 20, 2);
    try wr.append(a, &body, 77, 2, &table, 16384);
    for (0..4) |i| {
        var cell: [34]u8 = @splat(0);
        const base: usize = if (layout == 0) 6 else 8;
        put(u16, &cell, 0, 1);
        put(u16, &cell, base, @intCast(i % 2));
        put(u16, &cell, base + 2, @intCast(i / 2));
        put(u16, &cell, base + 4, 1);
        put(u16, &cell, base + 6, 1);
        put(u32, &cell, base + 8, 30);
        put(u32, &cell, base + 12, 20);
        try wr.append(a, &body, 72, 2, cell[0 .. base + 26], 16384);
        put(u32, &ph, 18, @intCast(200 + i));
        try wr.append(a, &body, 66, 2, &ph, 16384);
        try wr.append(a, &body, 67, 3, &.{ @intCast(75 + i), 0, 13, 0 }, 16384);
        try wr.append(a, &body, 68, 3, &(@as([8]u8, @splat(0))), 16384);
    }
    var header: [256]u8 = @splat(0);
    @memcpy(header[0..17], "HWP Document File");
    put(u32, &header, 32, 0x05000302);
    var info: std.ArrayList(u8) = .empty;
    defer info.deinit(a);
    var props: [26]u8 = @splat(0);
    put(u16, &props, 0, 1);
    try wr.append(a, &info, 16, 0, &props, 16384);
    try wr.append(a, &info, 17, 0, &(@as([72]u8, @splat(0))), 16384);
    return @import("cfb/writer.zig").write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = &header },
        .{ .name = "DocInfo", .parent = 0, .content = info.items },
        .{ .name = "BodyText", .parent = 0, .kind = 1 },
        .{ .name = "Section0", .parent = 3, .content = body.items },
        .{ .name = "Keep", .parent = 0, .content = "independent opaque" },
    }, .{});
}
fn hxFixture() ![]u8 {
    const fixture = @import("hwpx/test_package_fixture.zig");
    var xml: std.ArrayList(u8) = .empty;
    defer xml.deinit(a);
    try xml.appendSlice(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='70'><p:run><p:tbl rowCnt='2' colCnt='2'><p:sz width='60' height='40' widthRelTo='ABSOLUTE' heightRelTo='ABSOLUTE'/>");
    for (0..2) |row| {
        try xml.appendSlice(a, "<p:tr>");
        for (0..2) |col| {
            const cell = try std.fmt.allocPrint(a, "<p:tc><p:subList id=''><p:p id='{d}'><p:run><p:t>independent{d}</p:t></p:run></p:p></p:subList><p:cellAddr rowAddr='{d}' colAddr='{d}'/><p:cellSpan rowSpan='1' colSpan='1'/><p:cellSz width='30' height='20'/></p:tc>", .{ 80 + row * 2 + col, row * 2 + col, row, col });
            defer a.free(cell);
            try xml.appendSlice(a, cell);
        }
        try xml.appendSlice(a, "</p:tr>");
    }
    try xml.appendSlice(a, "</p:tbl></p:run></p:p></s:sec>");
    return fixture.storedZip(a, &.{
        .{ .name = "mimetype", .data = @import("hwpx/package.zig").mime },
        .{ .name = "META-INF/container.xml", .data = "<container xmlns='urn:oasis:names:tc:opendocument:xmlns:container'><rootfiles><rootfile full-path='Contents/content.hpf' media-type='application/hwpml-package+xml'/></rootfiles></container>" },
        .{ .name = "Contents/content.hpf", .data = "<package xmlns='http://www.idpf.org/2007/opf/'><manifest><item id='h' href='Contents/header.xml' media-type='application/xml'/><item id='s' href='Contents/section0.xml' media-type='application/xml'/></manifest><spine><itemref idref='h'/><itemref idref='s'/></spine></package>" },
        .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'/>" },
        .{ .name = "Contents/section0.xml", .data = xml.items },
        .{ .name = "Keep.bin", .data = "independent opaque" },
    });
}
fn checkFile(bytes: []const u8, format: u32, rows: u32, columns: u32) !void {
    if (format == 1) {
        var file = try @import("cfb/reader.zig").File.open(a, bytes, .{ .strict = true });
        defer file.deinit();
        const keep = try file.readStream(a, "/Keep");
        try std.testing.expectEqualStrings("independent opaque", keep);
        const section = try file.readStream(a, "/BodyText/Section0");
        var it = @import("hwp5/record.zig").Iterator.init(section, .{});
        var found: usize = 0;
        while (try it.next()) |r| if (r.tag == 77) {
            try std.testing.expectEqual(rows, std.mem.readInt(u16, r.payload[4..6], .little));
            try std.testing.expectEqual(columns, std.mem.readInt(u16, r.payload[6..8], .little));
            found += 1;
        };
        try std.testing.expectEqual(@as(usize, 1), found);
    } else {
        var file = try @import("hwpx/package.zig").inspectDocument(a, bytes, .{});
        defer file.deinit(a);
        var tree = try file.readSectionTree(a, 0, .{});
        defer tree.deinit(a);
        const fields = @import("hwpx/table_xml_fields.zig");
        var found: usize = 0;
        for (tree.elements, 0..) |_, i| if (fields.childIs(&tree, i, "tbl")) {
            try std.testing.expectEqual(rows, (try fields.optionalUnsigned(a, &tree, i, "rowCnt", 4096)).?);
            try std.testing.expectEqual(columns, (try fields.optionalUnsigned(a, &tree, i, "colCnt", 4096)).?);
            found += 1;
        };
        try std.testing.expectEqual(@as(usize, 1), found);
        const zip = &file.archive;
        var kept = false;
        for (zip.entries) |entry| if (std.mem.eql(u8, entry.name, "Keep.bin")) {
            const keep = try zip.decode(entry, 100);
            defer a.free(keep);
            try std.testing.expectEqualStrings("independent opaque", keep);
            kept = true;
        };
        try std.testing.expect(kept);
    }
}
fn sourceCases(format: u32, layout: u32) !void {
    const input = if (format == 1) try h5Fixture(layout) else try hxFixture();
    defer a.free(input);
    const baseline = try a.dupe(u8, input);
    defer a.free(baseline);
    var output: owner.Output = .{ .allocator = a };
    defer output.clear();
    for ([_]u32{ 1, 2, 3, 4 }) |action| {
        var r = request(input, format);
        r.layout = layout;
        r.action = action - 1;
        r.index = if (action == 1 or action == 3) 2 else 0;
        r.target = if (format == 1) 4 else 3;
        try output.replace(r);
        try std.testing.expect(output.ptr() != @intFromPtr(input.ptr));
        const rows: u32 = if (action == 1) 3 else if (action == 2) 1 else 2;
        const cols: u32 = if (action == 3) 3 else if (action == 4) 1 else 2;
        try checkFile(output.bytes.?, format, rows, cols);
        try std.testing.expectEqualSlices(u8, baseline, input);
        // Reverse through the prior output alias, retaining its allocation.
        r.input_ptr = output.bytes.?.ptr;
        r.input_len = output.bytes.?.len;
        r.expected_rows = rows;
        r.expected_columns = cols;
        r.action = (if (action % 2 == 1) action + 1 else action - 1) - 1;
        try output.replace(r);
        try checkFile(output.bytes.?, format, 2, 2);
        r.input_ptr = output.bytes.?.ptr;
        r.input_len = output.bytes.?.len;
        r.expected_rows = 3; // Deliberately stale binding, real parser path.
        r.expected_columns = 2;
        r.action = 0;
        r.index = 1;
        if (output.replace(r)) |_| return error.AcceptedStaleGrid else |err| {
            try std.testing.expectEqual(if (format == 1) error.SourceBindingMismatch else error.StaleSourceTableGrid, err);
        }
        try cleared(&output);
        try std.testing.expectEqualSlices(u8, baseline, input);
    }
}
test "table file grid HWP5 fresh simple source both layouts four actions reopen alias failure atomicity" {
    try sourceCases(1, 0);
    try sourceCases(1, 1);
}
test "table file grid HWPX fresh simple source four actions reopen alias failure atomicity" {
    try sourceCases(2, 0);
}
fn fileOom(allocator: std.mem.Allocator, input: []const u8, format: u32, action: u32) !void {
    var output: owner.Output = .{ .allocator = allocator };
    defer output.clear();
    output.bytes = try allocator.dupe(u8, input);
    var r = request(output.bytes.?, format);
    r.target = if (format == 1) 4 else 3;
    r.action = action - 1;
    output.replace(r) catch |err| {
        try cleared(&output);
        return err;
    };
    try std.testing.expect(output.len() != 0);
}
test "table file grid both formats four actions shared OOM sweep with prior output alias" {
    for ([_]u32{ 1, 2 }) |format| {
        const input = if (format == 1) try h5Fixture(0) else try hxFixture();
        defer a.free(input);
        const snapshot = try a.dupe(u8, input);
        defer a.free(snapshot);
        for ([_]u32{ 1, 2, 3, 4 }) |action| try @import("testing/allocation_failures.zig").check(fileOom, .{ input, format, action });
        try std.testing.expectEqualSlices(u8, snapshot, input);
    }
}
test "table file grid malformed source clears both format outputs" {
    for ([_]u32{ 1, 2 }) |format| {
        var output: owner.Output = .{ .allocator = a };
        defer output.clear();
        output.bytes = try a.dupe(u8, sample);
        if (output.replace(request(output.bytes.?, format))) |_| return error.AcceptedMalformedFile else |err| {
            if (err == error.OutOfMemory) return err;
        }
        try cleared(&output);
    }
}
