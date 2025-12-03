/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import { StatusBar, StyleSheet, useColorScheme, View, Text, ScrollView } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Hwpjs } from '@ohah/hwpjs';
import { useEffect, useState } from 'react';
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const [hwpData, setHwpData] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          const errorMsg = `파일을 찾을 수 없습니다: ${filePath}`;
          console.error(errorMsg);
          setError(errorMsg);
          setLoading(false);
          return;
        }

        // 파일을 base64로 읽기
        const fileData = await RNFS.readFile(filePath, 'base64');

        // base64를 ArrayBuffer로 변환 (안전한 방법)
        const binaryString = atob(fileData);
        const length = binaryString.length;
        const bytes = new Uint8Array(length);
        for (let i = 0; i < length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // HWP 파일 파싱
        const result = Hwpjs.toJson(bytes.buffer);
        setHwpData(result);
        console.log('HWP 파싱 결과:', result);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'HWP 파일 읽기 실패';
        console.error('HWP 파일 읽기 실패:', err);
        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    };

    loadHwpFile();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent hwpData={hwpData} loading={loading} error={error} />
    </SafeAreaProvider>
  );
}

function AppContent({
  hwpData,
  loading,
  error,
}: {
  hwpData: string | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title} testID="hwp-loading">
            HWP 파일 로딩 중...
          </Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title} testID="hwp-error">
            오류 발생
          </Text>
          <Text style={styles.error} testID="hwp-error-message">
            {error}
          </Text>
        </View>
      </View>
    );
  }

  if (!hwpData) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title} testID="hwp-empty">
            HWP 데이터가 없습니다
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title} testID="hwp-success">
          HWP 파싱 성공
        </Text>
        <Text style={styles.data} testID="hwp-data" numberOfLines={10}>
          {hwpData.substring(0, 500)}...
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#000000',
  },
  error: {
    fontSize: 16,
    color: 'red',
    marginTop: 8,
  },
  data: {
    fontSize: 14,
    marginTop: 8,
    color: '#000000',
  },
});

export default App;
