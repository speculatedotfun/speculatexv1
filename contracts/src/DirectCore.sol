// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface DirectCore {
    function admin() external view returns (address);
    function admins(address account) external view returns (bool);
    function addAdmin(address account) external;
    function createMarket(
        string memory question,
        string memory yesName,
        string memory yesSymbol,
        string memory noName,
        string memory noSymbol,
        uint256 initUsdc,
        uint256 expiryTimestamp,
        address oracle,
        bytes32 priceFeedId,
        uint256 targetValue,
        uint8 comparison
    ) external returns (uint256);
    function markets(uint256 id)
        external
        view
        returns (
            address yes,
            address no,
            uint256 qYes,
            uint256 qNo,
            uint256 bE18,
            uint256 usdcVault,
            uint16 feeTreasuryBps,
            uint16 feeVaultBps,
            uint16 feeLpBps,
            uint8 status,
            string memory question,
            address lp,
            uint256 totalLpUsdc,
            uint256 lpFeesUSDC,
            uint256 maxUsdcPerTrade,
            uint256 priceBandThreshold,
            uint256 maxJumpE18,
            uint256 resolutionExpiry,
            address resolutionOracle
        );
}

