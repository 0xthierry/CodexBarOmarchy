#!/usr/bin/env bash

set -euo pipefail

readonly script_path="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
  local data_home
  data_home="$(resolve_xdg_data_home)"
  local config_home
  config_home="$(resolve_xdg_config_home)"
  local app_home="${data_home}/${app_dir_name}"
  local current_link="${app_home}/current"
  local bin_link="${HOME}/.local/bin/${binary_name}"
  local autostart_path="${config_home}/autostart/${desktop_entry_name}"
  local version_root="${script_path}"
  local current_target=""

  if [[ -L "${current_link}" ]]; then
    current_target="$(readlink -f "${current_link}")"
  fi

  if [[ "${current_target}" == "${version_root}" ]]; then
    if [[ -L "${bin_link}" ]]; then
      rm -f "${bin_link}"
    fi

    if [[ -f "${autostart_path}" ]]; then
      rm -f "${autostart_path}"
    fi

    rm -f "${current_link}"
  fi

  rm -rf "${version_root}"

  if [[ -d "${app_home}" ]] && [[ -z "$(find "${app_home}" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    rmdir "${app_home}"
  fi

  printf 'Uninstalled %s from %s\n' "${binary_name}" "${version_root}"
  printf 'Config under %s/%s was left in place.\n' "${config_home}" "${app_dir_name}"
}

main "$@"
