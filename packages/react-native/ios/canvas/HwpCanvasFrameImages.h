#import <Foundation/Foundation.h>
// 채택한 프레임이 사용하는 이미지만 보유합니다. 누락 자산은 새 프레임을 거부합니다.
FOUNDATION_EXPORT NSDictionary *HwpCanvasFrameImages(NSArray *commands, NSDictionary *images, NSDictionary *versions, NSError **error);
// ticket는 실제 이미지 key의 세대이며, 문서 세대와 함께 늦은 완료를 판정합니다.
FOUNDATION_EXPORT NSNumber *HwpCanvasBeginImage(NSMutableDictionary *images, NSMutableDictionary *versions, NSString *key, NSUInteger *serial);
FOUNDATION_EXPORT BOOL HwpCanvasCompleteImage(NSMutableDictionary *images, NSMutableDictionary *versions, NSString *key, NSNumber *version, NSUInteger owner, NSUInteger current, id image);
FOUNDATION_EXPORT void HwpCanvasReleaseImage(NSMutableDictionary *images, NSMutableDictionary *versions, NSString *key, NSNumber *expected);
