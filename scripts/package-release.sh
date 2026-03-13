#!/usr/bin/env bash

set -euo pipefail

readonly repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly binary_name="omarchy-agent-bar"
readonly desktop_entry_name="omarchy-agent-bar.desktop"
readonly icon_relative_path="assets/tray/agent-stats-tray.svg"

normalize_arch() {
  case "$1" in
    x86_64 | amd64)
      printf 'x64\n'
      ;;
    aarch64 | arm64)
      printf 'arm64\n'
      ;;
    *)
      printf '%s\n' "$1"
      ;;
  esac
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "$1" >&2
    exit 1
  fi
}

main() {
  require_command bun
  require_command sha256sum
  require_command tar

  local version="${1:-${RELEASE_VERSION:-}}"
  if [[ -z "${version}" ]]; then
    printf 'Usage: %s <version>\n' "${BASH_SOURCE[0]}" >&2
    printf 'Or set RELEASE_VERSION=<version>.\n' >&2
    exit 1
  fi

  local platform="linux"
  local arch
  arch="$(normalize_arch "$(uname -m)")"
  local artifact_basename="${binary_name}-${version}-${platform}-${arch}"
  local release_root="${repo_root}/dist/release"
  local bundle_root="${release_root}/${artifact_basename}"
  local archive_path="${release_root}/${artifact_basename}.tar.gz"
  local checksum_path="${archive_path}.sha256"

  mkdir -p "${release_root}"
  rm -rf "${bundle_root}"
  mkdir -p "${bundle_root}/assets/tray"

  (
    cd "${repo_root}"
    bun run build:bin
  )

  install -m 0755 "${repo_root}/dist/${binary_name}" "${bundle_root}/${binary_name}"
  install -m 0644 "${repo_root}/${icon_relative_path}" "${bundle_root}/${icon_relative_path}"
  install -m 0644 \
    "${repo_root}/packaging/linux/${desktop_entry_name}.in" \
    "${bundle_root}/${desktop_entry_name}.in"
  install -m 0755 "${repo_root}/scripts/install-bundle.sh" "${bundle_root}/install.sh"
  install -m 0755 "${repo_root}/scripts/uninstall-installed.sh" "${bundle_root}/uninstall.sh"
  printf '%s\n' "${version}" >"${bundle_root}/VERSION"

  rm -f "${archive_path}" "${checksum_path}"
  (
    cd "${release_root}"
    tar -czf "${artifact_basename}.tar.gz" "${artifact_basename}"
    sha256sum "${artifact_basename}.tar.gz" >"${artifact_basename}.tar.gz.sha256"
  )

  printf 'Created release bundle:\n'
  printf '  %s\n' "${archive_path}"
  printf '  %s\n' "${checksum_path}"
}

main "$@"
