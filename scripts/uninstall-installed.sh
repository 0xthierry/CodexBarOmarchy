#!/bin/sh

set -eu

resolve_script_path() {
  script_target="$0"

  if command -v readlink >/dev/null 2>&1; then
    resolved_target="$(readlink -f -- "$script_target" 2>/dev/null || true)"
    if [ -n "${resolved_target}" ]; then
      script_target="${resolved_target}"
    fi
  fi

  CDPATH= cd -- "$(dirname -- "${script_target}")" && pwd -P
}

script_path="$(resolve_script_path)"
binary_name="omarchy-agent-bar"
desktop_entry_name="omarchy-agent-bar.desktop"
app_dir_name="omarchy-agent-bar"
hypr_snippet_name="omarchy-agent-bar.conf"

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

remove_exact_line() {
  file_path="$1"
  line="$2"
  temp_file="$(mktemp)"

  awk -v exact_line="${line}" '$0 != exact_line' "${file_path}" >"${temp_file}"
  mv "${temp_file}" "${file_path}"
}

reload_hyprland_if_running() {
  if [ -z "${HYPRLAND_INSTANCE_SIGNATURE:-}" ]; then
    return
  fi

  if ! command -v hyprctl >/dev/null 2>&1; then
    return
  fi

  hyprctl reload >/dev/null 2>&1 || true
}

main() {
  data_home="$(resolve_xdg_data_home)"
  config_home="$(resolve_xdg_config_home)"
  app_home="${data_home}/${app_dir_name}"
  current_link="${app_home}/current"
  bin_link="${HOME}/.local/bin/${binary_name}"
  autostart_path="${config_home}/autostart/${desktop_entry_name}"
  hypr_config_path="${config_home}/hypr/hyprland.conf"
  hypr_source_line="source = ${current_link}/hypr/${hypr_snippet_name}"
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

    if [ -f "${hypr_config_path}" ] && grep -Fqx "${hypr_source_line}" "${hypr_config_path}"; then
      remove_exact_line "${hypr_config_path}" "${hypr_source_line}"
      reload_hyprland_if_running
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
