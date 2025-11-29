import { readFileSync } from 'fs';
import { join } from 'path';
import { toJson, fileHeader } from '@ohah/hwpjs';

/**
 * 기본 예제: HWP 파일 읽기 및 파싱
 */
function main() {
  try {
    // 예제 HWP 파일 경로 (현재 디렉토리의 noori.hwp 사용)
    const hwpFilePath = join(process.cwd(), 'noori.hwp');

    console.log('HWP 파일 읽기:', hwpFilePath);

    // 파일을 바이트 배열로 읽기
    const fileBuffer = readFileSync(hwpFilePath);
    const byteArray = Array.from(fileBuffer);

    console.log(`파일 크기: ${byteArray.length} bytes`);

    // HWP 파일을 JSON으로 변환
    console.log('\n=== HWP 파일을 JSON으로 변환 중... ===');
    const parsedResult = toJson(fileBuffer);
    const parsedJson = JSON.parse(parsedResult);

    console.log('변환 성공!');
    console.log('문서 정보:', {
      version: parsedJson,
    });

    // FileHeader만 추출하는 예제
    console.log('\n=== FileHeader만 추출 ===');
    const fileHeaderResult = fileHeader(fileBuffer);
    const header = JSON.parse(fileHeaderResult);
    console.log('FileHeader:', header);
  } catch (error) {
    console.error('오류 발생:', error);
    if (error instanceof Error) {
      console.error('오류 메시지:', error.message);
      console.error('스택 트레이스:', error.stack);
    }
    process.exit(1);
  }
}

main();
