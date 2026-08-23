@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
set REPORT=%~dp0USER_CMD_REPORT.txt
del "%REPORT%" 2>nul

call :step 1 "npm install"
call :step 2 "npm test"
call :step 3 "npm run typecheck"
call :step 4 "npm run build"
call :step 5 "npm run rebuild:electron"
call :step6
call :dev
echo DONE>> "%REPORT%"
echo.
echo Report written to: %REPORT%
type "%REPORT%"
exit /b 0

:step
echo.>> "%REPORT%"
echo ===== STEP %1: %~2 =====>> "%REPORT%"
call %~2 > "%~dp0step-%1.log" 2>&1
set EC=!ERRORLEVEL!
echo EXIT=!EC!>> "%REPORT%"
type "%~dp0step-%1.log">> "%REPORT%"
exit /b !EC!

:step6
echo.>> "%REPORT%"
echo ===== STEP 6: better-sqlite3 in Electron =====>> "%REPORT%"
node -e "const {spawnSync}=require('child_process'); const r=spawnSync(require('electron'), ['-e', \"const Database=require('better-sqlite3'); const db=new Database(':memory:'); console.log('better-sqlite3 OK'); db.close();\"], {stdio:'inherit', shell:false}); process.exit(r.status??1);" > "%~dp0step-6.log" 2>&1
set EC=!ERRORLEVEL!
echo EXIT=!EC!>> "%REPORT%"
type "%~dp0step-6.log">> "%REPORT%"
exit /b !EC!

:dev
echo.>> "%REPORT%"
echo ===== STEP 7: npm run dev (15s) =====>> "%REPORT%"
start "" /B cmd /c "npm run dev > "%~dp0step-7-dev.log" 2>&1"
timeout /t 15 /nobreak >nul
taskkill /F /IM electron.exe /T >nul 2>&1
type "%~dp0step-7-dev.log" >> "%REPORT%" 2>nul
findstr /C:"NODE_MODULE_VERSION" "%~dp0step-7-dev.log" >nul 2>&1 && echo NODE_MODULE_VERSION_FOUND=YES>> "%REPORT%" || echo NODE_MODULE_VERSION_FOUND=NO>> "%REPORT%"
findstr /C:"Application ready" "%~dp0step-7-dev.log" >nul 2>&1 && echo APPLICATION_READY=YES>> "%REPORT%" || echo APPLICATION_READY=NO>> "%REPORT%"
exit /b 0
