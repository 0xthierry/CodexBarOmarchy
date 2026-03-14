# Changelog

## 1.0.0 (2026-03-14)


### Features

* add omarchy tray entrypoint ([355f56b](https://github.com/0xthierry/CodexBarOmarchy/commit/355f56be3e3e3f57de294dc647b9c2f8c0d9c6e6))
* add runtime-backed tui shell ([8739cdf](https://github.com/0xthierry/CodexBarOmarchy/commit/8739cdfcbe662e5b5e26451cb8dcbd40ea63f9aa))
* **cli:** add non-interactive stats command ([be6a8ff](https://github.com/0xthierry/CodexBarOmarchy/commit/be6a8ff161fcfef0442b56d1adba0e26d53250b0))
* complete headless runtime contract for provider refresh and config ([e80efe3](https://github.com/0xthierry/CodexBarOmarchy/commit/e80efe34d71b81b13c48e29e8ea8303568d4be08))
* **core-actions:** add provider adapter contracts ([18a5443](https://github.com/0xthierry/CodexBarOmarchy/commit/18a5443082901074593427450f9eceadebf0beea))
* **core-config:** add typed config schema and defaults ([f6c6d80](https://github.com/0xthierry/CodexBarOmarchy/commit/f6c6d8013510ec729f657dc435bd093b8a8c7e65))
* **core-detection:** add config store and provider detection ([36c0737](https://github.com/0xthierry/CodexBarOmarchy/commit/36c0737183d93ad12479425fbd96c23ce63e73d4))
* **core-store:** add app store mutation layer ([52f260f](https://github.com/0xthierry/CodexBarOmarchy/commit/52f260ff981e9911dc172ce164667b736b7f6dc7))
* **core:** make runtime defaults host-neutral ([c61208e](https://github.com/0xthierry/CodexBarOmarchy/commit/c61208eb7346b2cc33a1f68107e41bdbc161195b))
* **gemini:** report quota as used percentage ([e05de05](https://github.com/0xthierry/CodexBarOmarchy/commit/e05de0540a40b08f5376dea892bea530804a5804))
* implement provider parity runtime slice ([43dc005](https://github.com/0xthierry/CodexBarOmarchy/commit/43dc005e46542a3d63c73fca98e96527939655bf))
* **runtime:** add live provider adapters ([e2f3e8a](https://github.com/0xthierry/CodexBarOmarchy/commit/e2f3e8a26306423eea5a367f0b361cee4373b34f))
* **runtime:** enrich provider snapshots with status and cost data ([bf8305f](https://github.com/0xthierry/CodexBarOmarchy/commit/bf8305f32f69fd8ddb42ae1e93dbee3ffe73c26f))
* **shell:** add electron tray popup scaffold ([b3bd73a](https://github.com/0xthierry/CodexBarOmarchy/commit/b3bd73a517957e0d0c2aad071c1f5a9014fb1a39))
* **shell:** add electron tray popup scaffold ([0436268](https://github.com/0xthierry/CodexBarOmarchy/commit/0436268ed80b9544cfbce5fd9558b5cac252ef2a))
* **shell:** wire tray popup to live runtime host ([8456331](https://github.com/0xthierry/CodexBarOmarchy/commit/8456331b05f65e9d42277b6103dec521da5482f8))
* **store:** add runtime provider state ([386dc7d](https://github.com/0xthierry/CodexBarOmarchy/commit/386dc7d5de7589c46dd4c8d739339805fefef156))
* **tui:** refine status and privacy display ([06f619d](https://github.com/0xthierry/CodexBarOmarchy/commit/06f619dd88ee4e83d8ad53a42e48e28b10dac276))
* **tui:** rename app to agent-stats ([13aece7](https://github.com/0xthierry/CodexBarOmarchy/commit/13aece7792755b12d0836a508548f156a17fc6b7))
* **tui:** show live clock in header ([b76c6b3](https://github.com/0xthierry/CodexBarOmarchy/commit/b76c6b3958d15b99a38364c5c99cdd51617f0bf6))
* wire interactive tui settings flow ([227e4ca](https://github.com/0xthierry/CodexBarOmarchy/commit/227e4ca7afb66bca462464764e36477771c62409))


### Bug Fixes

* align codex dashboard usage labels with bars ([258e068](https://github.com/0xthierry/CodexBarOmarchy/commit/258e0681be58d3b2ef15c4b7e2baf513780d6c38))
* allow unset tray identity suffix ([ce33049](https://github.com/0xthierry/CodexBarOmarchy/commit/ce33049718a18b8f6373ed6f6d7b45c771a7f75e))
* **core:** harden initialization and persistence ordering ([2daa4cf](https://github.com/0xthierry/CodexBarOmarchy/commit/2daa4cf1816e632e078df2697d5d33640416c19f))
* enable waybar tray activation ([6493671](https://github.com/0xthierry/CodexBarOmarchy/commit/64936717621fe1cb168fdbc83e1479f137a7317e))
* estimate token cost with unpriced models ([c4e8b78](https://github.com/0xthierry/CodexBarOmarchy/commit/c4e8b78543579e00cdca5c439e230088b7ca0545))
* improve claude source handling and usage feedback ([6ced281](https://github.com/0xthierry/CodexBarOmarchy/commit/6ced281a465bfb905fcffc99152ab241efd4cbf3))
* install hyprland popup rules for tray tui ([2eb5db8](https://github.com/0xthierry/CodexBarOmarchy/commit/2eb5db8e7a18c85f6ddcacb0804cf02d32d6ea6a))
* normalize claude cli reset windows ([ec9dc25](https://github.com/0xthierry/CodexBarOmarchy/commit/ec9dc258501fd2686bd8319d12b96c584bc949ee))
* normalize provider web metadata and status details ([44727db](https://github.com/0xthierry/CodexBarOmarchy/commit/44727db65dd1f51f5dd9b109307429fa926b0e8e))
* preserve provider detection state ([f817617](https://github.com/0xthierry/CodexBarOmarchy/commit/f8176176b71b34e4f90a5db532408dcaaff92c93))
* refine provider usage details ([70edc4c](https://github.com/0xthierry/CodexBarOmarchy/commit/70edc4ceca2dd6128b9ad518923cf91415eec04e))
* relax chromium cookie row typing for typecheck ([97424d8](https://github.com/0xthierry/CodexBarOmarchy/commit/97424d8ef3ced4e121978e2780ff2d3d9ed609d4))
* reorder codex usage metrics ([b200430](https://github.com/0xthierry/CodexBarOmarchy/commit/b200430fdd591313b1696efdadbd7cc2efeaa116))
* restore provider typecheck compatibility ([fde5a99](https://github.com/0xthierry/CodexBarOmarchy/commit/fde5a9900788aec6a3e68fda91dd9c23a4932f4f))
* separate tray identities by environment ([8b5add8](https://github.com/0xthierry/CodexBarOmarchy/commit/8b5add8afcced153ba7cbdfc6c367e19337be76d))
* **shell:** avoid dismissing popup during tray handoff ([a1e0de8](https://github.com/0xthierry/CodexBarOmarchy/commit/a1e0de8f6137dbacd31bdb8c4feaf714535819b5))
* **shell:** harden popup startup and scheduler state ([47f5ad4](https://github.com/0xthierry/CodexBarOmarchy/commit/47f5ad40c670031f06437a6af6c45aa9665d9413))
* **shell:** make electron smoke startup stable ([98692db](https://github.com/0xthierry/CodexBarOmarchy/commit/98692db111aaed70d6bf5a7d2f8b18c06562b882))
* **tui:** address review findings ([c973536](https://github.com/0xthierry/CodexBarOmarchy/commit/c973536c25d34d3d8032edaf861ed9da88f89c94))

## Changelog

All notable changes to this project will be documented in this file.

This file is managed by Release Please.
