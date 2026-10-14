@echo off
cd /d "%~dp0"
call .venv\Scripts\activate.bat
python scrape_toast.py