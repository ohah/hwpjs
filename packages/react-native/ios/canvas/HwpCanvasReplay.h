#import <UIKit/UIKit.h>
NS_ASSUME_NONNULL_BEGIN
@interface HwpCanvasReplay : NSObject
+ (BOOL)validate:(NSArray *)commands error:(NSError **)error;
+ (BOOL)replay:(NSArray *)commands context:(CGContextRef)context images:(NSDictionary<NSString *,UIImage *> *)images error:(NSError **)error;
+ (UIFont * _Nullable)font:(NSString *)css fallback:(BOOL * _Nullable)fallback;
+ (NSDictionary *)measure:(NSString *)text font:(NSString *)css;
@end
NS_ASSUME_NONNULL_END
