#!/bin/sh

set -eu

binary_name="omarchy-agent-bar"
default_repository="0xthierry/CodexBarOmarchy"
release_host="${OMARCHY_AGENT_BAR_RELEASE_HOST:-https://github.com}"
repository="${OMARCHY_AGENT_BAR_REPOSITORY:-${default_repository}}"

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
  version="$1"
  printf '%s\n' "${version#v}"
}

resolve_latest_version() {
  latest_url="$(
    curl \
      -fsSL \
      -o /dev/null \
      -w '%{url_effective}' \
      "${release_host}/${repository}/releases/latest"
  )"

  latest_tag="${latest_url##*/}"
  if [ -z "${latest_tag}" ]; then
    printf 'Failed to resolve the latest release tag from %s\n' "${latest_url}" >&2
    exit 1
  fi

  normalize_version "${latest_tag}"
}

download_asset() {
  source_url="$1"
  destination_path="$2"

  curl --fail --location --retry 3 --silent --show-error --output "${destination_path}" "${source_url}"
}

print_usage() {
  cat <<'EOF'
Usage: install.sh [--version vX.Y.Z]

Installs the latest GitHub release by default.
Use --version to install a specific release.
EOF
}

parse_args() {
  requested_version="${OMARCHY_AGENT_BAR_VERSION:-}"

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --version)
        if [ "$#" -lt 2 ]; then
          printf 'Missing value for --version\n' >&2
          exit 1
        fi
        requested_version="$2"
        shift 2
        ;;
      --help|-h)
        print_usage
        exit 0
        ;;
      *)
        printf 'Unknown argument: %s\n' "$1" >&2
        print_usage >&2
        exit 1
        ;;
    esac
  done
}

cleanup() {
  if [ -n "${temp_root:-}" ] && [ -d "${temp_root}" ]; then
    rm -rf "${temp_root}"
  fi
}

main() {
  require_command curl
  require_command mktemp
  require_command sha256sum
  require_command tar

  parse_args "$@"

  if [ -n "${requested_version}" ]; then
    version="$(normalize_version "${requested_version}")"
  else
    version="$(resolve_latest_version)"
  fi

  tag_name="v${version}"
  arch="$(normalize_arch "$(uname -m)")"
  artifact_basename="${binary_name}-${version}-linux-${arch}"
  archive_name="${artifact_basename}.tar.gz"
  checksum_name="${archive_name}.sha256"
  archive_url="${release_host}/${repository}/releases/download/${tag_name}/${archive_name}"
  checksum_url="${release_host}/${repository}/releases/download/${tag_name}/${checksum_name}"

  temp_root="$(mktemp -d)"
  trap cleanup EXIT INT TERM

  download_asset "${archive_url}" "${temp_root}/${archive_name}"
  download_asset "${checksum_url}" "${temp_root}/${checksum_name}"

  (
    cd "${temp_root}"
    sha256sum -c "${checksum_name}"
    tar -xzf "${archive_name}"
  )

  sh "${temp_root}/${artifact_basename}/install.sh"
}

main "$@"
