/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import { NewAppScreen } from '@react-native/new-app-screen';
import { StatusBar, StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReactNative } from '@ohah/hwpjs';
import { useEffect, useState } from 'react';
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [hwpData, setHwpData] = useState<string | null>(null);

  useEffect(() => {
    // noori.hwp 파일 읽기
    const loadHwpFile = async () => {
      try {
        let filePath: string;

        if (Platform.OS === 'ios') {
          // iOS: 번들에 포함된 파일 읽기
          filePath = `${RNFS.MainBundlePath}/noori.hwp`;
        } else {
          // Android: assets에서 DocumentDirectory로 복사 후 읽기
          console.log('RNFS.DocumentDirectoryPath', RNFS.DocumentDirectoryPath);
          const destPath = `${RNFS.DocumentDirectoryPath}/noori.hwp`;

          // 이미 복사되어 있는지 확인
          const exists = await RNFS.exists(destPath);

          console.log('exists', exists);
          if (!exists) {
            // assets에서 파일 복사 (Android는 assets를 직접 읽을 수 없으므로)
            // react-native-fs는 Android assets를 직접 지원하지 않으므로
            // 네이티브 모듈을 통해 복사하거나, 다른 방법 사용
            // 임시로: assets에 파일이 있다고 가정하고 직접 경로 사용
            try {
              // Android에서 assets 파일 읽기 시도
              // react-native-fs는 Android assets를 직접 지원하지 않으므로
              // AssetManager를 사용하는 커스텀 방법이 필요합니다
              // 여기서는 간단히 DocumentDirectory에 파일이 있다고 가정
              console.log('Android: assets에서 파일을 복사해야 합니다');
              return;
            } catch (copyError) {
              console.error('파일 복사 실패:', copyError);
              return;
            }
          }

          filePath = destPath;
        }

        // 파일이 존재하는지 확인
        const exists = await RNFS.exists(filePath);
        if (!exists) {
          console.error('파일을 찾을 수 없습니다:', filePath);
          return;
        }

        // 파일을 base64로 읽기
        const fileData = await RNFS.readFile(filePath, 'base64');

        // base64를 number[]로 직접 변환
        const numberArray = [...Uint8Array.from(atob(fileData), (c) => c.charCodeAt(0))];

        // HWP 파일 파싱
        const result = ReactNative.hwp_parser(numberArray);
        setHwpData(result);
        console.log('HWP 파싱 결과:', result);
      } catch (error) {
        console.error('HWP 파일 읽기 실패:', error);
      }
    };

    loadHwpFile();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const safeAreaInsets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <NewAppScreen templateFileName="App.tsx" safeAreaInsets={safeAreaInsets} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;
