#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
printf 'Axiom Worksheet — open http://localhost:8080/\n'
exec python3 -m http.server 8080 --bind 127.0.0.1
