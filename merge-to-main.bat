@echo off
cd /d "%~dp0"

echo Removing stale git lock if present...
if exist ".git\index.lock" del /f ".git\index.lock"

echo Switching to main...
git checkout main
if errorlevel 1 goto :err

echo Merging Meeting-sum into main...
git merge Meeting-sum --no-ff -m "Merge branch 'Meeting-sum': include chat history in meeting summary"
if errorlevel 1 goto :err

echo.
echo Done! Last 5 commits:
git log --oneline -5
goto :end

:err
echo.
echo Something went wrong. Check the output above.

:end
pause
