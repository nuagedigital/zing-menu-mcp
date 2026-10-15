@echo off
chcp 65001 >nul
cd /d "C:\Users\Nuage Digital\Desktop\zingsters\zing-menu-mcp"

if not exist "logs" mkdir "logs"

echo. >> logs\auto.log
echo ==== Scrape run at %DATE% %TIME% ==== >> logs\auto.log

call .venv\Scripts\activate.bat
python scrape_toast.py >> logs\auto.log 2>&1
if errorlevel 1 (
    echo [ERROR] Scraper failed. Aborting. >> logs\auto.log
    exit /b 1
)

git add data/toast-menu.json >> logs\auto.log 2>&1
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "Auto-update menu" >> logs\auto.log 2>&1
    git push >> logs\auto.log 2>&1
) else (
    echo No changes to commit. >> logs\auto.log
)

echo ==== Done at %DATE% %TIME% ==== >> logs\auto.log
