@echo off
REM ============================================================
REM  EPROM CMS - one-click launcher
REM  Starts the backend (Node + embedded Postgres, port 4000)
REM  and the frontend (Vite dev server, port 5173) together,
REM  each in its own window, then opens the app in the browser.
REM ============================================================

setlocal
set "ROOT=%~dp0"

echo.
echo === EPROM CMS launcher ===
echo Root: %ROOT%
echo.

REM --- Install deps if missing (first run only) ---------------
if not exist "%ROOT%node_modules" (
    echo [setup] Installing frontend dependencies...
    call npm install --prefix "%ROOT%."
)
if not exist "%ROOT%server\node_modules" (
    echo [setup] Installing backend dependencies...
    call npm install --prefix "%ROOT%server"
)

REM --- Start the backend (embedded Postgres + API) -----------
REM serve-local.ts boots the persistent embedded Postgres itself
REM (no Docker / external DB needed), runs migrations, seeds the
REM admin, then serves the API. Plain `npm run dev` does NOT start
REM Postgres and will fail with ECONNREFUSED on :5433.
echo [start] Backend  -> http://localhost:4000
start "ECMS Backend" cmd /k "cd /d "%ROOT%server" && npx tsx scripts/serve-local.ts"

REM --- Start the frontend (Vite) -----------------------------
echo [start] Frontend -> http://localhost:5173
start "ECMS Frontend" cmd /k "cd /d "%ROOT%" && npm run dev"

REM --- Give the dev servers a moment, then open the browser --
echo.
echo Waiting for servers to boot...
timeout /t 6 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo Both servers are running in their own windows.
echo Close those windows (or press Ctrl+C in them) to stop.
echo.
endlocal
