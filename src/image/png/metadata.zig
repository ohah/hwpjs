const Header = @import("header.zig").Header;
const Chunk = @import("chunks.zig").Chunk;
const transparency = @import("transparency.zig");
const background = @import("background.zig");
const histogram = @import("histogram.zig");
const physical = @import("physical.zig");
const significant_bits = @import("significant_bits.zig");

/// Selected ancillary semantics only. Other chunks stay deferred in structure.
pub const State = struct {
    transparency: ?transparency.Value = null,
    background: ?background.Value = null,
    histogram: ?histogram.Value = null,
    physical: ?physical.Value = null,
    significant_bits: ?significant_bits.Value = null,
    validated_chunks: usize = 0,
    validated_bytes: usize = 0,
    palette_seen: bool = false,
    data_seen: bool = false,
    /// Atomic on failure; caller has already validated the critical envelope.
    pub fn consume(self: *State, h: Header, palette_entries: usize, chunk: Chunk) !void {
        if (chunk.is("PLTE")) {
            if (self.transparency != null) return error.InvalidPngTransparencyOrder;
            if (self.background != null) return error.InvalidPngBackgroundOrder;
            if (self.histogram != null) return error.InvalidPngHistogramOrder;
            self.palette_seen = true;
        } else if (chunk.is("IDAT")) {
            self.data_seen = true;
        } else if (chunk.is("tRNS")) {
            if (self.transparency != null) return error.DuplicatePngTransparency;
            if (self.data_seen or (h.color_type == 3 and !self.palette_seen)) return error.InvalidPngTransparencyOrder;
            const value = try transparency.parse(h, palette_entries, chunk.payload);
            self.transparency = value;
            self.validated_chunks += 1;
            self.validated_bytes += chunk.payload.len;
        } else if (chunk.is("bKGD")) {
            if (self.background != null) return error.DuplicatePngBackground;
            if (self.data_seen or (h.color_type == 3 and !self.palette_seen)) return error.InvalidPngBackgroundOrder;
            const value = try background.parse(h, palette_entries, chunk.payload);
            self.background = value;
            self.validated_chunks += 1;
            self.validated_bytes += chunk.payload.len;
        } else if (chunk.is("hIST")) {
            if (self.histogram != null) return error.DuplicatePngHistogram;
            if (self.data_seen or !self.palette_seen) return error.InvalidPngHistogramOrder;
            const value = try histogram.parse(h, palette_entries, chunk.payload);
            self.histogram = value;
            self.validated_chunks += 1;
            self.validated_bytes += chunk.payload.len;
        } else if (chunk.is("pHYs")) {
            if (self.physical != null) return error.DuplicatePngPhysical;
            if (self.data_seen) return error.InvalidPngPhysicalOrder;
            const value = try physical.parse(chunk.payload);
            self.physical = value;
            self.validated_chunks += 1;
            self.validated_bytes += chunk.payload.len;
        } else if (chunk.is("sBIT")) {
            if (self.significant_bits != null) return error.DuplicatePngSignificantBits;
            if (self.palette_seen or self.data_seen) return error.InvalidPngSignificantBitsOrder;
            const value = try significant_bits.parse(h, chunk.payload);
            self.significant_bits = value;
            self.validated_chunks += 1;
            self.validated_bytes += chunk.payload.len;
        }
    }
};
