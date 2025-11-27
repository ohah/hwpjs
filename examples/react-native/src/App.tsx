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
          filePath = `${RNFS.DocumentDirectoryPath}/noori.hwp`;
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
