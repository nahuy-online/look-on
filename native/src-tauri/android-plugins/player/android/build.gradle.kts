plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.lookon.player"
    compileSdk = 34

    defaultConfig {
        minSdk = 24
        targetSdk = 34
        consumerProguardFiles("consumer-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    sourceSets {
        getByName("main") {
            manifest.srcFile("src/main/AndroidManifest.xml")
            java.srcDirs("src/main/java")
            res.srcDirs("src/main/res")
        }
    }

    buildFeatures {
        buildConfig = false
    }
}

dependencies {
    // Tauri 2 mobile plugin Kotlin glue.
    implementation("app.tauri:plugin-api:2.0.0")

    // AndroidX Media3 (ExoPlayer) 1.3.1 — THE playback engine.
    // - media3-exoplayer: core player + setPlayWhenReady / PlaybackParameters
    // - media3-exoplayer-dash: DASH manifests (some YouTube streams)
    // - media3-exoplayer-hls: HLS manifests (.m3u8)
    // - media3-datasource-okhttp: HTTP stack that respects custom headers
    //   (DefaultHttpDataSource.Factory().setDefaultRequestProperties(headers))
    // - media3-ui: PlayerView (the View that renders the Surface)
    implementation("androidx.media3:media3-exoplayer:1.3.1")
    implementation("androidx.media3:media3-exoplayer-dash:1.3.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.3.1")
    implementation("androidx.media3:media3-datasource-okhttp:1.3.1")
    implementation("androidx.media3:media3-ui:1.3.1")

    // OkHttp (used by media3-datasource-okhttp + the attestation WebView's
    // companion HTTP client for the WAA att/get challenge).
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Coroutines for the attestation WebView async wait.
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
}
