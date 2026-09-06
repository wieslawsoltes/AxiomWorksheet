@echo off
cd /d "%~dp0"
echo Axiom Worksheet - open http://localhost:8080/
py -m http.server 8080 --bind 127.0.0.1
