#!/usr/bin/env node

import { execSync } from 'child_process';
import { platform } from 'os';

const APP_ID = 'org.reactjs.native.example.ReactNativeExample';
const MAESTRO_FLOW = '.maestro/app-launch-ios.yaml';

function findIOSSimulator() {
  // macOS가 아니면 오류
  if (platform() !== 'darwin') {
    console.error('❌ iOS 시뮬레이터는 macOS에서만 사용할 수 있습니다.');
    process.exit(1);
  }

  // 환경 변수에서 UDID 확인
  const envUdid = process.env.MAESTRO_IOS_UDID;
  if (envUdid) {
    console.log(`📱 환경 변수에서 UDID 사용: ${envUdid}`);
    return envUdid;
  }

  // 부팅된 시뮬레이터 찾기
  try {
    console.log('🔍 부팅된 iOS 시뮬레이터 검색 중...');
    const bootedDevices = execSync('xcrun simctl list devices booted', {
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    const udidRegex = /[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}/g;
    const udids = bootedDevices.match(udidRegex) || [];

    if (udids.length === 0) {
      console.error('❌ 부팅된 iOS 시뮬레이터를 찾을 수 없습니다.');
      console.error('   시뮬레이터를 부팅하거나 MAESTRO_IOS_UDID 환경 변수를 설정하세요.');
      process.exit(1);
    }

    console.log(`📱 부팅된 시뮬레이터 ${udids.length}개 발견, 앱 설치 여부 확인 중...`);

    for (const udid of udids) {
      try {
        const apps = execSync(`xcrun simctl listapps ${udid}`, {
          encoding: 'utf-8',
          stdio: 'pipe',
        });
        if (apps.includes(APP_ID)) {
          console.log(`✅ 앱이 설치된 시뮬레이터 발견: ${udid}`);
          return udid;
        }
      } catch (error) {
        // 시뮬레이터에 앱이 없거나 접근 불가
        continue;
      }
    }
  } catch (error) {
    console.error('❌ 시뮬레이터를 찾는 중 오류 발생:', error.message);
    process.exit(1);
  }

  console.error(`❌ 앱(${APP_ID})이 설치된 iOS 시뮬레이터를 찾을 수 없습니다.`);
  console.error('   다음 중 하나를 수행하세요:');
  console.error('   1. 시뮬레이터를 부팅하고 앱을 설치');
  console.error('   2. MAESTRO_IOS_UDID 환경 변수로 특정 시뮬레이터 지정');
  process.exit(1);
}

// 메인 실행
try {
  const udid = findIOSSimulator();
  console.log(`🚀 Maestro 테스트 실행 중... (시뮬레이터: ${udid})\n`);
  
  execSync(`maestro -p ios --udid ${udid} test ${MAESTRO_FLOW}`, {
    stdio: 'inherit',
  });
} catch (error) {
  if (error.status !== undefined) {
    process.exit(error.status);
  }
  console.error('❌ 테스트 실행 중 오류 발생:', error.message);
  process.exit(1);
}

