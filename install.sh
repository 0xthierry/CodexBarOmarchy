#!/usr/bin/env bash

set -euo pipefail

readonly binary_name="omarchy-agent-bar"
readonly default_repository="0xthierry/CodexBarOmarchy"
readonly release_host="${OMARCHY_AGENT_BAR_RELEASE_HOST:-https://github.com}"
readonly repository="${OMARCHY_AGENT_BAR_REPOSITORY:-${default_repository}}"

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

normalize_version() {
  local version="$1"
  printf '%s\n' "${version#v}"
}

resolve_latest_version() {
  local latest_url
  latest_url="$(
    curl \
      -fsSL \
      -o /dev/null \
      -w '%{url_effective}' \
      "${release_host}/${repository}/releases/latest"
  )"

  local latest_tag="${latest_url##*/}"
  if [[ -z "${latest_tag}" ]]; then
    printf 'Failed to resolve the latest release tag from %s\n' "${latest_url}" >&2
    exit 1
  fi

  normalize_version "${latest_tag}"
}

download_asset() {
  local source_url="$1"
  local destination_path="$2"

  curl --fail --location --retry 3 --silent --show-error --output "${destination_path}" "${source_url}"
}

main() {
  require_command curl
  require_command mktemp
  require_command sha256sum
  require_command tar

  local requested_version="${1:-${OMARCHY_AGENT_BAR_VERSION:-}}"
  local version
  if [[ -n "${requested_version}" ]]; then
    version="$(normalize_version "${requested_version}")"
  else
    version="$(resolve_latest_version)"
  fi

  local tag_name="v${version}"
  local arch
  arch="$(normalize_arch "$(uname -m)")"
  local artifact_basename="${binary_name}-${version}-linux-${arch}"
  local archive_name="${artifact_basename}.tar.gz"
  local checksum_name="${archive_name}.sha256"
  local archive_url="${release_host}/${repository}/releases/download/${tag_name}/${archive_name}"
  local checksum_url="${release_host}/${repository}/releases/download/${tag_name}/${checksum_name}"

  local temp_root
  temp_root="$(mktemp -d)"
  trap 'rm -rf "${temp_root:-}"' EXIT

  download_asset "${archive_url}" "${temp_root}/${archive_name}"
  download_asset "${checksum_url}" "${temp_root}/${checksum_name}"

  (
    cd "${temp_root}"
    sha256sum -c "${checksum_name}"
    tar -xzf "${archive_name}"
  )

  bash "${temp_root}/${artifact_basename}/install.sh"
}

main "$@"
