#!/usr/bin/env bash

set -euo pipefail

readonly bundle_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly binary_name="omarchy-agent-bar"
readonly desktop_entry_name="omarchy-agent-bar.desktop"
readonly app_dir_name="omarchy-agent-bar"

resolve_xdg_data_home() {
  if [[ -n "${XDG_DATA_HOME:-}" ]]; then
    printf '%s\n' "${XDG_DATA_HOME}"
    return
  fi

  printf '%s\n' "${HOME}/.local/share"
}

resolve_xdg_config_home() {
  if [[ -n "${XDG_CONFIG_HOME:-}" ]]; then
    printf '%s\n' "${XDG_CONFIG_HOME}"
    return
  fi

  printf '%s\n' "${HOME}/.config"
}

main() {
  local version_file="${bundle_root}/VERSION"
  if [[ ! -f "${version_file}" ]]; then
    printf 'Bundle is missing VERSION metadata: %s\n' "${version_file}" >&2
    exit 1
  fi

  local version
  version="$(<"${version_file}")"

  local data_home
  data_home="$(resolve_xdg_data_home)"
  local config_home
  config_home="$(resolve_xdg_config_home)"
  local bin_dir="${HOME}/.local/bin"

  local app_home="${data_home}/${app_dir_name}"
  local version_root="${app_home}/${version}"
  local current_link="${app_home}/current"
  local launcher_link="${bin_dir}/${binary_name}"
  local autostart_dir="${config_home}/autostart"
  local autostart_path="${autostart_dir}/${desktop_entry_name}"

  rm -rf "${version_root}"
  mkdir -p "${version_root}/assets/tray" "${bin_dir}" "${autostart_dir}"

  install -m 0755 "${bundle_root}/${binary_name}" "${version_root}/${binary_name}"
  install -m 0644 \
    "${bundle_root}/assets/tray/agent-stats-tray.svg" \
    "${version_root}/assets/tray/agent-stats-tray.svg"
  install -m 0755 "${bundle_root}/uninstall.sh" "${version_root}/uninstall.sh"
  printf '%s\n' "${version}" >"${version_root}/VERSION"

  ln -sfn "${version_root}" "${current_link}"
  ln -sfn "${current_link}/${binary_name}" "${launcher_link}"

  sed \
    -e "s|@EXECUTABLE_PATH@|${launcher_link}|g" \
    -e "s|@ICON_PATH@|${current_link}/assets/tray/agent-stats-tray.svg|g" \
    "${bundle_root}/${desktop_entry_name}.in" >"${autostart_path}"

  printf 'Installed %s %s\n' "${binary_name}" "${version}"
  printf '  version root: %s\n' "${version_root}"
  printf '  current link: %s -> %s\n' "${current_link}" "${version_root}"
  printf '  launcher: %s\n' "${launcher_link}"
  printf '  autostart: %s\n' "${autostart_path}"
}

main "$@"
