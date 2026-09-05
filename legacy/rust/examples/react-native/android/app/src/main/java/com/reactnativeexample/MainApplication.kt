package com.reactnativeexample

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    // res/raw에서 파일 자동 복사 (한 번만 실행)
    copyRawResource(R.raw.noori, "noori.hwp")
  }

  private fun copyRawResource(resourceId: Int, fileName: String) {
    try {
      val destFile = File(filesDir, fileName)
      if (destFile.exists()) {
        return // 이미 복사되어 있으면 스킵
      }

      val inputStream = resources.openRawResource(resourceId)
      val outputStream = FileOutputStream(destFile)
      
      inputStream.use { input ->
        outputStream.use { output ->
          input.copyTo(output)
        }
      }
    } catch (e: IOException) {
      e.printStackTrace()
    } catch (e: Exception) {
      e.printStackTrace()
    }
  }
}
