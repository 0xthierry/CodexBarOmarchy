#!/bin/sh

set -eu

script_path="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
binary_name="omarchy-agent-bar"
desktop_entry_name="omarchy-agent-bar.desktop"
app_dir_name="omarchy-agent-bar"

resolve_xdg_data_home() {
  if [ -n "${XDG_DATA_HOME:-}" ]; then
    printf '%s\n' "${XDG_DATA_HOME}"
    return
  fi

  printf '%s\n' "${HOME}/.local/share"
}

resolve_xdg_config_home() {
  if [ -n "${XDG_CONFIG_HOME:-}" ]; then
    printf '%s\n' "${XDG_CONFIG_HOME}"
    return
  fi

  printf '%s\n' "${HOME}/.config"
}

main() {
  data_home="$(resolve_xdg_data_home)"
  config_home="$(resolve_xdg_config_home)"
  app_home="${data_home}/${app_dir_name}"
  current_link="${app_home}/current"
  bin_link="${HOME}/.local/bin/${binary_name}"
  autostart_path="${config_home}/autostart/${desktop_entry_name}"
  version_root="${script_path}"
  current_target=""

  if [ -L "${current_link}" ]; then
    current_target="$(readlink -f "${current_link}")"
  fi

  if [ "${current_target}" = "${version_root}" ]; then
    if [ -L "${bin_link}" ]; then
      rm -f "${bin_link}"
    fi

    if [ -f "${autostart_path}" ]; then
      rm -f "${autostart_path}"
    fi

    rm -f "${current_link}"
  fi

  rm -rf "${version_root}"

  if [ -d "${app_home}" ] && [ -z "$(find "${app_home}" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
    rmdir "${app_home}"
  fi

  printf 'Uninstalled %s from %s\n' "${binary_name}" "${version_root}"
  printf 'Config under %s/%s was left in place.\n' "${config_home}" "${app_dir_name}"
}

main
