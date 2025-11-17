'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount } from 'wagmi';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { isAdmin as checkIsAdmin } from '@/lib/hooks';

export default function Header() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      if (isConnected && address) {
        const adminStatus = await checkIsAdmin(address);
        setIsAdmin(adminStatus);
      } else {
        setIsAdmin(false);
      }
    };
    checkAdmin();
  }, [isConnected, address]);

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  const isLandingPage = pathname === '/';

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  return (
    <header className="border-b border-gray-200 bg-white/95 backdrop-blur-md sticky top-0 z-50 shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 sm:h-20 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center group flex-shrink-0" onClick={() => setIsMobileMenuOpen(false)}>
            <Image
              src="/logo.jpg"
              alt="SpeculateX Logo"
              width={160}
              height={48}
              priority
              className="h-7 sm:h-8 w-auto object-contain transition-opacity group-hover:opacity-80"
            />
          </Link>

          {/* Navigation - Desktop */}
          <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
            <Link
              href="/"
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                isActive('/')
                  ? 'text-[#14B8A6] bg-[#14B8A6]/10'
                  : 'text-gray-600 hover:text-[#14B8A6] hover:bg-gray-50'
              }`}
            >
              Home
            </Link>
            <Link
              href="/markets"
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                isActive('/markets')
                  ? 'text-[#14B8A6] bg-[#14B8A6]/10'
                  : 'text-gray-600 hover:text-[#14B8A6] hover:bg-gray-50'
              }`}
            >
              Markets
            </Link>
            {isAdmin && (
              <Link
                href="/admin"
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  isActive('/admin')
                    ? 'text-[#14B8A6] bg-[#14B8A6]/10'
                    : 'text-gray-600 hover:text-[#14B8A6] hover:bg-gray-50'
                }`}
              >
                Admin
              </Link>
            )}
            <Link
              href="/claim"
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                isActive('/claim')
                  ? 'text-[#14B8A6] bg-[#14B8A6]/10'
                  : 'text-gray-600 hover:text-[#14B8A6] hover:bg-gray-50'
              }`}
            >
              Claim
            </Link>
          </nav>

          {/* Right Side - Wallet or Launch App */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-[#14B8A6] transition-all"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
            
            {isLandingPage ? (
              // Show "Launch App" button on landing page
              <Link
                href="/markets"
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#14B8A6] to-[#0D9488] px-4 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-white hover:shadow-lg transition-all transform hover:scale-105 shadow-md"
              >
                <span className="hidden sm:inline">Launch App</span>
                <span className="sm:hidden">Launch</span>
                <svg className="ml-1.5 sm:ml-2 w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
            ) : (
              // Show wallet connect on dapp pages with custom styling
              <div className="wallet-connect-wrapper">
                <ConnectButton.Custom>
                  {({
                    account,
                    chain,
                    openAccountModal,
                    openChainModal,
                    openConnectModal,
                    authenticationStatus,
                    mounted,
                  }) => {
                    const ready = mounted && authenticationStatus !== 'loading';
                    const connected =
                      ready &&
                      account &&
                      chain &&
                      (!authenticationStatus ||
                        authenticationStatus === 'authenticated');

                    return (
                      <div
                        {...(!ready && {
                          'aria-hidden': true,
                          style: {
                            opacity: 0,
                            pointerEvents: 'none',
                            userSelect: 'none',
                          },
                        })}
                      >
                        {(() => {
                          if (!connected) {
                            return (
                              <button
                                onClick={openConnectModal}
                                type="button"
                                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#14B8A6] to-[#0D9488] px-4 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-white hover:shadow-lg transition-all transform hover:scale-105 shadow-md"
                              >
                                <span className="hidden sm:inline">Connect Wallet</span>
                                <span className="sm:hidden">Connect</span>
                              </button>
                            );
                          }

                          if (chain.unsupported) {
                            return (
                              <button
                                onClick={openChainModal}
                                type="button"
                                className="inline-flex items-center justify-center rounded-full bg-red-500 px-4 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-red-600 transition-all shadow-md"
                              >
                                <span className="hidden sm:inline">Wrong Network</span>
                                <span className="sm:hidden">Network</span>
                              </button>
                            );
                          }

                          return (
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <button
                                onClick={openChainModal}
                                type="button"
                                className="hidden sm:flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 sm:px-3 py-1.5 sm:py-2 hover:bg-gray-200 transition-all"
                              >
                                {chain.hasIcon && (
                                  <div
                                    style={{
                                      background: chain.iconBackground,
                                      width: 18,
                                      height: 18,
                                      borderRadius: 999,
                                      overflow: 'hidden',
                                    }}
                                  >
                                    {chain.iconUrl && (
                                      <Image
                                        alt={chain.name ?? 'Chain icon'}
                                        src={chain.iconUrl}
                                        width={18}
                                        height={18}
                                        unoptimized
                                      />
                                    )}
                                  </div>
                                )}
                                <span className="text-xs sm:text-sm font-semibold text-gray-700">
                                  {chain.name}
                                </span>
                              </button>

                              <button
                                onClick={openAccountModal}
                                type="button"
                                className="flex items-center gap-1.5 sm:gap-2 rounded-full bg-white border-2 border-gray-200 px-2.5 sm:px-4 py-1.5 sm:py-2 hover:border-[#14B8A6] transition-all shadow-sm hover:shadow-md"
                              >
                                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-green-500"></div>
                                <span className="hidden sm:inline text-xs sm:text-sm font-bold text-gray-900">
                                  {account.displayBalance
                                    ? ` ${account.displayBalance}`
                                    : ''}
                                </span>
                                <span className="text-xs sm:text-sm font-semibold text-gray-600 truncate max-w-[80px] sm:max-w-none">
                                  {account.displayName}
                                </span>
                                <svg className="hidden sm:block w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  }}
                </ConnectButton.Custom>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white">
            <nav className="flex flex-col py-4 space-y-1">
              <Link
                href="/"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`px-4 py-3 rounded-lg text-base font-semibold transition-all ${
                  isActive('/')
                    ? 'text-[#14B8A6] bg-[#14B8A6]/10'
                    : 'text-gray-700 hover:text-[#14B8A6] hover:bg-gray-50'
                }`}
              >
                Home
              </Link>
              <Link
                href="/markets"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`px-4 py-3 rounded-lg text-base font-semibold transition-all ${
                  isActive('/markets')
                    ? 'text-[#14B8A6] bg-[#14B8A6]/10'
                    : 'text-gray-700 hover:text-[#14B8A6] hover:bg-gray-50'
                }`}
              >
                Markets
              </Link>
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`px-4 py-3 rounded-lg text-base font-semibold transition-all ${
                    isActive('/admin')
                      ? 'text-[#14B8A6] bg-[#14B8A6]/10'
                      : 'text-gray-700 hover:text-[#14B8A6] hover:bg-gray-50'
                  }`}
                >
                  Admin
                </Link>
              )}
              <Link
                href="/claim"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`px-4 py-3 rounded-lg text-base font-semibold transition-all ${
                  isActive('/claim')
                    ? 'text-[#14B8A6] bg-[#14B8A6]/10'
                    : 'text-gray-700 hover:text-[#14B8A6] hover:bg-gray-50'
                }`}
              >
                Claim
              </Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}