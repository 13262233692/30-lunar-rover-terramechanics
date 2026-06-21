#!/usr/bin/env bash
# =========================================================================
#  build-wasm.sh - Compile C++ terramechanics engine to WebAssembly
#  Requires: Emscripten SDK (emsdk) installed and activated
#
#  Usage:
#    1. Install emsdk:  git clone https://github.com/emscripten-core/emsdk.git
#    2. Activate:       emsdk install latest && emsdk activate latest
#    3. Source env:     source emsdk_env.sh
#    4. Run:            bash ./scripts/build-wasm.sh
# =========================================================================

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "${SCRIPT_DIR}/.." && pwd )"
SRC_FILE="${PROJECT_ROOT}/src/wasm/terramechanics.cpp"
OUT_DIR="${PROJECT_ROOT}/public/wasm"
OUT_JS="${OUT_DIR}/terramechanics.js"
OUT_WASM="${OUT_DIR}/terramechanics.wasm"

echo "[build-wasm] Project root: ${PROJECT_ROOT}"
echo "[build-wasm] Source file : ${SRC_FILE}"
echo "[build-wasm] Output dir  : ${OUT_DIR}"

mkdir -p "${OUT_DIR}"

if ! command -v emcc &> /dev/null; then
    echo "[build-wasm] ERROR: emcc (Emscripten) not found in PATH."
    echo "[build-wasm] Install and activate the Emscripten SDK first:"
    echo "  git clone https://github.com/emscripten-core/emsdk.git"
    echo "  cd emsdk && ./emsdk install latest && ./emsdk activate latest"
    echo "  source ./emsdk_env.sh"
    exit 1
fi

emcc "${SRC_FILE}" \
  -o "${OUT_JS}" \
  -O3 \
  -std=c++17 \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s USE_ES6_IMPORT_META=0 \
  -s EXPORT_NAME="TerramechanicsModule" \
  -s ENVIRONMENT="web,worker" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s TOTAL_STACK=2MB \
  -s INITIAL_MEMORY=32MB \
  -s EXPORTED_RUNTIME_METHODS='["cwrap","getValue","setValue","HEAPF32","HEAPF64","_malloc","_free"]' \
  -s EXPORTED_FUNCTIONS='[
    "_init",
    "_setSoilParams",
    "_setWheelParams",
    "_step",
    "_reset",
    "_malloc",
    "_free"
  ]' \
  --no-entry \
  -Wall \
  -Wno-unused-parameter \
  || {
    echo "[build-wasm] Compilation FAILED"
    exit 1
  }

if [ -f "${OUT_WASM}" ]; then
    SIZE=$(stat -c%s "${OUT_WASM}" 2>/dev/null || du -b "${OUT_WASM}" | cut -f1)
    echo "[build-wasm] SUCCESS - ${OUT_WASM} is ${SIZE} bytes"
else
    echo "[build-wasm] WARNING - .wasm not generated (emitted single JS?)"
fi

echo "[build-wasm] Done."
