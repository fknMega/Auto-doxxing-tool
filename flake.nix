{
  description = "Aether — an AI-driven OSINT analyst on the desktop";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAll = f: nixpkgs.lib.genAttrs systems (system: f system nixpkgs.legacyPackages.${system});
    in
    {
      # ── dev shell ─────────────────────────────────────────────────────────
      #   nix develop     then   npm install && npm run dev
      devShells = forAll (system: pkgs:
        let
          inherit (pkgs) lib stdenv;
          # Electron's postinstall downloads a prebuilt binary from the network,
          # which is exactly what Nix is trying to avoid. Point the toolchain at
          # the electron in nixpkgs instead and skip the download entirely.
          electron = pkgs.electron_33 or pkgs.electron;
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              nodejs_22
              node-gyp
              python3          # node-gyp needs it for any native rebuild
              electron
            ] ++ lib.optionals stdenv.hostPlatform.isLinux [
              pkg-config
              # Chromium's runtime deps. Without these the window opens on a
              # missing-symbol crash rather than a useful error.
              glib nss nspr atk at-spi2-atk at-spi2-core cups dbus
              gtk3 pango cairo gdk-pixbuf libdrm libgbm libxkbcommon
              alsa-lib expat systemd
              xorg.libX11 xorg.libXcomposite xorg.libXdamage xorg.libXext
              xorg.libXfixes xorg.libXrandr xorg.libxcb xorg.libXcursor
              xorg.libXi xorg.libXrender xorg.libXtst
            ];

            env = {
              ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
              ELECTRON_OVERRIDE_DIST_PATH = "${electron}/libexec/electron";
            };

            shellHook = ''
              echo "Aether dev shell — node $(node -v), electron ${electron.version}"
              echo "  npm install && npm run dev      run the app"
              echo "  npm run preview:web             renderer only, in a browser on :5199"
              echo "  npm run typecheck               tsc, both projects"
            '';
          };
        });

      # ── package ───────────────────────────────────────────────────────────
      #   nix build
      #
      # The npm dependency closure is pinned by npmDepsHash below, and nixpkgs
      # by flake.lock. Both are checked on every push by .github/workflows/nix.yml,
      # so a stale hash shows up as a red build rather than as an issue report.
      packages = forAll (system: pkgs:
        let
          inherit (pkgs) lib stdenv;
          electron = pkgs.electron_33 or pkgs.electron;
        in
        lib.optionalAttrs stdenv.hostPlatform.isLinux {
          default = pkgs.buildNpmPackage rec {
            pname = "aether";
            version = (lib.importJSON ./package.json).version;
            src = self;

            # Content hash of the npm dependency closure, derived from
            # package-lock.json. Regenerate after ANY lock change with:
            #   nix run nixpkgs#prefetch-npm-deps -- package-lock.json
            # A wrong value fails the build loudly; it can never make Nix accept
            # different content, because this is a fixed-output derivation.
            npmDepsHash = "sha256-aK5OXBx/2d9dokpjzEQh57s6igzT9lrbkxF6lSCcyTg=";

            nativeBuildInputs = [ pkgs.makeWrapper pkgs.copyDesktopItems ];

            ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
            ELECTRON_OVERRIDE_DIST_PATH = "${electron}/libexec/electron";

            # electron-builder wants to package and sign a distributable; under
            # Nix we only need the compiled bundle, and wrap the nixpkgs electron
            # around it ourselves.
            buildPhase = ''
              runHook preBuild
              npm run build
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              mkdir -p $out/share/aether
              cp -r out package.json $out/share/aether/
              cp -r node_modules $out/share/aether/
              makeWrapper ${electron}/bin/electron $out/bin/aether \
                --add-flags $out/share/aether \
                --set-default ELECTRON_IS_DEV 0 \
                --prefix LD_LIBRARY_PATH : "${lib.makeLibraryPath [ pkgs.libgbm ]}"
              runHook postInstall
            '';

            desktopItems = [
              (pkgs.makeDesktopItem {
                name = "aether";
                exec = "aether";
                desktopName = "Aether";
                comment = "AI-driven OSINT analyst with a live knowledge graph";
                categories = [ "Network" "Security" ];
              })
            ];

            meta = with lib; {
              description = "An AI-driven OSINT analyst that lives on your desktop";
              homepage = "https://github.com/fknMega/Aether";
              license = licenses.mit;
              platforms = platforms.linux;
              mainProgram = "aether";
            };
          };
        });

      formatter = forAll (system: pkgs: pkgs.nixpkgs-fmt);
    };
}
