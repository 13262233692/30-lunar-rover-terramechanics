@echo off
REM =========================================================================
REM   build-wasm.bat - Compile C++ terramechanics engine to WebAssembly
REM   Requires: Emscripten SDK (emsdk) installed and activated
REM
REM   Usage:
REM     1. Install emsdk:  git clone https://github.com/emscripten-core/emsdk.git
REM     2. Activate:       emsdk install latest && emsdk activate latest
REM     3. Source env:     emsdk_env.bat
REM     4. Run:            scripts\build-wasm.bat
REM =========================================================================

setlocal

set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..
set SRC_FILE=%PROJECT_ROOT%\src\wasm\terramechanics.cpp
set OUT_DIR=%PROJECT_ROOT%\public\wasm
set OUT_JS=%OUT_DIR%\terramechanics.js
set OUT_WASM=%OUT_DIR%\terramechanics.wasm

echo [build-wasm] Project root: %PROJECT_ROOT%
echo [build-wasm] Source file : %SRC_FILE%
echo [build-wasm] Output dir  : %OUT_DIR%

if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"

where emcc >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [build-wasm] ERROR: emcc ^(Emscripten^) not found in PATH.
    echo [build-wasm] Install and activate the Emscripten SDK first:
    echo   git clone https://github.com/emscripten-core/emsdk.git
    echo   cd emsdk ^&^& emsdk install latest ^&^& emsdk activate latest
    echo   call emsdk_env.bat
    exit /B 1
)

emcc "%SRC_FILE%" ^
  -o "%OUT_JS%" ^
  -O3 ^
  -std=c++17 ^
  -s WASM=1 ^
  -s MODULARIZE=1 ^
  -s EXPORT_ES6=1 ^
  -s USE_ES6_IMPORT_META=0 ^
  -s EXPORT_NAME=TerramechanicsModule ^
  -s ENVIRONMENT="web,worker" ^
  -s ALLOW_MEMORY_GROWTH=1 ^
  -s TOTAL_STACK=2MB ^
  -s INITIAL_MEMORY=32MB ^
  -s "EXPORTED_RUNTIME_METHODS=['cwrap','getValue','setValue','HEAPF32','HEAPF64','_malloc','_free']" ^
  -s "EXPORTED_FUNCTIONS=['_init','_setSoilParams','_setWheelParams','_step','_reset','_malloc','_free']" ^
  --no-entry ^
  -Wall ^
  -Wno-unused-parameter

if %ERRORLEVEL% NEQ 0 (
    echo [build-wasm] Compilation FAILED
    exit /B 1
)

if exist "%OUT_WASM%" (
    echo [build-wasm] SUCCESS: %OUT_WASM%
) else (
    echo [build-wasm] WARNING: .wasm not generated (emitted single JS?)
)

echo [build-wasm] Done.
endlocal
