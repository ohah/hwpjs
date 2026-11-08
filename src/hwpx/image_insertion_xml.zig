//! 기존 문서의 namespace·그림 속성을 추측하지 않는 단일 인라인 그림 XML 생성기입니다.
//! 문단 주소·원문 조건·자원 존재·ID 충돌 검사는 파일 변환 계획기의 책임입니다.
const std = @import("std");
const Size = @import("../image/image_insertion.zig").Size;

pub const Identity = struct {
    object_id: u32,
    instance_id: u32,
    resource_id: []const u8,
};

pub fn create(a: std.mem.Allocator, size: Size, identity: Identity, limit: usize) ![]u8 {
    if (size.width == 0 or size.height == 0 or size.width > std.math.maxInt(i32) or size.height > std.math.maxInt(i32)) return error.InvalidPictureInsertionSize;
    if (identity.object_id == 0 or identity.instance_id == 0 or identity.resource_id.len == 0 or identity.resource_id.len > 128) return error.InvalidPictureInsertionIdentity;
    // 새 manifest ID의 명시적인 ASCII 부분집합만 허용하여 XML 문자열 삽입을 차단합니다.
    for (identity.resource_id) |c| if (!std.ascii.isAlphanumeric(c) and c != '-' and c != '_' and c != '.') return error.InvalidPictureInsertionIdentity;
    if (limit == 0) return error.LimitExceeded;
    const output = try std.fmt.allocPrint(a, "<hp:pic xmlns:hp=\"http://www.hancom.co.kr/hwpml/2011/paragraph\" xmlns:hc=\"http://www.hancom.co.kr/hwpml/2011/core\" id=\"{d}\" zOrder=\"0\" numberingType=\"PICTURE\" textWrap=\"SQUARE\" textFlow=\"BOTH_SIDES\" lock=\"0\" dropcapstyle=\"None\" href=\"\" groupLevel=\"0\" instid=\"{d}\" reverse=\"0\">" ++
        "<hp:offset x=\"0\" y=\"0\"/><hp:orgSz width=\"{d}\" height=\"{d}\"/><hp:curSz width=\"{d}\" height=\"{d}\"/><hp:flip horizontal=\"0\" vertical=\"0\"/><hp:rotationInfo angle=\"0\" centerX=\"{d}\" centerY=\"{d}\" rotateimage=\"1\"/>" ++
        "<hp:renderingInfo><hc:transMatrix e1=\"1\" e2=\"0\" e3=\"0\" e4=\"0\" e5=\"1\" e6=\"0\"/><hc:scaMatrix e1=\"1\" e2=\"0\" e3=\"0\" e4=\"0\" e5=\"1\" e6=\"0\"/><hc:rotMatrix e1=\"1\" e2=\"0\" e3=\"0\" e4=\"0\" e5=\"1\" e6=\"0\"/></hp:renderingInfo>" ++
        "<hp:imgRect><hc:pt0 x=\"0\" y=\"0\"/><hc:pt1 x=\"{d}\" y=\"0\"/><hc:pt2 x=\"{d}\" y=\"{d}\"/><hc:pt3 x=\"0\" y=\"{d}\"/></hp:imgRect><hp:imgClip left=\"0\" right=\"{d}\" top=\"0\" bottom=\"{d}\"/><hp:inMargin left=\"0\" right=\"0\" top=\"0\" bottom=\"0\"/>" ++
        "<hc:img binaryItemIDRef=\"{s}\" bright=\"0\" contrast=\"0\" effect=\"REAL_PIC\" alpha=\"0\"/><hp:effects/><hp:sz width=\"{d}\" widthRelTo=\"ABSOLUTE\" height=\"{d}\" heightRelTo=\"ABSOLUTE\" protect=\"0\"/>" ++
        "<hp:pos treatAsChar=\"1\" affectLSpacing=\"1\" flowWithText=\"1\" allowOverlap=\"0\" holdAnchorAndSO=\"0\" vertRelTo=\"PARA\" horzRelTo=\"PARA\" vertAlign=\"TOP\" horzAlign=\"LEFT\" vertOffset=\"0\" horzOffset=\"0\"/><hp:outMargin left=\"0\" right=\"0\" top=\"0\" bottom=\"0\"/></hp:pic>", .{ identity.object_id, identity.instance_id, size.width, size.height, size.width, size.height, size.width / 2, size.height / 2, size.width, size.width, size.height, size.height, size.width, size.height, identity.resource_id, size.width, size.height });
    errdefer a.free(output);
    if (output.len > limit) return error.LimitExceeded;
    return output;
}
