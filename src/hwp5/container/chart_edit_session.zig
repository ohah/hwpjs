const std = @import("std");
const cfb = @import("../../cfb/reader.zig");
const ole_session = @import("ole_edit_session.zig");
const StorageLayout = @import("../docinfo/bin_data.zig").StorageLayout;
const ChartLayout = @import("../chart/observed_contents.zig").Layout;
const ChartContents = @import("../chart/observed_contents.zig").Contents;
const Font = @import("../chart/font.zig").Font;
const TextBody = @import("../chart/text_block_body.zig").Body;
const NullableTextBlock = @import("../chart/text_block.zig").NullableBlock;
const paths = @import("paths.zig");

pub const Options = struct {
    file: ole_session.Options = .{},
    chart: @import("../chart/observed_contents.zig").Options = .{},
    max_edits: usize = 1024,
    max_contents_bytes: usize = 64 * 1024 * 1024,
    max_edited_contents_bytes: usize = 64 * 1024 * 1024,
    max_total_edited_contents_bytes: usize = 256 * 1024 * 1024,
};

/// Forks one primary-axis title Font name in an observed chart Contents and
/// commits it through the OLE and outer HWP atomic edit layers.
pub fn forkPrimaryAxisTitleFontName(a: std.mem.Allocator, hwp: []const u8, ordinal: usize, storage_layout: StorageLayout, ole_layout: @import("../ole/envelope.zig").Layout, chart_layout: ChartLayout, axis_index: usize, new_name: []const u8, trailer: u8, options: Options) ![]u8 {
    return applyStringEdits(a, hwp, ordinal, storage_layout, ole_layout, chart_layout, &.{.{ .primary_axis_title_font_name = .{ .axis_index = axis_index, .bytes = new_name, .trailer = trailer } }}, options);
}

/// Forks the main label body text of one chart series.
pub fn forkSeriesLabelBodyText(a: std.mem.Allocator, hwp: []const u8, ordinal: usize, storage_layout: StorageLayout, ole_layout: @import("../ole/envelope.zig").Layout, chart_layout: ChartLayout, series_index: usize, new_text: []const u8, trailer: u8, options: Options) ![]u8 {
    return applyStringEdits(a, hwp, ordinal, storage_layout, ole_layout, chart_layout, &.{.{ .series_label_body_text = .{ .series_index = series_index, .bytes = new_text, .trailer = trailer } }}, options);
}

/// Materializes one currently-null point-label body as an inline String.
pub fn materializeSeriesPointLabelBodyText(a: std.mem.Allocator, hwp: []const u8, ordinal: usize, storage_layout: StorageLayout, ole_layout: @import("../ole/envelope.zig").Layout, chart_layout: ChartLayout, series_index: usize, point_index: usize, new_text: []const u8, trailer: u8, options: Options) ![]u8 {
    return applyStringEdits(a, hwp, ordinal, storage_layout, ole_layout, chart_layout, &.{.{ .null_series_point_label_body_text = .{ .series_index = series_index, .point_index = point_index, .bytes = new_text, .trailer = trailer } }}, options);
}

pub fn forkSecondaryAxisTitleFontName(a: std.mem.Allocator, hwp: []const u8, ordinal: usize, storage_layout: StorageLayout, ole_layout: @import("../ole/envelope.zig").Layout, chart_layout: ChartLayout, new_name: []const u8, trailer: u8, options: Options) ![]u8 {
    return applyStringEdits(a, hwp, ordinal, storage_layout, ole_layout, chart_layout, &.{.{ .secondary_axis_title_font_name = .{ .bytes = new_name, .trailer = trailer } }}, options);
}

pub fn forkSeriesLabelFontName(a: std.mem.Allocator, hwp: []const u8, ordinal: usize, storage_layout: StorageLayout, ole_layout: @import("../ole/envelope.zig").Layout, chart_layout: ChartLayout, series_index: usize, new_name: []const u8, trailer: u8, options: Options) ![]u8 {
    return applyStringEdits(a, hwp, ordinal, storage_layout, ole_layout, chart_layout, &.{.{ .series_label_font_name = .{ .series_index = series_index, .bytes = new_name, .trailer = trailer } }}, options);
}

pub fn forkSeriesPointLabelFontName(a: std.mem.Allocator, hwp: []const u8, ordinal: usize, storage_layout: StorageLayout, ole_layout: @import("../ole/envelope.zig").Layout, chart_layout: ChartLayout, series_index: usize, point_index: usize, new_name: []const u8, trailer: u8, options: Options) ![]u8 {
    return applyStringEdits(a, hwp, ordinal, storage_layout, ole_layout, chart_layout, &.{.{ .series_point_label_font_name = .{ .series_index = series_index, .point_index = point_index, .bytes = new_name, .trailer = trailer } }}, options);
}

pub fn forkSeriesSuffixFontName(a: std.mem.Allocator, hwp: []const u8, ordinal: usize, storage_layout: StorageLayout, ole_layout: @import("../ole/envelope.zig").Layout, chart_layout: ChartLayout, series_index: usize, new_name: []const u8, trailer: u8, options: Options) ![]u8 {
    return applyStringEdits(a, hwp, ordinal, storage_layout, ole_layout, chart_layout, &.{.{ .series_suffix_font_name = .{ .series_index = series_index, .bytes = new_name, .trailer = trailer } }}, options);
}

pub fn materializeSecondaryAxisTitleText(a: std.mem.Allocator, hwp: []const u8, ordinal: usize, storage_layout: StorageLayout, ole_layout: @import("../ole/envelope.zig").Layout, chart_layout: ChartLayout, new_text: []const u8, trailer: u8, options: Options) ![]u8 {
    return applyStringEdits(a, hwp, ordinal, storage_layout, ole_layout, chart_layout, &.{.{ .null_secondary_axis_title_text = .{ .bytes = new_text, .trailer = trailer } }}, options);
}

pub fn forkSeriesSuffixText(a: std.mem.Allocator, hwp: []const u8, ordinal: usize, storage_layout: StorageLayout, ole_layout: @import("../ole/envelope.zig").Layout, chart_layout: ChartLayout, series_index: usize, new_text: []const u8, trailer: u8, options: Options) ![]u8 {
    return applyStringEdits(a, hwp, ordinal, storage_layout, ole_layout, chart_layout, &.{.{ .series_suffix_text = .{ .series_index = series_index, .bytes = new_text, .trailer = trailer } }}, options);
}

pub const StringEdit = union(enum) {
    primary_axis_title_font_name: struct { axis_index: usize, bytes: []const u8, trailer: u8 },
    secondary_axis_title_font_name: struct { bytes: []const u8, trailer: u8 },
    series_label_font_name: struct { series_index: usize, bytes: []const u8, trailer: u8 },
    series_point_label_font_name: struct { series_index: usize, point_index: usize, bytes: []const u8, trailer: u8 },
    series_suffix_font_name: struct { series_index: usize, bytes: []const u8, trailer: u8 },
    series_label_body_text: struct { series_index: usize, bytes: []const u8, trailer: u8 },
    null_series_point_label_body_text: struct { series_index: usize, point_index: usize, bytes: []const u8, trailer: u8 },
    null_secondary_axis_title_text: struct { bytes: []const u8, trailer: u8 },
    series_suffix_text: struct { series_index: usize, bytes: []const u8, trailer: u8 },
};

const Resolved = union(enum) {
    font: struct { value: *const Font, bytes: []const u8, trailer: u8 },
    text_body: struct { value: *const TextBody, bytes: []const u8, trailer: u8 },
    null_text_body: struct { value: *const TextBody, bytes: []const u8, trailer: u8 },
    nullable_text_block: struct { value: *const NullableTextBlock, bytes: []const u8, trailer: u8 },
    null_nullable_text_block: struct { value: *const NullableTextBlock, bytes: []const u8, trailer: u8 },
};
pub const Command = StringEdit;

pub const ChartCommand = struct {
    ordinal: usize,
    ole_layout: @import("../ole/envelope.zig").Layout,
    chart_layout: ChartLayout,
    edits: []const StringEdit,
};

/// Applies multiple typed String forks to one parsed Contents and commits once.
pub fn applyStringEdits(a: std.mem.Allocator, hwp: []const u8, ordinal: usize, storage_layout: StorageLayout, ole_layout: @import("../ole/envelope.zig").Layout, chart_layout: ChartLayout, commands: []const Command, options: Options) ![]u8 {
    return applyCharts(a, hwp, &.{.{ .ordinal = ordinal, .ole_layout = ole_layout, .chart_layout = chart_layout, .edits = commands }}, storage_layout, options);
}

/// Applies typed edits to multiple chart BinData records and commits the outer
/// HWP once through the shared OLE edit session.
pub fn applyCharts(a: std.mem.Allocator, hwp: []const u8, commands: []const ChartCommand, storage_layout: StorageLayout, options: Options) ![]u8 {
    if (commands.len == 0) return error.EmptyChartEditSet;
    if (commands.len > options.file.bin_data.max_edits) return error.LimitExceeded;
    const ordinals = try a.alloc(usize, commands.len);
    defer a.free(ordinals);
    for (commands, ordinals) |command, *ordinal| {
        if (command.edits.len == 0) return error.EmptyChartEditBatch;
        if (command.edits.len > options.max_edits) return error.LimitExceeded;
        ordinal.* = command.ordinal;
    }
    var read_options = options.file.bin_data.cfb;
    read_options.strict = true;
    var file = try cfb.File.open(a, hwp, read_options);
    defer file.deinit();
    const header_index = try paths.required(&file, "/FileHeader", 2);
    const header = try @import("../file_header.zig").Header.parse(file.entries[header_index].content);
    const doc_info_index = try paths.required(&file, "/DocInfo", 2);
    const doc_info = try @import("../stream.zig").decodeWithPolicy(a, &header, file.entries[doc_info_index].content, options.file.bin_data.max_doc_info_bytes, options.file.bin_data.distribution);
    defer a.free(doc_info);
    const items = try a.alloc(@import("../docinfo/bin_data.zig").BinData, commands.len);
    defer a.free(items);
    const resources = try @import("../docinfo/resources.zig").inspectBinDataOrdinals(doc_info, header.version(), options.file.bin_data.framing, ordinals, items);
    try resources.validateKnownCounts();

    const edited = try a.alloc(?[]u8, commands.len);
    defer a.free(edited);
    @memset(edited, null);
    defer for (edited) |bytes| if (bytes) |owned| a.free(owned);
    const replacements = try a.alloc(cfb.stream_replace.Replacement, commands.len);
    defer a.free(replacements);
    const ole_commands = try a.alloc(ole_session.Command, commands.len);
    defer a.free(ole_commands);
    var remaining_decoded = options.file.max_total_decoded_bin_data_bytes;
    var remaining_edited = options.max_total_edited_contents_bytes;
    for (commands, items, edited, replacements, ole_commands, 0..) |command, item, *result, *replacement, *ole_command, i| {
        const target = (try item.target(storage_layout)) orelse return error.UnsupportedBinDataType;
        const path = try paths.binary(a, target.id, target.extension_utf16 orelse &.{});
        const stream_index = paths.required(&file, path, 2) catch |err| {
            a.free(path);
            return err;
        };
        a.free(path);
        const decoded = try @import("../bin_data_stream.zig").decodeWithPolicy(a, &header, item, file.entries[stream_index].content, @min(options.file.max_decoded_bin_data_bytes, remaining_decoded), options.file.bin_data.distribution);
        remaining_decoded -= decoded.len;
        result.* = editOleContents(a, decoded, command.ole_layout, command.chart_layout, command.edits, @min(options.max_edited_contents_bytes, remaining_edited), options) catch |err| {
            a.free(decoded);
            return err;
        };
        a.free(decoded);
        remaining_edited -= result.*.?.len;
        replacement.* = .{ .path = "/Contents", .content = result.*.? };
        ole_command.* = .{ .ordinal = command.ordinal, .layout = command.ole_layout, .replacements = replacements[i..][0..1] };
    }
    return ole_session.apply(a, hwp, ole_commands, storage_layout, options.file);
}

fn editOleContents(a: std.mem.Allocator, decoded: []const u8, ole_layout: @import("../ole/envelope.zig").Layout, chart_layout: ChartLayout, commands: []const StringEdit, max_output_bytes: usize, options: Options) ![]u8 {
    var ole = try @import("../ole/container.zig").open(a, decoded, ole_layout, options.file.ole.limits);
    defer ole.deinit();
    const contents_index = try ole.findExact("/Contents") orelse return error.StreamNotFound;
    if (ole.entries[contents_index].kind != 2) return error.NotAStream;
    const source = ole.entries[contents_index].content;
    if (source.len > options.max_contents_bytes) return error.LimitExceeded;
    return editContents(a, source, chart_layout, commands, max_output_bytes, options);
}

fn editContents(a: std.mem.Allocator, source: []const u8, chart_layout: ChartLayout, commands: []const StringEdit, max_output_bytes: usize, options: Options) ![]u8 {
    var chart = try @import("../chart/observed_contents.zig").readObservedV6(a, source, chart_layout, options.chart);
    defer chart.deinit();
    const fork = @import("../chart/contents_string_fork.zig");
    const requests = try a.alloc(fork.BatchRequest, commands.len);
    defer a.free(requests);
    const resolved = try a.alloc(Resolved, commands.len);
    defer a.free(resolved);
    const starts = try a.alloc(usize, commands.len);
    defer a.free(starts);
    const order = try a.alloc(usize, commands.len);
    defer a.free(order);
    const forbidden_count = std.math.mul(usize, commands.len, 2) catch return error.LimitExceeded;
    const forbidden = try a.alloc(u32, forbidden_count);
    defer a.free(forbidden);
    var reserved: usize = 0;
    for (commands, resolved, 0..) |command, *item, i| {
        item.* = try resolve(&chart, command);
        switch (item.*) {
            .font => |target| {
                starts[i] = target.value.name_start;
                forbidden[reserved] = target.value.object_id;
                reserved += 1;
            },
            .text_body => |target| starts[i] = target.value.text_start,
            .null_text_body => |target| starts[i] = target.value.text_start,
            .nullable_text_block => |target| {
                starts[i] = target.value.text_start;
                forbidden[reserved] = target.value.object_id;
                reserved += 1;
            },
            .null_nullable_text_block => |target| {
                starts[i] = target.value.text_start;
                forbidden[reserved] = target.value.object_id;
                reserved += 1;
            },
        }
    }
    for (order, 0..) |*slot, i| slot.* = i;
    for (order, 0..) |_, i| {
        var at = i;
        while (at > 0 and (starts[order[at]] < starts[order[at - 1]] or (starts[order[at]] == starts[order[at - 1]] and order[at] < order[at - 1]))) : (at -= 1)
            std.mem.swap(usize, &order[at], &order[at - 1]);
    }
    for (order) |i| {
        const new_id = try @import("../chart/object_id_allocator.zig").findLowestAvailable(&chart.prefix.objects, forbidden[0..reserved]);
        forbidden[reserved] = new_id;
        reserved += 1;
        requests[i] = switch (resolved[i]) {
            .font => |target| .{ .font_name = .{ .font = target.value, .new_object_id = new_id, .bytes = target.bytes, .trailer = target.trailer } },
            .text_body => |target| .{ .text_body = .{ .body = target.value, .new_object_id = new_id, .bytes = target.bytes, .trailer = target.trailer } },
            .null_text_body => |target| .{ .null_text_body = .{ .body = target.value, .new_object_id = new_id, .bytes = target.bytes, .trailer = target.trailer } },
            .nullable_text_block => |target| .{ .nullable_text_block = .{ .block = target.value, .new_object_id = new_id, .bytes = target.bytes, .trailer = target.trailer } },
            .null_nullable_text_block => |target| .{ .null_nullable_text_block = .{ .block = target.value, .new_object_id = new_id, .bytes = target.bytes, .trailer = target.trailer } },
        };
    }
    return fork.forkMany(a, &chart, requests, max_output_bytes);
}

fn resolve(chart: *const ChartContents, command: StringEdit) !Resolved {
    return switch (command) {
        .primary_axis_title_font_name => |item| blk: {
            if (item.axis_index >= chart.primary_axes.len) return error.InvalidChartAxisIndex;
            break :blk .{ .font = .{ .value = &chart.primary_axes[item.axis_index].title.font, .bytes = item.bytes, .trailer = item.trailer } };
        },
        .secondary_axis_title_font_name => |item| .{ .font = .{ .value = &chart.secondary_axis.title.font, .bytes = item.bytes, .trailer = item.trailer } },
        .series_label_font_name => |item| blk: {
            if (item.series_index >= chart.series.items.len) return error.InvalidChartSeriesIndex;
            break :blk .{ .font = .{ .value = &chart.series.items[item.series_index].section.label.body.font, .bytes = item.bytes, .trailer = item.trailer } };
        },
        .series_point_label_font_name => |item| blk: {
            if (item.series_index >= chart.series.items.len) return error.InvalidChartSeriesIndex;
            const points = chart.series.items[item.series_index].section.points;
            if (item.point_index >= points.len) return error.InvalidChartPointIndex;
            break :blk .{ .font = .{ .value = &points[item.point_index].label.body.font, .bytes = item.bytes, .trailer = item.trailer } };
        },
        .series_suffix_font_name => |item| blk: {
            if (item.series_index >= chart.series.items.len) return error.InvalidChartSeriesIndex;
            break :blk .{ .font = .{ .value = &chart.series.items[item.series_index].suffix.block.font, .bytes = item.bytes, .trailer = item.trailer } };
        },
        .series_label_body_text => |item| blk: {
            if (item.series_index >= chart.series.items.len) return error.InvalidChartSeriesIndex;
            break :blk .{ .text_body = .{ .value = &chart.series.items[item.series_index].section.label.body, .bytes = item.bytes, .trailer = item.trailer } };
        },
        .null_series_point_label_body_text => |item| blk: {
            if (item.series_index >= chart.series.items.len) return error.InvalidChartSeriesIndex;
            const points = chart.series.items[item.series_index].section.points;
            if (item.point_index >= points.len) return error.InvalidChartPointIndex;
            break :blk .{ .null_text_body = .{ .value = &points[item.point_index].label.body, .bytes = item.bytes, .trailer = item.trailer } };
        },
        .null_secondary_axis_title_text => |item| .{ .null_nullable_text_block = .{ .value = &chart.secondary_axis.title, .bytes = item.bytes, .trailer = item.trailer } },
        .series_suffix_text => |item| blk: {
            if (item.series_index >= chart.series.items.len) return error.InvalidChartSeriesIndex;
            break :blk .{ .nullable_text_block = .{ .value = &chart.series.items[item.series_index].suffix.block, .bytes = item.bytes, .trailer = item.trailer } };
        },
    };
}
