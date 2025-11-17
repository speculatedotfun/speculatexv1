# Testing Guide for SpeculateX Frontend

## 🧪 Testing Overview

This project uses a comprehensive testing strategy with multiple layers:

- **Unit Tests**: Core logic and components
- **Integration Tests**: API routes and data flow
- **E2E Tests**: Complete user journeys
- **CI/CD**: Automated testing pipeline

## 🚀 Quick Start

### Install Dependencies
```bash
npm install
```

### Run Unit Tests
```bash
npm test                    # Run all unit tests
npm run test:watch         # Watch mode for development
npm run test:coverage      # Generate coverage report
```

### Run E2E Tests
```bash
npm run test:e2e           # Run Playwright E2E tests
npm run test:e2e:ui        # Run with visual UI
```

### Run All Tests
```bash
npm run lint               # Code quality checks
npm run build              # Production build test
npm test                   # Unit tests
npm run test:e2e          # E2E tests
```

## 📁 Test Structure

```
frontend/
├── __tests__/                    # Unit tests
│   ├── hooks/                   # Hook tests
│   │   └── useMarketData.test.ts
│   ├── components/              # Component tests
│   │   └── PriceChart.test.tsx
│   └── lib/                     # Utility tests
│       └── lmsrMath.test.ts
├── tests/e2e/                   # E2E tests
│   ├── market-page.spec.ts     # Market page flows
│   └── trading-flow.spec.ts    # Trading flows
└── __tests__/api/              # API route tests
    └── goldsky-poll.test.ts
```

## 🎯 Test Coverage

### Unit Tests ✅
- **useMarketData hook**: Real-time data loading, polling, error handling
- **PriceChart component**: Rendering, data processing, error states
- **LMSR math utilities**: Price calculations, share calculations

### Integration Tests ✅
- **API routes**: Rate limiting, CORS, error handling
- **Data flow**: Hook to component communication
- **Error boundaries**: Graceful failure handling

### E2E Tests ✅
- **Market browsing**: Page loading, navigation
- **Trading flow**: Amount input, validation, preview
- **Real-time updates**: Price changes, chart updates
- **Error scenarios**: Network issues, invalid inputs

## 🔧 Configuration

### Jest Configuration (`jest.config.js`)
- Next.js integration
- React Testing Library setup
- Coverage reporting
- Module alias support

### Playwright Configuration (`playwright.config.ts`)
- Cross-browser testing (Chrome, Firefox, Safari)
- Mobile viewport testing
- Automatic screenshot/video capture
- CI integration

### CI/CD Pipeline (`.github/workflows/test.yml`)
- Multi-Node.js version testing
- Parallel test execution
- Coverage reporting to Codecov
- Security vulnerability scanning

## 🧪 Writing Tests

### Unit Test Example
```typescript
import { render, screen } from '@testing-library/react'
import { PriceChart } from '@/components/PriceChart'

describe('PriceChart', () => {
  it('should render with data', () => {
    render(<PriceChart data={mockData} selectedSide="yes" />)
    expect(screen.getByRole('img')).toBeInTheDocument()
  })
})
```

### E2E Test Example
```typescript
import { test, expect } from '@playwright/test'

test('market page loads', async ({ page }) => {
  await page.goto('/markets/1')
  await expect(page.locator('text=Created')).toBeVisible()
})
```

## 📊 Coverage Goals

- **Statements**: > 80%
- **Branches**: > 75%
- **Functions**: > 85%
- **Lines**: > 80%

## 🚨 Test Categories

### Critical Path Tests
- [ ] Market page loading
- [ ] Price chart rendering
- [ ] Trading interface
- [ ] Wallet connection
- [ ] Transaction submission

### Edge Case Tests
- [ ] Network disconnections
- [ ] Invalid market IDs
- [ ] Insufficient balance
- [ ] Contract reverts
- [ ] Extreme price movements

### Performance Tests
- [ ] Page load times (< 3s)
- [ ] Chart rendering (< 1s)
- [ ] API response times (< 500ms)
- [ ] Memory usage (no leaks)

## 🔒 Security Testing

### Automated Security Tests
```bash
npm audit                    # Dependency vulnerabilities
npx playwright test security/ # Security-specific E2E tests
```

### Manual Security Checks
- [ ] Input validation
- [ ] XSS prevention
- [ ] CSRF protection
- [ ] Secure headers
- [ ] Private key exposure

## 📈 Monitoring & Reporting

### Test Results
- **GitHub Actions**: Automated CI/CD results
- **Codecov**: Coverage reports and trends
- **Playwright Report**: E2E test results with screenshots

### Performance Metrics
- **Lighthouse**: Page performance scores
- **Web Vitals**: Core Web Vitals tracking
- **Bundle Analyzer**: Bundle size optimization

## 🎯 Next Steps

1. **Expand test coverage** to reach 80%+ threshold
2. **Add visual regression tests** with Percy/Applitools
3. **Implement contract testing** for API stability
4. **Add load testing** with Artillery
5. **Set up monitoring** for production errors

---

## 🚀 Running Tests in Development

```bash
# Development mode with watch
npm run test:watch

# Debug specific test
npm test -- --testNamePattern="useMarketData"

# Run E2E with browser
npm run test:e2e:ui
```

**Happy Testing! 🧪✨**
