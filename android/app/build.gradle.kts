plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.magic76.crewforge"
    compileSdk = 35
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "com.magic76.crewforge"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

val forgeWebDir = layout.projectDirectory.dir("src/main/assets/forge")
val repoRoot = rootProject.layout.projectDirectory

val syncForgeWeb by tasks.registering(Sync::class) {
    into(forgeWebDir)
    from(repoRoot.file("index.html"))
    from(repoRoot.file("forge.css"))
    from(repoRoot.file("gemini.css"))
    from(repoRoot.file("forge.js"))
    from(repoRoot.file("native-adapter.js"))
}

tasks.named("preBuild").configure { dependsOn(syncForgeWeb) }
