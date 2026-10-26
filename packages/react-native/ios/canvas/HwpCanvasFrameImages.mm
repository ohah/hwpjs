#import "HwpCanvasFrameImages.h"
static NSDictionary *Failure(NSError **error, NSString *message) {
  if (error) *error=[NSError errorWithDomain:@"HwpNativeCanvas" code:1 userInfo:@{NSLocalizedDescriptionKey:message}];
  return nil;
}
NSDictionary *HwpCanvasFrameImages(NSArray *commands, NSDictionary *images, NSDictionary *versions, NSError **error) {
  if (![commands isKindOfClass:NSArray.class] || ![images isKindOfClass:NSDictionary.class]) return Failure(error,@"InvalidImageCommand");
  NSMutableDictionary *selected=[NSMutableDictionary new];
  for (NSDictionary *command in commands) {
    if (![command isKindOfClass:NSDictionary.class]) return Failure(error,@"InvalidImageCommand");
    NSString *key=nil;
    if ([command[@"op"] isEqual:@"image"]) {
      key=command[@"key"];
      if (![key isKindOfClass:NSString.class]) return Failure(error,@"InvalidImageCommand");
    } else if ([command[@"op"] isEqual:@"ctx"] && [command[@"method"] isEqual:@"drawImage"]) {
      NSArray *args=command[@"args"];
      if (![args isKindOfClass:NSArray.class] || args.count==0 || ![args[0] isKindOfClass:NSString.class]) return Failure(error,@"InvalidImageCommand");
      key=args[0];
    }
    if (!key) continue;
    id image=images[key];
    if (!image) return Failure(error,versions[key]?@"NativeBitmapPending":@"MissingNativeBitmap");
    selected[key]=image;
  }
  return [selected copy];
}
NSNumber *HwpCanvasBeginImage(NSMutableDictionary *images, NSMutableDictionary *versions, NSString *key, NSUInteger *serial) {
  NSNumber *ticket=@(++*serial);
  versions[key]=ticket;
  [images removeObjectForKey:key];
  return ticket;
}
BOOL HwpCanvasCompleteImage(NSMutableDictionary *images, NSMutableDictionary *versions, NSString *key, NSNumber *version, NSUInteger owner, NSUInteger current, id image) {
  if (owner!=current || ![versions[key] isEqual:version]) return NO;
  if (!image) { [versions removeObjectForKey:key]; [images removeObjectForKey:key]; return NO; }
  images[key]=image;
  return YES;
}
void HwpCanvasReleaseImage(NSMutableDictionary *images, NSMutableDictionary *versions, NSString *key, NSNumber *expected) {
  if (expected && ![versions[key] isEqual:expected]) return;
  [versions removeObjectForKey:key];
  [images removeObjectForKey:key];
}
