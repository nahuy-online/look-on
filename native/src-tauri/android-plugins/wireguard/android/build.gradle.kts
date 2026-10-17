plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.puretuber.wireguard"
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
    // Tauri 2 mobile plugin Kotlin glue
    implementation("app.tauri:plugin-api:2.0.0")
    // WireGuard userspace library for Android (the official `wireguard-android`
    // tunnel module). Replace with the actual artifact once published, or
    // vendor the `wireguard-android` submodule.
    implementation("com.wireguard.android:tunnel:1.0.20230724")
    // Coroutines for async handshake
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
}
