#!/usr/bin/env bash
# Rebuild the retained MCC13 expanded-sky compiler from local, reviewed sources.
set -euo pipefail

payload=invader-expanded-sky
if [[ ${1:-} == --vehicle-bsp ]]; then
    payload=invader-mcc-placement
    shift
fi

if [[ $# != 3 ]]; then
    printf 'Usage: %s [--vehicle-bsp] <Invader checkout> <Corrosion checkout> <empty physical build folder>\n' "$0" >&2
    exit 2
fi
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
invader=$(realpath -e -- "$1")
corrosion=$(realpath -e -- "$2")
work=$(realpath -e -- "$3")
patch="$repo/scripts/patches/invader-mcc-expanded-sky.patch"

[[ -d "$work" && ! -L "$3" && -z $(find "$work" -mindepth 1 -maxdepth 1 -print -quit) ]] ||
    { echo 'Supply an empty physical build directory.' >&2; exit 2; }
for protected in "$repo" "$invader" "$corrosion"; do
    case "$work/" in
        "$protected/"*) echo 'Build output must be outside the source checkouts.' >&2; exit 2 ;;
    esac
done

require_revision() {
    local checkout=$1 revision=$2
    if [[ $(git -C "$checkout" rev-parse HEAD) != "$revision" ]]; then
        printf 'Expected revision %s in %s\n' "$revision" "$checkout" >&2
        exit 2
    fi
}

require_revision "$invader" 696830ff80af227e84e7237c2ef26eb2301ed110
require_revision "$invader/ext/riat" c1380cbfc708d89a3713af57b48d3f4368c34f8a
require_revision "$corrosion" 5239c1b64742bb03e13f10822ca8ef5e52f75f71
printf '%s  %s\n' 2c7c2d9c28e8ce9fabba7e5c4e19e133a4e9d9aadd247e57ebd8b6d25a5df834 "$patch" | sha256sum --check --status

# Archive committed inputs so rebuilding cannot modify or pick up dirt in the retained checkout.
mkdir -p -- "$work/source/ext/riat" "$work/corrosion"
git -C "$invader" archive HEAD | tar -x -C "$work/source"
git -C "$invader/ext/riat" archive HEAD | tar -x -C "$work/source/ext/riat"
git -C "$corrosion" archive HEAD | tar -x -C "$work/corrosion"
(cd "$work/source" && git apply "$patch")
if [[ "$payload" == invader-mcc-placement ]]; then
    (cd "$work/source" && git apply "$repo/scripts/patches/invader-mcc-vehicle-bsp.patch")
fi
lock="$repo/scripts/patches/invader-expanded-sky-riat.Cargo.lock"
printf '%s  %s\n' e8f032217fc7f698400c5853b4a4329834e22e9196eb5234d04c1e5fd3c30f64 "$lock" | sha256sum --check --status
cp -- "$lock" "$work/source/ext/riat/riatc/Cargo.lock"

# Use an origin-relative library lookup so the payload can run from a Tools folder.
export CARGO_NET_OFFLINE=true
cmake -S "$work/source" -B "$work/build" -G Ninja \
    -DCMAKE_BUILD_TYPE=Release -DCMAKE_BUILD_RPATH_USE_ORIGIN=ON \
    -DINVADER_USE_SYSTEM_CORROSION=OFF \
    -DFETCHCONTENT_SOURCE_DIR_CORROSION="$work/corrosion" -DFETCHCONTENT_FULLY_DISCONNECTED=ON
cmake --build "$work/build" --parallel 2 --target invader-build invader-edit invader-extract invader-dependency invader-info invader-refactor
tools=(invader-build invader-edit invader-extract invader-dependency invader-info invader-refactor libinvader.so)
mkdir -- "$work/$payload"
cp -- "$work/source/LICENSE.md" "$work/source/gplv3.txt" "$work/$payload/"
for tool in "${tools[@]}"; do
    test -f "$work/build/$tool"
    cp -- "$work/build/$tool" "$work/$payload/"
done
(cd "$work/$payload" && sha256sum "${tools[@]}" > SHA256SUMS)
printf 'Expanded-sky Linux toolchain: %s\n' "$work/$payload"
