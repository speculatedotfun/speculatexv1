# SpeculateX

<<div align="center">

![SpeculateX Banner](./docs/banner.png)

**Decentralized prediction markets powered by LMSR, Chainlink automation, and advanced bonding curves**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-e6e6e6?logo=solidity)](https://soliditylang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![BSC Testnet](https://img.shields.io/badge/BSC-Testnet-yellow)](https://testnet.bscscan.com/)

[Live Demo](https://speculatex.app) • [Documentation](./docs) • [Smart Contracts](./contracts) • [Twitter](https://twitter.com/speculatex)

</div>

**Trade on anything. Bet on everything.**

The future of prediction markets is here.

[Launch App](https://speculatex.app) • [Twitter](https://twitter.com/speculatex) • [Discord](https://discord.gg/speculatex)

</div>

---

## What is SpeculateX?

SpeculateX is a **decentralized prediction market platform** where you can trade on the outcome of real-world events. Will Bitcoin hit $100k? Will ETH reach $5k? Create a market, take a position, and profit from being right.

Unlike traditional betting platforms, SpeculateX uses sophisticated bonding curves and automated oracles to create liquid, efficient markets that settle instantly when events resolve.

### Why SpeculateX?

**🎯 Trade on Anything**  
From crypto prices to sports outcomes, economic indicators to political events - if it can be measured, you can trade it.

**⚡ Instant Liquidity**  
No waiting for counterparties. Our automated market maker provides instant execution at transparent prices.

**🤖 Automated Settlement**  
Chainlink oracles automatically resolve markets based on real-world data. No disputes, no delays.

**💰 Earn as You Trade**  
Provide liquidity to markets and earn fees from every trade. The more active the market, the more you earn.

**🔒 Fully Decentralized**  
Your funds, your custody. Smart contracts handle everything - no central authority can freeze or seize your assets.

---

## How It Works

### For Traders

**1. Find a Market**  
Browse active markets on crypto prices, sports, politics, or any measurable event.

**2. Buy Outcome Tokens**  
Think BTC will hit $100k? Buy YES tokens. Think it won't? Buy NO tokens. Prices reflect the market's probability.

**3. Watch Your Position**  
As traders buy and sell, prices update in real-time based on market sentiment.

**4. Collect Your Winnings**  
When the market resolves, winning tokens are redeemable 1:1 for USDC. Wrong predictions are worth $0.

**Example:**
- Market: "Will BTC hit $100k by Dec 2025?"
- You buy 100 YES tokens for $55 (55% probability)
- BTC hits $100k → Market resolves YES
- You redeem 100 tokens for $100 → **$45 profit (82% ROI)**

### For Liquidity Providers

**Earn passive income** by providing liquidity to markets:

- Deposit USDC to any market
- Earn 1% fee on every trade
- Claim fees anytime
- Receive leftover funds after market resolves

**No impermanent loss.** Your capital backs the market and earns consistently from trading activity.

### For Market Creators

Got an idea for a market? Create it:

1. Define your question
2. Choose an oracle (for automated resolution)
3. Add initial liquidity
4. Market goes live instantly

Markets can be about anything with verifiable outcomes: crypto prices, election results, sports scores, economic data, and more.

---

## Platform Features

### Advanced Market Making

Our proprietary bonding curve algorithm ensures:
- **Deep liquidity** at all price levels
- **Fair pricing** based on supply and demand
- **Instant execution** with transparent slippage
- **Protected markets** with anti-manipulation safeguards

### Oracle Integration

Markets can resolve automatically using real-world data:
- **Crypto prices** (BTC, ETH, BNB, and more)
- **Sports scores** (coming soon)
- **Economic indicators** (coming soon)
- **Custom data sources** (via Chainlink)

No disputes, no manual verification - outcomes settle automatically when oracles confirm the result.

### Security First

- **Smart contracts audited** (audit in progress)
- **Non-custodial** - you control your funds
- **Guaranteed payouts** - mathematical solvency enforced
- **Battle-tested** infrastructure on BNB Smart Chain
- **Open source** - transparency you can verify

---

## Why Trade on SpeculateX?

### Better Than Traditional Betting

| Traditional Betting | SpeculateX |
|---------------------|------------|
| ❌ Must wait for odds to match | ✅ Instant execution at market price |
| ❌ House always wins (high margins) | ✅ Peer-to-peer, low fees (2%) |
| ❌ Limited markets | ✅ Anyone can create markets |
| ❌ Centralized, can freeze funds | ✅ Decentralized, non-custodial |
| ❌ Manual payouts, disputes | ✅ Automatic oracle settlement |

### Better Than Other Prediction Markets

| Feature | SpeculateX | Competitors |
|---------|------------|-------------|
| **Liquidity** | Always available | Often thin or absent |
| **Resolution** | Automated oracles | Manual or disputed |
| **Fees** | 2% on buys only | 2-5% + withdrawal fees |
| **Market Creation** | Permissionless* | Restricted |
| **Settlement Speed** | Instant (oracle-based) | Days or weeks |
| **Blockchain** | BNB Chain (low fees) | Ethereum (high gas) or Polygon |

*Currently admin-only during beta, will open to public post-audit

---

## Live Stats

<div align="center">

### 📊 Platform Metrics

| Metric | Value |
|--------|-------|
| **Total Markets** | 15+ |
| **Total Volume** | $50k+ USDC |
| **Active Traders** | 200+ |
| **Trading Fee** | 2% (1% treasury + 1% LP) |
| **Network** | BNB Smart Chain Testnet |

*Stats as of November 2025*

</div>

---

## Deployed Contracts

SpeculateX is currently live on **BNB Smart Chain Testnet** (Chain ID: 97)

| Contract | Address | Explorer |
|----------|---------|----------|
| **Core Protocol** | `0x312463...21318e` | [View on BscScan](https://testnet.bscscan.com/address/0x312463901aDBB2C69843046bB04153454021318e) |
| **Oracle Resolver** | `0xEf281d...026307` | [View on BscScan](https://testnet.bscscan.com/address/0xEf281d31444D89eEf9Eb133B9d163d7dB4026307) |
| **Treasury** | `0x242b6C...C2AfA` | [View on BscScan](https://testnet.bscscan.com/address/0x242b6Cf7Ee87cb10Ea5cb157bF4fee4E39bC2AfA) |
| **Test USDC** | `0x2f7e29...6d031` | [View on BscScan](https://testnet.bscscan.com/address/0x2f7e29C9253bD5e096C5AFfa1827B843c536d031) |

> **Note:** Currently deployed on testnet for security testing. Mainnet launch coming Q1 2025 after full audit.

---

## Getting Started

### 1. Connect Your Wallet

Visit [speculatex.app](https://speculatex.app) and connect your wallet:
- MetaMask
- WalletConnect
- Coinbase Wallet
- Rainbow

### 2. Get Test Funds

Need testnet USDC? Use our faucet or mint directly from the contract.

### 3. Start Trading

Browse markets, analyze probabilities, and take positions. It's that simple.

---

## Market Examples

### Crypto Markets

- "Will BTC reach $100k by Dec 2025?"
- "Will ETH hit $5k before Q2 2026?"
- "Will BNB exceed $500 by end of 2025?"

### DeFi Markets

- "Will Total Value Locked (TVL) in DeFi exceed $200B by 2025?"
- "Will a new DeFi protocol reach $1B TVL in 2025?"

### Macro Markets (Coming Soon)

- "Will inflation exceed 3% by end of 2025?"
- "Will the Fed cut rates in Q1 2025?"

---

## Technology Stack

SpeculateX is built with cutting-edge technology:

- **Smart Contracts**: Solidity 0.8.24 on BNB Smart Chain
- **Oracle Network**: Chainlink for automated resolution
- **Frontend**: Next.js 15 with React 19
- **Web3**: Wagmi 2 + Viem 2 + RainbowKit
- **Data**: The Graph subgraph (BSC Testnet) + direct on-chain reads
- **Charts**: Lightweight Charts (TradingView quality)

---

## Subgraph Deployment

All off-chain analytics (price history, trade feeds, top holders, unique trader counts) come from a dedicated subgraph that indexes `SpeculateCore` on BSC Testnet.

| Item | Value |
|------|-------|
| Contract | `0x312463901aDBB2C69843046bB04153454021318e` |
| Network | BSC Testnet (`bsc-testnet`) |
| Start Block | `71966000` |

### Setup

```bash
cd subgraph
npm install
npm run codegen
npm run build
# Update the deploy script in package.json before running:
npm run deploy
```

Add the deployed endpoint to the frontend env:

```
NEXT_PUBLIC_SUBGRAPH_URL=https://api.thegraph.com/subgraphs/name/YOUR_ACCOUNT/speculate-subgraph
```

The frontend reads trades, price history, claims, and holder leaderboards exclusively from this subgraph.

---

## Roadmap

### ✅ Phase 1: Beta Launch (Q4 2024)
- [x] Core protocol development
- [x] Chainlink oracle integration
- [x] Testnet deployment
- [x] Basic frontend
- [x] BTC/ETH/BNB markets

### 🔄 Phase 2: Security & Scale (Q1 2025)
- [ ] Smart contract audit
- [ ] Bug bounty program
- [ ] Gas optimizations
- [ ] Mobile optimization
- [ ] Advanced charting

### 🔮 Phase 3: Mainnet Launch (Q2 2025)
- [ ] BSC Mainnet deployment
- [ ] Liquidity mining incentives
- [ ] Governance token (SPEC)
- [ ] DAO formation
- [ ] Multi-chain expansion

### 🌟 Phase 4: Advanced Features (Q3-Q4 2025)
- [ ] Sports markets
- [ ] Political markets
- [ ] Limit orders
- [ ] Portfolio tracking
- [ ] Mobile apps (iOS/Android)
- [ ] API for traders

---

## Fee Structure

SpeculateX uses a simple, transparent fee model:

| Action | Fee | Who Pays | Goes To |
|--------|-----|----------|---------|
| **Buy YES/NO** | 1% | Buyer | Treasury |
| **Buy YES/NO** | 1% | Buyer | Liquidity Providers |
| **Sell YES/NO** | 0% | Seller | Nobody |
| **Redeem Winners** | 0% | Winner | Nobody |
| **Market Creation** | 0%* | Creator | Nobody |

*Minimum 10 USDC initial liquidity required

**Total trading fee: 2%** (only on buys, not sells)

---

## Security & Audits

Your security is our priority:

### Current Status

✅ **Testnet deployment** - Live since October 2024  
✅ **Open source code** - Fully transparent  
✅ **Internal security reviews** - Multiple iterations  
🔄 **External audit** - Scheduled Q1 2025  
🔄 **Bug bounty program** - Launching Q1 2025  

### Security Features

- **Non-custodial** - You always control your funds
- **Reentrancy protection** - Industry-standard guards
- **Access controls** - Role-based permissions
- **Oracle validation** - Stale data prevention
- **Solvency guarantees** - Mathematical backing enforced

### Best Practices

- Never share your private keys
- Always verify contract addresses
- Start with small amounts on testnet
- Use hardware wallets for large amounts
- Double-check market terms before trading

---

## Community & Support

Join the SpeculateX community:

- 💬 **Discord**: [discord.gg/speculatex](https://discord.gg/speculatex)
- 🐦 **Twitter**: [@SpeculateX](https://twitter.com/speculatex)
- 📧 **Email**: support@speculatex.app
- 📚 **Docs**: [docs.speculatex.app](https://docs.speculatex.app)
- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/speculatex/issues)

---

## FAQ

### How does pricing work?

Markets use an automated market maker (AMM) with a logarithmic bonding curve. Prices adjust automatically based on supply and demand - when more people buy YES, the price of YES goes up and NO goes down.

### What happens if I'm wrong?

If your prediction is wrong, your tokens become worthless ($0). You lose your initial investment minus any fees.

### How do markets resolve?

Markets with oracles (like crypto prices) resolve automatically via Chainlink when the event occurs. Other markets may require manual resolution by admins.

### Can I sell my tokens before resolution?

Yes! You can sell your tokens anytime before the market resolves. The price you get depends on the current market price.

### What's the minimum trade size?

The minimum trade is 0.001 USDC ($0.001). There's no maximum, but large trades may experience more slippage.

### Are there trading limits?

Some markets may have per-transaction limits to prevent price manipulation. Check the market details before trading.

### How do I become a liquidity provider?

Connect your wallet, go to any market, and click "Add Liquidity". You'll need admin approval during the beta phase.

### When will governance launch?

We plan to launch the SPEC governance token in Q2 2025, giving the community control over protocol parameters and treasury.

---

## Legal

### Terms of Service

By using SpeculateX, you agree to our [Terms of Service](https://speculatex.app/terms).

### Risk Disclosure

Trading prediction markets involves substantial risk:
- You can lose your entire investment
- Markets may be illiquid
- Oracle failures can delay resolution
- Smart contract risks exist
- Regulatory status varies by jurisdiction

**Trade responsibly. Never invest more than you can afford to lose.**

### Jurisdictional Restrictions

SpeculateX may not be available in all jurisdictions. Check your local laws before trading.

---

## Team

**Almog Lachiany** - Founder & Lead Developer  
Backend specialist with 6 years experience in Python and Node.js. Currently IT consultant in military tech unit.

**Open Roles:**  
We're hiring! Check out open positions on our [careers page](https://speculatex.app/careers).

---

## Acknowledgments

SpeculateX is built on the shoulders of giants:

- **Chainlink** - Oracle infrastructure
- **Binance** - BNB Smart Chain
- **OpenZeppelin** - Smart contract libraries
- **Polymarket** - Inspiration for prediction markets
- **Uniswap** - AMM mechanics reference

---

## License

© 2024 SpeculateX. All rights reserved.

The smart contracts are open source under MIT License. The frontend and branding are proprietary.

---

<div align="center">

**Ready to start trading?**

[Launch App](https://speculatex.app) • [Read Docs](https://docs.speculatex.app) • [Join Discord](https://discord.gg/speculatex)

---

⚠️ **Testnet Warning**: Currently deployed on testnet. Do not use real funds. Mainnet launch Q1 2025.

</div>
