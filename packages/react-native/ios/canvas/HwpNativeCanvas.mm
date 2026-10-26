#import "HwpNativeCanvas.h"
#import "HwpCanvasReplay.h"
#import "HwpCanvasFrameImages.h"
#import <ImageIO/ImageIO.h>
#import <math.h>

@implementation HwpNativeCanvas {
  NSDictionary *_frame;
  // 채택된 frame은 registry 해제와 독립적으로 실제 이미지 객체를 보유합니다.
  NSDictionary *_frameImages;
  NSMutableDictionary<NSString *,UIImage *> *_images;
  NSUInteger _generation;
  BOOL _disposed;
  NSInteger _resourceEpoch;
  NSString *_resourceDocument;
  NSMutableDictionary *_imageVersions;
  NSUInteger _imageSerial;
}
- (instancetype)initWithFrame:(CGRect)frame {
  if ((self=[super initWithFrame:frame])) { _images=[NSMutableDictionary new]; _imageVersions=[NSMutableDictionary new]; self.backgroundColor=UIColor.whiteColor; }
  return self;
}
static BOOL Number(id n) { return [n isKindOfClass:NSNumber.class] && isfinite([n doubleValue]); }
static BOOL Numbers(NSArray *a, NSUInteger count) {
  if (![a isKindOfClass:NSArray.class] || a.count!=count) return NO;
  for (id n in a) if (!Number(n)) return NO;
  return YES;
}
static UIColor *Color(NSArray *rgba) {
  return [UIColor colorWithRed:[rgba[0] doubleValue] green:[rgba[1] doubleValue] blue:[rgba[2] doubleValue] alpha:[rgba[3] doubleValue]];
}
- (BOOL)presentFrame:(NSDictionary *)frame error:(NSError **)error {
  NSAssert(NSThread.isMainThread,@"Canvas main queue required");
  NSString *failure=nil;
  if (_disposed) failure=@"Disposed";
  else if (![frame[@"protocol"] isEqual:@"hwpjs.native-canvas/1"] || ![frame[@"state"] isEqual:@"paginated"]) failure=@"IncompleteLayout";
  else if (!Number(frame[@"revision"]) || [frame[@"revision"] doubleValue]<0 || floor([frame[@"revision"] doubleValue])!=[frame[@"revision"] doubleValue]) failure=@"InvalidRevision";
  else if (!Number(frame[@"scale"]) || [frame[@"scale"] doubleValue]<=0) failure=@"InvalidScale";
  else if (![frame[@"commands"] isKindOfClass:NSArray.class] || [frame[@"commands"] count]>100000) failure=@"InvalidCommands";
  if (!failure) for (NSDictionary *c in frame[@"commands"]) {
    if (![c isKindOfClass:NSDictionary.class]) { failure=@"InvalidCommand"; break; }
    NSString *op=c[@"op"];
    BOOL valid=NO;
    if ([op isEqual:@"text"]) valid=[c[@"text"] isKindOfClass:NSString.class] && Numbers(c[@"at"],2) && Number(c[@"fontSize"]) && [c[@"fontSize"] doubleValue]>0 && Numbers(c[@"color"],4);
    if ([op isEqual:@"fillRect"] || [op isEqual:@"strokeRect"]) valid=Numbers(c[@"rect"],4) && Numbers(c[@"color"],4) && Number(c[@"lineWidth"]) && [c[@"lineWidth"] doubleValue]>=0;
    if ([op isEqual:@"line"]) valid=Numbers(c[@"points"],4) && Numbers(c[@"color"],4) && Number(c[@"lineWidth"]) && [c[@"lineWidth"] doubleValue]>0;
    if ([op isEqual:@"image"]) valid=Numbers(c[@"rect"],4) && [c[@"key"] isKindOfClass:NSString.class];
    if ([op isEqual:@"ctx"]) valid=YES;
    if ([op isEqual:@"ctx"] && ([@[@"save",@"restore"] containsObject:c[@"method"]])) valid=YES;
    if (!valid) { failure=@"UnsupportedPaintCommand"; break; }
  }
  if (!failure && [frame[@"commands"] count] && [frame[@"commands"][0][@"op"] isEqual:@"ctx"] && ![HwpCanvasReplay validate:frame[@"commands"] error:error]) return NO;
  if (failure) { if(error)*error=[NSError errorWithDomain:@"HwpNativeCanvas" code:1 userInfo:@{NSLocalizedDescriptionKey:failure}]; return NO; }
  // Deep immutable snapshot prevents caller mutation after admission.
  NSData *json=[NSJSONSerialization dataWithJSONObject:frame options:0 error:error];
  if (!json) return NO;
  NSDictionary *owned=[NSJSONSerialization JSONObjectWithData:json options:0 error:error];
  if (!owned) return NO;
  NSDictionary *nextImages=HwpCanvasFrameImages(owned[@"commands"],_images,_imageVersions,error);
  if (!nextImages) return NO;
  NSMutableArray *targets=[NSMutableArray new];
  for(NSDictionary *target in owned[@"hitTargets"]?:@[]){
    if(![target isKindOfClass:NSDictionary.class]||![target[@"id"] isKindOfClass:NSString.class]||!Numbers(target[@"rect"],4))continue;
    NSArray *r=target[@"rect"];CGRect box=CGRectMake([r[0] doubleValue],[r[1] doubleValue],[r[2] doubleValue],[r[3] doubleValue]);
    if(!CGRectContainsRect(self.bounds,box)||CGRectIsEmpty(box))continue;
    UIAccessibilityElement *element=[[UIAccessibilityElement alloc] initWithAccessibilityContainer:self];element.accessibilityIdentifier=target[@"id"];element.accessibilityLabel=@"편집 가능한 문서 본문";element.accessibilityFrameInContainerSpace=box;[targets addObject:element];
  }
  self.isAccessibilityElement=NO;self.accessibilityElements=targets;
  _frame=owned; _frameImages=nextImages; [self setNeedsDisplay]; return YES;
}
- (NSDictionary *)measureText:(NSString *)text fontSize:(CGFloat)size {
  NSAssert(NSThread.isMainThread,@"Canvas main queue required");
  if (_disposed || !isfinite(size) || size<=0) return @{};
  UIFont *font=[UIFont systemFontOfSize:size];
  CGSize measured=[text sizeWithAttributes:@{NSFontAttributeName:font}];
  return @{@"width":@(measured.width),@"height":@(font.lineHeight),@"ascent":@(font.ascender),@"descent":@(-font.descender)};
}
- (void)decodeImage:(NSData *)bytes key:(NSString *)key revision:(NSInteger)revision completion:(void (^)(BOOL))completion {
  NSAssert(NSThread.isMainThread,@"Canvas main queue required");
  // 요청 epoch는 문서 ID가 아닙니다. 늦은 정상 decode는 JS 소스 소유권 검증 뒤 정리됩니다.
  if (_disposed || revision>_resourceEpoch || bytes.length==0 || bytes.length>32*1024*1024) { completion(NO); return; }
  NSNumber *ticket=HwpCanvasBeginImage(_images,_imageVersions,key,&_imageSerial);
  NSUInteger generation=_generation; NSData *owned=[bytes copy]; NSString *imageKey=[key copy];
  __weak HwpNativeCanvas *weakSelf=self;
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0), ^{
    CGImageSourceRef source=CGImageSourceCreateWithData((__bridge CFDataRef)owned,NULL);
    CGImageRef image=NULL;
    if (source) {
      NSDictionary *props=CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source,0,NULL));
      double width=[props[(NSString *)kCGImagePropertyPixelWidth] doubleValue],height=[props[(NSString *)kCGImagePropertyPixelHeight] doubleValue];
      if (width>0 && height>0 && width*height<=16000000) image=CGImageSourceCreateImageAtIndex(source,0,NULL);
      CFRelease(source);
    }
    UIImage *decoded=image?[UIImage imageWithCGImage:image]:nil;
    if (image) CGImageRelease(image);
    dispatch_async(dispatch_get_main_queue(), ^{
      HwpNativeCanvas *strong=weakSelf;
      if (!strong || strong->_disposed || strong->_generation!=generation) { completion(NO); return; }
      BOOL accepted=HwpCanvasCompleteImage(strong->_images,strong->_imageVersions,imageKey,ticket,generation,strong->_generation,decoded);
      if (accepted) [strong setNeedsDisplay];
      completion(accepted);
    });
  });
}
- (void)drawRect:(CGRect)rect {
  if (_disposed || !_frame) return;
  CGContextRef ctx=UIGraphicsGetCurrentContext(); if (!ctx) return;
  CGContextSaveGState(ctx); CGContextClipToRect(ctx,self.bounds);
  CGFloat scale=[_frame[@"scale"] doubleValue]; CGContextScaleCTM(ctx,scale,scale);
  if ([_frame[@"commands"] count] && [_frame[@"commands"][0][@"op"] isEqual:@"ctx"]) {
    NSError *error=nil; if(![HwpCanvasReplay replay:_frame[@"commands"] context:ctx images:_frameImages error:&error]) NSLog(@"NativeCanvasPaintRejected:%@",error.localizedDescription);
    CGContextRestoreGState(ctx); if(self.onFrameDrawn)self.onFrameDrawn([_frame[@"revision"] integerValue],error==nil); return;
  }
  for (NSDictionary *c in _frame[@"commands"]) {
    NSString *op=c[@"op"]; NSArray *r=c[@"rect"];
    CGRect box=r?CGRectMake([r[0] doubleValue],[r[1] doubleValue],[r[2] doubleValue],[r[3] doubleValue]):CGRectZero;
    if ([op isEqual:@"text"]) {
      UIFont *font=[UIFont systemFontOfSize:[c[@"fontSize"] doubleValue]];
      NSArray *p=c[@"at"];
      // Command y is baseline; UIKit NSString drawing expects top-left.
      [c[@"text"] drawAtPoint:CGPointMake([p[0] doubleValue],[p[1] doubleValue]-font.ascender) withAttributes:@{NSFontAttributeName:font,NSForegroundColorAttributeName:Color(c[@"color"])}];
    } else if ([op isEqual:@"line"]) { NSArray *p=c[@"points"]; CGContextSetStrokeColorWithColor(ctx,Color(c[@"color"]).CGColor); CGContextSetLineWidth(ctx,[c[@"lineWidth"] doubleValue]); CGContextBeginPath(ctx); CGContextMoveToPoint(ctx,[p[0] doubleValue],[p[1] doubleValue]); CGContextAddLineToPoint(ctx,[p[2] doubleValue],[p[3] doubleValue]); CGContextStrokePath(ctx);
    } else if ([op isEqual:@"image"]) { [_frameImages[c[@"key"]] drawInRect:box]; }
    else if ([op isEqual:@"fillRect"]) { CGContextSetFillColorWithColor(ctx,Color(c[@"color"]).CGColor); CGContextFillRect(ctx,box); }
    else if ([op isEqual:@"strokeRect"]) { CGContextSetStrokeColorWithColor(ctx,Color(c[@"color"]).CGColor); CGContextSetLineWidth(ctx,[c[@"lineWidth"] doubleValue]); CGContextStrokeRect(ctx,box); }
  }
  CGContextRestoreGState(ctx);
  if(self.onFrameDrawn)self.onFrameDrawn([_frame[@"revision"] integerValue],YES);
}
- (void)layoutSubviews { [super layoutSubviews]; if(self.onBoundsChanged)self.onBoundsChanged(self.bounds); }
- (void)touchesEnded:(NSSet<UITouch *> *)touches withEvent:(UIEvent *)event {
  if (_disposed || !_frame || !self.onDocumentPoint) return;
  CGPoint point=[touches.anyObject locationInView:self];
  if (!CGRectContainsPoint(self.bounds,point)) return;
  // JS canonical hitText resolves owner/display UTF16; UIView never guesses raw offsets.
  self.onDocumentPoint(@{@"revision":_frame[@"revision"],@"x":@(point.x),@"y":@(point.y),@"width":@(self.bounds.size.width),@"height":@(self.bounds.size.height)});
}
// registry 수명은 명시 releaseImage/dispose가 소유하며 편집 epoch마다 비우지 않습니다.
- (void)beginResources:(NSInteger)epoch { [self beginResources:epoch document:[NSString stringWithFormat:@"legacy:%ld",(long)epoch]]; }
- (void)beginResources:(NSInteger)epoch document:(NSString *)document {
  NSAssert(NSThread.isMainThread,@"Canvas main queue required"); if(_disposed)return;
  if (![_resourceDocument isEqual:document]) { _generation++; [_images removeAllObjects]; [_imageVersions removeAllObjects]; _resourceDocument=[document copy]; }
  _resourceEpoch=epoch;
}
- (void)releaseImage:(NSString *)key { [self releaseImage:key version:nil]; }
- (void)releaseImage:(NSString *)key version:(NSNumber *)version { NSAssert(NSThread.isMainThread,@"Canvas main queue required");HwpCanvasReleaseImage(_images,_imageVersions,key,version); }
- (NSDictionary *)imageSize:(NSString *)key { UIImage *image=_images[key];return image?@{@"width":@(CGImageGetWidth(image.CGImage)),@"height":@(CGImageGetHeight(image.CGImage)),@"version":_imageVersions[key]?:@0}:@{}; }
- (NSDictionary *)measureCanvasText:(NSString *)text font:(NSString *)font { return _disposed?@{}:[HwpCanvasReplay measure:text font:font]; }
- (void)dispose {
  NSAssert(NSThread.isMainThread,@"Canvas main queue required");
  _disposed=YES; _generation++; _frame=nil; _frameImages=nil; [_images removeAllObjects]; [_imageVersions removeAllObjects]; self.onDocumentPoint=nil; self.onFrameDrawn=nil; self.onBoundsChanged=nil; [self setNeedsDisplay];
}
@end
