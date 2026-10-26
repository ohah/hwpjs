#import <UIKit/UIKit.h>
NS_ASSUME_NONNULL_BEGIN
// Experimental surface, not registered as a production TurboModule.
@interface HwpNativeCanvas : UIView
@property(nonatomic,copy,nullable) void (^onDocumentPoint)(NSDictionary *point);
@property(nonatomic,copy,nullable) void (^onFrameDrawn)(NSInteger revision, BOOL painted);
@property(nonatomic,copy,nullable) void (^onBoundsChanged)(CGRect bounds);
- (BOOL)presentFrame:(NSDictionary *)frame error:(NSError **)error;
- (void)decodeImage:(NSData *)bytes key:(NSString *)key revision:(NSInteger)revision completion:(void (^)(BOOL))completion;
- (NSDictionary *)measureText:(NSString *)text fontSize:(CGFloat)size;
- (void)beginResources:(NSInteger)epoch;
- (void)beginResources:(NSInteger)epoch document:(NSString *)document;
- (void)releaseImage:(NSString *)key;
- (void)releaseImage:(NSString *)key version:(nullable NSNumber *)version;
- (NSDictionary *)imageSize:(NSString *)key;
- (NSDictionary *)measureCanvasText:(NSString *)text font:(NSString *)font;
- (void)dispose;
@end
NS_ASSUME_NONNULL_END
