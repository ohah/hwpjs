#import <Foundation/Foundation.h>
#import "HwpCanvasFrameImages.h"
static NSUInteger conditions=0;
static NSDictionary *Images(NSArray*c,NSDictionary*i,NSError**e){return HwpCanvasFrameImages(c,i,@{},e);}
static void Require(BOOL value, NSString *message) {conditions++; if(!value) @throw [NSException exceptionWithName:@"TestFailure" reason:message userInfo:nil]; }
int main(){@autoreleasepool {
 NSError *error=nil;NSObject *a=[NSObject new],*b=[NSObject new];NSMutableDictionary *registry=[@{@"a":a,@"b":b} mutableCopy];
 NSArray *commands=@[@{@"op":@"ctx",@"method":@"drawImage",@"args":@[@"a",@0,@0]}];
 NSDictionary *frame=Images(commands,registry,&error);Require(frame.count==1&&frame[@"a"]==a,@"선택 자산만 보유");
 [registry removeAllObjects];Require(frame[@"a"]==a,@"cache 초기화가 채택 frame을 무효화하지 않음");
 registry[@"a"]=b;Require(frame[@"a"]==a,@"동일 ID 교체가 이전 frame을 바꾸지 않음");
 NSDictionary *next=Images(commands,registry,&error);Require(next[@"a"]==b,@"새 frame은 새 자산 채택");
 [registry removeAllObjects];error=nil;Require(Images(commands,registry,&error)==nil&&[error.localizedDescription isEqual:@"MissingNativeBitmap"],@"진짜 missing은 거부");
 Require(frame[@"a"]==a,@"거부 뒤 이전 frame 보존");
 Require(Images(@[],registry,&error).count==0,@"이미지 없는 frame은 이전 자산 보유하지 않음");
 registry[@"a"]=a;Require(Images(@[@{@"op":@"image",@"key":@"a"}],registry,&error)[@"a"]==a,@"단순 image 명령도 같은 소유권");
 for(id malformed in @[[NSNull null],@"bad",@0])Require(Images(@[malformed],registry,&error)==nil,@"잘못된 명령 거부");
 Require(Images(@[@{@"op":@"ctx",@"method":@"drawImage",@"args":@[]}],registry,&error)==nil,@"빈 이미지 인자 거부");
 __weak NSObject *weak=nil;NSDictionary *held=nil;@autoreleasepool{NSObject *owned=[NSObject new];weak=owned;held=Images(commands,@{@"a":owned},&error);}Require(weak!=nil,@"frame이 실제 객체 수명 소유");held=nil;Require(weak==nil,@"frame 폐기 때 실제 객체 해제");

 NSMutableDictionary *cache=[NSMutableDictionary new],*versions=[NSMutableDictionary new];NSUInteger serial=0;
 NSArray *same=@[@{@"op":@"ctx",@"method":@"drawImage",@"args":@[@"same",@0,@0]}];
 NSNumber *older=HwpCanvasBeginImage(cache,versions,@"same",&serial);
 NSNumber *newer=HwpCanvasBeginImage(cache,versions,@"same",&serial);
 Require(HwpCanvasCompleteImage(cache,versions,@"same",newer,1,1,b),@"새 decode 먼저 완료");
 Require(!HwpCanvasCompleteImage(cache,versions,@"same",older,1,1,a),@"옛 decode 늦게 완료 거부");
 Require(cache[@"same"]==b,@"늦은 완료가 미래 cache를 덮어쓰지 않음");
 Require(HwpCanvasFrameImages(same,cache,versions,&error)[@"same"]==b,@"다음 frame도 새 이미지 유지");
 HwpCanvasReleaseImage(cache,versions,@"same",older);Require(cache[@"same"]==b,@"옛 release가 새 이미지를 해제하지 않음");
 [cache removeAllObjects];[versions removeAllObjects];NSNumber *doc2=HwpCanvasBeginImage(cache,versions,@"same",&serial);
 Require(HwpCanvasCompleteImage(cache,versions,@"same",doc2,2,2,b),@"새 문서의 decode 완료");
 Require(!HwpCanvasCompleteImage(cache,versions,@"same",older,1,2,a),@"문서 교체 뒤 옛 decode 거부");
 Require(cache[@"same"]==b,@"문서 교체 뒤 새 cache 유지");
 NSNumber *pending=HwpCanvasBeginImage(cache,versions,@"same",&serial);error=nil;
 Require(HwpCanvasFrameImages(same,cache,versions,&error)==nil&&[error.localizedDescription isEqual:@"NativeBitmapPending"],@"초기 pending은 missing과 구분");
 Require(HwpCanvasCompleteImage(cache,versions,@"same",pending,2,2,a),@"현재 문서의 늦은 정상 decode 허용");
 Require(HwpCanvasFrameImages(same,cache,versions,&error)[@"same"]==a,@"decode 완료 뒤 새 frame 채택");
 HwpCanvasReleaseImage(cache,versions,@"same",pending);
 Require(!HwpCanvasCompleteImage(cache,versions,@"same",pending,2,2,b),@"release 뒤 완료 거부");
 NSNumber *disposing=HwpCanvasBeginImage(cache,versions,@"same",&serial);[cache removeAllObjects];[versions removeAllObjects];
 Require(!HwpCanvasCompleteImage(cache,versions,@"same",disposing,2,3,b)&&cache.count==0,@"dispose 뒤 완료 거부");
 printf("Foundation 이미지 소유권 %lu조건 통과\n",(unsigned long)conditions);

}return 0;}
