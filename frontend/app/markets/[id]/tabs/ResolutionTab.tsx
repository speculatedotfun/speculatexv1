'use client';
import { formatUnits, keccak256, stringToBytes } from 'viem';

interface ResolutionTabProps {
  resolution: any;
}

export function ResolutionTab({ resolution }: ResolutionTabProps) {
  if (!resolution || !resolution.expiryTimestamp || resolution.expiryTimestamp === 0n) {
    return (
      <div className="p-4 sm:p-6 bg-gray-50 rounded-xl">
        <p className="text-xs sm:text-sm text-gray-500">No resolution information available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Resolution Status */}
      {resolution.isResolved ? (
        <div className="p-4 sm:p-6 bg-gradient-to-br from-green-500/10 to-green-600/10 rounded-xl border border-green-500/20">
          <div className="flex items-center gap-3 mb-2">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h4 className="text-sm sm:text-base font-bold text-green-900">Market Resolved</h4>
          </div>
          <p className="text-xs sm:text-sm text-gray-700">
            Winner: <span className="font-bold">{resolution.yesWins ? 'YES' : 'NO'}</span>
          </p>
        </div>
      ) : (
        <div className="p-4 sm:p-6 bg-gradient-to-br from-[#14B8A6]/5 to-[#14B8A6]/10 rounded-xl border border-[#14B8A6]/20">
          <h4 className="text-xs sm:text-sm font-bold text-gray-900 mb-2 sm:mb-3 uppercase tracking-wide flex items-center gap-2">
            <svg className="w-4 h-4 text-[#14B8A6] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Resolution Criteria</span>
          </h4>
          {resolution.oracleType === 1 ? (
            <p className="text-xs sm:text-sm text-gray-700 leading-relaxed">
              {resolution.comparison === 0 && `Market resolves YES if price is above $${Number(formatUnits(resolution.targetValue, 8)).toLocaleString()}`}
              {resolution.comparison === 1 && `Market resolves YES if price is below $${Number(formatUnits(resolution.targetValue, 8)).toLocaleString()}`}
              {resolution.comparison === 2 && `Market resolves YES if price equals $${Number(formatUnits(resolution.targetValue, 8)).toLocaleString()}`}
              {' at expiry. Otherwise resolves NO.'}
            </p>
          ) : (
            <p className="text-xs sm:text-sm text-gray-700 leading-relaxed">
              This market will be resolved manually by the admin.
            </p>
          )}
        </div>
      )}

      {/* Resolution Details Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
        <div className="p-3 sm:p-4 bg-gray-50 rounded-xl">
          <div className="text-[10px] sm:text-xs font-bold text-gray-500 mb-1 sm:mb-2 uppercase">Resolution Type</div>
          <div className="text-xs sm:text-sm font-bold text-gray-900">
            {resolution.oracleType === 0 ? 'Manual' : 'Chainlink Feed'}
          </div>
        </div>

        {resolution.oracleType === 1 && (
          <div className="p-3 sm:p-4 bg-gray-50 rounded-xl">
            <div className="text-[10px] sm:text-xs font-bold text-gray-500 mb-1 sm:mb-2 uppercase">Price Feed</div>
            <div className="text-xs sm:text-sm font-bold text-gray-900">
              {(() => {
                const feedId = resolution.priceFeedId.toLowerCase();
                const commonFeeds = ['BTC/USD', 'ETH/USD', 'BNB/USD', 'SOL/USD', 'ADA/USD', 'XRP/USD'];
                for (const symbol of commonFeeds) {
                  const hash = keccak256(stringToBytes(symbol)).toLowerCase();
                  if (hash === feedId) {
                    return symbol;
                  }
                }
                return feedId.slice(0, 10) + '...';
              })()}
            </div>
          </div>
        )}

        {resolution.targetValue > 0n && (
          <div className="p-3 sm:p-4 bg-gray-50 rounded-xl">
            <div className="text-[10px] sm:text-xs font-bold text-gray-500 mb-1 sm:mb-2 uppercase">Target Value</div>
            <div className="text-xs sm:text-sm font-bold text-gray-900">
              ${Number(formatUnits(resolution.targetValue, 8)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        )}

        <div className="p-3 sm:p-4 bg-gray-50 rounded-xl">
          <div className="text-[10px] sm:text-xs font-bold text-gray-500 mb-1 sm:mb-2 uppercase">Resolution Date</div>
          <div className="text-xs sm:text-sm font-bold text-gray-900">
            {new Date(Number(resolution.expiryTimestamp) * 1000).toLocaleString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZoneName: 'short'
            })}
          </div>
        </div>

        {resolution.isResolved && (
          <div className="p-3 sm:p-4 bg-gray-50 rounded-xl">
            <div className="text-[10px] sm:text-xs font-bold text-gray-500 mb-1 sm:mb-2 uppercase">Winner</div>
            <div className={`text-xs sm:text-sm font-bold ${resolution.yesWins ? 'text-green-600' : 'text-red-600'}`}>
              {resolution.yesWins ? 'YES' : 'NO'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}




