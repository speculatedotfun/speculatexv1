@echo off
echo ===================================
echo Deploying SpeculateX v3 to BSC Testnet
echo ===================================
echo.

REM Check if .env exists
if not exist .env (
    echo ERROR: .env file not found!
    echo Please create .env with PRIVATE_KEY, BSC_TESTNET_RPC_URL, and BSCSCAN_API_KEY
    echo See ENV_SETUP.md for instructions
    pause
    exit /b 1
)

echo Building contracts...
C:\Users\Almog\.foundry\bin\forge.exe build
if errorlevel 1 (
    echo Build failed!
    pause
    exit /b 1
)

echo.
echo Deploying to BSC Testnet...
C:\Users\Almog\.foundry\bin\forge.exe script script/Deploy.s.sol --rpc-url bsc_testnet --broadcast -vvvv

if errorlevel 1 (
    echo Deployment failed!
    pause
    exit /b 1
)

echo.
echo ===================================
echo Deployment successful!
echo ===================================
echo.
echo Next steps:
echo 1. Copy deployed addresses from output above
echo 2. Update frontend/.env.local with contract addresses
echo 3. Copy ABIs from out/ to frontend/lib/abis/
echo 4. See DEPLOY_GUIDE.md for details
echo.
pause


