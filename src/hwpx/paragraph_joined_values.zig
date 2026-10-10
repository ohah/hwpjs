//! One text owner, ordered source provenance; no serialized XML cache.
const std = @import("std");
const Sites = @import("text_sites.zig").Sites;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub const Piece = struct {
    template_element: usize,
    source_ordinal: ?usize,
    generated_id: ?u32,
    first_site: usize,
    site_count: usize,
    /// A continuation may reuse a template without owning its source removal.
    owns_source: bool = true,
    /// Source removal/inventory ownership does not imply emitting current runs.
    output: enum { current_runs, inventory_only, source_runs } = .current_runs,
    /// Retain a continuation's paragraph shell without emitting template runs.
    template_only: bool = false,
};

pub const Joined = struct {
    pieces: []Piece,
    sites: Sites,
    character_styles: ?[]@import("character_style_paint.zig").Span = null,

    pub fn deinit(self: *Joined, a: std.mem.Allocator) void {
        if (self.character_styles) |styles| a.free(styles);
        self.sites.deinit(a);
        a.free(self.pieces);
        self.* = undefined;
    }

    pub fn clone(self: *const Joined, a: std.mem.Allocator) !Joined {
        const styles = if (self.character_styles) |items| try a.dupe(@import("character_style_paint.zig").Span, items) else null;
        errdefer if (styles) |items| a.free(items);
        const pieces = try a.dupe(Piece, self.pieces);
        errdefer a.free(pieces);
        return .{ .pieces = pieces, .sites = try self.sites.clone(a), .character_styles = styles };
    }

    pub fn fromParagraph(a: std.mem.Allocator, original: *const Paragraph) !Joined {
        if (original.page_area_positions != null) return error.UnsupportedPageAreaOwnership;
        if (original.field_positions != null) return error.UnsupportedStructuralFieldEdit;
        if (original.column_boundaries != null) return error.UnsupportedColumnBoundaryEdit;
        if (original.protected_positions != null) return error.UnsupportedAnchoredStructure;
        if (original.joined()) |view| return view.clone(a);
        const styles = if (original.character_styles) |items| try a.dupe(@import("character_style_paint.zig").Span, items) else null;
        errdefer if (styles) |items| a.free(items);
        const pieces = try a.alloc(Piece, 1);
        errdefer a.free(pieces);
        pieces[0] = .{ .template_element = original.template_element, .source_ordinal = original.source_ordinal, .generated_id = original.generated_id, .first_site = 0, .site_count = original.sites.items.len, .owns_source = original.generated_id == null };
        return .{ .pieces = pieces, .sites = try original.sites.clone(a), .character_styles = styles };
    }

    /// A borrowed adapter. Never deinit this view or retain it across mutation.
    pub fn paragraph(self: *const Joined, index: usize) !Paragraph {
        if (index >= self.pieces.len) return error.InvalidParagraphIndex;
        const piece = self.pieces[index];
        if (piece.first_site > self.sites.items.len or piece.site_count > self.sites.items.len - piece.first_site) return error.SourceBindingMismatch;
        return .{ .template_element = piece.template_element, .source_ordinal = piece.source_ordinal, .generated_id = piece.generated_id, .sites = .{ .items = self.sites.items[piece.first_site..][0..piece.site_count] } };
    }

    pub fn validate(self: *const Joined) !void {
        if (self.pieces.len == 0) return error.SourceBindingMismatch;
        var cursor: usize = 0;
        for (self.pieces, 0..) |piece, index| {
            if (piece.first_site != cursor or piece.site_count > self.sites.items.len -| cursor) return error.SourceBindingMismatch;
            if (piece.template_only) {
                if (piece.owns_source or piece.generated_id == null or piece.source_ordinal != null) return error.SourceBindingMismatch;
                for (self.sites.items[cursor..][0..piece.site_count]) |site| if (site.text.len != 0) return error.NonEmptyProvenancePiece;
            }
            if (piece.output == .inventory_only) {
                if (index == 0) return error.UnsupportedColumnBoundaryEdit;
                for (self.sites.items[cursor..][0..piece.site_count]) |site| if (site.text.len != 0) return error.NonEmptyProvenancePiece;
            }
            if (piece.output == .source_runs and (piece.owns_source or piece.generated_id == null or piece.source_ordinal != null)) return error.SourceBindingMismatch;
            cursor += piece.site_count;
        }
        if (cursor != self.sites.items.len) return error.SourceBindingMismatch;
    }

    pub fn byteSize(self: *const Joined, limit: usize) !usize {
        try self.validate();
        var bytes = std.math.mul(usize, self.pieces.len, @sizeOf(Piece)) catch return error.LimitExceeded;
        if (self.character_styles) |styles| {
            bytes = std.math.add(usize, bytes, std.math.mul(usize, styles.len, @sizeOf(@import("character_style_paint.zig").Span)) catch return error.LimitExceeded) catch return error.LimitExceeded;
        }
        const rows = std.math.mul(usize, self.sites.items.len, @sizeOf(@import("text_sites.zig").Site)) catch return error.LimitExceeded;
        bytes = std.math.add(usize, bytes, rows) catch return error.LimitExceeded;
        if (bytes > limit) return error.LimitExceeded;
        for (self.sites.items) |site| {
            if (site.text.len > limit - bytes) return error.LimitExceeded;
            bytes += site.text.len;
        }
        return bytes;
    }
};
