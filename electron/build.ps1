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

Write-Host "[1/4] Building JAR..." -ForegroundColor Yellow
Push-Location $ProjectRoot
try {
    mvn package -DskipTests -q
    if ($LASTEXITCODE -ne 0) { throw "Maven build failed" }
} finally {
    Pop-Location
}

Write-Host "[2/4] Copying JAR to resources..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "$ScriptDir\resources" | Out-Null
Copy-Item "$ProjectRoot\target\HippoBuddy-1.0.0.jar" "$ScriptDir\resources\hippo-agent.jar" -Force

# ---- 3. jlink: trim minimal JRE ----
if (-not $SkipJre) {
    Write-Host "[3/4] Trimming JRE (jlink)..." -ForegroundColor Yellow

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
        $jdepsOut = java -jar "$Env:JAVA_HOME\lib\jdeps.jar" --print-module-deps --ignore-missing-deps $JarFile 2>&1
        if ($LASTEXITCODE -eq 0) {
            $ModuleList = ($jdepsOut | Out-String).Trim()
            Write-Host "      jdeps result: $ModuleList" -ForegroundColor Gray
        }
    } catch {
        Write-Host "      jdeps failed, falling back to default module list" -ForegroundColor DarkYellow
    }

    # 3b. Fallback to a safe default list if jdeps fails
    if (-not $ModuleList) {
        $ModuleList = @(
            'java.base',              # Core
            'java.logging',           # SLF4J / Logback
            'java.xml',               # Jackson / POI
            'java.net.http',          # OkHttp / HTTP client
            'jdk.httpserver',         # com.sun.net.httpserver (DashboardServer)
            'java.management',        # Logback JMX
            'java.naming',            # JNDI (transitive deps)
            'jdk.unsupported',        # sun.misc.Unsafe (Jackson/OkHttp)
            'java.sql',               # Transitive deps
            'jdk.crypto.ec',          # HTTPS / TLS
            'jdk.crypto.cryptoki',    # HTTPS / TLS
            'java.compiler'           # jsoup and others
        ) -join ','
        Write-Host "      Using default module list: $ModuleList" -ForegroundColor Gray
    }

    # 3c. Run jlink
    $JlinkArgs = @(
        '--module-path', "$Env:JAVA_HOME\jmods"
        '--add-modules', $ModuleList
        '--output', $JreOut
        '--strip-debug'
        '--compress', '2'
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
    Write-Host "[3/4] Skipping jlink (-SkipJre)" -ForegroundColor DarkYellow
}

# ---- 4. Electron build ----
Write-Host "[4/4] Building Electron package..." -ForegroundColor Yellow
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
