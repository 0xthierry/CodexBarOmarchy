#!/bin/sh

set -eu

bundle_root="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
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

append_line_if_missing() {
  file_path="$1"
  line="$2"

  if grep -Fqx "${line}" "${file_path}"; then
    return
  fi

  printf '\n%s\n' "${line}" >>"${file_path}"
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
  version_file="${bundle_root}/VERSION"
  if [ ! -f "${version_file}" ]; then
    printf 'Bundle is missing VERSION metadata: %s\n' "${version_file}" >&2
    exit 1
  fi

  version="$(cat "${version_file}")"

  data_home="$(resolve_xdg_data_home)"
  config_home="$(resolve_xdg_config_home)"
  bin_dir="${HOME}/.local/bin"

  app_home="${data_home}/${app_dir_name}"
  version_root="${app_home}/${version}"
  current_link="${app_home}/current"
  launcher_link="${bin_dir}/${binary_name}"
  autostart_dir="${config_home}/autostart"
  autostart_path="${autostart_dir}/${desktop_entry_name}"
  hypr_config_path="${config_home}/hypr/hyprland.conf"
  installed_hypr_snippet_path="${current_link}/hypr/${hypr_snippet_name}"
  hypr_source_line="source = ${installed_hypr_snippet_path}"

  rm -rf "${version_root}"
  mkdir -p "${version_root}/assets/tray" "${version_root}/hypr" "${bin_dir}" "${autostart_dir}"

  install -m 0755 "${bundle_root}/${binary_name}" "${version_root}/${binary_name}"
  install -m 0644 \
    "${bundle_root}/assets/tray/agent-stats-tray.svg" \
    "${version_root}/assets/tray/agent-stats-tray.svg"
  install -m 0644 \
    "${bundle_root}/hypr/${hypr_snippet_name}" \
    "${version_root}/hypr/${hypr_snippet_name}"
  install -m 0755 "${bundle_root}/uninstall.sh" "${version_root}/uninstall.sh"
  printf '%s\n' "${version}" >"${version_root}/VERSION"

  ln -sfn "${version_root}" "${current_link}"
  ln -sfn "${current_link}/${binary_name}" "${launcher_link}"

  sed \
    -e "s|@EXECUTABLE_PATH@|${launcher_link}|g" \
    -e "s|@ICON_PATH@|${current_link}/assets/tray/agent-stats-tray.svg|g" \
    "${bundle_root}/${desktop_entry_name}.in" >"${autostart_path}"

  if [ -f "${hypr_config_path}" ]; then
    append_line_if_missing "${hypr_config_path}" "${hypr_source_line}"
    reload_hyprland_if_running
    printf '  hyprland rule: %s\n' "${installed_hypr_snippet_path}"
  else
    printf '  hyprland rule: skipped (missing %s)\n' "${hypr_config_path}"
  fi

  printf 'Installed %s %s\n' "${binary_name}" "${version}"
  printf '  version root: %s\n' "${version_root}"
  printf '  current link: %s -> %s\n' "${current_link}" "${version_root}"
  printf '  launcher: %s\n' "${launcher_link}"
  printf '  autostart: %s\n' "${autostart_path}"
}

main
