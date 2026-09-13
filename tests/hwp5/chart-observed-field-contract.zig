const std = @import("std");
const core = @import("hwpjs");
const h = core.hwp5;

fn fields(comptime T: type, comptime expected: []const []const u8) void {
    const actual = @typeInfo(T).@"struct".fields;
    if (actual.len != expected.len) @compileError("observed chart field contract count changed");
    inline for (actual, expected) |field, name| {
        if (!std.mem.eql(u8, field.name, name)) @compileError("observed chart field contract order changed");
    }
}

/// Compile-time inventory. A product result field cannot be added, removed or
/// reordered without updating both this inventory and the independent wire.
pub fn assertCurrent() void {
    comptime {
        @setEvalBranchQuota(10000);
        fields(h.chart_observed_contents.Contents, &.{ "allocator", "source", "prefix", "plot", "light", "primary_axes", "surface", "secondary_axis", "line_word", "line_items", "post_line", "series", "title", "tail", "end" });
        fields(h.chart_contents_prefix.Prefix, &.{ "grid", "transition", "footnote", "objects", "legend", "end" });
        fields(h.chart_grid_cells.Grid, &.{ "allocator", "prelude", "cells", "string_bytes", "payload_offset" });
        fields(h.chart_grid_cells.Cell, &.{ "object_id", "start", "end", "value" });
        fields(h.chart_grid_prelude.Prelude, &.{ "prefix", "root_prefix", "grid_prefix", "collection_prefix", "rows", "columns", "payload_offset", "types" });
        fields(h.chart_grid_backdrop.Block, &.{ "raw", "backdrop", "end" });
        fields(h.chart_backdrop.Backdrop, &.{ "object_ids", "raw_backdrop", "raw_fill", "raw_picture", "fill_suffix", "end" });
        fields(h.chart_footnote.Footnote, &.{ "object_id", "block", "section", "end" });
        fields(h.chart_text_block.Block, &.{ "object_id", "prefix", "font", "middle", "text", "suffix", "end", "backdrop", "text_introduced" });
        fields(h.chart_text_block_body.Body, &.{ "prefix", "font", "middle", "text", "suffix", "end", "backdrop", "text_introduced" });
        fields(@TypeOf(@as(h.chart_text_block.Block, undefined).font), &.{ "object_id", "name", "raw", "name_introduced" });
        fields(h.chart_value_object.String, &.{ "object_id", "bytes", "trailer" });
        fields(h.chart_value_object.Number, &.{ "object_id", "bits", "trailer" });
        fields(h.chart_section.Section, &.{ "raw", "backdrop", "end" });
        fields(h.chart_legend.Legend, &.{ "object_id", "font", "raw", "section", "end" });
        fields(h.chart_plot_prefix.Prefix, &.{ "object_id", "initial", "raw", "end" });
        fields(h.chart_array_header.Header, &.{ "object_id", "first_word", "second_word", "end" });
        fields(h.chart_light.Light, &.{ "allocator", "object_id", "array", "sources", "raw", "end" });
        fields(h.chart_light_source.Source, &.{ "object_id", "raw", "start", "end" });
        fields(h.chart_axis.Axis, &.{ "object_id", "raw", "title", "scale_array", "scale", "tail", "end" });
        fields(@typeInfo(@TypeOf(@as(h.chart_axis.Axis, undefined).scale)).optional.child, &.{ "object_id", "array", "value", "end" });
        fields(@TypeOf(@as(h.chart_axis.Axis, undefined).tail), &.{ "prefix", "extra", "suffix", "end" });
        fields(h.chart_value_block.Block, &.{ "header_word", "reference", "format", "raw_before_label", "label", "raw_suffix", "text", "end" });
        fields(h.chart_object_table.Reference, &.{ "value", "introduced", "start", "end" });
        fields(h.chart_object_table.ValueReference, &.{ "value", "introduced", "start", "end" });
        fields(h.chart_text_format.Format, &.{ "object_id", "raw_word", "code", "code_introduced", "end" });
        fields(h.chart_surface_prefix.Prefix, &.{ "raw_before", "object_id", "raw_body", "array", "end" });
        fields(h.chart_line_item.Item, &.{ "object_id", "raw", "end" });
        fields(h.chart_post_line.Block, &.{ "raw", "array", "end" });
        fields(h.chart_series_collection.Collection, &.{ "items", "title", "end", "allocator" });
        fields(h.chart_series.Series, &.{ "prefix", "section", "suffix", "picture", "trailer", "end" });
        fields(h.chart_series_prefix.Prefix, &.{ "object_id", "raw", "array", "end" });
        fields(h.chart_series_label_section.Section, &.{ "points", "raw", "text", "label", "end", "allocator" });
        fields(h.chart_series_point.Point, &.{ "object_id", "label", "raw", "end" });
        fields(h.chart_series_label.Label, &.{ "object_id", "body", "end" });
        fields(h.chart_series_suffix.Suffix, &.{ "block", "raw_word", "formats", "end" });
        fields(h.chart_series_picture.Block, &.{ "raw", "picture", "end" });
        fields(h.chart_picture.Picture, &.{ "object_id", "body", "end" });
        fields(h.chart_picture.Body, &.{ "raw", "end" });
        fields(h.chart_title_header.Header, &.{ "object_id", "end" });
        fields(h.chart_text.NullableText, &.{ "block", "section", "end" });
        fields(h.chart_tail.Tail, &.{ "list", "raw", "window", "end" });
        fields(h.chart_list_header.Header, &.{ "object_id", "collection", "end" });
        fields(h.chart_collection_header.Header, &.{ "raw_word", "end" });
        fields(h.chart_window_type_body.Body, &.{ "raw_word", "end" });
    }
}
