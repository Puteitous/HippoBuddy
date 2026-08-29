# build.ps1 — HippoBuddy 一键打包脚本
#
# 用法：
#   PowerShell (管理员):
#     .\build.ps1              # 打包 Windows x64
#     .\build.ps1 -All         # 打包当前平台所有目标
#
# 前置条件：
#   1. JDK 21+（需要 jlink + jdeps）
#   2. Maven 3.8+
#   3. Node.js 18+

param(
    [switch]$All,
    [switch]$SkipJre      # skip jlink (debug only)
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path "$ScriptDir\.."

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  HippoBuddy Build Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ---- 0. Check JDK version (jlink requires JDK 9+) ----
$oldPref = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$raw = java -version 2>&1 | ForEach-Object { "$_" }
$ErrorActionPreference = $oldPref
$output = [string]($raw -join "`n")
$javaVersion = if ($output -match '"(.*?)"') { $matches[1] } else { "unknown" }
Write-Host "[info] JDK version: $javaVersion" -ForegroundColor Gray

# ---- 1. Cache mirrors (CN mirror for faster downloads) ----
$env:ELECTRON_CACHE = "$ScriptDir\.electron-cache"
$env:ELECTRON_BUILDER_CACHE = "$ScriptDir\.builder-cache"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"
$env:NODE_OPTIONS = "--max-old-space-size=4096"

# ---- 1. Build React frontend ----
# 新版前端(React)由 frontend 经 vite 构建,产物输出到
# ../src/main/resources/static-v2,再由 mvn package 打进 JAR。
# 必须先 build,否则安装包里的 /app(新版 UI)会停留在旧产物。
Write-Host "[1/5] Building React frontend..." -ForegroundColor Yellow
Push-Location "$ProjectRoot\frontend"
try {
    if (-not (Test-Path "node_modules")) { npm ci }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
} finally {
    Pop-Location
}

# ---- 2. Build JAR ----
Write-Host "[2/5] Building JAR..." -ForegroundColor Yellow
Push-Location $ProjectRoot
try {
    # 必须带 clean:前端产物(static-v2)文件名每次构建都带新 hash,
    # 不带 clean 会让旧文件残留在 target/classes,几百轮构建后 JAR 膨胀到数百 MB。
    # 用 --batch-mode 显式执行;mvn 若不可用/失败会以非零码退出,由下面的判定抛出,避免静默沿用旧 jar。
    $buildStarted = Get-Date
    & mvn --batch-mode clean package -DskipTests
    if ($LASTEXITCODE -ne 0) {
        throw "Maven build failed (exit code=$LASTEXITCODE)"
    }
} finally {
    Pop-Location
}

# ---- 3. Copy JAR to resources ----
Write-Host "[3/5] Copying JAR to resources..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "$ScriptDir\resources" | Out-Null

# 动态查找最新构建的 JAR（排除 maven-shade 的 original-* 副本）
# Windows 下 Maven 刚写完大文件时目录枚举可能瞬时为空（杀软/文件系统竞态），
# 因此带等待的重试，避免误报 "No JAR found"。
$JarFile = $null
for ($retry = 1; $retry -le 5 -and -not $JarFile; $retry++) {
    if ($retry -gt 1) {
        Write-Host "      JAR not visible yet, retrying ($retry/5)..." -ForegroundColor DarkYellow
        Start-Sleep -Seconds 1
    }
    $JarFile = Get-ChildItem "$ProjectRoot\target\*.jar" -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notlike 'original-*' } | Select-Object -First 1
}
if (-not $JarFile) { throw "No JAR found in target/ - run 'mvn package' first" }

# 新鲜度校验:jar 必须是本次 [2/5] 刚构建出来的。若 mvn 因故未真正重建(命令不可用/
# 被杀软锁住/失败却被静默通过),这里会命中旧 jar 并终止打包,避免把旧后端打进安装包。
if ($JarFile.LastWriteTime -lt $buildStarted) {
    throw "JAR 不是本次构建产物 (mtime=$($JarFile.LastWriteTime), buildStarted=$buildStarted)。终止打包避免遗留旧后端;请检查 Maven 是否正常执行。"
}
Write-Host "      Using JAR: $($JarFile.Name) (mtime=$($JarFile.LastWriteTime))" -ForegroundColor Gray
Copy-Item $JarFile.FullName "$ScriptDir\resources\hippo-agent.jar" -Force

# 清理 resources 下的 JAR 残留备份(extraResources filter 为 "**/*",历史 .bak 会被打进安装包)
Get-ChildItem "$ScriptDir\resources" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like '*.bak*' } |
    Remove-Item -Force

# ---- 3. jlink: trim minimal JRE ----
if (-not $SkipJre) {
    Write-Host "[4/5] Trimming JRE (jlink)..." -ForegroundColor Yellow

    $JreOut = "$ScriptDir\resources\jre"
    if (Test-Path $JreOut) {
        Write-Host "      Cleaning old JRE..." -ForegroundColor Gray
        Remove-Item -Recurse -Force $JreOut
    }

    # 3a. Auto-detect required modules with jdeps
    $JarFile = "$ScriptDir\resources\hippo-agent.jar"
    $ModuleList = $null

    Write-Host "      Analyzing module dependencies (jdeps)..." -ForegroundColor Gray
    try {
        $jdepsOut = & jdeps --print-module-deps --ignore-missing-deps $JarFile 2>&1
        if ($LASTEXITCODE -eq 0) {
            $autoModules = ($jdepsOut | Out-String).Trim()
            Write-Host "      jdeps result: $autoModules" -ForegroundColor Gray
            # 以 jdeps 检测结果为基，补充运行期可能需要的模块
            $extra = @('java.logging', 'jdk.crypto.ec', 'jdk.crypto.cryptoki')
            $combined = ($autoModules -split ',' ) + $extra | Select-Object -Unique
            $ModuleList = ($combined | Where-Object { $_ -match '\S' }) -join ','
        }
    } catch {
        Write-Host "      jdeps failed, falling back to default module list" -ForegroundColor DarkYellow
    }

    # 3b. Fallback to a safe default list if jdeps fails
    if (-not $ModuleList) {
        $ModuleList = @(
            'java.base',              # Core
            'java.desktop',           # AWT headless (WebApplication) + POI PPT 渲染
            'java.instrument',        # 字节码操作库
            'java.logging',           # SLF4J / Logback
            'java.management',        # Logback JMX
            'java.naming',            # JNDI (transitive deps)
            'java.net.http',          # OkHttp / HTTP client
            'java.security.jgss',     # 安全认证 (HTTP client)
            'java.sql',               # Transitive deps
            'java.xml',               # Jackson / POI
            'java.xml.crypto',        # XML 加密 (POI)
            'jdk.crypto.ec',          # HTTPS / TLS
            'jdk.crypto.cryptoki',    # HTTPS / TLS
            'jdk.httpserver'          # com.sun.net.httpserver (DashboardServer)
        ) -join ','
        Write-Host "      Using default module list: $ModuleList" -ForegroundColor Gray
    }

    # 3c. Run jlink
    $JlinkArgs = @(
        '--module-path', "$Env:JAVA_HOME\jmods"
        '--add-modules', $ModuleList
        '--output', $JreOut
        '--strip-debug'
        '--compress', 'zip-6'
        '--no-header-files'
        '--no-man-pages'
        '--vm', 'server'
    )

    Write-Host "      Generating minimal JRE..." -ForegroundColor Gray
    jlink @JlinkArgs
    if ($LASTEXITCODE -ne 0) { throw "jlink failed" }

    # 3d. Show size stats
    $jreSize = (Get-ChildItem -Recurse $JreOut | Measure-Object -Property Length -Sum).Sum
    Write-Host "      Done! JRE size: $('{0:N1} MB' -f ($jreSize / 1MB))" -ForegroundColor Green
} else {
    Write-Host "[3/5] Skipping jlink (-SkipJre)" -ForegroundColor DarkYellow
}

# ---- 5. Electron build ----
Write-Host "[5/5] Building Electron package..." -ForegroundColor Yellow
Push-Location $ScriptDir
try {
    if ($All) {
        npm run pack:all
    } else {
        npm run pack
    }
    if ($LASTEXITCODE -ne 0) { throw "Electron build failed" }
} finally {
    Pop-Location
}

Write-Host "========================================" -ForegroundColor Green
Write-Host "  Build complete!" -ForegroundColor Green
Write-Host "  Output: $ScriptDir\release" -ForegroundColor Green
$installer = Get-ChildItem "$ScriptDir\release\*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($installer) {
    Write-Host "  Installer: $($installer.FullName)" -ForegroundColor Green
    Write-Host "  Size: $('{0:N1} MB' -f ($installer.Length / 1MB))" -ForegroundColor Green
}
Write-Host "========================================" -ForegroundColor Green
