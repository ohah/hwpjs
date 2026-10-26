#import "HwpCanvasReplay.h"
#import <CoreText/CoreText.h>
#import <math.h>

static BOOL Num(id n) { return [n isKindOfClass:NSNumber.class] && isfinite([n doubleValue]) && fabs([n doubleValue])<=1e9; }
static BOOL Fail(NSError **error,NSString *reason) {if(error)*error=[NSError errorWithDomain:@"HwpCanvasReplay" code:1 userInfo:@{NSLocalizedDescriptionKey:reason}];return NO;}
static UIColor *ParseColor(id v) {
 if(![v isKindOfClass:NSString.class])return nil;
 NSString *s=[v lowercaseString];
 NSDictionary *names=@{@"white":@"#ffffff",@"black":@"#000000",@"transparent":@"#00000000"};s=names[s]?:s;
 if([s hasPrefix:@"#"] && (s.length==7||s.length==9)) {
   unsigned long long n=0;NSScanner *scanner=[NSScanner scannerWithString:[s substringFromIndex:1]];
   if(![scanner scanHexLongLong:&n]||!scanner.isAtEnd)return nil;
   if(s.length==7)n=(n<<8)|255;
   return [UIColor colorWithRed:((n>>24)&255)/255.0 green:((n>>16)&255)/255.0 blue:((n>>8)&255)/255.0 alpha:(n&255)/255.0];
 }
 if([s hasPrefix:@"rgba("]||[s hasPrefix:@"rgb("]) {
   NSRange start=[s rangeOfString:@"("];if(![s hasSuffix:@")"])return nil;
   NSArray *p=[[s substringWithRange:NSMakeRange(start.location+1,s.length-start.location-2)] componentsSeparatedByString:@","];
   if(p.count!=3&&p.count!=4)return nil;
   double c[4]={0,0,0,1};for(NSUInteger i=0;i<p.count;i++){NSScanner *scan=[NSScanner scannerWithString:p[i]];if(![scan scanDouble:&c[i]]||!scan.isAtEnd||!isfinite(c[i])||c[i]<0||c[i]>(i==3?1:255))return nil;}
   return [UIColor colorWithRed:c[0]/255 green:c[1]/255 blue:c[2]/255 alpha:c[3]];
 }
 return nil;
}
static BOOL ValidStyle(id value) {
 if(ParseColor(value))return YES;
 if(![value isKindOfClass:NSDictionary.class]||![value[@"kind"] isEqual:@"linear"]||![value[@"points"] isKindOfClass:NSArray.class]||[value[@"points"] count]!=4||![value[@"stops"] isKindOfClass:NSArray.class]||[value[@"stops"] count]<1||[value[@"stops"] count]>64)return NO;
 for(id n in value[@"points"])if(!Num(n))return NO;
 for(NSArray *stop in value[@"stops"])if(![stop isKindOfClass:NSArray.class]||stop.count!=2||!Num(stop[0])||[stop[0] doubleValue]<0||[stop[0] doubleValue]>1||!ParseColor(stop[1]))return NO;
 return YES;
}
static BOOL PaintFill(CGContextRef ctx,id style,BOOL evenOdd) {
 UIColor *color=ParseColor(style);
 if(color){CGContextSetFillColorWithColor(ctx,color.CGColor);if(evenOdd)CGContextEOFillPath(ctx);else CGContextFillPath(ctx);return YES;}
 if(!ValidStyle(style))return NO;
 NSArray *stops=[style[@"stops"] sortedArrayUsingComparator:^NSComparisonResult(NSArray *a,NSArray *b){return [a[0] compare:b[0]];}];
 NSMutableArray *colors=[NSMutableArray new];CGFloat locations[64];NSUInteger i=0;
 for(NSArray *stop in stops){[colors addObject:(__bridge id)ParseColor(stop[1]).CGColor];locations[i++]=[stop[0] doubleValue];}
 CGColorSpaceRef space=CGColorSpaceCreateDeviceRGB();CGGradientRef gradient=CGGradientCreateWithColors(space,(__bridge CFArrayRef)colors,locations);CGColorSpaceRelease(space);
 if(!gradient)return NO;
 CGContextSaveGState(ctx);if(evenOdd)CGContextEOClip(ctx);else CGContextClip(ctx);
 NSArray *p=style[@"points"];CGContextDrawLinearGradient(ctx,gradient,CGPointMake([p[0] doubleValue],[p[1] doubleValue]),CGPointMake([p[2] doubleValue],[p[3] doubleValue]),kCGGradientDrawsBeforeStartLocation|kCGGradientDrawsAfterEndLocation);
 CGContextRestoreGState(ctx);CGGradientRelease(gradient);return YES;
}
@implementation HwpCanvasReplay
+ (UIFont *)font:(NSString *)css fallback:(BOOL *)fallback {
 if(![css isKindOfClass:NSString.class])return nil;
 NSRegularExpression *re=[NSRegularExpression regularExpressionWithPattern:@"([0-9]+(?:\\.[0-9]+)?)(px|pt)\\s+(.+)" options:0 error:nil];
 NSTextCheckingResult *match=[re firstMatchInString:css options:0 range:NSMakeRange(0,css.length)];if(!match)return nil;
 CGFloat size=[[css substringWithRange:[match rangeAtIndex:1]] doubleValue];if([[css substringWithRange:[match rangeAtIndex:2]] isEqual:@"pt"])size*=96.0/72.0;if(!isfinite(size)||size<=0||size>4096)return nil;
 NSString *family=[[[css substringWithRange:[match rangeAtIndex:3]] componentsSeparatedByString:@","] firstObject];family=[family stringByTrimmingCharactersInSet:[NSCharacterSet characterSetWithCharactersInString:@" \"'"]];
 UIFont *font=[UIFont fontWithName:family size:size];BOOL missing=font==nil;
 if(!font)font=[UIFont systemFontOfSize:size];
 UIFontDescriptorSymbolicTraits traits=0;if([css containsString:@"bold"])traits|=UIFontDescriptorTraitBold;if([css containsString:@"italic"])traits|=UIFontDescriptorTraitItalic;
 if(traits){UIFontDescriptor *d=[font.fontDescriptor fontDescriptorWithSymbolicTraits:traits];if(!d)return nil;font=[UIFont fontWithDescriptor:d size:size];}
 if(fallback)*fallback=missing;return font;
}
+ (NSDictionary *)measure:(NSString *)text font:(NSString *)css {
 BOOL fallback=NO;UIFont *font=[self font:css fallback:&fallback];if(!font)return @{};
 CGSize size=[text sizeWithAttributes:@{NSFontAttributeName:font}];
 return @{@"width":@(size.width),@"actualBoundingBoxAscent":@(font.ascender),@"actualBoundingBoxDescent":@(-font.descender),@"fontBoundingBoxAscent":@(font.ascender),@"fontBoundingBoxDescent":@(-font.descender),@"resolvedFont":font.fontName,@"fontFallback":@(fallback)};
}
+ (BOOL)validate:(NSArray *)commands error:(NSError **)error {
 if(![commands isKindOfClass:NSArray.class]||commands.count>100000)return Fail(error,@"CommandBudget");
 NSDictionary *arity=@{@"save":@0,@"restore":@0,@"beginPath":@0,@"closePath":@0,@"stroke":@0,@"fillRect":@4,@"strokeRect":@4,@"moveTo":@2,@"lineTo":@2,@"rect":@4,@"bezierCurveTo":@6,@"setTransform":@6,@"transform":@6};
 NSSet *numbers=[NSSet setWithArray:@[@"lineWidth",@"miterLimit",@"lineDashOffset",@"shadowBlur",@"shadowOffsetX",@"shadowOffsetY"]];
 NSUInteger depth=0;
 for(NSDictionary *c in commands){
   if(![c isKindOfClass:NSDictionary.class]||![c[@"op"] isEqual:@"ctx"]||![c[@"method"] isKindOfClass:NSString.class]||![c[@"args"] isKindOfClass:NSArray.class])return Fail(error,@"InvalidCommand");
   NSString *m=c[@"method"];NSArray *a=c[@"args"];
   if(arity[m]){if(a.count!=[arity[m] unsignedIntegerValue])return Fail(error,@"CommandArity");for(id n in a)if(!Num(n))return Fail(error,@"CommandNumber");}
   else if([m isEqual:@"set"]){
     if(a.count!=2||![a[0] isKindOfClass:NSString.class])return Fail(error,@"CommandProperty");NSString *key=a[0];id v=a[1];
     if([numbers containsObject:key]){if(!Num(v)||([key isEqual:@"lineWidth"]&&[v doubleValue]<=0)||([key isEqual:@"shadowBlur"]&&[v doubleValue]<0))return Fail(error,@"PaintPropertyNumber");}
     else if([key isEqual:@"fillStyle"]||[key isEqual:@"strokeStyle"]){if(!ValidStyle(v))return Fail(error,@"PaintStyle");}
     else if([key isEqual:@"shadowColor"]){if(!ParseColor(v))return Fail(error,@"ShadowColor");}
     else if([key isEqual:@"font"]){if(![self font:v fallback:NULL])return Fail(error,@"NativeFont");}
     else {NSDictionary *choices=@{@"filter":@[@"none"],@"textAlign":@[@"left",@"right",@"center",@"start",@"end"],@"textBaseline":@[@"top",@"hanging",@"middle",@"alphabetic",@"ideographic",@"bottom"],@"lineCap":@[@"butt",@"round",@"square"],@"lineJoin":@[@"miter",@"round",@"bevel"]};if(![choices[key] containsObject:v])return Fail(error,@"UnsupportedPaintProperty");}
   } else if([m isEqual:@"setLineDash"]){if(a.count!=1||![a[0] isKindOfClass:NSArray.class]||[a[0] count]>64)return Fail(error,@"DashBudget");for(id n in a[0])if(!Num(n)||[n doubleValue]<0)return Fail(error,@"DashNumber");}
   else if([m isEqual:@"fillText"]||[m isEqual:@"strokeText"]){if(a.count!=3||![a[0] isKindOfClass:NSString.class]||[a[0] length]>1000000||!Num(a[1])||!Num(a[2]))return Fail(error,@"TextBounds");}
   else if([m isEqual:@"fill"]||[m isEqual:@"clip"]){if(a.count>1||(a.count==1&&![@[@"nonzero",@"evenodd"] containsObject:a[0]]))return Fail(error,@"FillRule");}
   else if([m isEqual:@"drawImage"]){if(![@[@3,@5,@9] containsObject:@(a.count)]||![a[0] isKindOfClass:NSString.class])return Fail(error,@"ImageArity");for(NSUInteger i=1;i<a.count;i++)if(!Num(a[i]))return Fail(error,@"ImageNumber");}
   else if([m isEqual:@"arc"]||[m isEqual:@"ellipse"]){NSUInteger n=[m isEqual:@"arc"]?5:7;if(a.count!=n&&a.count!=n+1)return Fail(error,@"ArcArity");for(NSUInteger i=0;i<n;i++)if(!Num(a[i]))return Fail(error,@"ArcNumber");if([a[2] doubleValue]<0||([m isEqual:@"ellipse"]&&[a[3] doubleValue]<0))return Fail(error,@"ArcRadius");}
   else return Fail(error,@"UnsupportedPaintCommand");
   if([m isEqual:@"save"]){if(++depth>256)return Fail(error,@"PaintStackBudget");}if([m isEqual:@"restore"]){if(depth==0)return Fail(error,@"PaintStackUnderflow");depth--;}
 }
 return depth==0?YES:Fail(error,@"UnbalancedPaintStack");
}
+ (BOOL)replay:(NSArray *)commands context:(CGContextRef)ctx images:(NSDictionary<NSString *,UIImage *> *)images error:(NSError **)error {
 if(![self validate:commands error:error])return NO;
 CGAffineTransform base=CGContextGetCTM(ctx);
 NSMutableDictionary *state=[@{@"font":@"16px system-ui",@"fillStyle":@"#000000",@"strokeStyle":@"#000000",@"textAlign":@"start",@"textBaseline":@"alphabetic",@"lineWidth":@1,@"lineDashOffset":@0,@"shadowBlur":@0,@"shadowOffsetX":@0,@"shadowOffsetY":@0,@"shadowColor":@"transparent"} mutableCopy];NSMutableArray *stack=[NSMutableArray new];NSArray *dash=@[];
 CGContextSaveGState(ctx);
 @try {for(NSDictionary *c in commands){NSString *m=c[@"method"];NSArray *a=c[@"args"];
  if([m isEqual:@"save"]){[stack addObject:@{@"state":[state copy],@"dash":dash}];CGContextSaveGState(ctx);}
  else if([m isEqual:@"restore"]){NSDictionary *v=stack.lastObject;state=[v[@"state"] mutableCopy];dash=v[@"dash"];[stack removeLastObject];CGContextRestoreGState(ctx);}
  else if([m isEqual:@"set"]){NSString *key=a[0];state[key]=a[1];double n=[a[1] isKindOfClass:NSNumber.class]?[a[1] doubleValue]:0;
   if([key isEqual:@"lineWidth"])CGContextSetLineWidth(ctx,n);if([key isEqual:@"miterLimit"])CGContextSetMiterLimit(ctx,n);
   if([key isEqual:@"lineCap"])CGContextSetLineCap(ctx,[a[1] isEqual:@"round"]?kCGLineCapRound:[a[1] isEqual:@"square"]?kCGLineCapSquare:kCGLineCapButt);
   if([key isEqual:@"lineJoin"])CGContextSetLineJoin(ctx,[a[1] isEqual:@"round"]?kCGLineJoinRound:[a[1] isEqual:@"bevel"]?kCGLineJoinBevel:kCGLineJoinMiter);
  }
  else if([m isEqual:@"setLineDash"]){dash=a[0];}
  else if([m isEqual:@"setTransform"]||[m isEqual:@"transform"]){CGAffineTransform t=CGAffineTransformMake([a[0] doubleValue],[a[1] doubleValue],[a[2] doubleValue],[a[3] doubleValue],[a[4] doubleValue],[a[5] doubleValue]);if([m isEqual:@"setTransform"]){CGAffineTransform inverse=CGAffineTransformInvert(CGContextGetCTM(ctx));CGContextConcatCTM(ctx,inverse);CGContextConcatCTM(ctx,base);}CGContextConcatCTM(ctx,t);}
  else if([m isEqual:@"beginPath"])CGContextBeginPath(ctx);
  else if([m isEqual:@"closePath"])CGContextClosePath(ctx);
  else if([m isEqual:@"moveTo"])CGContextMoveToPoint(ctx,[a[0] doubleValue],[a[1] doubleValue]);
  else if([m isEqual:@"lineTo"])CGContextAddLineToPoint(ctx,[a[0] doubleValue],[a[1] doubleValue]);
  else if([m isEqual:@"bezierCurveTo"])CGContextAddCurveToPoint(ctx,[a[0] doubleValue],[a[1] doubleValue],[a[2] doubleValue],[a[3] doubleValue],[a[4] doubleValue],[a[5] doubleValue]);
  else if([m isEqual:@"rect"])CGContextAddRect(ctx,CGRectMake([a[0] doubleValue],[a[1] doubleValue],[a[2] doubleValue],[a[3] doubleValue]));
  else if([m isEqual:@"arc"]||[m isEqual:@"ellipse"]){BOOL ellipse=[m isEqual:@"ellipse"];NSUInteger n=ellipse?7:5;BOOL reverse=a.count>n?[a[n] boolValue]:NO;if(!ellipse)CGContextAddArc(ctx,[a[0] doubleValue],[a[1] doubleValue],[a[2] doubleValue],[a[3] doubleValue],[a[4] doubleValue],reverse);else {CGContextSaveGState(ctx);CGContextTranslateCTM(ctx,[a[0] doubleValue],[a[1] doubleValue]);CGContextRotateCTM(ctx,[a[4] doubleValue]);CGFloat rx=[a[2] doubleValue],ry=[a[3] doubleValue];if(rx>0&&ry>0){CGContextScaleCTM(ctx,rx,ry);CGContextAddArc(ctx,0,0,1,[a[5] doubleValue],[a[6] doubleValue],reverse);}CGContextRestoreGState(ctx);}}
  else if([m isEqual:@"clip"]){if(a.count&&[a[0] isEqual:@"evenodd"])CGContextEOClip(ctx);else CGContextClip(ctx);}
  else {
   CGFloat lengths[64];for(NSUInteger i=0;i<dash.count;i++)lengths[i]=[dash[i] doubleValue];CGContextSetLineDash(ctx,[state[@"lineDashOffset"] doubleValue],lengths,dash.count);
   CGContextSetShadowWithColor(ctx,CGSizeMake([state[@"shadowOffsetX"] doubleValue],[state[@"shadowOffsetY"] doubleValue]),[state[@"shadowBlur"] doubleValue],ParseColor(state[@"shadowColor"]).CGColor);
   if([m isEqual:@"fill"]){if(!PaintFill(ctx,state[@"fillStyle"],a.count&&[a[0] isEqual:@"evenodd"]))return Fail(error,@"NativeGradient");}
   else if([m isEqual:@"fillRect"]||[m isEqual:@"strokeRect"]){CGPathRef previous=CGContextCopyPath(ctx);CGContextBeginPath(ctx);CGContextAddRect(ctx,CGRectMake([a[0] doubleValue],[a[1] doubleValue],[a[2] doubleValue],[a[3] doubleValue]));if([m isEqual:@"fillRect"]){if(!PaintFill(ctx,state[@"fillStyle"],NO)){if(previous)CGPathRelease(previous);return Fail(error,@"NativeGradient");}}else {UIColor *color=ParseColor(state[@"strokeStyle"]);if(!color){if(previous)CGPathRelease(previous);return Fail(error,@"UnsupportedStrokeGradient");}CGContextSetStrokeColorWithColor(ctx,color.CGColor);CGContextStrokePath(ctx);}CGContextBeginPath(ctx);if(previous){CGContextAddPath(ctx,previous);CGPathRelease(previous);}}
   else if([m isEqual:@"stroke"]){UIColor *color=ParseColor(state[@"strokeStyle"]);if(!color)return Fail(error,@"UnsupportedStrokeGradient");CGContextSetStrokeColorWithColor(ctx,color.CGColor);CGFloat lengths[64];for(NSUInteger i=0;i<dash.count;i++)lengths[i]=[dash[i] doubleValue];CGContextSetLineDash(ctx,[state[@"lineDashOffset"] doubleValue],lengths,dash.count);CGContextStrokePath(ctx);}
   else if([m isEqual:@"fillText"]||[m isEqual:@"strokeText"]){UIFont *font=[self font:state[@"font"] fallback:NULL];UIColor *color=ParseColor(state[[m isEqual:@"fillText"]?@"fillStyle":@"strokeStyle"]);if(!color)return Fail(error,@"UnsupportedTextGradient");NSString *text=a[0];CGSize size=[text sizeWithAttributes:@{NSFontAttributeName:font}];CGFloat x=[a[1] doubleValue],y=[a[2] doubleValue];NSString *align=state[@"textAlign"],*baseline=state[@"textBaseline"];if([align isEqual:@"right"]||[align isEqual:@"end"])x-=size.width;else if([align isEqual:@"center"])x-=size.width/2;if([baseline isEqual:@"alphabetic"])y-=font.ascender;else if([baseline isEqual:@"middle"])y-=font.lineHeight/2;else if([baseline isEqual:@"bottom"]||[baseline isEqual:@"ideographic"])y-=font.lineHeight;else if([baseline isEqual:@"hanging"])return Fail(error,@"UnsupportedHangingBaseline");NSMutableDictionary *attributes=[@{NSFontAttributeName:font,NSForegroundColorAttributeName:color} mutableCopy];if([m isEqual:@"strokeText"]){attributes[NSStrokeColorAttributeName]=color;attributes[NSStrokeWidthAttributeName]=@([state[@"lineWidth"] doubleValue]*100/font.pointSize);}[text drawAtPoint:CGPointMake(x,y) withAttributes:attributes];}
   else if([m isEqual:@"drawImage"]){UIImage *image=images[a[0]];if(!image)return Fail(error,@"MissingNativeBitmap");CGRect dest;if(a.count==3)dest=CGRectMake([a[1] doubleValue],[a[2] doubleValue],image.size.width,image.size.height);else if(a.count==5)dest=CGRectMake([a[1] doubleValue],[a[2] doubleValue],[a[3] doubleValue],[a[4] doubleValue]);else {CGRect crop=CGRectMake([a[1] doubleValue],[a[2] doubleValue],[a[3] doubleValue],[a[4] doubleValue]);CGImageRef part=CGImageCreateWithImageInRect(image.CGImage,crop);if(!part)return Fail(error,@"ImageCropBounds");image=[UIImage imageWithCGImage:part];CGImageRelease(part);dest=CGRectMake([a[5] doubleValue],[a[6] doubleValue],[a[7] doubleValue],[a[8] doubleValue]);}[image drawInRect:dest];}
  }
 }} @finally {while(stack.count){CGContextRestoreGState(ctx);[stack removeLastObject];}CGContextRestoreGState(ctx);}
 return YES;
}
@end
